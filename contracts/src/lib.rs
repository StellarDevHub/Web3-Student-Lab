#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, String};

const SCALE: i128 = 1_000_000_000_000;
const PEG_BPS: i128 = 10_000;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub admin: Address,
    pub oracle: Address,
    pub upper_band_bps: i128,
    pub lower_band_bps: i128,
    pub breaker_bps: i128,
    pub max_price_age: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Price {
    pub price_bps: i128,
    pub updated_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Config,
    Price,
    Paused,
    Index,
    TotalSupply,
    Shares(Address),
}

#[contract]
pub struct AlgorithmicStablecoinContract;

#[contractimpl]
impl AlgorithmicStablecoinContract {
    /// Initialize the protocol around a 1.0 peg represented as 10,000 bps.
    #[allow(clippy::too_many_arguments)]
    pub fn initialize(
        env: Env,
        admin: Address,
        oracle: Address,
        upper_band_bps: i128,
        lower_band_bps: i128,
        breaker_bps: i128,
        max_price_age: u64,
    ) {
        if env.storage().instance().has(&DataKey::Config) {
            panic!("already initialized");
        }
        admin.require_auth();
        if lower_band_bps >= PEG_BPS || upper_band_bps <= PEG_BPS || breaker_bps <= upper_band_bps {
            panic!("invalid bands");
        }
        env.storage().instance().set(
            &DataKey::Config,
            &Config {
                admin,
                oracle,
                upper_band_bps,
                lower_band_bps,
                breaker_bps,
                max_price_age,
            },
        );
        env.storage().instance().set(&DataKey::Paused, &false);
        env.storage().instance().set(&DataKey::Index, &SCALE);
        env.storage().instance().set(&DataKey::TotalSupply, &0_i128);
    }

    /// Oracle-authorized price report. The price uses basis points of $1.
    pub fn report_price(env: Env, oracle: Address, price_bps: i128) {
        let config = config(&env);
        if config.oracle != oracle {
            panic!("not oracle");
        }
        oracle.require_auth();
        if price_bps <= 0 {
            panic!("invalid price");
        }
        env.storage().instance().set(
            &DataKey::Price,
            &Price {
                price_bps,
                updated_at: env.ledger().timestamp(),
            },
        );
    }

    /// Mint new stablecoins to an account.
    ///
    /// Admin minting is intentionally explicit for the educational protocol;
    /// public supply changes occur through rebases.
    pub fn mint(env: Env, admin: Address, to: Address, amount: i128) {
        require_admin(&env, &admin);
        require_not_paused(&env);
        validate_amount(amount);
        let index = index(&env);
        let shares = checked_div(checked_mul(amount, SCALE), index);
        add_shares(&env, to, shares);
        add_total_supply(&env, amount);
    }

    /// Burn tokens from an account.
    pub fn burn(env: Env, from: Address, amount: i128) {
        from.require_auth();
        require_not_paused(&env);
        validate_amount(amount);
        let index = index(&env);
        let shares = checked_div_round_up(checked_mul(amount, SCALE), index);
        sub_shares(&env, from, shares);
        sub_total_supply(&env, amount);
    }

