#![cfg(test)]

use crate::cross_chain_messaging::{
    CrossChainMessagingContract, CrossChainMessagingContractClient, MessagingError,
};
use ed25519_dalek::{Signer, SigningKey};
use soroban_sdk::{
    testutils::{Address as _, BytesN as _},
    Address, Bytes, BytesN, Env,
};

const SRC_CHAIN: u32 = 100; // EVM chain (example)
const DST_CHAIN: u32 = 1;   // Stellar (example)

/// Build canonical hash bytes (mirrors `CrossChainMessagingContract::build_hash_input`),
/// sign with an ephemeral ed25519 key, and return the Soroban-typed public key and signature.
fn sign_message(
    env: &Env,
    source_chain: u32,
    dest_chain: u32,
    nonce: u64,
    sender: &Bytes,
    payload: &Bytes,
) -> (BytesN<32>, BytesN<64>) {
    // Build canonical bytes (big-endian field encoding).
    let mut data = Bytes::new(env);
    data.push_back((source_chain >> 24) as u8);
    data.push_back((source_chain >> 16) as u8);
    data.push_back((source_chain >> 8) as u8);
    data.push_back(source_chain as u8);
    data.push_back((dest_chain >> 24) as u8);
    data.push_back((dest_chain >> 16) as u8);
    data.push_back((dest_chain >> 8) as u8);
    data.push_back(dest_chain as u8);
    data.push_back((nonce >> 56) as u8);
    data.push_back((nonce >> 48) as u8);
    data.push_back((nonce >> 40) as u8);
    data.push_back((nonce >> 32) as u8);
    data.push_back((nonce >> 24) as u8);
    data.push_back((nonce >> 16) as u8);
    data.push_back((nonce >> 8) as u8);
    data.push_back(nonce as u8);
    data.append(sender);
    data.append(payload);

    // Compute sha256 → Hash<32> → byte slice for dalek.
    let hash = env.crypto().sha256(&data);
    let hash_bytes: BytesN<32> = hash.into();
    let mut hash_slice = [0u8; 32];
    for (i, b) in hash_bytes.iter().enumerate() {
        hash_slice[i] = b;
    }

    // Generate an ephemeral signing key.
    let secret_bytes: [u8; 32] = rand::random();
    let signing_key = SigningKey::from_bytes(&secret_bytes);
    let verifying_key = signing_key.verifying_key();

    // Sign the hash (ed25519-dalek signs the raw bytes, matching the contract's verify call).
    let sig_raw = signing_key.sign(&hash_slice);
    let sig_bytes = sig_raw.to_bytes(); // [u8; 64]

    // Convert to Soroban BytesN types.
    let pubkey = BytesN::<32>::from_array(env, verifying_key.as_bytes());
    let signature = BytesN::<64>::from_array(env, &sig_bytes);

    (pubkey, signature)
}

