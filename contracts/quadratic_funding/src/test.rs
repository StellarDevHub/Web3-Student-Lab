//! # SC-HARD-14 — Quadratic Funding & Voting Allocation Engine: Test Suite
//!
//! Tests verify:
//!  - Single project receives the full matching pool.
//!  - Equal donors split the pool equally.
//!  - Projects with more unique donors receive more matching than a single
//!    whale donor contributing the same total (quadratic advantage).
//!  - Sybil resistance: non-whitelisted donor is rejected.
//!  - Double donation is rejected.
//!  - Donations after round close are rejected.
//!  - `isqrt` helper correctness.
//!  - Pool query.

use super::*;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::Env;

// ── Helper ────────────────────────────────────────────────────────────────────

fn setup() -> (Env, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(QuadraticFunding, ());
    let admin = Address::generate(&env);
    (env, contract_id, admin)
}

// ── Unit tests ────────────────────────────────────────────────────────────────

/// Integer square root helper must be exact for perfect squares.
#[test]
fn test_isqrt() {
    assert_eq!(QuadraticFunding::isqrt(0), 0);
    assert_eq!(QuadraticFunding::isqrt(1), 1);
    assert_eq!(QuadraticFunding::isqrt(4), 2);
    assert_eq!(QuadraticFunding::isqrt(9), 3);
    assert_eq!(QuadraticFunding::isqrt(100), 10);
    assert_eq!(QuadraticFunding::isqrt(1_000_000), 1_000);
}

/// A round with a single project should allocate the entire pool to it.
#[test]
fn test_single_project_gets_full_pool() {
    let (env, contract_id, admin) = setup();
    let client = QuadraticFundingClient::new(&env, &contract_id);
    let donor = Address::generate(&env);
    let owner = Address::generate(&env);

    client.init(&admin, &10_000);
    client.register_project(&admin, &1, &owner);
    client.whitelist_donor(&admin, &donor);
    client.donate(&donor, &1, &100);

    let payouts = client.distribute(&admin);
    assert_eq!(payouts.len(), 1);
    let (id, amount) = payouts.get(0).unwrap();
    assert_eq!(id, 1);
    assert_eq!(amount, 10_000); // single project gets 100 % of pool
}

/// Two projects with identical donation profiles must split the pool 50/50.
#[test]
fn test_equal_donors_split_pool_equally() {
    let (env, contract_id, admin) = setup();
    let client = QuadraticFundingClient::new(&env, &contract_id);
    let d1 = Address::generate(&env);
    let d2 = Address::generate(&env);
    let o1 = Address::generate(&env);
    let o2 = Address::generate(&env);

    client.init(&admin, &10_000);
    client.register_project(&admin, &1, &o1);
    client.register_project(&admin, &2, &o2);
    client.whitelist_donor(&admin, &d1);
    client.whitelist_donor(&admin, &d2);

    // Both projects get the same donation amount from one unique donor.
    client.donate(&d1, &1, &100);
    client.donate(&d2, &2, &100);

    let payouts = client.distribute(&admin);
    assert_eq!(payouts.len(), 2);
    for i in 0..payouts.len() {
        let (_, amount) = payouts.get(i).unwrap();
        assert_eq!(amount, 5_000);
    }
}