    /// Transfer rebasing balances without changing total supply.
    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();
        require_not_paused(&env);
        validate_amount(amount);
        let shares = checked_div_round_up(checked_mul(amount, SCALE), index(&env));
        sub_shares(&env, from, shares);
        add_shares(&env, to, shares);
    }

    /// Rebase supply according to the latest fresh oracle price.
    ///
    /// Price above peg expands supply; below peg contracts supply. If the price
    /// breaches the circuit breaker, the protocol pauses instead of rebasing.
    pub fn rebase(env: Env) -> i128 {
        require_not_paused(&env);
        let config = config(&env);
        let price = price(&env);
        if checked_add_u64(price.updated_at, config.max_price_age) < env.ledger().timestamp() {
            panic!("stale price");
        }

        if price.price_bps >= config.breaker_bps
            || price.price_bps <= checked_sub(checked_mul(PEG_BPS, 2), config.breaker_bps)
        {
            env.storage().instance().set(&DataKey::Paused, &true);
            panic!("circuit breaker");
        }

        if price.price_bps <= config.upper_band_bps && price.price_bps >= config.lower_band_bps {
            return total_supply(&env);
        }

        let old_supply = total_supply(&env);
        if old_supply == 0 {
            return 0;
        }

        let new_supply = checked_div(checked_mul(old_supply, price.price_bps), PEG_BPS);
        let new_index = checked_div(checked_mul(index(&env), new_supply), old_supply);
        env.storage().instance().set(&DataKey::Index, &new_index);
        env.storage()
            .instance()
            .set(&DataKey::TotalSupply, &new_supply);
        new_supply
    }

    pub fn unpause(env: Env, admin: Address) {
        require_admin(&env, &admin);
        env.storage().instance().set(&DataKey::Paused, &false);
    }

    pub fn balance_of(env: Env, account: Address) -> i128 {
        checked_div(checked_mul(shares(&env, account), index(&env)), SCALE)
    }

    pub fn total_supply(env: Env) -> i128 {
        total_supply(&env)
    }

    pub fn paused(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Paused)
            .unwrap_or(false)
    }

    pub fn name(_env: Env) -> String {
        String::from_str(&_env, "Web3 Student Lab Stablecoin")
    }
}

fn config(env: &Env) -> Config {
    env.storage()
        .instance()
        .get(&DataKey::Config)
        .unwrap_or_else(|| panic!("not initialized"))
}

fn require_admin(env: &Env, admin: &Address) {
    let cfg = config(env);
    if cfg.admin != *admin {
        panic!("not admin");
    }
    admin.require_auth();
}

fn require_not_paused(env: &Env) {
    if env
        .storage()
        .instance()
        .get(&DataKey::Paused)
        .unwrap_or(false)
    {
        panic!("paused");
    }
}

fn price(env: &Env) -> Price {
    env.storage()
        .instance()
        .get(&DataKey::Price)
        .unwrap_or_else(|| panic!("price missing"))
}

fn index(env: &Env) -> i128 {
    env.storage()
        .instance()
        .get(&DataKey::Index)
        .unwrap_or(SCALE)
}

fn shares(env: &Env, account: Address) -> i128 {
    env.storage()
        .persistent()
        .get(&DataKey::Shares(account))
        .unwrap_or(0_i128)
}

fn add_shares(env: &Env, account: Address, amount: i128) {
    let current = shares(env, account.clone());
    env.storage()
        .persistent()
        .set(&DataKey::Shares(account), &checked_add(current, amount));
}

fn sub_shares(env: &Env, account: Address, amount: i128) {
    let current = shares(env, account.clone());
    if amount > current {
        panic!("insufficient balance");
    }
    env.storage()
        .persistent()
        .set(&DataKey::Shares(account), &checked_sub(current, amount));
}

fn total_supply(env: &Env) -> i128 {
    env.storage()
        .instance()
        .get(&DataKey::TotalSupply)
        .unwrap_or(0_i128)
}

fn add_total_supply(env: &Env, amount: i128) {
    env.storage().instance().set(
        &DataKey::TotalSupply,
        &checked_add(total_supply(env), amount),
    );
}

fn sub_total_supply(env: &Env, amount: i128) {
    let supply = total_supply(env);
    if amount > supply {
        panic!("supply underflow");
    }
    env.storage()
        .instance()
        .set(&DataKey::TotalSupply, &checked_sub(supply, amount));
}

fn validate_amount(amount: i128) {
    if amount <= 0 {
        panic!("invalid amount");
    }
}

fn checked_add(left: i128, right: i128) -> i128 {
    match left.checked_add(right) {
        Some(value) => value,
        None => panic!("i128 overflow"),
    }
}

fn checked_sub(left: i128, right: i128) -> i128 {
    match left.checked_sub(right) {
        Some(value) => value,
        None => panic!("i128 underflow"),
    }
}

fn checked_mul(left: i128, right: i128) -> i128 {
    match left.checked_mul(right) {
        Some(value) => value,
        None => panic!("i128 overflow"),
    }
}

