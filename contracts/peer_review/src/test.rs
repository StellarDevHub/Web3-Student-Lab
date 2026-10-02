//! # SC-HARD-13 — Peer Review Incentive Protocol: Test Suite
//!
//! Unit and integration tests for:
//!  - Accurate reviewers sharing the reward pool.
//!  - Outlier reviewer stake slashing.
//!  - Commit-reveal integrity enforcement.
//!  - Stake lock-up and withdrawal.
//!  - Median consensus correctness (backed by property tests in proptests module).
//!  - Standardized event emission.

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    token, Address, BytesN, Env,
};

// ── Test helpers ──────────────────────────────────────────────────────────────

/// Stand up a fresh environment, mint tokens, register and initialise the
/// contract. Returns `(env, contract_id, admin, creator, r1, r2, token_id)`.
pub(crate) fn setup() -> (Env, Address, Address, Address, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let creator = Address::generate(&env);
    let r1 = Address::generate(&env);
    let r2 = Address::generate(&env);

    let token = env.register_stellar_asset_contract_v2(admin.clone());
    let token_id = token.address();
    let sac = token::StellarAssetClient::new(&env, &token_id);
    sac.mint(&creator, &10_000_000);
    sac.mint(&r1, &10_000_000);
    sac.mint(&r2, &10_000_000);

    let id = env.register(PeerReviewContract, ());
    let client = PeerReviewContractClient::new(&env, &id);
    // tolerance = 5, slash_bps = 250 (2.5%), lock_seconds = 1000
    client.initialize(&admin, &token_id, &5, &250, &1_000);

    (env, id, admin, creator, r1, r2, token_id)
}

/// Build and commit a grade (grade used as both salt pattern and grade value
/// for test simplicity).
pub(crate) fn commit(
    env: &Env,
    client: &PeerReviewContractClient<'_>,
    reviewer: &Address,
    sub: u64,
    grade: i128,
) {
    let salt = BytesN::from_array(env, &[grade as u8; 32]);
    let digest = hash_grade_salt(env, grade, &salt);
    client.commit_review(reviewer, &sub, &digest);
}

/// Reveal a previously committed grade.
pub(crate) fn reveal(
    env: &Env,
    client: &PeerReviewContractClient<'_>,
    reviewer: &Address,
    sub: u64,
    grade: i128,
) {
    let salt = BytesN::from_array(env, &[grade as u8; 32]);
    client.reveal_review(reviewer, &sub, &grade, &salt);
}

// ── Core behaviour tests ──────────────────────────────────────────────────────

/// Two accurate reviewers both within tolerance split the pool equally.
#[test]
fn accurate_reviewers_share_reward_pool() {
    let (env, id, _admin, creator, r1, r2, token_id) = setup();
    let client = PeerReviewContractClient::new(&env, &id);
    let deadline = env.ledger().timestamp();

    client.stake(&r1, &1_000);
    client.stake(&r2, &1_000);
    client.create_submission(&creator, &1, &3_000, &(deadline + 100), &(deadline + 200));

    commit(&env, &client, &r1, 1, 80);
    commit(&env, &client, &r2, 1, 85);

    env.ledger().with_mut(|li| li.timestamp = deadline + 101);
    reveal(&env, &client, &r1, 1, 80);
    reveal(&env, &client, &r2, 1, 85);

    env.ledger().with_mut(|li| li.timestamp = deadline + 201);
    client.finalize_submission(&r1, &1);

    let sub = client.submission(&1);
    assert!(sub.finalized);
    // median of [80, 85] = (80+85)/2 = 82
    assert_eq!(sub.median, 82);
    assert_eq!(sub.accurate_count, 2);
    assert_eq!(sub.slashed_count, 0);

    // Both accurate (within tolerance 5): each gets half the pool (1500).
    let sac = token::StellarAssetClient::new(&env, &token_id);
    assert_eq!(sac.balance(&r1), 10_000_000 - 1_000 + 1_500);
    assert_eq!(sac.balance(&r2), 10_000_000 - 1_000 + 1_500);
}

