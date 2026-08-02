#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, token, Address, Env,
    Symbol,
};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Token,
    Oracle,
    TotalCapital,
    LockedLiability,
    UnderwriterBalance(Address),
    Policy(u64),
    NextPolicyId,
    OracleValue(Symbol),
    Claimable(Address),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Policy {
    pub id: u64,
    pub buyer: Address,
    pub trigger_key: Symbol,
    pub trigger_value: i128,
    pub trigger_above: bool,
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
    pub fn initialize(env: Env, admin: Address, token: Address, oracle: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, InsuranceError::AlreadyInitialized);
        }

        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::Oracle, &oracle);
        env.storage().instance().set(&DataKey::TotalCapital, &0i128);
        env.storage()
            .instance()
            .set(&DataKey::LockedLiability, &0i128);
        env.storage().instance().set(&DataKey::NextPolicyId, &1u64);
    }

    pub fn underwrite(env: Env, underwriter: Address, amount: i128) {
        ensure_initialized(&env);
        underwriter.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, InsuranceError::InvalidAmount);
        }

        let token: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .unwrap_or_else(|| panic_with_error!(&env, InsuranceError::NotInitialized));

        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&underwriter, &env.current_contract_address(), &amount);

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
        trigger_value: i128,
        trigger_above: bool,
    ) -> u64 {
        ensure_initialized(&env);
        buyer.require_auth();

        if premium <= 0 || payout <= 0 {
            panic_with_error!(&env, InsuranceError::InvalidAmount);
        }
        if expires_at <= env.ledger().timestamp() {
            panic_with_error!(&env, InsuranceError::InvalidAmount);
        }

        let mut locked = locked_liability(&env);
        locked += payout;
        let mut total = total_capital(&env);
        if total + premium < locked {
            panic_with_error!(&env, InsuranceError::Insolvent);
        }

        let token: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .unwrap_or_else(|| panic_with_error!(&env, InsuranceError::NotInitialized));

        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&buyer, &env.current_contract_address(), &premium);

        total += premium;
        env.storage().instance().set(&DataKey::TotalCapital, &total);
        env.storage()
            .instance()
            .set(&DataKey::LockedLiability, &locked);

        let id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextPolicyId)
            .unwrap_or(1);
        let policy = Policy {
            id,
            buyer,
            trigger_key,
            trigger_value,
            trigger_above,
            premium,
            payout,
            expires_at,
            claimed: false,
        };

        env.storage().instance().set(&DataKey::Policy(id), &policy);
        env.storage()
            .instance()
            .set(&DataKey::NextPolicyId, &(id + 1));
        id
    }

    pub fn post_oracle_value(env: Env, oracle: Address, trigger_key: Symbol, value: i128) {
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
            .set(&DataKey::OracleValue(trigger_key), &value);
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

        let oracle_value: i128 = env
            .storage()
            .instance()
            .get(&DataKey::OracleValue(policy.trigger_key.clone()))
            .unwrap_or_else(|| panic_with_error!(&env, InsuranceError::TriggerNotMet));

        let trigger_met = if policy.trigger_above {
            oracle_value >= policy.trigger_value
        } else {
            oracle_value <= policy.trigger_value
        };
        if !trigger_met {
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
        env.storage()
            .instance()
            .set(&DataKey::LockedLiability, &locked);

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

        env.storage().instance().set(
            &DataKey::UnderwriterBalance(underwriter.clone()),
            &(current - amount),
        );
        env.storage()
            .instance()
            .set(&DataKey::TotalCapital, &(total - amount));

        let token: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .unwrap_or_else(|| panic_with_error!(&env, InsuranceError::NotInitialized));

        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&env.current_contract_address(), &underwriter, &amount);
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

    pub fn withdraw_claim(env: Env, buyer: Address, amount: i128) {
        ensure_initialized(&env);
        buyer.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, InsuranceError::InvalidAmount);
        }

        let claimable: i128 = env
            .storage()
            .instance()
            .get(&DataKey::Claimable(buyer.clone()))
            .unwrap_or(0);
        if claimable < amount {
            panic_with_error!(&env, InsuranceError::InvalidAmount);
        }

        env.storage()
            .instance()
            .set(&DataKey::Claimable(buyer.clone()), &(claimable - amount));

        let token: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .unwrap_or_else(|| panic_with_error!(&env, InsuranceError::NotInitialized));

        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&env.current_contract_address(), &buyer, &amount);
    }
}

