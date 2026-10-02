//! # SC-HARD-15 — ZK Proof Verifier Compute Optimization: Test Suite
//!
//! Tests verify:
//!  - Valid proofs are accepted exactly once.
//!  - Invalid proofs are rejected.
//!  - Replay attacks via the same nullifier are rejected.
//!  - The verifying key can be updated by the admin.
//!  - Unauthorized key update is rejected.
//!  - Nullifier state is queryable.

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Bytes, BytesN, Env};

// ── Helper ────────────────────────────────────────────────────────────────────

/// Build the correct proof bytes that will be accepted by the contract.
/// The contract checks: sha256(proof) == expected_proof_hash(…)
/// So proof must equal the pre-image of that hash — which is the payload
/// used in `expected_proof_hash`.
pub(crate) fn make_valid_proof(
    env: &Env,
    vk_hash: &BytesN<32>,
    student: &Address,
    public_input_hash: &BytesN<32>,
    nullifier: &BytesN<32>,
) -> Bytes {
    // The proof bytes ARE the sha256 pre-image: vk_hash || pub_input || nul || student_xdr.
    // The contract computes expected = sha256(pre-image) and provided = sha256(proof).
    // For provided == expected we need sha256(proof) == sha256(pre-image),
    // which means proof == pre-image.
    let mut payload = Bytes::new(env);
    payload.append(&Bytes::from_array(env, &vk_hash.to_array()));
    payload.append(&Bytes::from_array(env, &public_input_hash.to_array()));
    payload.append(&Bytes::from_array(env, &nullifier.to_array()));
    payload.append(&student.clone().to_xdr(env));
    payload
}

// ── Core behaviour tests ──────────────────────────────────────────────────────

/// A correctly formed proof is accepted exactly once, and the nullifier is
/// marked as consumed.
#[test]
fn verifies_valid_proof_once() {
    let env = Env::default();
    let contract_id = env.register(ZkProofVerifierContract, ());
    let client = ZkProofVerifierContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let student = Address::generate(&env);
    let vk_hash = BytesN::from_array(&env, &[1u8; 32]);
    let public_input_hash = BytesN::from_array(&env, &[2u8; 32]);
    let nullifier = BytesN::from_array(&env, &[3u8; 32]);

    env.mock_all_auths();
    client.initialize(&admin, &vk_hash);

    let proof = make_valid_proof(&env, &vk_hash, &student, &public_input_hash, &nullifier);
    let ok = client.verify_lab_completion(&student, &public_input_hash, &proof, &nullifier);

    assert!(ok);
    assert!(client.is_nullifier_used(&nullifier));
}

/// A proof whose bytes have been tampered with must be rejected.
#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn rejects_invalid_proof() {
    let env = Env::default();
    let contract_id = env.register(ZkProofVerifierContract, ());
    let client = ZkProofVerifierContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let student = Address::generate(&env);
    let vk_hash = BytesN::from_array(&env, &[10u8; 32]);
    let public_input_hash = BytesN::from_array(&env, &[11u8; 32]);
    let nullifier = BytesN::from_array(&env, &[12u8; 32]);

    env.mock_all_auths();
    client.initialize(&admin, &vk_hash);

    // Completely wrong proof bytes.
    let fake_proof = Bytes::from_array(&env, &[9u8, 9, 9, 9]);
    let _ = client.verify_lab_completion(&student, &public_input_hash, &fake_proof, &nullifier);
}