/// An outlier reviewer (grade 10 vs median 80) is slashed; accurate reviewers
/// still receive their share of the pool.
#[test]
fn outlier_is_slashed_and_accurate_reviewers_paid() {
    let (env, id, _admin, creator, r1, r2, token_id) = setup();
    let client = PeerReviewContractClient::new(&env, &id);
    let deadline = env.ledger().timestamp();

    let r3 = Address::generate(&env);
    token::StellarAssetClient::new(&env, &token_id).mint(&r3, &10_000_000);

    client.stake(&r1, &2_000);
    client.stake(&r2, &2_000);
    client.stake(&r3, &2_000);
    client.create_submission(&creator, &2, &2_000, &(deadline + 100), &(deadline + 200));

    commit(&env, &client, &r1, 2, 80);
    commit(&env, &client, &r2, 2, 85);
    commit(&env, &client, &r3, 2, 10); // clear outlier

    env.ledger().with_mut(|li| li.timestamp = deadline + 101);
    reveal(&env, &client, &r1, 2, 80);
    reveal(&env, &client, &r2, 2, 85);
    reveal(&env, &client, &r3, 2, 10);

    env.ledger().with_mut(|li| li.timestamp = deadline + 201);
    client.finalize_submission(&r2, &2);

    let sub = client.submission(&2);
    // sorted grades: [10, 80, 85] → median = 80 (middle of 3)
    assert_eq!(sub.median, 80);
    assert_eq!(sub.accurate_count, 2);
    assert_eq!(sub.slashed_count, 1);

    // r1/r2 accurate: half the pool each (1000).
    // r3 outlier: 250 bps of 2000 staked = 50 slashed.
    let sac = token::StellarAssetClient::new(&env, &token_id);
    assert_eq!(sac.balance(&r1), 10_000_000 - 2_000 + 1_000);
    assert_eq!(sac.balance(&r2), 10_000_000 - 2_000 + 1_000);
    // r3 never received reward; stake reduced on-chain.
    assert_eq!(sac.balance(&r3), 10_000_000 - 2_000);
    assert_eq!(client.reviewer_state(&r3).stake, 1_950); // 2000 - 50
    assert_eq!(client.reviewer_state(&r3).slashed_total, 50);
    assert_eq!(client.treasury(), 50);
}

/// Revealing a different grade from what was committed must panic.
#[test]
#[should_panic(expected = "Error(Contract, #12)")]
fn tampered_reveal_is_rejected() {
    let (env, id, _admin, creator, r1, _r2, _token_id) = setup();
    let client = PeerReviewContractClient::new(&env, &id);
    let deadline = env.ledger().timestamp();

    client.stake(&r1, &1_000);
    client.create_submission(&creator, &3, &1_000, &(deadline + 100), &(deadline + 200));

    commit(&env, &client, &r1, 3, 80);
    env.ledger().with_mut(|li| li.timestamp = deadline + 101);
    // Reveal with a different grade than committed.
    client.reveal_review(&r1, &3, &90, &BytesN::from_array(&env, &[80u8; 32]));
}

/// Reveal during the commit window (before the deadline) must panic.
#[test]
#[should_panic(expected = "Error(Contract, #8)")]
fn cannot_reveal_during_commit_window() {
    let (env, id, _admin, creator, r1, _r2, _token_id) = setup();
    let client = PeerReviewContractClient::new(&env, &id);
    let deadline = env.ledger().timestamp();

    client.stake(&r1, &1_000);
    client.create_submission(&creator, &4, &1_000, &(deadline + 100), &(deadline + 200));

    commit(&env, &client, &r1, 4, 80);
    // Reveal before the commit deadline has passed — still inside commit window.
    client.reveal_review(&r1, &4, &80, &BytesN::from_array(&env, &[80u8; 32]));
}

/// An unstaked reviewer must not be able to commit.
#[test]
#[should_panic(expected = "Error(Contract, #13)")]
fn unstaked_reviewer_cannot_commit() {
    let (env, id, _admin, creator, r1, _r2, _token_id) = setup();
    let client = PeerReviewContractClient::new(&env, &id);
    let deadline = env.ledger().timestamp();
    client.create_submission(&creator, &5, &1_000, &(deadline + 100), &(deadline + 200));
    commit(&env, &client, &r1, 5, 80);
}

/// Stake is locked immediately after deposit (within lock_seconds window).
#[test]
#[should_panic(expected = "Error(Contract, #14)")]
fn stake_is_locked_during_lock_period() {
    let (env, id, _admin, _creator, r1, _r2, _token_id) = setup();
    let client = PeerReviewContractClient::new(&env, &id);
    client.stake(&r1, &1_000);
    // Still inside lock_seconds (1000): withdrawal rejected.
    client.withdraw_stake(&r1, &100);
}

