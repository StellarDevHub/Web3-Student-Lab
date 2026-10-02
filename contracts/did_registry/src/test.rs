//! Tests for SC-HARD-11 — DID Registry & Cryptographic Key Rotation.
//!
//! Covers:
//! - DID registration and resolution
//! - GitHub handle binding
//! - Social identity binding (discord)
//! - Ed25519 verification key management
//! - Contributor proof add / reject on handle mismatch
//! - Controller delegation (add / remove / proof via delegate)
//! - Service endpoint (attribute) updates
//! - Key rotation
//! - Revocation: deactivated DIDs reject all subsequent mutations
//! - Duplicate DID registration rejected

use crate::{ContributorProof, DIDRegistryContract, DIDRegistryContractClient};
use soroban_sdk::{
    symbol_short,
    testutils::Address as _,
    Address, Bytes, BytesN, Env, Map, String, Symbol,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

fn deploy(env: &Env) -> (Address, DIDRegistryContractClient) {
    let contract_id = env.register(DIDRegistryContract, ());
    let client = DIDRegistryContractClient::new(env, &contract_id);
    (contract_id, client)
}

fn make_did(env: &Env, seed: u8) -> BytesN<32> {
    BytesN::from_array(env, &[seed; 32])
}

fn register_default(
    env: &Env,
    client: &DIDRegistryContractClient,
    owner: &Address,
    did: &BytesN<32>,
) {
    let mut attrs = Map::new(env);
    attrs.set(symbol_short!("name"), Bytes::from_slice(env, b"Alice"));
    client.register(owner, did, &attrs);
}

fn make_proof(env: &Env, handle: &str) -> ContributorProof {
    ContributorProof {
        claim_type: String::from_str(env, "pr"),
        repo: String::from_str(env, "StellarDevHub/Web3-Student-Lab"),
        item_id: String::from_str(env, "42"),
        github_handle: String::from_str(env, handle),
        issued_at: 1_700_000_000,
        signature: Bytes::from_slice(env, &[0u8; 64]),
    }
}

// ── Registration ──────────────────────────────────────────────────────────────

#[test]
fn test_register_and_resolve() {
    let env = Env::default();
    env.mock_all_auths();
    let (_id, client) = deploy(&env);
    let owner = Address::generate(&env);
    let did = make_did(&env, 1);
    register_default(&env, &client, &owner, &did);

    let doc = client.resolve(&did).unwrap();
    assert_eq!(doc.owner, owner);
    assert!(!doc.revoked);
    assert!(doc.github_handle.is_none());
}

#[test]
fn test_duplicate_registration_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (_id, client) = deploy(&env);
    let owner = Address::generate(&env);
    let did = make_did(&env, 2);
    register_default(&env, &client, &owner, &did);

    let result = client.try_register(&owner, &did, &Map::new(&env));
    assert!(result.is_err(), "duplicate DID must be rejected");
}

// ── GitHub handle binding ─────────────────────────────────────────────────────

#[test]
fn test_bind_github_handle() {
    let env = Env::default();
    env.mock_all_auths();
    let (_id, client) = deploy(&env);
    let owner = Address::generate(&env);
    let did = make_did(&env, 3);
    register_default(&env, &client, &owner, &did);

    let handle = String::from_str(&env, "alice");
    client.bind_github(&owner, &did, &handle);

    let doc = client.resolve(&did).unwrap();
    assert_eq!(doc.github_handle, Some(handle.clone()));
    assert_eq!(
        client.get_github_handle(&did),
        Some(handle)
    );
}

// ── Social identity binding ───────────────────────────────────────────────────

#[test]
fn test_bind_discord_handle() {
    let env = Env::default();
    env.mock_all_auths();
    let (_id, client) = deploy(&env);
    let owner = Address::generate(&env);
    let did = make_did(&env, 4);
    register_default(&env, &client, &owner, &did);

    let discord = String::from_str(&env, "alice#1234");
    client.bind_social(&owner, &did, &Symbol::new(&env, "discord"), &discord);

    assert_eq!(
        client.get_social_handle(&did, &Symbol::new(&env, "discord")),
        Some(discord)
    );
}

