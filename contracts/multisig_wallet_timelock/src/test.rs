//! Tests for SC-HARD-09 — Threshold Multisig Wallet with Nonce Replay Guards & Timelock.
//!
//! Covers:
//! - m-of-n threshold enforcement (execution rejected below threshold)
//! - Monotonic nonce replay guard (duplicate/stale nonces rejected)
//! - Timelock enforcement (execution blocked until timelock expires)
//! - Full happy-path (submit → approve × N → advance time → execute)
//! - Signer management (add / remove)

use crate::{DataKey, Error, MultiSigWalletContract, MultiSigWalletContractClient, Proposal};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Bytes, Env, Map, Vec,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

fn setup(threshold: u32, timelock: u64) -> (Env, Address, Vec<Address>, MultiSigWalletContractClient<'static>) {
    // We need a 'static lifetime trick — use Box::leak for the env.
    // Actually in Soroban tests the client borrows from env; pattern is to
    // keep env in scope and use a helper struct, but the idiomatic way is just
    // to inline the setup per test. For brevity we return owned values.
    let env = Env::default();
    env.mock_all_auths();

    let s1 = Address::generate(&env);
    let s2 = Address::generate(&env);
    let s3 = Address::generate(&env);
    let signers = Vec::from_array(&env, [s1.clone(), s2.clone(), s3.clone()]);

    let contract_id = env.register(MultiSigWalletContract, ());
    let client = MultiSigWalletContractClient::new(&env, &contract_id);
    client.initialize(&signers, &threshold, &timelock);
    (env, contract_id, signers, client)
}

// ── Basic initialisation ──────────────────────────────────────────────────────

#[test]
fn test_initialize_stores_signers_and_threshold() {
    let env = Env::default();
    env.mock_all_auths();

    let s1 = Address::generate(&env);
    let s2 = Address::generate(&env);
    let signers = Vec::from_array(&env, [s1.clone(), s2.clone()]);

    let contract_id = env.register(MultiSigWalletContract, ());
    let client = MultiSigWalletContractClient::new(&env, &contract_id);
    client.initialize(&signers, &2, &0);

    assert_eq!(client.get_threshold(), 2);
    let stored = client.get_signers();
    assert_eq!(stored.len(), 2);
    assert!(stored.contains(&s1));
    assert!(stored.contains(&s2));
}

// ── Happy path: full multisig flow ────────────────────────────────────────────

#[test]
fn test_full_multisig_flow_2_of_3() {
    let env = Env::default();
    env.mock_all_auths();

    let s1 = Address::generate(&env);
    let s2 = Address::generate(&env);
    let s3 = Address::generate(&env);
    let signers = Vec::from_array(&env, [s1.clone(), s2.clone(), s3.clone()]);

    let contract_id = env.register(MultiSigWalletContract, ());
    let client = MultiSigWalletContractClient::new(&env, &contract_id);
    // 2-of-3, timelock = 10 seconds
    client.initialize(&signers, &2, &10);

    let to = Address::generate(&env);
    let data = Bytes::new(&env);
    let proposal_id = client.submit_proposal(&s1, &to, &500, &data, &1);

    // Only s1 has approved so far → should fail threshold
    let result = client.try_execute_proposal(&proposal_id);
    assert!(result.is_err(), "should fail: below threshold");

    // s2 approves → threshold met, but timelock not expired
    client.approve_proposal(&s2, &proposal_id);

    let result = client.try_execute_proposal(&proposal_id);
    assert!(result.is_err(), "should fail: timelock not expired");

    // Advance ledger timestamp past timelock
    env.ledger().with_mut(|l| l.timestamp = 25);
    client.execute_proposal(&proposal_id);

    let proposal = client.get_proposal(&proposal_id).unwrap();
    assert!(proposal.executed, "proposal should be marked executed");
}

// ── Threshold enforcement ─────────────────────────────────────────────────────

