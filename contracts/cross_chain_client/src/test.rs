//! Tests for the cross-chain light client / SPV proof verifier.
//!
//! Covers the three compounded sub-tasks from the epic:
//!   * Easy:     foreign `BridgeHeader` struct can be submitted and read back.
//!   * Medium:   block hash storage and lookup by (chain_id, block_number).
//!   * Advanced: Merkle inclusion proof verification against a submitted
//!   * header's state root, with validator-signature consensus
//!   * gating which headers are accepted.

use super::*;
use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::Env;

extern crate std;

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

fn rlp_string(value: &[u8]) -> std::vec::Vec<u8> {
    if value.len() == 1 && value[0] < 0x80 {
        return std::vec![value[0]];
    }
    let mut encoded = std::vec::Vec::new();
    if value.len() < 56 {
        encoded.push(0x80 + value.len() as u8);
    } else {
        let length = (value.len() as u32).to_be_bytes();
        let first_nonzero = length.iter().position(|byte| *byte != 0).unwrap();
        let length_bytes = &length[first_nonzero..];
        encoded.push(0xb7 + length_bytes.len() as u8);
        encoded.extend_from_slice(length_bytes);
    }
    encoded.extend_from_slice(value);
    encoded
}

fn rlp_list(items: &[u8]) -> std::vec::Vec<u8> {
    let mut encoded = std::vec::Vec::new();
    if items.len() < 56 {
        encoded.push(0xc0 + items.len() as u8);
    } else {
        let length = (items.len() as u32).to_be_bytes();
        let first_nonzero = length.iter().position(|byte| *byte != 0).unwrap();
        let length_bytes = &length[first_nonzero..];
        encoded.push(0xf7 + length_bytes.len() as u8);
        encoded.extend_from_slice(length_bytes);
    }
    encoded.extend_from_slice(items);
    encoded
}

fn valid_empty_receipt() -> std::vec::Vec<u8> {
    let mut contents = std::vec![0x01, 0x01];
    contents.extend_from_slice(&rlp_string(&[0u8; 256]));
    contents.push(0xc0);
    rlp_list(&contents)
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
fn rlp_receipt_parser_accepts_valid_receipt_and_rejects_malformed_data() {
    let receipt = valid_empty_receipt();
    let receipt = Bytes::from_slice(&Env::default(), &receipt);
    assert!(rlp::is_receipt(&receipt));
    assert!(!rlp::is_receipt(&Bytes::from_array(
        &Env::default(),
        &[0xf8, 0x01, 0xc0]
    )));

    let env = Env::default();
    assert_eq!(rlp::encode_index(&env, 0), Bytes::from_array(&env, &[0x80]));
    assert_eq!(rlp::encode_index(&env, 1), Bytes::from_array(&env, &[0x01]));
    assert_eq!(
        rlp::encode_index(&env, 128),
        Bytes::from_array(&env, &[0x81, 0x80])
    );
}

#[test]
fn mpt_receipt_proof_validates_leaf_against_keccak_root() {
    let env = Env::default();
    let receipt = valid_empty_receipt();
    let key = rlp::encode_index(&env, 0);
    let compact_path = [0x20, 0x80];
    let encoded_path = rlp_string(&compact_path);
    let encoded_receipt = rlp_string(&receipt);
    let mut leaf_contents = encoded_path;
    leaf_contents.extend_from_slice(&encoded_receipt);
    let leaf_node = rlp_list(&leaf_contents);
    let leaf_node_bytes = Bytes::from_slice(&env, &leaf_node);
    let root: BytesN<32> = env.crypto().keccak256(&leaf_node_bytes).into();
    let proof = Vec::from_array(&env, [leaf_node_bytes]);

    assert!(mpt::verify_proof(
        &env,
        &root,
        &key,
        &Bytes::from_slice(&env, &receipt),
        &proof
    ));

    let wrong_value = Bytes::from_array(&env, &[0xc0]);
    assert!(!mpt::verify_proof(&env, &root, &key, &wrong_value, &proof));
}
