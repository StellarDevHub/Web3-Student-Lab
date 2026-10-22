// Decentralized Identity (DID) Registry Contract — `did:stellar` method
// Language: Rust (Soroban)
//
// This contract is the on-chain anchor for the `did:stellar` DID method. It
// implements the W3C DID Core 1.0 write/control model:
//
//   * The DID identifier is the 32-byte Stellar Ed25519 account id
//     (`did:stellar:<hex>`).
//   * The registry stores the controller `Address`, an off-chain GitHub
//     handle binding, the Ed25519 *verification key* used to sign contributor
//     proofs, and the set of verified contributor claims.
//   * String-form entry points (`register_string`, `resolve_string`) accept
//     only canonical `did:stellar:<64 hex>` DIDs and reject malformed strings
//     with `DIDError::MalformedDID`; `validate_did` is a non-panicking view.
//
// Cryptographic *verification* of Ed25519 signatures over contributor proofs
// is performed by the off-chain resolver (see backend `didResolver`), which
// reads this on-chain state. On-chain we only store the binding so the
// resolver can fetch the trusted public key.

#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, Address, Bytes, BytesN, Env, Map, String, Symbol, Vec,
};

pub mod types;
pub mod verification;

pub use types::*;

/// Contract-level errors.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum DIDError {
    /// `1` — input was not a canonical `did:stellar:<64 hex>` string.
    MalformedDID = 1,
}

#[contract]
pub struct DIDRegistryContract;

#[contractimpl]
impl DIDRegistryContract {
    pub fn register(env: Env, owner: Address, did: BytesN<32>, attributes: Map<Symbol, Bytes>) {
        owner.require_auth();
        let mut dids: Map<BytesN<32>, DIDDocument> = env
            .storage()
            .persistent()
            .get(&DataKey::DIDs)
            .unwrap_or_else(|| Map::new(&env));
        assert!(!dids.contains_key(did.clone()), "DID already registered");
        let doc = DIDDocument {
            owner: owner.clone(),
            github_handle: None,
            social_identities: Map::new(&env),
            verification_key: None,
            attributes,
            controllers: Vec::new(&env),
            revoked: false,
            proofs: Vec::new(&env),
        };
        dids.set(did.clone(), doc);
        let mut proofs: Map<BytesN<32>, Vec<ContributorProof>> = env
            .storage()
            .persistent()
            .get(&DataKey::Proofs)
            .unwrap_or_else(|| Map::new(&env));
        proofs.set(did.clone(), Vec::new(&env));
        env.storage().persistent().set(&DataKey::DIDs, &dids);
        env.storage().persistent().set(&DataKey::Proofs, &proofs);
    }

    /// Bind an off-chain GitHub handle to the DID. Only the owner may bind.
    pub fn bind_github(env: Env, sender: Address, did: BytesN<32>, handle: String) {
        sender.require_auth();
        let mut dids: Map<BytesN<32>, DIDDocument> =
            env.storage().persistent().get(&DataKey::DIDs).unwrap();
        let mut doc = dids.get(did.clone()).unwrap();
        assert!(!doc.revoked, "DID revoked");
        assert!(doc.owner == sender, "Only owner can bind github handle");
        doc.github_handle = Some(handle);
        doc.social_identities.set(
            Symbol::new(&env, "github"),
            doc.github_handle.clone().unwrap(),
        );
        dids.set(did.clone(), doc);
        env.storage().persistent().set(&DataKey::DIDs, &dids);
    }

    /// Bind a social handle to the DID. Only the owner may bind; verifiers must
    /// separately validate the provider proof associated with the handle.
    pub fn bind_social(
        env: Env,
        sender: Address,
        did: BytesN<32>,
        provider: Symbol,
        handle: String,
    ) {
        sender.require_auth();
        assert!(
            provider == Symbol::new(&env, "github") || provider == Symbol::new(&env, "discord"),
            "Unsupported social provider"
        );
        let mut dids: Map<BytesN<32>, DIDDocument> =
            env.storage().persistent().get(&DataKey::DIDs).unwrap();
        let mut doc = dids.get(did.clone()).unwrap();
        assert!(!doc.revoked, "DID revoked");
        assert!(doc.owner == sender, "Only owner can bind social identity");
        if provider == Symbol::new(&env, "github") {
            doc.github_handle = Some(handle.clone());
        }
        doc.social_identities.set(provider, handle);
        dids.set(did, doc);
        env.storage().persistent().set(&DataKey::DIDs, &dids);
    }