/// Quadratic advantage: a project with more unique small donors receives a
/// larger matching share than a project with a single whale donor — even when
/// both projects raise the same total donation amount.
///
/// Project 1: 4 donors × 25 tokens  = 100 total
/// Project 2: 1 donor  × 100 tokens = 100 total
///
/// QF weights:
///   P1 weight = (4 × sqrt(25))²  = (4 × 5)² = 400
///   P2 weight = (1 × sqrt(100))² = (10)²     = 100
/// → P1 gets 80 % of pool, P2 gets 20 %.
#[test]
fn test_more_unique_donors_wins_quadratic_advantage() {
    let (env, contract_id, admin) = setup();
    let client = QuadraticFundingClient::new(&env, &contract_id);
    let o1 = Address::generate(&env);
    let o2 = Address::generate(&env);

    client.init(&admin, &10_000);
    client.register_project(&admin, &1, &o1);
    client.register_project(&admin, &2, &o2);

    // Project 1: 4 donors × 25 tokens each.
    for _ in 0..4u32 {
        let d = Address::generate(&env);
        client.whitelist_donor(&admin, &d);
        client.donate(&d, &1, &25);
    }
    // Project 2: 1 donor × 100 tokens.
    let d_big = Address::generate(&env);
    client.whitelist_donor(&admin, &d_big);
    client.donate(&d_big, &2, &100);

    let payouts = client.distribute(&admin);
    let mut p1_amount = 0i128;
    let mut p2_amount = 0i128;
    for i in 0..payouts.len() {
        let (id, amount) = payouts.get(i).unwrap();
        if id == 1 {
            p1_amount = amount;
        } else if id == 2 {
            p2_amount = amount;
        }
    }
    // Core acceptance criterion: breadth of donors beats single whales.
    assert!(
        p1_amount > p2_amount,
        "project with more unique donors should receive more matching"
    );
    // Sanity: P1 receives ~80 % of pool (8000).
    assert!(p1_amount >= 7_900, "expected ~80% match for project 1");
}

/// A non-whitelisted donor must be rejected.
#[test]
#[should_panic(expected = "donor not whitelisted")]
fn test_non_whitelisted_donor_panics() {
    let (env, contract_id, admin) = setup();
    let client = QuadraticFundingClient::new(&env, &contract_id);
    let donor = Address::generate(&env);
    let owner = Address::generate(&env);

    client.init(&admin, &10_000);
    client.register_project(&admin, &1, &owner);
    // donor NOT whitelisted
    client.donate(&donor, &1, &100);
}

/// A donor that tries to donate twice to the same project must be rejected.
#[test]
#[should_panic(expected = "already donated to this project")]
fn test_double_donation_panics() {
    let (env, contract_id, admin) = setup();
    let client = QuadraticFundingClient::new(&env, &contract_id);
    let donor = Address::generate(&env);
    let owner = Address::generate(&env);

    client.init(&admin, &10_000);
    client.register_project(&admin, &1, &owner);
    client.whitelist_donor(&admin, &donor);
    client.donate(&donor, &1, &100);
    client.donate(&donor, &1, &100); // second donation — must panic
}

/// Any donation after `distribute` closes the round must be rejected.
#[test]
#[should_panic(expected = "round not open")]
fn test_donate_after_distribute_panics() {
    let (env, contract_id, admin) = setup();
    let client = QuadraticFundingClient::new(&env, &contract_id);
    let donor = Address::generate(&env);
    let owner = Address::generate(&env);

    client.init(&admin, &10_000);
    client.register_project(&admin, &1, &owner);
    client.whitelist_donor(&admin, &donor);
    client.donate(&donor, &1, &100);
    client.distribute(&admin);

    // Round is now closed; new donor must be rejected.
    let donor2 = Address::generate(&env);
    client.whitelist_donor(&admin, &donor2);
    client.donate(&donor2, &1, &50);
}

/// `get_pool` must return the pool size set at initialisation.
#[test]
fn test_get_pool() {
    let (env, contract_id, admin) = setup();
    let client = QuadraticFundingClient::new(&env, &contract_id);
    client.init(&admin, &5_000);
    assert_eq!(client.get_pool(), 5_000);
}

/// Distributing a round with no donations returns an empty payout list.
#[test]
fn test_distribute_with_no_donations_returns_empty() {
    let (env, contract_id, admin) = setup();
    let client = QuadraticFundingClient::new(&env, &contract_id);
    let owner = Address::generate(&env);

    client.init(&admin, &10_000);
    client.register_project(&admin, &1, &owner);

    let payouts = client.distribute(&admin);
    assert_eq!(payouts.len(), 0);
}
