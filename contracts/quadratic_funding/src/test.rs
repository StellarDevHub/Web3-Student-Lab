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
use soroban_sdk::{Bytes, BytesN, Env};

// ── Mock sybil-resistance contracts ───────────────────────────────────────────

#[contract]
struct MockSybilOk;

#[contractimpl]
impl MockSybilOk {
    pub fn is_verified(_env: Env, _user: Address) -> bool {
        true
    }
}

#[contract]
struct MockSybilReject;

#[contractimpl]
impl MockSybilReject {
    pub fn is_verified(_env: Env, _user: Address) -> bool {
        false
    }
}

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

// ── SC-037 Penalty Slasher Tests ──────────────────────────────────────────────

#[test]
fn test_slash_collusion_disqualifies_donations_and_awards_50pct_bounty() {
    let (env, contract_id, admin) = setup();
    let client = QuadraticFundingClient::new(&env, &contract_id);
    let owner = Address::generate(&env);
    let investigator = Address::generate(&env);
    let colluder1 = Address::generate(&env);
    let colluder2 = Address::generate(&env);
    let honest_donor = Address::generate(&env);

    client.init(&admin, &10_000);
    client.register_project(&admin, &1, &owner);

    client.whitelist_donor(&admin, &colluder1);
    client.whitelist_donor(&admin, &colluder2);
    client.whitelist_donor(&admin, &honest_donor);

    // Colluders deposit bond stake
    client.deposit_stake(&colluder1, &1_000);
    client.deposit_stake(&colluder2, &1_000);

    // Honest donor donates 100
    client.donate(&honest_donor, &1, &100);
    // Colluders donate 100 each
    client.donate(&colluder1, &1, &100);
    client.donate(&colluder2, &1, &100);

    let proj_before = client.get_project(&1);
    assert_eq!(proj_before.total_donations, 300);

    // Investigator prepares cryptographic proof
    let evidence_raw = [42u8; 32];
    let evidence = Bytes::from_array(&env, &evidence_raw);
    let proof_hash = env.crypto().sha256(&evidence).to_bytes();
    let proof = CollusionProof {
        funding_source: Address::generate(&env),
        timestamp: 12345678,
        proof_hash,
        evidence,
    };

    let colluders = soroban_sdk::vec![&env, colluder1.clone(), colluder2.clone()];
    let bounty = client.slash_collusion(&investigator, &1, &colluders, &proof);

    // Total confiscated stake = 2_000. 50% bounty = 1_000
    assert_eq!(bounty, 1_000);

    // Verify colluders' stake is now 0 and they are marked slashed
    assert_eq!(client.get_stake(&colluder1), 0);
    assert_eq!(client.get_stake(&colluder2), 0);
    assert!(client.is_slashed(&colluder1));
    assert!(client.is_slashed(&colluder2));

    // Verify project donations disqualified
    let proj_after = client.get_project(&1);
    assert_eq!(proj_after.total_donations, 100);
    assert!(!proj_after.donors.contains_key(colluder1));
    assert!(!proj_after.donors.contains_key(colluder2));
}

#[test]
fn test_slash_collusion_rejects_tampered_proof_hash() {
    let (env, contract_id, admin) = setup();
    let client = QuadraticFundingClient::new(&env, &contract_id);
    let owner = Address::generate(&env);
    let investigator = Address::generate(&env);
    let colluder1 = Address::generate(&env);
    let colluder2 = Address::generate(&env);

    client.init(&admin, &10_000);
    client.register_project(&admin, &1, &owner);
    client.whitelist_donor(&admin, &colluder1);
    client.whitelist_donor(&admin, &colluder2);
    client.donate(&colluder1, &1, &100);
    client.donate(&colluder2, &1, &100);

    let evidence = Bytes::from_array(&env, &[1, 2, 3, 4]);
    // Tampered proof hash (does not match sha256(evidence))
    let bogus_hash = soroban_sdk::BytesN::from_array(&env, &[99u8; 32]);
    let proof = CollusionProof {
        funding_source: Address::generate(&env),
        timestamp: 100,
        proof_hash: bogus_hash,
        evidence,
    };

    let colluders = soroban_sdk::vec![&env, colluder1, colluder2];
    let res = client.try_slash_collusion(&investigator, &1, &colluders, &proof);
    assert_eq!(res, Err(Ok(SlasherError::InvalidProof)));
}

