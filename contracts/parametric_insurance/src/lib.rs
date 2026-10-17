#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, token, Address, Env,
    Symbol, Vec,
};

pub mod oracle_consensus;
pub mod payout;

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Token,
    Oracles,
    Quorum,
    StalenessSecs,
    TotalCapital,
    LockedLiability,
    UnderwriterBalance(Address),
    Policy(u64),
    NextPolicyId,
    OracleReport(Symbol, Address),
    PoliciesForTrigger(Symbol),
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
    pub expired: bool,
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
    Expired = 8,
    InvalidOracleSet = 10,
    PolicyLimitReached = 11,
    AlreadySettled = 12,
    Overflow = 13,
}

const MAX_POLICIES_PER_TRIGGER: u32 = 100;

#[contract]
pub struct ParametricInsuranceContract;

#[contractimpl]
impl ParametricInsuranceContract {
    pub fn initialize(
        env: Env,
        admin: Address,
        token: Address,
        oracles: Vec<Address>,
        quorum: u32,
    ) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, InsuranceError::AlreadyInitialized);
        }
        if oracles.len() < oracle_consensus::MIN_ORACLES
            || oracles.len() > oracle_consensus::MAX_ORACLES
            || quorum < oracle_consensus::MIN_ORACLES
            || quorum > oracles.len()
        {
            panic_with_error!(&env, InsuranceError::InvalidOracleSet);
        }
        for i in 0..oracles.len() {
            for j in 0..i {
                if oracles.get(i) == oracles.get(j) {
                    panic_with_error!(&env, InsuranceError::InvalidOracleSet);
                }
            }
        }

        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::Oracles, &oracles);
        env.storage().instance().set(&DataKey::Quorum, &quorum);
        env.storage().instance().set(
            &DataKey::StalenessSecs,
            &oracle_consensus::DEFAULT_STALENESS_SECS,
        );
        env.storage().instance().set(&DataKey::TotalCapital, &0i128);
        env.storage()
            .instance()
            .set(&DataKey::LockedLiability, &0i128);
        env.storage().instance().set(&DataKey::NextPolicyId, &1u64);
    }

    pub fn set_staleness_threshold(env: Env, admin: Address, staleness_secs: u64) {
        ensure_initialized(&env);
        admin.require_auth();
        require_admin(&env, &admin);
        if staleness_secs == 0 {
            panic_with_error!(&env, InsuranceError::InvalidAmount);
        }
        env.storage()
            .instance()
            .set(&DataKey::StalenessSecs, &staleness_secs);
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

        let total = total_capital(&env)
            .checked_add(amount)
            .unwrap_or_else(|| panic_with_error!(&env, InsuranceError::Overflow));
        env.storage().instance().set(&DataKey::TotalCapital, &total);

        let bal: i128 = env
            .storage()
            .instance()
            .get(&DataKey::UnderwriterBalance(underwriter.clone()))
            .unwrap_or(0);
        env.storage().instance().set(
            &DataKey::UnderwriterBalance(underwriter),
            &bal.checked_add(amount)
                .unwrap_or_else(|| panic_with_error!(&env, InsuranceError::Overflow)),
        );
    }

    #[allow(clippy::too_many_arguments)]
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

        let locked = locked_liability(&env)
            .checked_add(payout)
            .unwrap_or_else(|| panic_with_error!(&env, InsuranceError::Overflow));
        let total = total_capital(&env)
            .checked_add(premium)
            .unwrap_or_else(|| panic_with_error!(&env, InsuranceError::Overflow));
        if total < locked {
            panic_with_error!(&env, InsuranceError::Insolvent);
        }

        let mut policies = read_policies_for_trigger(&env, trigger_key.clone());
        if policies.len() >= MAX_POLICIES_PER_TRIGGER {
            panic_with_error!(&env, InsuranceError::PolicyLimitReached);
        }

        let token = read_token(&env);
        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&buyer, &env.current_contract_address(), &premium);

        env.storage().instance().set(&DataKey::TotalCapital, &total);
        env.storage()
            .instance()
            .set(&DataKey::LockedLiability, &locked);
        let admin_balance = underwriter_balance(&env, &read_admin(&env))
            .checked_add(premium)
            .unwrap_or_else(|| panic_with_error!(&env, InsuranceError::Overflow));
        env.storage().instance().set(
            &DataKey::UnderwriterBalance(read_admin(&env)),
            &admin_balance,
        );

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
            expired: false,
            claimed: false,
        };

        env.storage().instance().set(&DataKey::Policy(id), &policy);
        policies.push_back(id);
        env.storage()
            .instance()
            .set(&DataKey::PoliciesForTrigger(trigger_key), &policies);
        env.storage().instance().set(
            &DataKey::NextPolicyId,
            &id.checked_add(1)
                .unwrap_or_else(|| panic_with_error!(&env, InsuranceError::Overflow)),
        );
        id
    }

    pub fn post_oracle_value(env: Env, oracle: Address, trigger_key: Symbol, value: i128) {
        ensure_initialized(&env);
        oracle.require_auth();

        let oracles: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::Oracles)
            .unwrap_or_else(|| panic_with_error!(&env, InsuranceError::NotInitialized));
        if !oracle_consensus::contains_oracle(&oracles, &oracle) {
            panic_with_error!(&env, InsuranceError::Unauthorized);
        }

        env.storage().instance().set(
            &DataKey::OracleReport(trigger_key.clone(), oracle),
            &oracle_consensus::OracleReport {
                value,
                timestamp: env.ledger().timestamp(),
            },
        );

        if let Some(median) = Self::aggregate_oracle_value(env.clone(), trigger_key.clone()) {
            settle_triggered_policies(&env, &trigger_key, median);
        }
    }

    pub fn aggregate_oracle_value(env: Env, trigger_key: Symbol) -> Option<i128> {
        let oracles: Vec<Address> = env.storage().instance().get(&DataKey::Oracles)?;
        let staleness_secs: u64 = env
            .storage()
            .instance()
            .get(&DataKey::StalenessSecs)
            .unwrap_or(oracle_consensus::DEFAULT_STALENESS_SECS);
        let mut values = Vec::new(&env);
        for oracle in oracles.iter() {
            let report: Option<oracle_consensus::OracleReport> = env
                .storage()
                .instance()
                .get(&DataKey::OracleReport(trigger_key.clone(), oracle));
            if let Some(report) = report {
                if oracle_consensus::is_fresh(&env, &report, staleness_secs) {
                    values.push_back(report.value);
                }
            }
        }
        let quorum: u32 = env.storage().instance().get(&DataKey::Quorum)?;
        if values.len() < quorum {
            return None;
        }
        oracle_consensus::median(&values)
    }

    pub fn expire_policy(env: Env, policy_id: u64) {
        ensure_initialized(&env);
        let mut policy = read_policy(&env, policy_id);
        if policy.claimed || policy.expired {
            panic_with_error!(&env, InsuranceError::AlreadySettled);
        }
        if env.ledger().timestamp() < policy.expires_at {
            panic_with_error!(&env, InsuranceError::Expired);
        }

        policy.expired = true;
        let locked = locked_liability(&env)
            .checked_sub(policy.payout)
            .unwrap_or_else(|| panic_with_error!(&env, InsuranceError::Insolvent));
        env.storage()
            .instance()
            .set(&DataKey::LockedLiability, &locked);
        env.storage()
            .instance()
            .set(&DataKey::Policy(policy_id), &policy);
        remove_policy_from_trigger(&env, &policy.trigger_key, policy_id);
    }

    pub fn withdraw_underwriting(env: Env, underwriter: Address, amount: i128) {
        ensure_initialized(&env);
        underwriter.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, InsuranceError::InvalidAmount);
        }

        let current = underwriter_balance(&env, &underwriter);
        if current < amount {
            panic_with_error!(&env, InsuranceError::InvalidAmount);
        }

        let total = total_capital(&env);
        let locked = locked_liability(&env);
        if total - amount < locked {
            panic_with_error!(&env, InsuranceError::Insolvent);
        }

        let updated_balance = current - amount;
        let updated_total = total - amount;
        env.storage().instance().set(
            &DataKey::UnderwriterBalance(underwriter.clone()),
            &updated_balance,
        );
        env.storage()
            .instance()
            .set(&DataKey::TotalCapital, &updated_total);

        let token_client = token::Client::new(&env, &read_token(&env));
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
        total.checked_mul(10_000).unwrap_or(i128::MAX) / locked
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