#[test]
fn test_unsupported_social_provider_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (_id, client) = deploy(&env);
    let owner = Address::generate(&env);
    let did = make_did(&env, 5);
    register_default(&env, &client, &owner, &did);

    let result = client.try_bind_social(
        &owner,
        &did,
        &Symbol::new(&env, "telegram"),
        &String::from_str(&env, "alice"),
    );
    assert!(result.is_err(), "unsupported provider must be rejected");
}

// ── Verification key ──────────────────────────────────────────────────────────

#[test]
fn test_set_and_get_verification_key() {
    let env = Env::default();
    env.mock_all_auths();
    let (_id, client) = deploy(&env);
    let owner = Address::generate(&env);
    let did = make_did(&env, 6);
    register_default(&env, &client, &owner, &did);

    let key = BytesN::from_array(&env, &[9u8; 32]);
    client.set_verification_key(&owner, &did, &key);

    assert_eq!(client.get_verification_key(&did), Some(key));
}

// ── Contributor proofs ────────────────────────────────────────────────────────

#[test]
fn test_add_contributor_proof_success() {
    let env = Env::default();
    env.mock_all_auths();
    let (_id, client) = deploy(&env);
    let owner = Address::generate(&env);
    let did = make_did(&env, 7);
    register_default(&env, &client, &owner, &did);

    // Bind handle first
    client.bind_github(&owner, &did, &String::from_str(&env, "alice"));

    let proof = make_proof(&env, "alice");
    client.add_contributor_proof(&owner, &did, &proof);

    assert_eq!(client.get_proofs(&did).len(), 1);
}

#[test]
fn test_proof_rejected_on_handle_mismatch() {
    let env = Env::default();
    env.mock_all_auths();
    let (_id, client) = deploy(&env);
    let owner = Address::generate(&env);
    let did = make_did(&env, 8);
    register_default(&env, &client, &owner, &did);

    client.bind_github(&owner, &did, &String::from_str(&env, "alice"));

    let bad_proof = make_proof(&env, "mallory");
    let result = client.try_add_contributor_proof(&owner, &did, &bad_proof);
    assert!(result.is_err(), "proof with wrong handle must be rejected");
}

#[test]
fn test_multiple_proofs_accumulate() {
    let env = Env::default();
    env.mock_all_auths();
    let (_id, client) = deploy(&env);
    let owner = Address::generate(&env);
    let did = make_did(&env, 9);
    register_default(&env, &client, &owner, &did);

    client.bind_github(&owner, &did, &String::from_str(&env, "alice"));
    client.add_contributor_proof(&owner, &did, &make_proof(&env, "alice"));
    client.add_contributor_proof(&owner, &did, &make_proof(&env, "alice"));
    client.add_contributor_proof(&owner, &did, &make_proof(&env, "alice"));

    assert_eq!(client.get_proofs(&did).len(), 3);
}

// ── Controller delegation ─────────────────────────────────────────────────────

#[test]
fn test_delegate_controller_can_add_proof() {
    let env = Env::default();
    env.mock_all_auths();
    let (_id, client) = deploy(&env);
    let owner = Address::generate(&env);
    let delegate = Address::generate(&env);
    let did = make_did(&env, 10);
    register_default(&env, &client, &owner, &did);

    client.add_controller(&owner, &did, &delegate);
    // No github handle bound → proof handle check skipped
    client.add_contributor_proof(&delegate, &did, &make_proof(&env, "bob"));
    assert_eq!(client.get_proofs(&did).len(), 1);
}

#[test]
fn test_remove_controller() {
    let env = Env::default();
    env.mock_all_auths();
    let (_id, client) = deploy(&env);
    let owner = Address::generate(&env);
    let delegate = Address::generate(&env);
    let did = make_did(&env, 11);
    register_default(&env, &client, &owner, &did);

    client.add_controller(&owner, &did, &delegate);
    client.remove_controller(&owner, &did, &delegate);

    let doc = client.resolve(&did).unwrap();
    assert_eq!(doc.controllers.len(), 0);
}

// ── Key rotation ──────────────────────────────────────────────────────────────

