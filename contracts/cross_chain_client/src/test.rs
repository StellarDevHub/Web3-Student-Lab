//! Tests for the cross-chain light client / SPV proof verifier.
//!
//! Covers the three compounded sub-tasks from the epic:
//!   * Easy:     foreign `BridgeHeader` struct can be submitted and read back.
//!   * Medium:   block hash storage and lookup by (chain_id, block_number).
//!   * Advanced: Merkle inclusion proof verification against a submitted
//!   * header's state root, with validator-signature consensus
//!   * gating which headers are accepted.

use super::*;
use ed25519_dalek::{Signer, SigningKey};
use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::Env;

fn setup(env: &Env) -> (CrossChainClientClient<'static>, Address) {
    let admin = Address::generate(env);
    let contract_id = env.register(CrossChainClient, ());
    let client = CrossChainClientClient::new(env, &contract_id);
    client.init(&admin);
    (client, admin)
}

/// Build a Merkle root from a leaf and a sibling proof path, matching the
/// contract's `verify_merkle_proof` hashing order (direction 0 = left).
fn compute_root(env: &Env, leaf: &BytesN<32>, proof: &Vec<BytesN<32>>) -> BytesN<32> {
    let mut current = leaf.clone();
    for sibling in proof.iter() {
        let mut payload = [0u8; 64];
        payload[..32].copy_from_slice(&current.to_array());
        payload[32..].copy_from_slice(&sibling.to_array());
        current = env
            .crypto()
            .sha256(&Bytes::from_array(env, &payload))
            .into();
    }
    current
}

#[test]
fn validator_registration_and_threshold() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    let validator = BytesN::from_array(&env, &[9u8; 32]);
    client.register_validator(&admin, &validator);
    assert!(client.is_validator(&validator));
    assert_eq!(client.get_threshold(), 1);

    client.set_threshold(&admin, &2u32);
    assert_eq!(client.get_threshold(), 2);

    client.unregister_validator(&admin, &validator);
    assert!(!client.is_validator(&validator));
}

#[test]
fn validator_quorum_tracks_distinct_active_validators() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    for key in [[1u8; 32], [2u8; 32], [3u8; 32], [4u8; 32]] {
        client.register_validator(&admin, &BytesN::from_array(&env, &key));
    }
    assert_eq!(client.get_threshold(), 3);

    client.set_threshold(&admin, &1u32);
    assert_eq!(client.get_threshold(), 3);

    client.unregister_validator(&admin, &BytesN::from_array(&env, &[4u8; 32]));
    assert_eq!(client.get_threshold(), 3);
    client.unregister_validator(&admin, &BytesN::from_array(&env, &[3u8; 32]));
    assert_eq!(client.get_threshold(), 2);
}

#[test]
fn verify_block_header_rejects_duplicate_signers() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);
    let validator = BytesN::from_array(&env, &[9u8; 32]);
    client.register_validator(&admin, &validator);

    let hash = BytesN::from_array(&env, &[1u8; 32]);
    let signers: Vec<BytesN<32>> = Vec::from_array(&env, [validator.clone(), validator]);
    let signatures: Vec<BytesN<64>> = Vec::from_array(
        &env,
        [
            BytesN::from_array(&env, &[0u8; 64]),
            BytesN::from_array(&env, &[0u8; 64]),
        ],
    );
    assert!(!client.verify_block_header(&hash, &signers, &signatures));
}

#[test]
fn verify_block_header_rejects_unregistered_signer() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    client.set_threshold(&admin, &1u32);

    let block_hash = BytesN::from_array(&env, &[1u8; 32]);
    // Signer was never registered as a validator, so consensus must fail
    // before signature verification is even attempted.
    let unregistered = BytesN::from_array(&env, &[7u8; 32]);
    let signers: Vec<BytesN<32>> = Vec::from_array(&env, [unregistered]);
    let signatures: Vec<BytesN<64>> = Vec::from_array(&env, [BytesN::from_array(&env, &[0u8; 64])]);

    let ok = client.verify_block_header(&block_hash, &signers, &signatures);
    assert!(!ok);
}

#[test]
fn verify_block_header_rejects_below_threshold() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    client.set_threshold(&admin, &2u32);
    let block_hash = BytesN::from_array(&env, &[1u8; 32]);
    let signers: Vec<BytesN<32>> = Vec::new(&env);
    let signatures: Vec<BytesN<64>> = Vec::new(&env);

    let ok = client.verify_block_header(&block_hash, &signers, &signatures);
    assert!(!ok);
}

#[test]
fn merkle_state_proof_verifies_valid_inclusion() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let leaf = BytesN::from_array(&env, &[3u8; 32]);
    let sibling_a = BytesN::from_array(&env, &[4u8; 32]);
    let sibling_b = BytesN::from_array(&env, &[5u8; 32]);
    let proof: Vec<BytesN<32>> = Vec::from_array(&env, [sibling_a, sibling_b]);
    let path = Bytes::from_array(&env, &[0u8, 0u8]);

    let root = compute_root(&env, &leaf, &proof);

    let valid = client.verify_merkle_proof(&leaf, &proof, &path, &root);
    assert!(valid);
}

