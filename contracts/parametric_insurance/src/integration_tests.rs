use crate::{ParametricInsuranceContract, ParametricInsuranceContractClient};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token, Address, Env, Symbol, Vec,
};

fn setup_three_oracles(
    quorum: u32,
) -> (
    Env,
    Address,
    Address,
    Address,
    Vec<Address>,
    Address,
    Address,
) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let buyer = Address::generate(&env);
    let underwriter = Address::generate(&env);
    let oracles = Vec::from_array(
        &env,
        [
            Address::generate(&env),
            Address::generate(&env),
            Address::generate(&env),
        ],
    );
    let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
    let token_id = token_contract.address();
    let sac = token::StellarAssetClient::new(&env, &token_id);
    sac.mint(&buyer, &10_000);
    sac.mint(&underwriter, &50_000);
    let contract_id = env.register(ParametricInsuranceContract, ());
    let client = ParametricInsuranceContractClient::new(&env, &contract_id);
    client.initialize(&admin, &token_id, &oracles, &quorum);
    (
        env,
        contract_id,
        token_id,
        admin,
        oracles,
        buyer,
        underwriter,
    )
}

fn setup() -> (Env, Address, Address, Address, Vec<Address>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let buyer = Address::generate(&env);
    let underwriter = Address::generate(&env);
    let oracles = Vec::from_array(
        &env,
        [
            Address::generate(&env),
            Address::generate(&env),
            Address::generate(&env),
        ],
    );
    let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
    let token_id = token_contract.address();
    let sac = token::StellarAssetClient::new(&env, &token_id);
    sac.mint(&buyer, &10_000);
    sac.mint(&underwriter, &50_000);
    let contract_id = env.register(ParametricInsuranceContract, ());
    let client = ParametricInsuranceContractClient::new(&env, &contract_id);
    client.initialize(&admin, &token_id, &oracles, &3);
    (env, contract_id, token_id, admin, oracles, buyer)
}

#[test]
fn median_quorum_pays_policy_automatically() {
    let (env, contract_id, token_id, _admin, oracles, buyer) = setup();
    let client = ParametricInsuranceContractClient::new(&env, &contract_id);
    let underwriter = Address::generate(&env);
    let sac = token::StellarAssetClient::new(&env, &token_id);
    sac.mint(&underwriter, &20_000);
    client.underwrite(&underwriter, &20_000);

    let trigger = Symbol::new(&env, "temperature");
    let policy_id = client.buy_policy(
        &buyer,
        &500,
        &10_000,
        &(env.ledger().timestamp() + 100),
        &trigger,
        &100,
        &true,
    );
    client.post_oracle_value(&oracles.get(0).unwrap(), &trigger, &50);
    client.post_oracle_value(&oracles.get(1).unwrap(), &trigger, &150);
    assert_eq!(client.aggregate_oracle_value(&trigger), None);
    client.post_oracle_value(&oracles.get(2).unwrap(), &trigger, &200);

    let policy = client.get_policy(&policy_id).unwrap();
    assert!(policy.claimed);
    assert_eq!(token::Client::new(&env, &token_id).balance(&buyer), 19_500);
}

#[test]
fn stale_reports_do_not_satisfy_quorum() {
    let (env, contract_id, _token_id, _admin, oracles, _buyer) = setup();
    let client = ParametricInsuranceContractClient::new(&env, &contract_id);
    let trigger = Symbol::new(&env, "rainfall");
    client.post_oracle_value(&oracles.get(0).unwrap(), &trigger, &10);
    client.post_oracle_value(&oracles.get(1).unwrap(), &trigger, &20);

    env.ledger()
        .with_mut(|ledger| ledger.timestamp += crate::oracle_consensus::DEFAULT_STALENESS_SECS + 1);
    client.post_oracle_value(&oracles.get(2).unwrap(), &trigger, &30);
    assert_eq!(client.aggregate_oracle_value(&trigger), None);
}

// ── Multi-oracle quorum (2 of 3) ─────────────────────────────────────────────