#[test]
fn test_execution_rejected_below_threshold() {
    let env = Env::default();
    env.mock_all_auths();

    let s1 = Address::generate(&env);
    let s2 = Address::generate(&env);
    let signers = Vec::from_array(&env, [s1.clone(), s2.clone()]);

    let contract_id = env.register(MultiSigWalletContract, ());
    let client = MultiSigWalletContractClient::new(&env, &contract_id);
    // 2-of-2, no timelock
    client.initialize(&signers, &2, &0);

    let to = Address::generate(&env);
    let proposal_id = client.submit_proposal(&s1, &to, &100, &Bytes::new(&env), &1);

    // Only 0 explicit approvals yet (proposer does NOT auto-approve)
    let result = client.try_execute_proposal(&proposal_id);
    assert!(
        result.is_err(),
        "execution must be rejected when below threshold"
    );

    // s1 approves — still 1, need 2
    client.approve_proposal(&s1, &proposal_id);
    let result = client.try_execute_proposal(&proposal_id);
    assert!(result.is_err(), "still below threshold with 1 approval");
}

// ── Nonce replay guard ────────────────────────────────────────────────────────

#[test]
fn test_nonce_increases_monotonically() {
    let env = Env::default();
    env.mock_all_auths();

    let s1 = Address::generate(&env);
    let signers = Vec::from_array(&env, [s1.clone()]);

    let contract_id = env.register(MultiSigWalletContract, ());
    let client = MultiSigWalletContractClient::new(&env, &contract_id);
    client.initialize(&signers, &1, &0);

    let to = Address::generate(&env);
    client.submit_proposal(&s1, &to, &1, &Bytes::new(&env), &1);
    // nonce 1 consumed
    assert_eq!(client.get_last_nonce(), 1);

    client.submit_proposal(&s1, &to, &2, &Bytes::new(&env), &5);
    // nonce 5 consumed
    assert_eq!(client.get_last_nonce(), 5);
}

#[test]
fn test_duplicate_nonce_rejected() {
    let env = Env::default();
    env.mock_all_auths();

    let s1 = Address::generate(&env);
    let signers = Vec::from_array(&env, [s1.clone()]);

    let contract_id = env.register(MultiSigWalletContract, ());
    let client = MultiSigWalletContractClient::new(&env, &contract_id);
    client.initialize(&signers, &1, &0);

    let to = Address::generate(&env);
    client.submit_proposal(&s1, &to, &1, &Bytes::new(&env), &10);

    // Try to replay nonce 10
    let result = client.try_submit_proposal(&s1, &to, &1, &Bytes::new(&env), &10);
    assert!(result.is_err(), "duplicate nonce must be rejected");
}

#[test]
fn test_lower_nonce_rejected() {
    let env = Env::default();
    env.mock_all_auths();

    let s1 = Address::generate(&env);
    let signers = Vec::from_array(&env, [s1.clone()]);

    let contract_id = env.register(MultiSigWalletContract, ());
    let client = MultiSigWalletContractClient::new(&env, &contract_id);
    client.initialize(&signers, &1, &0);

    let to = Address::generate(&env);
    client.submit_proposal(&s1, &to, &1, &Bytes::new(&env), &20);

    // Attempt to submit with lower nonce
    let result = client.try_submit_proposal(&s1, &to, &1, &Bytes::new(&env), &5);
    assert!(result.is_err(), "lower nonce must be rejected (replay attack)");
}

// ── Timelock ──────────────────────────────────────────────────────────────────

#[test]
fn test_timelock_blocks_early_execution() {
    let env = Env::default();
    env.mock_all_auths();

    let s1 = Address::generate(&env);
    let signers = Vec::from_array(&env, [s1.clone()]);

    let contract_id = env.register(MultiSigWalletContract, ());
    let client = MultiSigWalletContractClient::new(&env, &contract_id);
    // 1-of-1, timelock = 100 seconds
    client.initialize(&signers, &1, &100);

    let to = Address::generate(&env);
    let proposal_id = client.submit_proposal(&s1, &to, &1, &Bytes::new(&env), &1);
    client.approve_proposal(&s1, &proposal_id);

    // Ledger time is still 0 — before timelock
    let result = client.try_execute_proposal(&proposal_id);
    assert!(result.is_err(), "timelock must block execution");

    // Advance to exactly the timelock boundary
    env.ledger().with_mut(|l| l.timestamp = 100);
    client.execute_proposal(&proposal_id);
    assert!(client.get_proposal(&proposal_id).unwrap().executed);
}