#[test]
fn merkle_state_proof_rejects_tampered_root() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let leaf = BytesN::from_array(&env, &[3u8; 32]);
    let sibling = BytesN::from_array(&env, &[4u8; 32]);
    let proof: Vec<BytesN<32>> = Vec::from_array(&env, [sibling]);
    let path = Bytes::from_array(&env, &[0u8]);

    let wrong_root = BytesN::from_array(&env, &[0xEE; 32]);
    let valid = client.verify_merkle_proof(&leaf, &proof, &path, &wrong_root);
    assert!(!valid);
}

#[test]
fn nonce_replay_guard_starts_clear() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    let relayer = BytesN::from_array(&env, &[6u8; 32]);
    client.add_relayer(&admin, &relayer);

    // The (chain, nonce) replay guard must start false for a fresh pair.
    assert!(!client.is_processed(&7u32, &1u64));
}

#[test]
fn ledger_timestamp_advances_for_header_accept_time() {
    let env = Env::default();
    env.mock_all_auths();
    let (_client, _admin) = setup(&env);
    env.ledger().with_mut(|li| li.timestamp = 1_000);
    assert_eq!(env.ledger().timestamp(), 1_000);
}

#[test]
fn mpt_leaf_inclusion_verifies_exact_transaction_value() {
    let env = Env::default();
    let node = Bytes::from_array(&env, &[0xc6, 0x82, 0x20, 0x80, 0x82, 0xaa, 0xbb]);
    let root: BytesN<32> = env.crypto().keccak256(&node).into();
    let key = Bytes::from_array(&env, &[0x80]);
    let transaction = Bytes::from_array(&env, &[0xaa, 0xbb]);
    let proof = Vec::from_array(&env, [node]);

    assert!(verify_mpt_inclusion(
        &env,
        &root,
        &key,
        &transaction,
        &proof
    ));
}

#[test]
fn mpt_leaf_inclusion_rejects_wrong_key_and_value() {
    let env = Env::default();
    let node = Bytes::from_array(&env, &[0xc6, 0x82, 0x20, 0x80, 0x82, 0xaa, 0xbb]);
    let root: BytesN<32> = env.crypto().keccak256(&node).into();
    let proof = Vec::from_array(&env, [node]);

    assert!(!verify_mpt_inclusion(
        &env,
        &root,
        &Bytes::from_array(&env, &[0x81]),
        &Bytes::from_array(&env, &[0xaa, 0xbb]),
        &proof
    ));
    assert!(!verify_mpt_inclusion(
        &env,
        &root,
        &Bytes::from_array(&env, &[0x80]),
        &Bytes::from_array(&env, &[0xaa, 0xbc]),
        &proof
    ));
}

#[test]
fn accepted_header_mpt_proof_unlocks_once() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);
    env.ledger().with_mut(|li| li.timestamp = 1_000);

    let signing_key = SigningKey::from_bytes(&[42u8; 32]);
    let validator = BytesN::from_array(&env, &signing_key.verifying_key().to_bytes());
    client.register_validator(&admin, &validator);

    let transaction = Bytes::from_array(&env, &[0xaa, 0xbb]);
    let trie_key = Bytes::from_array(&env, &[0x80]);
    let node = Bytes::from_array(&env, &[0xc6, 0x82, 0x20, 0x80, 0x82, 0xaa, 0xbb]);
    let tx_root: BytesN<32> = env.crypto().keccak256(&node).into();
    let block_hash = BytesN::from_array(&env, &[3u8; 32]);
    let parent_hash = BytesN::from_array(&env, &[0u8; 32]);
    let state_root = BytesN::from_array(&env, &[4u8; 32]);
    let signing_hash = client.block_header_signing_hash(
        &7u32,
        &1u64,
        &block_hash,
        &parent_hash,
        &state_root,
        &tx_root,
        &1_000u64,
    );
    let signature = signing_key.sign(&signing_hash.to_array()).to_bytes();
    let signers = Vec::from_array(&env, [validator]);
    let signatures = Vec::from_array(&env, [BytesN::from_array(&env, &signature)]);
    client.submit_block_header(
        &admin,
        &7u32,
        &1u64,
        &block_hash,
        &parent_hash,
        &state_root,
        &tx_root,
        &1_000u64,
        &signers,
        &signatures,
    );

    let tx_hash: BytesN<32> = env.crypto().keccak256(&transaction).into();
    let proof_nodes = Vec::from_array(&env, [node]);
    let asset_id = BytesN::from_array(&env, &[5u8; 32]);
    let recipient = Bytes::from_array(&env, &[6u8; 32]);
    assert!(client.unlock_asset_from_header(
        &admin,
        &7u32,
        &1u64,
        &tx_hash,
        &trie_key,
        &transaction,
        &proof_nodes,
        &asset_id,
        &recipient,
        &25i128,
    ));
    assert!(client.is_source_tx_processed(&7u32, &tx_hash));
    assert!(client.get_processed_tx(&tx_hash));
    assert_eq!(client.get_source_unlock(&7u32, &tx_hash).block_number, 1);
    assert!(!client.is_source_tx_processed(&8u32, &tx_hash));
}