fn checked_div(left: i128, right: i128) -> i128 {
    if right == 0 {
        panic!("division by zero");
    }
    left / right
}

fn checked_div_round_up(left: i128, right: i128) -> i128 {
    if right == 0 {
        panic!("division by zero");
    }
    (checked_add(left, checked_sub(right, 1))) / right
}

fn checked_add_u64(left: u64, right: u64) -> u64 {
    match left.checked_add(right) {
        Some(value) => value,
        None => panic!("u64 overflow"),
    }
}

#[cfg(test)]
mod test {
    extern crate std;

    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    fn setup(env: &Env) -> (AlgorithmicStablecoinContractClient, Address, Address) {
        env.mock_all_auths();
        let client = AlgorithmicStablecoinContractClient::new(
            env,
            &env.register_contract(None, AlgorithmicStablecoinContract),
        );
        let admin = Address::generate(env);
        let oracle = Address::generate(env);
        client.initialize(&admin, &oracle, &10_100, &9_900, &12_000, &60);
        (client, admin, oracle)
    }

    #[test]
    fn expands_all_holder_balances_proportionately() {
        let env = Env::default();
        env.ledger().with_mut(|ledger| ledger.timestamp = 100);
        let (client, admin, oracle) = setup(&env);
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);

        client.mint(&admin, &alice, &1_000);
        client.mint(&admin, &bob, &500);
        client.report_price(&oracle, &11_000);
        assert_eq!(client.rebase(), 1_650);

        assert_eq!(client.balance_of(&alice), 1_100);
        assert_eq!(client.balance_of(&bob), 550);
        assert_eq!(client.total_supply(), 1_650);
    }

    #[test]
    fn contracts_supply_below_peg() {
        let env = Env::default();
        env.ledger().with_mut(|ledger| ledger.timestamp = 100);
        let (client, admin, oracle) = setup(&env);
        let alice = Address::generate(&env);

        client.mint(&admin, &alice, &1_000);
        client.report_price(&oracle, &9_500);
        assert_eq!(client.rebase(), 950);
        assert_eq!(client.balance_of(&alice), 950);
    }

    #[test]
    fn ignores_prices_inside_deadband() {
        let env = Env::default();
        env.ledger().with_mut(|ledger| ledger.timestamp = 100);
        let (client, admin, oracle) = setup(&env);
        let alice = Address::generate(&env);

        client.mint(&admin, &alice, &1_000);
        client.report_price(&oracle, &10_050);
        assert_eq!(client.rebase(), 1_000);
        assert_eq!(client.balance_of(&alice), 1_000);
    }

    #[test]
    #[should_panic(expected = "stale price")]
    fn rejects_stale_oracle_prices() {
        let env = Env::default();
        env.ledger().with_mut(|ledger| ledger.timestamp = 100);
        let (client, admin, oracle) = setup(&env);
        let alice = Address::generate(&env);

        client.mint(&admin, &alice, &1_000);
        client.report_price(&oracle, &11_000);
        env.ledger().with_mut(|ledger| ledger.timestamp = 200);
        client.rebase();
    }

    #[test]
    #[should_panic(expected = "circuit breaker")]
    fn circuit_breaker_pauses_extreme_deviation() {
        let env = Env::default();
        env.ledger().with_mut(|ledger| ledger.timestamp = 100);
        let (client, admin, oracle) = setup(&env);
        let alice = Address::generate(&env);

        client.mint(&admin, &alice, &1_000);
        client.report_price(&oracle, &12_500);
        client.rebase();
    }

    #[test]
    fn transfers_and_burns_use_rebased_balance() {
        let env = Env::default();
        env.ledger().with_mut(|ledger| ledger.timestamp = 100);
        let (client, admin, oracle) = setup(&env);
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);

        client.mint(&admin, &alice, &1_000);
        client.report_price(&oracle, &11_000);
        client.rebase();
        client.transfer(&alice, &bob, &110);
        client.burn(&bob, &55);

        assert_eq!(client.balance_of(&alice), 990);
        assert_eq!(client.balance_of(&bob), 55);
        assert_eq!(client.total_supply(), 1_045);
    }
}
