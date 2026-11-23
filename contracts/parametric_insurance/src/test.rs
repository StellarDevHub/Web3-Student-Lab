//! Tests for SC-HARD-12 — Parametric Insurance with Multi-Oracle Quorum.
//!
//! Covers:
//! - Policy creation and state initialisation
//! - Single-oracle happy path (quorum = 1)
//! - Multi-oracle quorum — payout triggers only after required reports
//! - Median calculation — correct median used for trigger evaluation
//! - Trigger-not-met rejection (oracle posts value that doesn't cross threshold)
//! - Oracle quorum not met rejection
//! - Claim expiry rejection
//! - Double-claim prevention
//! - Solvency check at policy purchase
//! - Underwriter deposit and withdrawal
//! - Full payout flow including withdraw_claim

use crate::{InsuranceError, ParametricInsuranceContract, ParametricInsuranceContractClient};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token, Address, Env, Symbol, Vec,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

fn create_token<'a>(env: &'a Env, admin: &Address) -> (Address, token::StellarAssetClient<'a>) {
    let contract = env.register_stellar_asset_contract_v2(admin.clone());
    let id = contract.address();
    let sac = token::StellarAssetClient::new(env, &id);
    (id, sac)
}

/// Deploy and initialise with a single oracle, quorum = 1.
fn setup_single_oracle(
) -> (Env, Address, Address, Address, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    let buyer = Address::generate(&env);
    let underwriter = Address::generate(&env);

    let (token, sac) = create_token(&env, &admin);
    sac.mint(&underwriter, &100_000);
    sac.mint(&buyer, &10_000);

    let contract_id = env.register(ParametricInsuranceContract, ());
    let client = ParametricInsuranceContractClient::new(&env, &contract_id);
    let oracles = Vec::from_array(&env, [oracle.clone()]);
    client.initialize(&admin, &token, &oracles, &1);

    (env, contract_id, token, admin, oracle, buyer, underwriter)
}

/// Deploy with three oracles, quorum = 2.
fn setup_multi_oracle(
) -> (Env, Address, Address, Address, Address, Address, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let oracle1 = Address::generate(&env);
    let oracle2 = Address::generate(&env);
    let oracle3 = Address::generate(&env);
    let buyer = Address::generate(&env);
    let underwriter = Address::generate(&env);

    let (token, sac) = create_token(&env, &admin);
    sac.mint(&underwriter, &100_000);
    sac.mint(&buyer, &10_000);

    let contract_id = env.register(ParametricInsuranceContract, ());
    let client = ParametricInsuranceContractClient::new(&env, &contract_id);
    let oracles = Vec::from_array(&env, [oracle1.clone(), oracle2.clone(), oracle3.clone()]);
    client.initialize(&admin, &token, &oracles, &2);

    (env, contract_id, token, admin, oracle1, oracle2, oracle3, buyer, underwriter)
}

// ── Initialisation ────────────────────────────────────────────────────────────

#[test]
fn test_initialize_sets_solvency_ratio() {
    let (env, contract_id, ..) = setup_single_oracle();
    let client = ParametricInsuranceContractClient::new(&env, &contract_id);
    // No liabilities yet → 100 000 bps
    assert_eq!(client.solvency_ratio_bps(), 100_000);
}

#[test]
fn test_double_initialize_rejected() {
    let (env, contract_id, token, admin, oracle, ..) = setup_single_oracle();
    let client = ParametricInsuranceContractClient::new(&env, &contract_id);
    let oracles = Vec::from_array(&env, [oracle.clone()]);
    let result = client.try_initialize(&admin, &token, &oracles, &1);
    assert!(result.is_err(), "double init must fail");
}

// ── Underwriting ──────────────────────────────────────────────────────────────

#[test]
fn test_underwriter_deposits_capital() {
    let (env, contract_id, .., underwriter) = setup_single_oracle();
    let client = ParametricInsuranceContractClient::new(&env, &contract_id);
    client.underwrite(&underwriter, &20_000);
    // Solvency still unlimited (no locked liability)
    assert_eq!(client.solvency_ratio_bps(), 100_000);
}

#[test]
fn test_underwriter_withdraws_capital() {
    let (env, contract_id, token, _admin, _oracle, _buyer, underwriter) = setup_single_oracle();
    let client = ParametricInsuranceContractClient::new(&env, &contract_id);
    client.underwrite(&underwriter, &20_000);
    client.withdraw_underwriting(&underwriter, &5_000);

    let token_client = token::Client::new(&env, &token);
    // Started with 100k, deposited 20k (80k left), withdrew 5k (85k left)
    assert_eq!(token_client.balance(&underwriter), 85_000);
}