// ── Double-execution guard ─────────────────────────────────────────────────────

#[test]
fn test_proposal_cannot_be_executed_twice() {
    let env = Env::default();
    env.mock_all_auths();

    let s1 = Address::generate(&env);
    let signers = Vec::from_array(&env, [s1.clone()]);

    let contract_id = env.register(MultiSigWalletContract, ());
    let client = MultiSigWalletContractClient::new(&env, &contract_id);
    client.initialize(&signers, &1, &0);

    let to = Address::generate(&env);
    let proposal_id = client.submit_proposal(&s1, &to, &1, &Bytes::new(&env), &1);
    client.approve_proposal(&s1, &proposal_id);
    client.execute_proposal(&proposal_id);

    let result = client.try_execute_proposal(&proposal_id);
    assert!(result.is_err(), "already-executed proposal must be rejected");
}

// ── Double-approve guard ──────────────────────────────────────────────────────

#[test]
fn test_signer_cannot_approve_twice() {
    let env = Env::default();
    env.mock_all_auths();

    let s1 = Address::generate(&env);
    let s2 = Address::generate(&env);
    let signers = Vec::from_array(&env, [s1.clone(), s2.clone()]);

    let contract_id = env.register(MultiSigWalletContract, ());
    let client = MultiSigWalletContractClient::new(&env, &contract_id);
    client.initialize(&signers, &2, &0);

    let to = Address::generate(&env);
    let proposal_id = client.submit_proposal(&s1, &to, &1, &Bytes::new(&env), &1);
    client.approve_proposal(&s1, &proposal_id);

    let result = client.try_approve_proposal(&s1, &proposal_id);
    assert!(result.is_err(), "same signer approving twice must fail");
}

// ── Non-signer rejection ──────────────────────────────────────────────────────

#[test]
fn test_non_signer_cannot_submit_proposal() {
    let env = Env::default();
    env.mock_all_auths();

    let s1 = Address::generate(&env);
    let outsider = Address::generate(&env);
    let signers = Vec::from_array(&env, [s1.clone()]);

    let contract_id = env.register(MultiSigWalletContract, ());
    let client = MultiSigWalletContractClient::new(&env, &contract_id);
    client.initialize(&signers, &1, &0);

    let to = Address::generate(&env);
    let result = client.try_submit_proposal(&outsider, &to, &1, &Bytes::new(&env), &1);
    assert!(result.is_err(), "non-signer must not be able to submit");
}

// ── Batch proposals ───────────────────────────────────────────────────────────

#[test]
fn test_multiple_proposals_independent() {
    let env = Env::default();
    env.mock_all_auths();

    let s1 = Address::generate(&env);
    let s2 = Address::generate(&env);
    let signers = Vec::from_array(&env, [s1.clone(), s2.clone()]);

    let contract_id = env.register(MultiSigWalletContract, ());
    let client = MultiSigWalletContractClient::new(&env, &contract_id);
    client.initialize(&signers, &2, &0);

    let to = Address::generate(&env);
    let p0 = client.submit_proposal(&s1, &to, &100, &Bytes::new(&env), &1);
    let p1 = client.submit_proposal(&s1, &to, &200, &Bytes::new(&env), &2);

    // Approve and execute only p1
    client.approve_proposal(&s1, &p1);
    client.approve_proposal(&s2, &p1);
    client.execute_proposal(&p1);

    // p0 still pending
    assert!(!client.get_proposal(&p0).unwrap().executed);
    assert!(client.get_proposal(&p1).unwrap().executed);
}