    /// Set the Ed25519 verification key used to sign contributor proofs.
    pub fn set_verification_key(env: Env, sender: Address, did: BytesN<32>, key: BytesN<32>) {
        sender.require_auth();
        let mut dids: Map<BytesN<32>, DIDDocument> =
            env.storage().persistent().get(&DataKey::DIDs).unwrap();
        let mut doc = dids.get(did.clone()).unwrap();
        assert!(!doc.revoked, "DID revoked");
        assert!(doc.owner == sender, "Only owner can set verification key");
        doc.verification_key = Some(key);
        dids.set(did.clone(), doc);
        env.storage().persistent().set(&DataKey::DIDs, &dids);
    }

    /// Revoke the delegated Ed25519 verification (signing) key. Only the
    /// owner may revoke it; a new key can be set afterwards.
    pub fn revoke_verification_key(env: Env, sender: Address, did: BytesN<32>) {
        sender.require_auth();
        let mut dids: Map<BytesN<32>, DIDDocument> =
            env.storage().persistent().get(&DataKey::DIDs).unwrap();
        let mut doc = dids.get(did.clone()).unwrap();
        assert!(!doc.revoked, "DID revoked");
        assert!(
            doc.owner == sender,
            "Only owner can revoke verification key"
        );
        doc.verification_key = None;
        dids.set(did, doc);
        env.storage().persistent().set(&DataKey::DIDs, &dids);
    }

    /// Append a signed contributor proof claim. Only the owner may add; the
    /// resolver performs the cryptographic verification off-chain.
    pub fn add_contributor_proof(
        env: Env,
        sender: Address,
        did: BytesN<32>,
        proof: ContributorProof,
    ) {
        sender.require_auth();
        let dids: Map<BytesN<32>, DIDDocument> =
            env.storage().persistent().get(&DataKey::DIDs).unwrap();
        let doc = dids.get(did.clone()).unwrap();
        assert!(!doc.revoked, "DID revoked");
        assert!(
            verification::is_owner_or_controller(&doc, &sender),
            "Not authorized"
        );
        if let Some(handle) = doc.github_handle.clone() {
            assert!(
                handle == proof.github_handle,
                "Proof handle must match bound handle"
            );
        }
        let mut proofs: Map<BytesN<32>, Vec<ContributorProof>> = env
            .storage()
            .persistent()
            .get(&DataKey::Proofs)
            .unwrap_or_else(|| Map::new(&env));
        let mut list = proofs.get(did.clone()).unwrap_or_else(|| Vec::new(&env));
        list.push_back(proof);
        proofs.set(did.clone(), list);
        env.storage().persistent().set(&DataKey::Proofs, &proofs);
    }

    pub fn update(env: Env, sender: Address, did: BytesN<32>, attributes: Map<Symbol, Bytes>) {
        sender.require_auth();
        let mut dids: Map<BytesN<32>, DIDDocument> =
            env.storage().persistent().get(&DataKey::DIDs).unwrap();
        let mut doc = dids.get(did.clone()).unwrap();
        assert!(!doc.revoked, "DID revoked");
        assert!(
            verification::is_owner_or_controller(&doc, &sender),
            "Not authorized"
        );
        doc.attributes = attributes;
        dids.set(did, doc);
        env.storage().persistent().set(&DataKey::DIDs, &dids);
    }

    pub fn rotate_key(env: Env, sender: Address, did: BytesN<32>, new_owner: Address) {
        sender.require_auth();
        let mut dids: Map<BytesN<32>, DIDDocument> =
            env.storage().persistent().get(&DataKey::DIDs).unwrap();
        let mut doc = dids.get(did.clone()).unwrap();
        assert!(!doc.revoked, "DID revoked");
        assert!(doc.owner == sender, "Only owner can rotate key");
        doc.owner = new_owner;
        dids.set(did, doc);
        env.storage().persistent().set(&DataKey::DIDs, &dids);
    }