/// Submitting the same (valid) proof twice must be rejected on the second
/// attempt via nullifier replay detection.
#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn rejects_replay_with_same_nullifier() {
    let env = Env::default();
    let contract_id = env.register(ZkProofVerifierContract, ());
    let client = ZkProofVerifierContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let student = Address::generate(&env);
    let vk_hash = BytesN::from_array(&env, &[4u8; 32]);
    let public_input_hash = BytesN::from_array(&env, &[5u8; 32]);
    let nullifier = BytesN::from_array(&env, &[6u8; 32]);

    env.mock_all_auths();
    client.initialize(&admin, &vk_hash);

    let proof = make_valid_proof(&env, &vk_hash, &student, &public_input_hash, &nullifier);

    // First submission succeeds.
    let _ = client.verify_lab_completion(&student, &public_input_hash, &proof, &nullifier);
    // Second submission with the same nullifier must panic.
    let _ = client.verify_lab_completion(&student, &public_input_hash, &proof, &nullifier);
}

/// A fresh nullifier (never seen before) is not flagged as used.
#[test]
fn fresh_nullifier_is_not_used() {
    let env = Env::default();
    let contract_id = env.register(ZkProofVerifierContract, ());
    let client = ZkProofVerifierContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let vk_hash = BytesN::from_array(&env, &[0u8; 32]);

    env.mock_all_auths();
    client.initialize(&admin, &vk_hash);

    let nullifier = BytesN::from_array(&env, &[99u8; 32]);
    assert!(!client.is_nullifier_used(&nullifier));
}

/// The admin can update the verifying key hash (circuit upgrade scenario).
#[test]
fn admin_can_update_verifying_key() {
    let env = Env::default();
    let contract_id = env.register(ZkProofVerifierContract, ());
    let client = ZkProofVerifierContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let vk_hash_v1 = BytesN::from_array(&env, &[1u8; 32]);
    let vk_hash_v2 = BytesN::from_array(&env, &[2u8; 32]);

    env.mock_all_auths();
    client.initialize(&admin, &vk_hash_v1);
    client.update_verifying_key(&admin, &vk_hash_v2);

    // After the upgrade a proof generated against vk_v2 must be accepted.
    let student = Address::generate(&env);
    let public_input_hash = BytesN::from_array(&env, &[7u8; 32]);
    let nullifier = BytesN::from_array(&env, &[8u8; 32]);
    let proof = make_valid_proof(&env, &vk_hash_v2, &student, &public_input_hash, &nullifier);
    let ok = client.verify_lab_completion(&student, &public_input_hash, &proof, &nullifier);
    assert!(ok);
}

/// A non-admin address must not be able to update the verifying key.
#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn non_admin_cannot_update_verifying_key() {
    let env = Env::default();
    let contract_id = env.register(ZkProofVerifierContract, ());
    let client = ZkProofVerifierContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let attacker = Address::generate(&env);
    let vk_hash = BytesN::from_array(&env, &[1u8; 32]);
    let new_vk = BytesN::from_array(&env, &[2u8; 32]);

    env.mock_all_auths();
    client.initialize(&admin, &vk_hash);
    // attacker is not the admin → must panic with Unauthorized (5).
    client.update_verifying_key(&attacker, &new_vk);
}

/// Proof built against the old VK must be rejected after a key upgrade,
/// ensuring circuit upgrades invalidate outstanding stale proofs.
#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn proof_against_old_vk_rejected_after_upgrade() {
    let env = Env::default();
    let contract_id = env.register(ZkProofVerifierContract, ());
    let client = ZkProofVerifierContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let student = Address::generate(&env);
    let vk_v1 = BytesN::from_array(&env, &[1u8; 32]);
    let vk_v2 = BytesN::from_array(&env, &[2u8; 32]);
    let public_input_hash = BytesN::from_array(&env, &[3u8; 32]);
    let nullifier = BytesN::from_array(&env, &[4u8; 32]);

    env.mock_all_auths();
    client.initialize(&admin, &vk_v1);

    // Proof generated against old VK.
    let old_proof = make_valid_proof(&env, &vk_v1, &student, &public_input_hash, &nullifier);

    // Admin upgrades to v2.
    client.update_verifying_key(&admin, &vk_v2);

    // Old proof must now fail.
    let _ = client.verify_lab_completion(&student, &public_input_hash, &old_proof, &nullifier);
}
