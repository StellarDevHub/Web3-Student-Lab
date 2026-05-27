#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Env, Symbol,
};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Oracle,
    TotalCapital,
    LockedLiability,
    UnderwriterBalance(Address),
    Policy(u64),
    NextPolicyId,
    OracleSignal(Symbol),
    Claimable(Address),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Policy {
    pub id: u64,
    pub buyer: Address,
    pub trigger_key: Symbol,
    pub premium: i128,
    pub payout: i128,
    pub expires_at: u64,
    pub claimed: bool,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum InsuranceError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    InvalidAmount = 4,
    Insolvent = 5,
    PolicyMissing = 6,
    TriggerNotMet = 7,
    Expired = 8,
    AlreadyClaimed = 9,
}

#[contract]
pub struct ParametricInsuranceContract;

#[contractimpl]
impl ParametricInsuranceContract {
    pub fn initialize(env: Env, admin: Address, oracle: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, InsuranceError::AlreadyInitialized);
        }

        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Oracle, &oracle);
        env.storage().instance().set(&DataKey::TotalCapital, &0i128);
        env.storage().instance().set(&DataKey::LockedLiability, &0i128);
        env.storage().instance().set(&DataKey::NextPolicyId, &1u64);
    }

    pub fn underwrite(env: Env, underwriter: Address, amount: i128) {
        ensure_initialized(&env);
        underwriter.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, InsuranceError::InvalidAmount);
        }

        let mut total = total_capital(&env);
        total += amount;
        env.storage().instance().set(&DataKey::TotalCapital, &total);

        let bal: i128 = env
            .storage()
            .instance()
            .get(&DataKey::UnderwriterBalance(underwriter.clone()))
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::UnderwriterBalance(underwriter), &(bal + amount));
    }

    pub fn buy_policy(
        env: Env,
        buyer: Address,
        premium: i128,
        payout: i128,
        expires_at: u64,
        trigger_key: Symbol,
    ) -> u64 {
        ensure_initialized(&env);
        buyer.require_auth();

        if premium <= 0 || payout <= 0 {
            panic_with_error!(&env, InsuranceError::InvalidAmount);
        }
        if expires_at <= env.ledger().timestamp() {
            panic_with_error!(&env, InsuranceError::InvalidAmount);
        }

        let mut total = total_capital(&env);
        total += premium;

        let mut locked = locked_liability(&env);
        locked += payout;
        if total < locked {
            panic_with_error!(&env, InsuranceError::Insolvent);
        }

        let id: u64 = env.storage().instance().get(&DataKey::NextPolicyId).unwrap_or(1);
        let policy = Policy {
            id,
            buyer,
            trigger_key,
            premium,
            payout,
            expires_at,
            claimed: false,
        };

        env.storage().instance().set(&DataKey::Policy(id), &policy);
        env.storage().instance().set(&DataKey::TotalCapital, &total);
        env.storage().instance().set(&DataKey::LockedLiability, &locked);
        env.storage().instance().set(&DataKey::NextPolicyId, &(id + 1));
        id
    }

    pub fn post_oracle_signal(env: Env, oracle: Address, trigger_key: Symbol, fired: bool) {
        ensure_initialized(&env);
        oracle.require_auth();

        let expected_oracle: Address = env
            .storage()
            .instance()
            .get(&DataKey::Oracle)
            .unwrap_or_else(|| panic_with_error!(&env, InsuranceError::NotInitialized));
        if oracle != expected_oracle {
            panic_with_error!(&env, InsuranceError::Unauthorized);
        }

        env.storage()
            .instance()
            .set(&DataKey::OracleSignal(trigger_key), &fired);
    }

    pub fn claim(env: Env, buyer: Address, policy_id: u64) -> i128 {
        ensure_initialized(&env);
        buyer.require_auth();

        let mut policy: Policy = env
            .storage()
            .instance()
            .get(&DataKey::Policy(policy_id))
            .unwrap_or_else(|| panic_with_error!(&env, InsuranceError::PolicyMissing));

        if policy.buyer != buyer {
            panic_with_error!(&env, InsuranceError::Unauthorized);
        }
        if policy.claimed {
            panic_with_error!(&env, InsuranceError::AlreadyClaimed);
        }
        if env.ledger().timestamp() > policy.expires_at {
            panic_with_error!(&env, InsuranceError::Expired);
        }

        let fired: bool = env
            .storage()
            .instance()
            .get(&DataKey::OracleSignal(policy.trigger_key.clone()))
            .unwrap_or(false);
        if !fired {
            panic_with_error!(&env, InsuranceError::TriggerNotMet);
        }

        policy.claimed = true;
        env.storage()
            .instance()
            .set(&DataKey::Policy(policy_id), &policy);

        let mut total = total_capital(&env);
        total -= policy.payout;
        env.storage().instance().set(&DataKey::TotalCapital, &total);

        let mut locked = locked_liability(&env);
        locked -= policy.payout;
        env.storage().instance().set(&DataKey::LockedLiability, &locked);

        let claimable: i128 = env
            .storage()
            .instance()
            .get(&DataKey::Claimable(buyer.clone()))
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::Claimable(buyer), &(claimable + policy.payout));

        policy.payout
    }

    pub fn withdraw_underwriting(env: Env, underwriter: Address, amount: i128) {
        ensure_initialized(&env);
        underwriter.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, InsuranceError::InvalidAmount);
        }

        let current: i128 = env
            .storage()
            .instance()
            .get(&DataKey::UnderwriterBalance(underwriter.clone()))
            .unwrap_or(0);
        if current < amount {
            panic_with_error!(&env, InsuranceError::InvalidAmount);
        }

        let total = total_capital(&env);
        let locked = locked_liability(&env);
        if total - amount < locked {
            panic_with_error!(&env, InsuranceError::Insolvent);
        }

        env.storage()
            .instance()
            .set(&DataKey::UnderwriterBalance(underwriter), &(current - amount));
        env.storage().instance().set(&DataKey::TotalCapital, &(total - amount));
    }

    pub fn get_policy(env: Env, policy_id: u64) -> Option<Policy> {
        env.storage().instance().get(&DataKey::Policy(policy_id))
    }

    pub fn solvency_ratio_bps(env: Env) -> i128 {
        let total = total_capital(&env);
        let locked = locked_liability(&env);
        if locked == 0 {
            return 100_000;
        }
        (total * 10_000) / locked
    }
}