#[test]
fn two_of_three_oracles_settle_policy_automatically() {
    let (env, contract_id, token_id, _admin, oracles, buyer, underwriter) = setup_three_oracles(2);
    let client = ParametricInsuranceContractClient::new(&env, &contract_id);
    client.underwrite(&underwriter, &20_000);

    let trigger = Symbol::new(&env, "temperature");
    let policy_id = client.buy_policy(
        &buyer,
        &500,
        &10_000,
        &(env.ledger().timestamp() + 100),
        &trigger,
        &100,
        &true,
    );

    client.post_oracle_value(&oracles.get(0).unwrap(), &trigger, &150);
    assert_eq!(client.aggregate_oracle_value(&trigger), None);
    assert!(!client.get_policy(&policy_id).unwrap().claimed);
    assert_eq!(token::Client::new(&env, &token_id).balance(&buyer), 9_500);

    client.post_oracle_value(&oracles.get(1).unwrap(), &trigger, &200);

    assert_eq!(client.aggregate_oracle_value(&trigger), Some(175));
    assert!(client.get_policy(&policy_id).unwrap().claimed);
    assert_eq!(token::Client::new(&env, &token_id).balance(&buyer), 19_500);
}

#[test]
fn single_oracle_cannot_settle_two_of_three() {
    let (env, contract_id, token_id, _admin, oracles, buyer, underwriter) = setup_three_oracles(2);
    let client = ParametricInsuranceContractClient::new(&env, &contract_id);
    client.underwrite(&underwriter, &20_000);

    let trigger = Symbol::new(&env, "temperature");
    let policy_id = client.buy_policy(
        &buyer,
        &500,
        &10_000,
        &(env.ledger().timestamp() + 100),
        &trigger,
        &100,
        &true,
    );

    client.post_oracle_value(&oracles.get(0).unwrap(), &trigger, &1_000);

    assert_eq!(client.aggregate_oracle_value(&trigger), None);
    assert!(!client.get_policy(&policy_id).unwrap().claimed);
    assert_eq!(token::Client::new(&env, &token_id).balance(&buyer), 9_500);
}

#[test]
fn reports_outside_ledger_window_cannot_join_consensus() {
    let (env, contract_id, _token_id, _admin, oracles, buyer, underwriter) = setup_three_oracles(2);
    let client = ParametricInsuranceContractClient::new(&env, &contract_id);
    client.underwrite(&underwriter, &20_000);

    let trigger = Symbol::new(&env, "temperature");
    let policy_id = client.buy_policy(
        &buyer,
        &500,
        &10_000,
        &(env.ledger().timestamp() + 100),
        &trigger,
        &100,
        &true,
    );

    client.post_oracle_value(&oracles.get(0).unwrap(), &trigger, &150);
    env.ledger().with_mut(|ledger| {
        ledger.sequence_number += crate::oracle_consensus::CONSENSUS_LEDGER_WINDOW + 1
    });
    client.post_oracle_value(&oracles.get(1).unwrap(), &trigger, &200);

    assert_eq!(client.aggregate_oracle_value(&trigger), None);
    assert!(!client.get_policy(&policy_id).unwrap().claimed);

    // A second report inside the same window restores consensus.
    client.post_oracle_value(&oracles.get(2).unwrap(), &trigger, &200);
    assert_eq!(client.aggregate_oracle_value(&trigger), Some(200));
    assert!(client.get_policy(&policy_id).unwrap().claimed);
}

#[test]
fn initialize_accepts_two_of_three_and_rejects_invalid_quorums() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
    let token_id = token_contract.address();
    let oracles = Vec::from_array(
        &env,
        [
            Address::generate(&env),
            Address::generate(&env),
            Address::generate(&env),
        ],
    );
    let contract_id = env.register(ParametricInsuranceContract, ());
    let client = ParametricInsuranceContractClient::new(&env, &contract_id);

    assert!(client
        .try_initialize(&admin, &token_id, &oracles, &1)
        .is_err());
    assert!(client
        .try_initialize(&admin, &token_id, &oracles, &4)
        .is_err());

    client.initialize(&admin, &token_id, &oracles, &2);
    assert_eq!(client.coverage_ratio_bps(), 8_000);
}

// ── Coverage-ratio solvency invariant ────────────────────────────────────────