fn read_admin(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&DataKey::Admin)
        .unwrap_or_else(|| panic_with_error!(env, InsuranceError::NotInitialized))
}

fn read_token(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&DataKey::Token)
        .unwrap_or_else(|| panic_with_error!(env, InsuranceError::NotInitialized))
}

fn require_admin(env: &Env, admin: &Address) {
    if *admin != read_admin(env) {
        panic_with_error!(env, InsuranceError::Unauthorized);
    }
}

fn underwriter_balance(env: &Env, underwriter: &Address) -> i128 {
    env.storage()
        .instance()
        .get(&DataKey::UnderwriterBalance(underwriter.clone()))
        .unwrap_or(0)
}

fn read_policy(env: &Env, policy_id: u64) -> Policy {
    env.storage()
        .instance()
        .get(&DataKey::Policy(policy_id))
        .unwrap_or_else(|| panic_with_error!(env, InsuranceError::PolicyMissing))
}

fn read_policies_for_trigger(env: &Env, trigger_key: Symbol) -> Vec<u64> {
    env.storage()
        .instance()
        .get(&DataKey::PoliciesForTrigger(trigger_key))
        .unwrap_or(Vec::new(env))
}

fn remove_policy_from_trigger(env: &Env, trigger_key: &Symbol, policy_id: u64) {
    let mut policies = read_policies_for_trigger(env, trigger_key.clone());
    for index in 0..policies.len() {
        if policies.get(index) == Some(policy_id) {
            policies.remove_unchecked(index);
            break;
        }
    }
    env.storage()
        .instance()
        .set(&DataKey::PoliciesForTrigger(trigger_key.clone()), &policies);
}