#[test]
fn test_slash_collusion_rejects_insufficient_colluders() {
    let (env, contract_id, admin) = setup();
    let client = QuadraticFundingClient::new(&env, &contract_id);
    let owner = Address::generate(&env);
    let investigator = Address::generate(&env);
    let colluder1 = Address::generate(&env);

    client.init(&admin, &10_000);
    client.register_project(&admin, &1, &owner);
    client.whitelist_donor(&admin, &colluder1);
    client.donate(&colluder1, &1, &100);

    let evidence = Bytes::from_array(&env, &[1, 2, 3]);
    let proof_hash = env.crypto().sha256(&evidence).to_bytes();
    let proof = CollusionProof {
        funding_source: Address::generate(&env),
        timestamp: 100,
        proof_hash,
        evidence,
    };

    // Cluster collusion requires >= 2 accounts
    let colluders = soroban_sdk::vec![&env, colluder1];
    let res = client.try_slash_collusion(&investigator, &1, &colluders, &proof);
    assert_eq!(res, Err(Ok(SlasherError::InsufficientColluders)));
}

#[test]
fn test_slash_collusion_rejects_non_guilty_donor() {
    let (env, contract_id, admin) = setup();
    let client = QuadraticFundingClient::new(&env, &contract_id);
    let owner = Address::generate(&env);
    let investigator = Address::generate(&env);
    let colluder1 = Address::generate(&env);
    let innocent = Address::generate(&env);

    client.init(&admin, &10_000);
    client.register_project(&admin, &1, &owner);
    client.whitelist_donor(&admin, &colluder1);
    client.donate(&colluder1, &1, &100);

    let evidence = Bytes::from_array(&env, &[1, 2, 3]);
    let proof_hash = env.crypto().sha256(&evidence).to_bytes();
    let proof = CollusionProof {
        funding_source: Address::generate(&env),
        timestamp: 100,
        proof_hash,
        evidence,
    };

    // innocent never donated to project 1
    let colluders = soroban_sdk::vec![&env, colluder1, innocent];
    let res = client.try_slash_collusion(&investigator, &1, &colluders, &proof);
    assert_eq!(res, Err(Ok(SlasherError::DonorNotGuilty)));
}

// ── SC-005 tests ──────────────────────────────────────────────────────────────

#[test]
fn test_isqrt_boundaries_and_max() {
    assert_eq!(QuadraticFunding::isqrt(0), 0);
    assert_eq!(QuadraticFunding::isqrt(-7), 0);
    assert_eq!(QuadraticFunding::isqrt(3), 1);
    assert_eq!(QuadraticFunding::isqrt(99), 9);
    assert_eq!(QuadraticFunding::isqrt(100), 10);
    // Must not panic at the type boundary; floor(sqrt(MAX)) ≈ 1.3e19.
    let r = QuadraticFunding::isqrt(i128::MAX);
    assert!(r.checked_mul(r).unwrap() <= i128::MAX);
}

#[test]
fn test_sybil_unverified_donor_rejected_in_donate() {
    let (env, contract_id, admin) = setup();
    let client = QuadraticFundingClient::new(&env, &contract_id);
    let donor = Address::generate(&env);
    let owner = Address::generate(&env);
    let sybil = env.register(MockSybilReject, ());

    client.init(&admin, &10_000);
    client.set_sybil_contract(&admin, &sybil);
    client.register_project(&admin, &1, &owner);
    client.whitelist_donor(&admin, &donor);

    let res = client.try_donate(&donor, &1, &100);
    assert!(res.is_err(), "unverified sybil donor must be rejected");
    assert_eq!(client.get_project(&1).total_donations, 0);
}

#[test]
fn test_sybil_verified_donor_accepted_in_donate() {
    let (env, contract_id, admin) = setup();
    let client = QuadraticFundingClient::new(&env, &contract_id);
    let donor = Address::generate(&env);
    let owner = Address::generate(&env);
    let sybil = env.register(MockSybilOk, ());

    client.init(&admin, &10_000);
    client.set_sybil_contract(&admin, &sybil);
    client.register_project(&admin, &1, &owner);
    client.whitelist_donor(&admin, &donor);
    client.donate(&donor, &1, &100);
    assert_eq!(client.get_project(&1).total_donations, 100);
}

#[test]
fn test_distribute_sums_exactly_to_pool() {
    let (env, contract_id, admin) = setup();
    let client = QuadraticFundingClient::new(&env, &contract_id);
    client.init(&admin, &10_000);
    for id in 1u32..=3 {
        let owner = Address::generate(&env);
        client.register_project(&admin, &id, &owner);
        let d = Address::generate(&env);
        client.whitelist_donor(&admin, &d);
        client.donate(&d, &id, &100);
    }

    let payouts = client.distribute(&admin);
    assert_eq!(payouts.len(), 3);
    let mut sum = 0i128;
    for i in 0..payouts.len() {
        sum += payouts.get(i).unwrap().1;
    }
    assert_eq!(sum, 10_000);
    // Equal weights: 3333 each, remainder 1 goes to the first largest-weight project.
    assert_eq!(payouts.get(0).unwrap(), (1, 3334));
    assert_eq!(payouts.get(1).unwrap(), (2, 3333));
    assert_eq!(payouts.get(2).unwrap(), (3, 3333));
}