// ── Policy purchase ───────────────────────────────────────────────────────────

#[test]
fn test_buy_policy_success() {
    let (env, contract_id, _token, _admin, _oracle, buyer, underwriter) = setup_single_oracle();
    let client = ParametricInsuranceContractClient::new(&env, &contract_id);
    client.underwrite(&underwriter, &30_000);

    let trigger = Symbol::new(&env, "temp_c");
    let id = client.buy_policy(
        &buyer,
        &500,
        &10_000,
        &(env.ledger().timestamp() + 100),
        &trigger,
        &35i128,
        &true,
    );

    let policy = client.get_policy(&id).unwrap();
    assert_eq!(policy.payout, 10_000);
    assert!(!policy.claimed);
}

#[test]
fn test_buy_policy_rejected_when_insolvent() {
    let (env, contract_id, _token, _admin, _oracle, buyer, underwriter) = setup_single_oracle();
    let client = ParametricInsuranceContractClient::new(&env, &contract_id);
    client.underwrite(&underwriter, &1_000);

    let trigger = Symbol::new(&env, "crash");
    let result = client.try_buy_policy(
        &buyer,
        &10,
        &50_000, // payout >> capital → insolvent
        &(env.ledger().timestamp() + 100),
        &trigger,
        &0i128,
        &false,
    );
    assert!(result.is_err(), "insolvent purchase must be rejected");
}

// ── Single-oracle claim (quorum = 1) ─────────────────────────────────────────

#[test]
fn test_claim_succeeds_single_oracle() {
    let (env, contract_id, _token, _admin, oracle, buyer, underwriter) = setup_single_oracle();
    let client = ParametricInsuranceContractClient::new(&env, &contract_id);
    client.underwrite(&underwriter, &30_000);

    let trigger = Symbol::new(&env, "temp_c");
    let id = client.buy_policy(
        &buyer,
        &500,
        &10_000,
        &(env.ledger().timestamp() + 100),
        &trigger,
        &35i128,
        &true,
    );

    client.post_oracle_value(&oracle, &trigger, &42i128);
    let payout = client.claim(&buyer, &id);
    assert_eq!(payout, 10_000);
}

#[test]
fn test_claim_rejected_trigger_not_met() {
    let (env, contract_id, _token, _admin, oracle, buyer, underwriter) = setup_single_oracle();
    let client = ParametricInsuranceContractClient::new(&env, &contract_id);
    client.underwrite(&underwriter, &30_000);

    let trigger = Symbol::new(&env, "temp_c");
    let id = client.buy_policy(
        &buyer,
        &500,
        &10_000,
        &(env.ledger().timestamp() + 100),
        &trigger,
        &35i128,
        &true, // above trigger
    );

    // Oracle posts 20 — below threshold of 35
    client.post_oracle_value(&oracle, &trigger, &20i128);
    let result = client.try_claim(&buyer, &id);
    assert!(result.is_err(), "trigger not met must reject claim");
}

#[test]
fn test_claim_rejected_no_oracle_data() {
    let (env, contract_id, .., buyer, underwriter) = setup_single_oracle();
    let client = ParametricInsuranceContractClient::new(&env, &contract_id);
    client.underwrite(&underwriter, &30_000);

    let trigger = Symbol::new(&env, "temp_c");
    let id = client.buy_policy(
        &buyer,
        &500,
        &10_000,
        &(env.ledger().timestamp() + 100),
        &trigger,
        &35i128,
        &true,
    );

    // No oracle data posted
    let result = client.try_claim(&buyer, &id);
    assert!(result.is_err(), "missing oracle data must reject claim");
}

// ── Multi-oracle quorum (quorum = 2) ──────────────────────────────────────────

#[test]
fn test_claim_rejected_below_quorum() {
    let (env, contract_id, _token, _admin, oracle1, _oracle2, _oracle3, buyer, underwriter) =
        setup_multi_oracle();
    let client = ParametricInsuranceContractClient::new(&env, &contract_id);
    client.underwrite(&underwriter, &30_000);

    let trigger = Symbol::new(&env, "wind_kph");
    let id = client.buy_policy(
        &buyer,
        &500,
        &10_000,
        &(env.ledger().timestamp() + 100),
        &trigger,
        &100i128,
        &true,
    );

    // Only one oracle posts (quorum = 2 required)
    client.post_oracle_value(&oracle1, &trigger, &150i128);
    let result = client.try_claim(&buyer, &id);
    assert!(result.is_err(), "quorum not met must reject claim");
}