    pub fn revoke(env: Env, sender: Address, did: BytesN<32>) {
        sender.require_auth();
        let mut dids: Map<BytesN<32>, DIDDocument> =
            env.storage().persistent().get(&DataKey::DIDs).unwrap();
        let mut doc = dids.get(did.clone()).unwrap();
        assert!(doc.owner == sender, "Only owner can revoke");
        doc.revoked = true;
        dids.set(did, doc);
        env.storage().persistent().set(&DataKey::DIDs, &dids);
    }

    pub fn add_controller(env: Env, sender: Address, did: BytesN<32>, controller: Address) {
        sender.require_auth();
        let mut dids: Map<BytesN<32>, DIDDocument> =
            env.storage().persistent().get(&DataKey::DIDs).unwrap();
        let mut doc = dids.get(did.clone()).unwrap();
        assert!(doc.owner == sender, "Only owner can add controller");
        if !doc.controllers.contains(&controller) {
            doc.controllers.push_back(controller);
        }
        dids.set(did, doc);
        env.storage().persistent().set(&DataKey::DIDs, &dids);
    }

    pub fn remove_controller(env: Env, sender: Address, did: BytesN<32>, controller: Address) {
        sender.require_auth();
        let mut dids: Map<BytesN<32>, DIDDocument> =
            env.storage().persistent().get(&DataKey::DIDs).unwrap();
        let mut doc = dids.get(did.clone()).unwrap();
        assert!(doc.owner == sender, "Only owner can remove controller");
        let idx = doc.controllers.iter().position(|c| c == controller);
        if let Some(i) = idx {
            doc.controllers.remove(i as u32);
        }
        dids.set(did, doc);
        env.storage().persistent().set(&DataKey::DIDs, &dids);
    }

    pub fn resolve(env: Env, did: BytesN<32>) -> Option<DIDDocument> {
        let dids: Map<BytesN<32>, DIDDocument> = env
            .storage()
            .persistent()
            .get(&DataKey::DIDs)
            .unwrap_or_else(|| Map::new(&env));
        let mut doc = dids.get(did.clone())?;
        let proofs: Map<BytesN<32>, Vec<ContributorProof>> = env
            .storage()
            .persistent()
            .get(&DataKey::Proofs)
            .unwrap_or_else(|| Map::new(&env));
        doc.proofs = proofs.get(did).unwrap_or_else(|| Vec::new(&env));
        Some(doc)
    }

    /// Pure structural check: is this a canonical `did:stellar:<64 hex>`
    /// string? Never panics — safe to call on untrusted resolver input.
    pub fn validate_did(_env: Env, did: String) -> bool {
        verification::is_valid_did_string(&did)
    }

    /// Register a DID from its canonical string form. Malformed DID strings
    /// are rejected with `DIDError::MalformedDID`.
    pub fn register_string(env: Env, owner: Address, did: String, attributes: Map<Symbol, Bytes>) {
        // Parsing runs first so malformed input is rejected before anything
        // else; `register` performs the `owner.require_auth()` itself (a
        // second `require_auth` on the same frame is an auth error).
        let key = match verification::parse_did_string(&env, &did) {
            Some(key) => key,
            None => soroban_sdk::panic_with_error!(&env, DIDError::MalformedDID),
        };
        Self::register(env, owner, key, attributes);
    }

    /// Resolve a DID document from its canonical string form. Malformed DID
    /// strings are rejected with `DIDError::MalformedDID`.
    pub fn resolve_string(env: Env, did: String) -> Option<DIDDocument> {
        let key = match verification::parse_did_string(&env, &did) {
            Some(key) => key,
            None => soroban_sdk::panic_with_error!(&env, DIDError::MalformedDID),
        };
        Self::resolve(env, key)
    }

    /// Canonical `did:stellar:<hex>` string for a raw DID key — exact inverse
    /// of the parser backing the string entry points.
    pub fn did_to_string(env: Env, did: BytesN<32>) -> String {
        verification::did_to_string(&env, &did)
    }

    /// Returns the bound GitHub handle for a DID, if any.
    pub fn get_github_handle(env: Env, did: BytesN<32>) -> Option<String> {
        let dids: Map<BytesN<32>, DIDDocument> = env
            .storage()
            .persistent()
            .get(&DataKey::DIDs)
            .unwrap_or_else(|| Map::new(&env));
        dids.get(did).and_then(|d| d.github_handle)
    }