/// After the lock period expires, withdrawal succeeds.
#[test]
fn stake_withdraws_after_lock_period() {
    let (env, id, _admin, _creator, r1, _r2, _token_id) = setup();
    let client = PeerReviewContractClient::new(&env, &id);
    let now = env.ledger().timestamp();

    client.stake(&r1, &1_000);
    env.ledger().with_mut(|li| li.timestamp = now + 1_001);
    client.withdraw_stake(&r1, &400);
    let state = client.reviewer_state(&r1);
    assert_eq!(state.stake, 600);
}

/// When no reviewers revealed, the reward pool is refunded to the creator.
#[test]
fn no_reviews_refunds_reward_pool() {
    let (env, id, _admin, creator, _r1, _r2, token_id) = setup();
    let client = PeerReviewContractClient::new(&env, &id);
    let deadline = env.ledger().timestamp();
    let sac = token::StellarAssetClient::new(&env, &token_id);

    client.create_submission(&creator, &6, &1_000, &(deadline + 100), &(deadline + 200));
    assert_eq!(sac.balance(&creator), 10_000_000 - 1_000);

    env.ledger().with_mut(|li| li.timestamp = deadline + 201);
    client.finalize_submission(&creator, &6);
    assert_eq!(sac.balance(&creator), 10_000_000);
}

// ── Event emission tests ──────────────────────────────────────────────────────

/// Find the first event whose first topic matches `topic`.
fn find_event(
    env: &Env,
    topic: soroban_sdk::Symbol,
) -> Option<(std::vec::Vec<soroban_sdk::Val>, std::vec::Vec<soroban_sdk::Val>)> {
    use soroban_sdk::TryFromVal;
    for (t, d) in raw_events(env) {
        if soroban_sdk::Symbol::try_from_val(env, &t[0]).ok() == Some(topic.clone()) {
            return Some((t, d));
        }
    }
    None
}

/// Convert `env.events().all()` into `(topics, payload)` pairs.
fn raw_events(
    env: &Env,
) -> std::vec::Vec<(std::vec::Vec<soroban_sdk::Val>, std::vec::Vec<soroban_sdk::Val>)> {
    use soroban_sdk::{xdr, TryFromVal, Val, Vec};
    let mut out = std::vec::Vec::new();
    for e in env.events().all().iter() {
        if let xdr::ContractEventBody::V0(v0) = &e.body {
            let topics: Vec<Val> = Vec::try_from_val(env, &v0.topics).unwrap();
            let payload: Vec<Val> = Vec::try_from_val(env, &v0.data).unwrap_or_else(|_| {
                let mut v = Vec::new(env);
                v.push_back(Val::try_from_val(env, &v0.data).unwrap());
                v
            });
            let mut t = std::vec::Vec::new();
            for i in 0..topics.len() {
                t.push(topics.get(i).unwrap());
            }
            let mut p = std::vec::Vec::new();
            for i in 0..payload.len() {
                p.push(payload.get(i).unwrap());
            }
            out.push((t, p));
        }
    }
    out
}

/// Every state-mutating call emits a standardized event with the correct
/// topic and decoded payload.
#[test]
fn emits_standardized_review_events() {
    use contract_events::{
        decode_commit, decode_reveal, decode_review_done, decode_stake, decode_submission, topic,
    };
    let (env, id, _admin, creator, r1, _r2, _token_id) = setup();
    let client = PeerReviewContractClient::new(&env, &id);
    let deadline = env.ledger().timestamp();

    client.stake(&r1, &1_000);
    let (topics, data) = find_event(&env, topic::STAKE).unwrap();
    assert!(decode_stake(&env, &topics, &data).deposit);

    client.create_submission(&creator, &7, &1_000, &(deadline + 100), &(deadline + 200));
    let (topics, data) = find_event(&env, topic::SUBMISSION).unwrap();
    assert_eq!(decode_submission(&env, &topics, &data).submission_id, 7);

    commit(&env, &client, &r1, 7, 80);
    let (topics, data) = find_event(&env, topic::COMMIT).unwrap();
    assert_eq!(decode_commit(&env, &topics, &data).submission_id, 7);

    env.ledger().with_mut(|li| li.timestamp = deadline + 101);
    reveal(&env, &client, &r1, 7, 80);
    let (topics, data) = find_event(&env, topic::REVEAL).unwrap();
    assert_eq!(decode_reveal(&env, &topics, &data).grade, 80);

    env.ledger().with_mut(|li| li.timestamp = deadline + 201);
    client.finalize_submission(&r1, &7);
    let (topics, data) = find_event(&env, topic::REVIEW_DONE).unwrap();
    let done = decode_review_done(&env, &topics, &data);
    assert_eq!(done.median, 80);
    assert_eq!(done.rewarded, 1);
}