#[test]
fn underwriting_halts_when_new_coverage_breaches_capacity() {
    let (env, contract_id, _token_id, _admin, _oracles, buyer, underwriter) =
        setup_three_oracles(2);
    let client = ParametricInsuranceContractClient::new(&env, &contract_id);
    client.underwrite(&underwriter, &10_000);

    assert_eq!(client.coverage_ratio_bps(), 8_000);
    assert_eq!(client.coverage_capacity(), 8_000);

    // Exactly at capacity is allowed; the premium raises reserves by 1.
    let policy_id = client.buy_policy(
        &buyer,
        &1,
        &8_000,
        &(env.ledger().timestamp() + 100),
        &Symbol::new(&env, "hackathon"),
        &0,
        &false,
    );
    assert_eq!(client.get_policy(&policy_id).unwrap().payout, 8_000);

    // One unit of extra coverage would breach the ratio.
    let result = client.try_buy_policy(
        &buyer,
        &1,
        &2,
        &(env.ledger().timestamp() + 100),
        &Symbol::new(&env, "rpc_outage"),
        &0,
        &false,
    );
    assert!(result.is_err(), "coverage above capacity must be rejected");
}

#[test]
fn only_admin_can_change_coverage_ratio_and_bounds_enforced() {
    let (env, contract_id, _token_id, admin, _oracles, _buyer, underwriter) =
        setup_three_oracles(2);
    let client = ParametricInsuranceContractClient::new(&env, &contract_id);
    client.underwrite(&underwriter, &10_000);

    let stranger = Address::generate(&env);
    assert!(client.try_set_coverage_ratio(&stranger, &9_000).is_err());
    assert!(client.try_set_coverage_ratio(&admin, &0).is_err());
    assert!(client.try_set_coverage_ratio(&admin, &10_001).is_err());

    client.set_coverage_ratio(&admin, &10_000);
    assert_eq!(client.coverage_capacity(), 10_000);
}

#[test]
fn coverage_ratio_cannot_drop_below_existing_liability() {
    let (env, contract_id, _token_id, admin, _oracles, buyer, underwriter) = setup_three_oracles(2);
    let client = ParametricInsuranceContractClient::new(&env, &contract_id);
    client.underwrite(&underwriter, &10_000);
    client.set_coverage_ratio(&admin, &10_000);

    client.buy_policy(
        &buyer,
        &1,
        &9_000,
        &(env.ledger().timestamp() + 100),
        &Symbol::new(&env, "hackathon"),
        &0,
        &false,
    );

    assert!(client.try_set_coverage_ratio(&admin, &8_000).is_err());
    // 9 000 bps of the 10 001 reserve still covers the 9 000 liability.
    client.set_coverage_ratio(&admin, &9_000);
    assert_eq!(client.coverage_capacity(), 9_000);
}

#[test]
fn withdraw_underwriting_blocked_when_it_would_breach_ratio() {
    let (env, contract_id, _token_id, _admin, _oracles, buyer, underwriter) =
        setup_three_oracles(2);
    let client = ParametricInsuranceContractClient::new(&env, &contract_id);
    client.underwrite(&underwriter, &10_000);
    client.buy_policy(
        &buyer,
        &1,
        &8_000,
        &(env.ledger().timestamp() + 100),
        &Symbol::new(&env, "hackathon"),
        &0,
        &false,
    );

    assert!(client
        .try_withdraw_underwriting(&underwriter, &1_000)
        .is_err());
    client.withdraw_underwriting(&underwriter, &1);
    assert_eq!(client.coverage_capacity(), 8_000);
}

#[test]
fn expiry_releases_liability_and_premium_to_insurer() {
    let (env, contract_id, token_id, admin, _oracles, buyer) = setup();
    let client = ParametricInsuranceContractClient::new(&env, &contract_id);
    let underwriter = Address::generate(&env);
    let sac = token::StellarAssetClient::new(&env, &token_id);
    sac.mint(&underwriter, &20_000);
    client.underwrite(&underwriter, &20_000);

    let expires_at = env.ledger().timestamp() + 50;
    let policy_id = client.buy_policy(
        &buyer,
        &500,
        &10_000,
        &expires_at,
        &Symbol::new(&env, "wind"),
        &100,
        &true,
    );
    env.ledger()
        .with_mut(|ledger| ledger.timestamp = expires_at);
    client.expire_policy(&policy_id);
    client.withdraw_underwriting(&admin, &500);

    let token_client = token::Client::new(&env, &token_id);
    assert_eq!(token_client.balance(&admin), 500);
    assert_eq!(client.get_policy(&policy_id).unwrap().expired, true);
    assert_eq!(client.solvency_ratio_bps(), 100_000);
}