fn ensure_initialized(env: &Env) {
    if !env.storage().instance().has(&DataKey::Admin) {
        panic_with_error!(env, InsuranceError::NotInitialized);
    }
}

fn total_capital(env: &Env) -> i128 {
    env.storage()
        .instance()
        .get(&DataKey::TotalCapital)
        .unwrap_or(0)
}

fn locked_liability(env: &Env) -> i128 {
    env.storage()
        .instance()
        .get(&DataKey::LockedLiability)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        token, Address, Env, Symbol,
    };

    fn create_token(env: &Env, admin: &Address) -> (Address, token::StellarAssetClient<'_>) {
        let token_id = env.register_stellar_asset_contract_v2(admin.clone());
        let sac = token::StellarAssetClient::new(env, &token_id);
        (token_id, sac)
    }

    fn setup() -> (Env, Address, Address, Address, Address, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set(Ledger {
            timestamp: 1_000_000,
            ..Default::default()
        });

        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);
        let buyer = Address::generate(&env);
        let underwriter = Address::generate(&env);

        let (token, sac) = create_token(&env, &admin);
        sac.mint(&underwriter, &50_000);
        sac.mint(&buyer, &10_000);

        let contract_id = env.register(ParametricInsuranceContract, ());
        let client = ParametricInsuranceContractClient::new(&env, &contract_id);
        client.initialize(&admin, &token, &oracle);

        (env, contract_id, token, admin, oracle, buyer, underwriter)
    }

    #[test]
    fn buys_policy_and_claims_on_trigger() {
        let (env, _contract_id, _token, _admin, oracle, buyer, underwriter) = setup();
        let client = ParametricInsuranceContractClient::new(&env, &_contract_id);

        client.underwrite(&underwriter, &30_000);

        let trigger = Symbol::new(&env, "temp_celsius");
        let policy_id = client.buy_policy(
            &buyer,
            &500,
            &10_000,
            &(env.ledger().timestamp() + 100),
            &trigger,
            &35i128,
            &true,
        );

        let policy = client.get_policy(&policy_id).unwrap();
        assert_eq!(policy.premium, 500);
        assert_eq!(policy.payout, 10_000);
        assert!(!policy.claimed);

        client.post_oracle_value(&oracle, &trigger, &42i128);

        let payout = client.claim(&buyer, &policy_id);
        assert_eq!(payout, 10_000);
    }

    #[test]
    fn rejects_claim_when_oracle_not_set() {
        let (env, _contract_id, _token, _admin, _oracle, buyer, underwriter) = setup();
        let client = ParametricInsuranceContractClient::new(&env, &_contract_id);

        client.underwrite(&underwriter, &30_000);

        let trigger = Symbol::new(&env, "temp_celsius");
        let policy_id = client.buy_policy(
            &buyer,
            &500,
            &10_000,
            &(env.ledger().timestamp() + 100),
            &trigger,
            &35i128,
            &true,
        );

        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.claim(&buyer, &policy_id);
        }));
        assert!(result.is_err());
    }

    #[test]
    fn rejects_claim_when_trigger_not_met_below() {
        let (env, _contract_id, _token, _admin, oracle, buyer, underwriter) = setup();
        let client = ParametricInsuranceContractClient::new(&env, &_contract_id);

        client.underwrite(&underwriter, &30_000);

        // Policy triggers when temp is BELOW 10
        let trigger = Symbol::new(&env, "temp_celsius");
        let policy_id = client.buy_policy(
            &buyer,
            &500,
            &5_000,
            &(env.ledger().timestamp() + 100),
            &trigger,
            &10i128,
            &false,
        );

        // Oracle posts 25 - trigger NOT met (25 > 10, but we need <= 10)
        client.post_oracle_value(&oracle, &trigger, &25i128);

        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.claim(&buyer, &policy_id);
        }));
        assert!(result.is_err());
    }

    #[test]
    fn claims_when_trigger_below() {
        let (env, _contract_id, _token, _admin, oracle, buyer, underwriter) = setup();
        let client = ParametricInsuranceContractClient::new(&env, &_contract_id);

        client.underwrite(&underwriter, &30_000);

        // Policy triggers when oracle value is BELOW 10
        let trigger = Symbol::new(&env, "temp_celsius");
        let policy_id = client.buy_policy(
            &buyer,
            &500,
            &5_000,
            &(env.ledger().timestamp() + 100),
            &trigger,
            &10i128,
            &false,
        );

        client.post_oracle_value(&oracle, &trigger, &5i128);

        let payout = client.claim(&buyer, &policy_id);
        assert_eq!(payout, 5_000);
    }

    #[test]
    fn rejects_expired_policy() {
        let (env, _contract_id, _token, _admin, oracle, buyer, underwriter) = setup();
        let client = ParametricInsuranceContractClient::new(&env, &_contract_id);

        client.underwrite(&underwriter, &30_000);

        let trigger = Symbol::new(&env, "rainfall_mm");
        let policy_id = client.buy_policy(
            &buyer,
            &200,
            &3_000,
            &(env.ledger().timestamp() + 10),
            &trigger,
            &100i128,
            &true,
        );

        // Advance time past expiry
        env.ledger().set(Ledger {
            timestamp: 1_000_020,
            ..Default::default()
        });

        client.post_oracle_value(&oracle, &trigger, &150i128);

        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.claim(&buyer, &policy_id);
        }));
        assert!(result.is_err());
    }

    #[test]
    fn prevents_double_claim() {
        let (env, _contract_id, _token, _admin, oracle, buyer, underwriter) = setup();
        let client = ParametricInsuranceContractClient::new(&env, &_contract_id);

        client.underwrite(&underwriter, &30_000);

        let trigger = Symbol::new(&env, "wind_speed");
        let policy_id = client.buy_policy(
            &buyer,
            &300,
            &5_000,
            &(env.ledger().timestamp() + 100),
            &trigger,
            &80i128,
            &true,
        );

        client.post_oracle_value(&oracle, &trigger, &120i128);

        client.claim(&buyer, &policy_id);

        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.claim(&buyer, &policy_id);
        }));
        assert!(result.is_err());
    }

    #[test]
    fn rejects_policy_that_would_break_solvency() {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set(Ledger {
            timestamp: 1_000_000,
            ..Default::default()
        });

        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);
        let buyer = Address::generate(&env);
        let underwriter = Address::generate(&env);

        let (token, sac) = create_token(&env, &admin);
        sac.mint(&underwriter, &1_000);

        let contract_id = env.register(ParametricInsuranceContract, ());
        let client = ParametricInsuranceContractClient::new(&env, &contract_id);
        client.initialize(&admin, &token, &oracle);
        client.underwrite(&underwriter, &1_000);

        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _ = client.buy_policy(
                &buyer,
                &10,
                &5_000,
                &(env.ledger().timestamp() + 100),
                &Symbol::new(&env, "price_crash"),
                &0i128,
                &false,
            );
        }));
        assert!(result.is_err());
    }

    #[test]
    fn underwriter_can_withdraw() {
        let (env, _contract_id, _token, _admin, _oracle, _buyer, underwriter) = setup();
        let client = ParametricInsuranceContractClient::new(&env, &_contract_id);

        client.underwrite(&underwriter, &20_000);
        client.withdraw_underwriting(&underwriter, &5_000);

        let token_client = token::Client::new(&env, &_token);
        // Underwriter deposited 20k, withdrew 5k => balance unchanged (just moved back)
        let bal = token_client.balance(&underwriter);
        // Started with 50k, deposited 20k (30k remaining), withdrew 5k (35k)
        assert_eq!(bal, 35_000);
    }

    #[test]
    fn buyer_can_withdraw_claim() {
        let (env, _contract_id, _token, _admin, oracle, buyer, underwriter) = setup();
        let client = ParametricInsuranceContractClient::new(&env, &_contract_id);

        client.underwrite(&underwriter, &30_000);

        let trigger = Symbol::new(&env, "temp");
        let policy_id = client.buy_policy(
            &buyer,
            &500,
            &10_000,
            &(env.ledger().timestamp() + 100),
            &trigger,
            &35i128,
            &true,
        );

        client.post_oracle_value(&oracle, &trigger, &42i128);
        client.claim(&buyer, &policy_id);
        client.withdraw_claim(&buyer, &10_000);

        let token_client = token::Client::new(&env, &_token);
        let buyer_bal = token_client.balance(&buyer);
        // Started with 10_000, paid 500 premium, withdrew 10_000 claim => 19_500
        assert_eq!(buyer_bal, 19_500);
    }

    #[test]
    fn solvency_ratio_works() {
        let (env, _contract_id, _token, _admin, _oracle, _buyer, underwriter) = setup();
        let client = ParametricInsuranceContractClient::new(&env, &_contract_id);

        // No liabilities yet
        assert_eq!(client.solvency_ratio_bps(), 100_000);

        client.underwrite(&underwriter, &20_000);
        assert_eq!(client.solvency_ratio_bps(), 100_000);
    }
}
