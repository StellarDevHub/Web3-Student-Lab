#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Env,
};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Slope,
    BasePrice,
    Supply,
    Reserve,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum CurveError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidAmount = 3,
    SlippageExceeded = 4,
    DeadlinePassed = 5,
    Unauthorized = 6,
    InsufficientSupply = 7,
}

#[contract]
pub struct ContinuousBondingCurveContract;

#[contractimpl]
impl ContinuousBondingCurveContract {
    pub fn initialize(env: Env, admin: Address, slope: i128, base_price: i128) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, CurveError::AlreadyInitialized);
        }
        if slope <= 0 || base_price <= 0 {
            panic_with_error!(&env, CurveError::InvalidAmount);
        }

        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Slope, &slope);
        env.storage().instance().set(&DataKey::BasePrice, &base_price);
        env.storage().instance().set(&DataKey::Supply, &0i128);
        env.storage().instance().set(&DataKey::Reserve, &0i128);
    }

    pub fn buy_exact_tokens(
        env: Env,
        buyer: Address,
        tokens_out: i128,
        max_reserve_in: i128,
        deadline: u64,
    ) -> i128 {
        ensure_initialized(&env);
        buyer.require_auth();

        if deadline < env.ledger().timestamp() {
            panic_with_error!(&env, CurveError::DeadlinePassed);
        }
        if tokens_out <= 0 || max_reserve_in <= 0 {
            panic_with_error!(&env, CurveError::InvalidAmount);
        }

        let supply = read_i128(&env, DataKey::Supply);
        let cost = integral_cost_for_mint(&env, supply, tokens_out);
        if cost > max_reserve_in {
            panic_with_error!(&env, CurveError::SlippageExceeded);
        }

        env.storage().instance().set(&DataKey::Supply, &(supply + tokens_out));
        let reserve = read_i128(&env, DataKey::Reserve);
        env.storage().instance().set(&DataKey::Reserve, &(reserve + cost));
        cost
    }

    pub fn sell_exact_tokens(
        env: Env,
        seller: Address,
        tokens_in: i128,
        min_reserve_out: i128,
        deadline: u64,
    ) -> i128 {
        ensure_initialized(&env);
        seller.require_auth();

        if deadline < env.ledger().timestamp() {
            panic_with_error!(&env, CurveError::DeadlinePassed);
        }
        if tokens_in <= 0 || min_reserve_out <= 0 {
            panic_with_error!(&env, CurveError::InvalidAmount);
        }

        let supply = read_i128(&env, DataKey::Supply);
        if supply < tokens_in {
            panic_with_error!(&env, CurveError::InsufficientSupply);
        }

        let payout = integral_payout_for_burn(&env, supply, tokens_in);
        if payout < min_reserve_out {
            panic_with_error!(&env, CurveError::SlippageExceeded);
        }

        let reserve = read_i128(&env, DataKey::Reserve);
        if reserve < payout {
            panic_with_error!(&env, CurveError::InvalidAmount);
        }

        env.storage().instance().set(&DataKey::Supply, &(supply - tokens_in));
        env.storage().instance().set(&DataKey::Reserve, &(reserve - payout));
        payout
    }

    pub fn quote_buy(env: Env, tokens_out: i128) -> i128 {
        ensure_initialized(&env);
        if tokens_out <= 0 {
            panic_with_error!(&env, CurveError::InvalidAmount);
        }
        let supply = read_i128(&env, DataKey::Supply);
        integral_cost_for_mint(&env, supply, tokens_out)
    }

    pub fn quote_sell(env: Env, tokens_in: i128) -> i128 {
        ensure_initialized(&env);
        if tokens_in <= 0 {
            panic_with_error!(&env, CurveError::InvalidAmount);
        }
        let supply = read_i128(&env, DataKey::Supply);
        if supply < tokens_in {
            panic_with_error!(&env, CurveError::InsufficientSupply);
        }
        integral_payout_for_burn(&env, supply, tokens_in)
    }

    pub fn state(env: Env) -> (i128, i128) {
        (read_i128(&env, DataKey::Supply), read_i128(&env, DataKey::Reserve))
    }
}

fn ensure_initialized(env: &Env) {
    if !env.storage().instance().has(&DataKey::Admin) {
        panic_with_error!(env, CurveError::NotInitialized);
    }
}

fn read_i128(env: &Env, key: DataKey) -> i128 {
    env.storage().instance().get(&key).unwrap_or(0)
}

// Linear price curve: p(s) = base + slope*s
// Cost for minting x from supply s:
// integral_s^(s+x) p(u) du = base*x + slope*((s+x)^2 - s^2)/2
fn integral_cost_for_mint(env: &Env, s: i128, x: i128) -> i128 {
    let base = read_i128(env, DataKey::BasePrice);
    let slope = read_i128(env, DataKey::Slope);
    let new_s = s + x;

    let linear_term = base * x;
    let quad_term = slope * ((new_s * new_s) - (s * s)) / 2;
    linear_term + quad_term
}

// Payout for burning x from supply s (moving from s down to s-x):
// integral_(s-x)^s p(u) du
fn integral_payout_for_burn(env: &Env, s: i128, x: i128) -> i128 {
    let base = read_i128(env, DataKey::BasePrice);
    let slope = read_i128(env, DataKey::Slope);
    let new_s = s - x;

    let linear_term = base * x;
    let quad_term = slope * ((s * s) - (new_s * new_s)) / 2;
    linear_term + quad_term
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Address, Env};

    fn client(env: &Env) -> ContinuousBondingCurveContractClient<'_> {
        let id = env.register(ContinuousBondingCurveContract, ());
        ContinuousBondingCurveContractClient::new(env, &id)
    }

    #[test]
    fn buy_and_sell_flow_updates_supply_and_reserve() {
        let env = Env::default();
        env.mock_all_auths();
        let client = client(&env);

        let admin = Address::generate(&env);
        let user = Address::generate(&env);

        client.initialize(&admin, &2, &100);

        let buy_cost = client.buy_exact_tokens(&user, &100, &30_000, &(env.ledger().timestamp() + 100));
        assert!(buy_cost > 0);

        let (supply, reserve) = client.state();
        assert_eq!(supply, 100);
        assert_eq!(reserve, buy_cost);

        let payout = client.sell_exact_tokens(&user, &40, &1, &(env.ledger().timestamp() + 100));
        assert!(payout > 0);

        let (supply_after, reserve_after) = client.state();
        assert_eq!(supply_after, 60);
        assert_eq!(reserve_after, buy_cost - payout);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn enforces_slippage_limits() {
        let env = Env::default();
        env.mock_all_auths();
        let client = client(&env);

        let admin = Address::generate(&env);
        let user = Address::generate(&env);

        client.initialize(&admin, &1, &50);

        let _ = client.buy_exact_tokens(&user, &100, &10, &(env.ledger().timestamp() + 100));
    }
}