#[test]
fn test_claim_succeeds_when_quorum_met() {
    let (env, contract_id, _token, _admin, oracle1, oracle2, _oracle3, buyer, underwriter) =
        setup_multi_oracle();
    let client = ParametricInsuranceContractClient::new(&env, &contract_id);
    client.underwrite(&underwriter, &30_000);

    let trigger = Symbol::new(&env, "wind_kph");
    let id = client.buy_policy(
        &buyer,
        &500,
        &10_000,
        &(env.ledger().timestamp() + 100),
        &trigger,
        &100i128,
        &true,
    );

    // Two oracles post — quorum met
    client.post_oracle_value(&oracle1, &trigger, &120i128);
    client.post_oracle_value(&oracle2, &trigger, &130i128);

    // Median of [120, 130] → 130 (upper of the two, index = len/2 = 1)
    let payout = client.claim(&buyer, &id);
    assert_eq!(payout, 10_000);
}

// ── Median correctness ────────────────────────────────────────────────────────

#[test]
fn test_median_below_trigger_with_3_oracles() {
    // 3 oracles: [200, 50, 80] → sorted [50, 80, 200] → median = 80
    // Trigger: above 100 → NOT met
    let (env, contract_id, _token, _admin, oracle1, oracle2, oracle3, buyer, underwriter) =
        setup_multi_oracle();
    let client = ParametricInsuranceContractClient::new(&env, &contract_id);
    // Override quorum to 3
    // We have to re-register for quorum=3; use a separate env instead
    let env2 = Env::default();
    env2.mock_all_auths();
    let admin2 = Address::generate(&env2);
    let o1 = Address::generate(&env2);
    let o2 = Address::generate(&env2);
    let o3 = Address::generate(&env2);
    let b = Address::generate(&env2);
    let uw = Address::generate(&env2);
    let (tok2, sac2) = create_token(&env2, &admin2);
    sac2.mint(&uw, &100_000);
    sac2.mint(&b, &10_000);

    let cid2 = env2.register(ParametricInsuranceContract, ());
    let c2 = ParametricInsuranceContractClient::new(&env2, &cid2);
    let oracles2 = Vec::from_array(&env2, [o1.clone(), o2.clone(), o3.clone()]);
    c2.initialize(&admin2, &tok2, &oracles2, &3);
    c2.underwrite(&uw, &50_000);

    let trigger = Symbol::new(&env2, "price");
    let id = c2.buy_policy(
        &b,
        &500,
        &10_000,
        &(env2.ledger().timestamp() + 100),
        &trigger,
        &100i128,
        &true, // above 100
    );

    c2.post_oracle_value(&o1, &trigger, &200i128);
    c2.post_oracle_value(&o2, &trigger, &50i128);
    c2.post_oracle_value(&o3, &trigger, &80i128);
    // Median = 80 → trigger NOT met (need > 100)
    let result = c2.try_claim(&b, &id);
    assert!(result.is_err(), "median 80 below trigger 100 → reject");

    // keep unused vars quiet
    let _ = (env, contract_id, oracle1, oracle2, oracle3, buyer, underwriter);
}

#[test]
fn test_median_above_trigger_with_3_oracles() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let o1 = Address::generate(&env);
    let o2 = Address::generate(&env);
    let o3 = Address::generate(&env);
    let buyer = Address::generate(&env);
    let uw = Address::generate(&env);
    let (token, sac) = create_token(&env, &admin);
    sac.mint(&uw, &100_000);
    sac.mint(&buyer, &10_000);

    let cid = env.register(ParametricInsuranceContract, ());
    let client = ParametricInsuranceContractClient::new(&env, &cid);
    let oracles = Vec::from_array(&env, [o1.clone(), o2.clone(), o3.clone()]);
    client.initialize(&admin, &token, &oracles, &3);
    client.underwrite(&uw, &50_000);

    let trigger = Symbol::new(&env, "rainfall");
    let id = client.buy_policy(
        &buyer,
        &500,
        &10_000,
        &(env.ledger().timestamp() + 100),
        &trigger,
        &100i128,
        &true, // above 100
    );

    // [50, 150, 200] → sorted → median = 150 → trigger met
    client.post_oracle_value(&o1, &trigger, &50i128);
    client.post_oracle_value(&o2, &trigger, &150i128);
    client.post_oracle_value(&o3, &trigger, &200i128);

    let payout = client.claim(&buyer, &id);
    assert_eq!(payout, 10_000);
}