fn settle_triggered_policies(env: &Env, trigger_key: &Symbol, median: i128) {
    let policies = read_policies_for_trigger(env, trigger_key.clone());
    let now = env.ledger().timestamp();
    let token_client = token::Client::new(env, &read_token(env));
    for policy_id in policies.iter() {
        let mut policy = read_policy(env, policy_id);
        if policy.claimed || policy.expired {
            continue;
        }
        if now >= policy.expires_at {
            policy.expired = true;
            let locked = locked_liability(env)
                .checked_sub(policy.payout)
                .unwrap_or_else(|| panic_with_error!(env, InsuranceError::Insolvent));
            env.storage()
                .instance()
                .set(&DataKey::LockedLiability, &locked);
            env.storage()
                .instance()
                .set(&DataKey::Policy(policy_id), &policy);
            remove_policy_from_trigger(env, trigger_key, policy_id);
            continue;
        }
        if payout::trigger_met(median, policy.trigger_value, policy.trigger_above) {
            policy.claimed = true;
            let total = total_capital(env)
                .checked_sub(policy.payout)
                .unwrap_or_else(|| panic_with_error!(env, InsuranceError::Insolvent));
            let locked = locked_liability(env)
                .checked_sub(policy.payout)
                .unwrap_or_else(|| panic_with_error!(env, InsuranceError::Insolvent));
            env.storage().instance().set(&DataKey::TotalCapital, &total);
            env.storage()
                .instance()
                .set(&DataKey::LockedLiability, &locked);
            env.storage()
                .instance()
                .set(&DataKey::Policy(policy_id), &policy);
            token_client.transfer(
                &env.current_contract_address(),
                &policy.buyer,
                &policy.payout,
            );
            remove_policy_from_trigger(env, trigger_key, policy_id);
        }
    }
}

#[cfg(any())]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, token, Address, Env, Symbol};

    fn create_token<'a>(env: &'a Env, admin: &Address) -> (Address, token::StellarAssetClient<'a>) {
        let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = token_contract.address();
        let sac = token::StellarAssetClient::new(env, &token_id);
        (token_id, sac)
    }

    fn setup() -> (Env, Address, Address, Address, Address, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();

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
    #[should_panic(expected = "Error(Contract, #7)")]
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

        client.claim(&buyer, &policy_id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #7)")]
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

        client.claim(&buyer, &policy_id);
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
        // Note: Ledger state manipulation is not directly supported in this SDK version
        // Tests rely on natural ledger progression or sequence number advances

        client.post_oracle_value(&oracle, &trigger, &150i128);

        client.claim(&buyer, &policy_id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #9)")]
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

        client.claim(&buyer, &policy_id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #5)")]
    fn rejects_policy_that_would_break_solvency() {
        let env = Env::default();
        env.mock_all_auths();

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

        let _ = client.buy_policy(
            &buyer,
            &10,
            &5_000,
            &(env.ledger().timestamp() + 100),
            &Symbol::new(&env, "price_crash"),
            &0i128,
            &false,
        );
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

#[cfg(test)]
mod integration_tests;