#[test]
fn test_key_rotation_transfers_ownership() {
    let env = Env::default();
    env.mock_all_auths();
    let (_id, client) = deploy(&env);
    let owner = Address::generate(&env);
    let new_owner = Address::generate(&env);
    let did = make_did(&env, 12);
    register_default(&env, &client, &owner, &did);

    client.rotate_key(&owner, &did, &new_owner);

    let doc = client.resolve(&did).unwrap();
    assert_eq!(doc.owner, new_owner);
}

#[test]
fn test_old_owner_cannot_mutate_after_rotation() {
    let env = Env::default();
    env.mock_all_auths();
    let (_id, client) = deploy(&env);
    let owner = Address::generate(&env);
    let new_owner = Address::generate(&env);
    let did = make_did(&env, 13);
    register_default(&env, &client, &owner, &did);

    client.rotate_key(&owner, &did, &new_owner);

    // Old owner tries to rotate again
    let another = Address::generate(&env);
    let result = client.try_rotate_key(&owner, &did, &another);
    assert!(result.is_err(), "old owner must not be able to rotate after handoff");
}

// ── Revocation ────────────────────────────────────────────────────────────────

#[test]
fn test_revoke_marks_did_revoked() {
    let env = Env::default();
    env.mock_all_auths();
    let (_id, client) = deploy(&env);
    let owner = Address::generate(&env);
    let did = make_did(&env, 14);
    register_default(&env, &client, &owner, &did);

    client.revoke(&owner, &did);

    let doc = client.resolve(&did).unwrap();
    assert!(doc.revoked);
}

#[test]
fn test_revoked_did_rejects_bind_github() {
    let env = Env::default();
    env.mock_all_auths();
    let (_id, client) = deploy(&env);
    let owner = Address::generate(&env);
    let did = make_did(&env, 15);
    register_default(&env, &client, &owner, &did);

    client.revoke(&owner, &did);

    let result = client.try_bind_github(&owner, &did, &String::from_str(&env, "alice"));
    assert!(result.is_err(), "revoked DID must reject bind_github");
}

#[test]
fn test_revoked_did_rejects_key_rotation() {
    let env = Env::default();
    env.mock_all_auths();
    let (_id, client) = deploy(&env);
    let owner = Address::generate(&env);
    let did = make_did(&env, 16);
    register_default(&env, &client, &owner, &did);

    client.revoke(&owner, &did);

    let new_owner = Address::generate(&env);
    let result = client.try_rotate_key(&owner, &did, &new_owner);
    assert!(result.is_err(), "revoked DID must reject key rotation");
}

#[test]
fn test_revoked_did_rejects_update() {
    let env = Env::default();
    env.mock_all_auths();
    let (_id, client) = deploy(&env);
    let owner = Address::generate(&env);
    let did = make_did(&env, 17);
    register_default(&env, &client, &owner, &did);

    client.revoke(&owner, &did);

    let result = client.try_update(&owner, &did, &Map::new(&env));
    assert!(result.is_err(), "revoked DID must reject attribute updates");
}

#[test]
fn test_revoked_did_rejects_add_proof() {
    let env = Env::default();
    env.mock_all_auths();
    let (_id, client) = deploy(&env);
    let owner = Address::generate(&env);
    let did = make_did(&env, 18);
    register_default(&env, &client, &owner, &did);

    client.revoke(&owner, &did);

    let result = client.try_add_contributor_proof(&owner, &did, &make_proof(&env, "alice"));
    assert!(result.is_err(), "revoked DID must reject proof additions");
}

// ── Attribute (service endpoint) updates ─────────────────────────────────────

#[test]
fn test_update_attributes() {
    let env = Env::default();
    env.mock_all_auths();
    let (_id, client) = deploy(&env);
    let owner = Address::generate(&env);
    let did = make_did(&env, 19);
    register_default(&env, &client, &owner, &did);

    let mut new_attrs = Map::new(&env);
    new_attrs.set(symbol_short!("endpoint"), Bytes::from_slice(&env, b"https://example.com"));
    client.update(&owner, &did, &new_attrs);

    let doc = client.resolve(&did).unwrap();
    assert!(doc.attributes.contains_key(symbol_short!("endpoint")));
}