    /// Returns a verified social handle for a DID and provider, if any.
    pub fn get_social_handle(env: Env, did: BytesN<32>, provider: Symbol) -> Option<String> {
        let dids: Map<BytesN<32>, DIDDocument> = env
            .storage()
            .persistent()
            .get(&DataKey::DIDs)
            .unwrap_or_else(|| Map::new(&env));
        dids.get(did)
            .and_then(|doc| doc.social_identities.get(provider))
    }

    /// Returns the Ed25519 verification key for a DID, if set.
    pub fn get_verification_key(env: Env, did: BytesN<32>) -> Option<BytesN<32>> {
        let dids: Map<BytesN<32>, DIDDocument> = env
            .storage()
            .persistent()
            .get(&DataKey::DIDs)
            .unwrap_or_else(|| Map::new(&env));
        dids.get(did).and_then(|d| d.verification_key)
    }

    /// Returns all stored contributor proofs for a DID.
    pub fn get_proofs(env: Env, did: BytesN<32>) -> Vec<ContributorProof> {
        let proofs: Map<BytesN<32>, Vec<ContributorProof>> = env
            .storage()
            .persistent()
            .get(&DataKey::Proofs)
            .unwrap_or_else(|| Map::new(&env));
        proofs.get(did).unwrap_or_else(|| Vec::new(&env))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{symbol_short, testutils::Address as _, BytesN, Env};

    #[test]
    fn test_did_registry_flow() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(DIDRegistryContract, ());
        let client = DIDRegistryContractClient::new(&env, &contract_id);
        let owner = Address::generate(&env);
        let did = BytesN::from_array(&env, &[1u8; 32]);
        let mut attrs = Map::new(&env);
        attrs.set(symbol_short!("name"), Bytes::from_slice(&env, b"Alice"));

        client.register(&owner, &did, &attrs);
        let doc = client.resolve(&did).unwrap();
        assert_eq!(doc.owner, owner);

        // Bind github + verification key
        let handle = String::from_str(&env, "alice");
        client.bind_github(&owner, &did, &handle);
        let discord_handle = String::from_str(&env, "alice#1234");
        client.bind_social(&owner, &did, &Symbol::new(&env, "discord"), &discord_handle);
        let key = BytesN::from_array(&env, &[9u8; 32]);
        client.set_verification_key(&owner, &did, &key);

        let doc = client.resolve(&did).unwrap();
        assert_eq!(doc.github_handle, Some(handle));
        assert_eq!(
            client.get_social_handle(&did, &Symbol::new(&env, "discord")),
            Some(discord_handle)
        );
        assert_eq!(doc.verification_key, Some(key));

        // Add a contributor proof
        let proof = ContributorProof {
            claim_type: String::from_str(&env, "pr"),
            repo: String::from_str(&env, "StellarDevHub/Web3-Student-Lab"),
            item_id: String::from_str(&env, "123"),
            github_handle: String::from_str(&env, "alice"),
            issued_at: 1_700_000_000,
            signature: Bytes::from_slice(&env, &[0u8; 64]),
        };
        client.add_contributor_proof(&owner, &did, &proof);
        assert_eq!(client.get_proofs(&did).len(), 1);

        // Handle mismatch must be rejected
        let bad_proof = ContributorProof {
            claim_type: String::from_str(&env, "pr"),
            repo: String::from_str(&env, "x/y"),
            item_id: String::from_str(&env, "1"),
            github_handle: String::from_str(&env, "mallory"),
            issued_at: 1,
            signature: Bytes::from_slice(&env, &[0u8; 64]),
        };
        let result = client.try_add_contributor_proof(&owner, &did, &bad_proof);
        assert!(result.is_err(), "proof with wrong handle must be rejected");

        // Key rotation
        let new_owner = Address::generate(&env);
        client.rotate_key(&owner, &did, &new_owner);
        let doc = client.resolve(&did).unwrap();
        assert_eq!(doc.owner, new_owner);

        // Revoke
        client.revoke(&new_owner, &did);
        let doc = client.resolve(&did).unwrap();
        assert!(doc.revoked);
    }
}

#[cfg(test)]
mod test;