// ── Expiry ────────────────────────────────────────────────────────────────────

#[test]
fn test_expired_policy_rejected() {
    let (env, contract_id, _token, _admin, oracle, buyer, underwriter) = setup_single_oracle();
    let client = ParametricInsuranceContractClient::new(&env, &contract_id);
    client.underwrite(&underwriter, &30_000);

    let trigger = Symbol::new(&env, "rain_mm");
    let expiry = env.ledger().timestamp() + 50;
    let id = client.buy_policy(&buyer, &200, &3_000, &expiry, &trigger, &100i128, &true);

    // Advance past expiry
    env.ledger().with_mut(|l| l.timestamp = expiry + 1);
    client.post_oracle_value(&oracle, &trigger, &150i128);

    let result = client.try_claim(&buyer, &id);
    assert!(result.is_err(), "expired policy must be rejected");
}

// ── Double-claim ──────────────────────────────────────────────────────────────

#[test]
fn test_double_claim_rejected() {
    let (env, contract_id, _token, _admin, oracle, buyer, underwriter) = setup_single_oracle();
    let client = ParametricInsuranceContractClient::new(&env, &contract_id);
    client.underwrite(&underwriter, &30_000);

    let trigger = Symbol::new(&env, "wind");
    let id = client.buy_policy(
        &buyer,
        &300,
        &5_000,
        &(env.ledger().timestamp() + 100),
        &trigger,
        &80i128,
        &true,
    );
    client.post_oracle_value(&oracle, &trigger, &120i128);
    client.claim(&buyer, &id);

    let result = client.try_claim(&buyer, &id);
    assert!(result.is_err(), "double claim must be rejected");
}

// ── Full payout flow ──────────────────────────────────────────────────────────

#[test]
fn test_full_flow_claim_and_withdraw() {
    let (env, contract_id, token, _admin, oracle, buyer, underwriter) = setup_single_oracle();
    let client = ParametricInsuranceContractClient::new(&env, &contract_id);
    client.underwrite(&underwriter, &30_000);

    let trigger = Symbol::new(&env, "temp");
    let id = client.buy_policy(
        &buyer,
        &500,
        &10_000,
        &(env.ledger().timestamp() + 100),
        &trigger,
        &35i128,
        &true,
    );
    client.post_oracle_value(&oracle, &trigger, &42i128);
    client.claim(&buyer, &id);

    assert_eq!(client.get_claimable(&buyer), 10_000);
    client.withdraw_claim(&buyer, &10_000);
    assert_eq!(client.get_claimable(&buyer), 0);

    let token_client = token::Client::new(&env, &token);
    // buyer: started 10k, paid 500 premium, received 10k payout → 19 500
    assert_eq!(token_client.balance(&buyer), 19_500);
}

// ── Below-trigger (trigger_above = false) ────────────────────────────────────

#[test]
fn test_claim_below_trigger() {
    let (env, contract_id, _token, _admin, oracle, buyer, underwriter) = setup_single_oracle();
    let client = ParametricInsuranceContractClient::new(&env, &contract_id);
    client.underwrite(&underwriter, &30_000);

    let trigger = Symbol::new(&env, "frost_c");
    let id = client.buy_policy(
        &buyer,
        &300,
        &5_000,
        &(env.ledger().timestamp() + 100),
        &trigger,
        &0i128,   // trigger at 0°C
        &false,   // trigger BELOW → frost event
    );

    // Oracle posts -5 → below 0 → trigger met
    client.post_oracle_value(&oracle, &trigger, &-5i128);
    let payout = client.claim(&buyer, &id);
    assert_eq!(payout, 5_000);
}

#[test]
fn test_below_trigger_not_met_rejected() {
    let (env, contract_id, _token, _admin, oracle, buyer, underwriter) = setup_single_oracle();
    let client = ParametricInsuranceContractClient::new(&env, &contract_id);
    client.underwrite(&underwriter, &30_000);

    let trigger = Symbol::new(&env, "frost_c");
    let id = client.buy_policy(
        &buyer,
        &300,
        &5_000,
        &(env.ledger().timestamp() + 100),
        &trigger,
        &0i128,
        &false,
    );

    // Oracle posts 25 → above 0 → trigger NOT met
    client.post_oracle_value(&oracle, &trigger, &25i128);
    let result = client.try_claim(&buyer, &id);
    assert!(result.is_err(), "trigger_above=false with value above threshold must reject");
}