#[test]
fn test_distribute_uneven_weights_sums_exactly_to_pool() {
    let (env, contract_id, admin) = setup();
    let client = QuadraticFundingClient::new(&env, &contract_id);
    client.init(&admin, &9_999);
    let amounts = [7i128, 13, 29];
    for (idx, amount) in amounts.iter().enumerate() {
        let id = (idx as u32) + 1;
        let owner = Address::generate(&env);
        client.register_project(&admin, &id, &owner);
        let d = Address::generate(&env);
        client.whitelist_donor(&admin, &d);
        client.donate(&d, &id, amount);
    }

    let payouts = client.distribute(&admin);
    let mut sum = 0i128;
    for i in 0..payouts.len() {
        sum += payouts.get(i).unwrap().1;
    }
    assert_eq!(sum, 9_999);
    // Round is closed: a second distribute must fail.
    assert!(client.try_distribute(&admin).is_err());
}

#[test]
fn test_commit_then_reveal_succeeds() {
    let (env, contract_id, admin) = setup();
    let client = QuadraticFundingClient::new(&env, &contract_id);
    let donor = Address::generate(&env);
    let owner = Address::generate(&env);

    client.init(&admin, &10_000);
    client.register_project(&admin, &1, &owner);
    client.whitelist_donor(&admin, &donor);

    let salt = BytesN::from_array(&env, &[7u8; 32]);
    let hash = commitment_hash(&env, &donor, 1, 100, &salt);
    client.commit_donation(&donor, &1, &hash);

    client.open_reveal(&admin);
    assert!(client.is_reveal_phase());
    client.reveal_donation(&donor, &1, &100, &salt);

    let project = client.get_project(&1);
    assert_eq!(project.total_donations, 100);
    assert!(project.donors.contains_key(donor));
}

#[test]
fn test_reveal_with_wrong_salt_fails() {
    let (env, contract_id, admin) = setup();
    let client = QuadraticFundingClient::new(&env, &contract_id);
    let donor = Address::generate(&env);
    let owner = Address::generate(&env);

    client.init(&admin, &10_000);
    client.register_project(&admin, &1, &owner);
    client.whitelist_donor(&admin, &donor);

    let salt = BytesN::from_array(&env, &[7u8; 32]);
    let wrong_salt = BytesN::from_array(&env, &[8u8; 32]);
    let hash = commitment_hash(&env, &donor, 1, 100, &salt);
    client.commit_donation(&donor, &1, &hash);
    client.open_reveal(&admin);

    let res = client.try_reveal_donation(&donor, &1, &100, &wrong_salt);
    assert!(res.is_err(), "reveal with wrong salt must fail");
    // The commitment is still intact and the correct reveal still works.
    assert_eq!(client.get_project(&1).total_donations, 0);
    client.reveal_donation(&donor, &1, &100, &salt);
    assert_eq!(client.get_project(&1).total_donations, 100);
}

#[test]
fn test_commit_after_reveal_opened_fails() {
    let (env, contract_id, admin) = setup();
    let client = QuadraticFundingClient::new(&env, &contract_id);
    let donor = Address::generate(&env);
    let owner = Address::generate(&env);

    client.init(&admin, &10_000);
    client.register_project(&admin, &1, &owner);
    client.whitelist_donor(&admin, &donor);
    client.open_reveal(&admin);

    let salt = BytesN::from_array(&env, &[1u8; 32]);
    let hash = commitment_hash(&env, &donor, 1, 100, &salt);
    assert!(client.try_commit_donation(&donor, &1, &hash).is_err());
}

#[test]
fn test_reveal_before_open_fails() {
    let (env, contract_id, admin) = setup();
    let client = QuadraticFundingClient::new(&env, &contract_id);
    let donor = Address::generate(&env);
    let owner = Address::generate(&env);

    client.init(&admin, &10_000);
    client.register_project(&admin, &1, &owner);
    client.whitelist_donor(&admin, &donor);

    let salt = BytesN::from_array(&env, &[1u8; 32]);
    let hash = commitment_hash(&env, &donor, 1, 100, &salt);
    client.commit_donation(&donor, &1, &hash);
    assert!(client.try_reveal_donation(&donor, &1, &100, &salt).is_err());
}