fn setup() -> (Env, Address, CrossChainMessagingContractClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(CrossChainMessagingContract, ());
    let client = CrossChainMessagingContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    (env, admin, client)
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

#[test]
fn test_initialize_success() {
    let (_, admin, client) = setup();
    client.initialize(&admin, &DST_CHAIN);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #1)")]
fn test_initialize_already_initialized() {
    let (_, admin, client) = setup();
    client.initialize(&admin, &DST_CHAIN);
    client.initialize(&admin, &DST_CHAIN);
}

// ---------------------------------------------------------------------------
// Relayer registry
// ---------------------------------------------------------------------------

#[test]
fn test_register_relayer() {
    let (env, admin, client) = setup();
    client.initialize(&admin, &DST_CHAIN);

    let pubkey = BytesN::<32>::random(&env);
    assert!(!client.is_active_relayer(&pubkey));
    client.register_relayer(&admin, &pubkey);
    assert!(client.is_active_relayer(&pubkey));
}

#[test]
fn test_deregister_relayer() {
    let (env, admin, client) = setup();
    client.initialize(&admin, &DST_CHAIN);

    let pubkey = BytesN::<32>::random(&env);
    client.register_relayer(&admin, &pubkey);
    assert!(client.is_active_relayer(&pubkey));
    client.deregister_relayer(&admin, &pubkey);
    assert!(!client.is_active_relayer(&pubkey));
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #3)")]
fn test_register_relayer_unauthorized() {
    let (env, admin, client) = setup();
    client.initialize(&admin, &DST_CHAIN);

    let attacker = Address::generate(&env);
    let pubkey = BytesN::<32>::random(&env);
    client.register_relayer(&attacker, &pubkey);
}

// ---------------------------------------------------------------------------
// Inbound message – success paths
// ---------------------------------------------------------------------------

#[test]
fn test_send_message_success() {
    let (env, admin, client) = setup();
    client.initialize(&admin, &DST_CHAIN);

    let sender = Bytes::from_slice(&env, &[0xDE, 0xAD, 0xBE, 0xEF]);
    let payload = Bytes::from_slice(&env, b"hello cross-chain");
    let nonce = 1u64;

    let (pubkey, sig) = sign_message(&env, SRC_CHAIN, DST_CHAIN, nonce, &sender, &payload);
    client.register_relayer(&admin, &pubkey);

    let msg_id = client.send_message(&SRC_CHAIN, &nonce, &sender, &payload, &pubkey, &sig);

    let msg = client.get_message(&msg_id);
    assert_eq!(msg.source_chain, SRC_CHAIN);
    assert_eq!(msg.dest_chain, DST_CHAIN);
    assert_eq!(msg.nonce, nonce);
    assert_eq!(msg.sender, sender);
    assert_eq!(msg.payload, payload);
}

#[test]
fn test_nonce_marked_processed_after_message() {
    let (env, admin, client) = setup();
    client.initialize(&admin, &DST_CHAIN);

    let sender = Bytes::from_slice(&env, &[0x01]);
    let payload = Bytes::from_slice(&env, b"payload");
    let nonce = 42u64;

    let (pubkey, sig) = sign_message(&env, SRC_CHAIN, DST_CHAIN, nonce, &sender, &payload);
    client.register_relayer(&admin, &pubkey);

    assert!(!client.is_nonce_processed(&SRC_CHAIN, &nonce));
    client.send_message(&SRC_CHAIN, &nonce, &sender, &payload, &pubkey, &sig);
    assert!(client.is_nonce_processed(&SRC_CHAIN, &nonce));
}

// ---------------------------------------------------------------------------
// Inbound message – failure paths
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected = "HostError: Error(Contract, #4)")]
fn test_send_message_unknown_relayer() {
    let (env, admin, client) = setup();
    client.initialize(&admin, &DST_CHAIN);

    let sender = Bytes::from_slice(&env, &[0x01]);
    let payload = Bytes::from_slice(&env, b"data");
    let (pubkey, sig) = sign_message(&env, SRC_CHAIN, DST_CHAIN, 1, &sender, &payload);
    // Do NOT register the relayer.
    client.send_message(&SRC_CHAIN, &1u64, &sender, &payload, &pubkey, &sig);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #5)")]
fn test_send_message_replay_attack() {
    let (env, admin, client) = setup();
    client.initialize(&admin, &DST_CHAIN);

    let sender = Bytes::from_slice(&env, &[0x01]);
    let payload = Bytes::from_slice(&env, b"data");
    let nonce = 7u64;

    let (pubkey, sig) = sign_message(&env, SRC_CHAIN, DST_CHAIN, nonce, &sender, &payload);
    client.register_relayer(&admin, &pubkey);

    // First submission succeeds.
    client.send_message(&SRC_CHAIN, &nonce, &sender, &payload, &pubkey, &sig);
    // Identical second submission must revert with NonceReplayed.
    client.send_message(&SRC_CHAIN, &nonce, &sender, &payload, &pubkey, &sig);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #4)")]
fn test_send_message_deactivated_relayer() {
    let (env, admin, client) = setup();
    client.initialize(&admin, &DST_CHAIN);

    let sender = Bytes::from_slice(&env, &[0x01]);
    let payload = Bytes::from_slice(&env, b"data");
    let nonce = 1u64;

    let (pubkey, sig) = sign_message(&env, SRC_CHAIN, DST_CHAIN, nonce, &sender, &payload);
    client.register_relayer(&admin, &pubkey);
    client.deregister_relayer(&admin, &pubkey);

    client.send_message(&SRC_CHAIN, &nonce, &sender, &payload, &pubkey, &sig);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #7)")]
fn test_get_message_not_found() {
    let (env, admin, client) = setup();
    client.initialize(&admin, &DST_CHAIN);

    let fake_id = BytesN::<32>::random(&env);
    client.get_message(&fake_id);
}

#[test]
fn test_multiple_sequential_nonces() {
    let (env, admin, client) = setup();
    client.initialize(&admin, &DST_CHAIN);

    let sender = Bytes::from_slice(&env, &[0xAA]);
    let payload = Bytes::from_slice(&env, b"msg");

    // Different nonces use different signing keys so each key can be registered.
    for nonce in 1u64..=3u64 {
        let (pubkey, sig) = sign_message(&env, SRC_CHAIN, DST_CHAIN, nonce, &sender, &payload);
        client.register_relayer(&admin, &pubkey);
        client.send_message(&SRC_CHAIN, &nonce, &sender, &payload, &pubkey, &sig);
        assert!(client.is_nonce_processed(&SRC_CHAIN, &nonce));
    }
}