fn ensure_initialized(env: &Env) {
    if !env.storage().instance().has(&DataKey::Admin) {
        panic_with_error!(env, InsuranceError::NotInitialized);
    }
}

fn total_capital(env: &Env) -> i128 {
    env.storage().instance().get(&DataKey::TotalCapital).unwrap_or(0)
}

fn locked_liability(env: &Env) -> i128 {
    env.storage().instance().get(&DataKey::LockedLiability).unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Address, Env, Symbol};

    fn client(env: &Env) -> ParametricInsuranceContractClient<'_> {
        let id = env.register(ParametricInsuranceContract, ());
        ParametricInsuranceContractClient::new(env, &id)
    }

    #[test]
    fn pays_policy_when_oracle_trigger_fires() {
        let env = Env::default();
        env.mock_all_auths();
        let client = client(&env);

        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);
        let buyer = Address::generate(&env);
        let underwriter = Address::generate(&env);

        client.initialize(&admin, &oracle);
        client.underwrite(&underwriter, &10_000);

        let trigger = Symbol::new(&env, "flight_delayed");
        let policy_id = client.buy_policy(
            &buyer,
            &500,
            &4_000,
            &(env.ledger().timestamp() + 50),
            &trigger,
        );

        client.post_oracle_signal(&oracle, &trigger, &true);

        let payout = client.claim(&buyer, &policy_id);
        assert_eq!(payout, 4_000);
        assert!(client.solvency_ratio_bps() > 0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #5)")]
    fn rejects_policy_that_would_break_solvency() {
        let env = Env::default();
        env.mock_all_auths();
        let client = client(&env);

        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);
        let buyer = Address::generate(&env);
        let underwriter = Address::generate(&env);

        client.initialize(&admin, &oracle);
        client.underwrite(&underwriter, &1_000);

        let _ = client.buy_policy(
            &buyer,
            &10,
            &5_000,
            &(env.ledger().timestamp() + 100),
            &Symbol::new(&env, "price_crash"),
        );
    }
}
