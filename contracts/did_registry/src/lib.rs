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
//
// Cryptographic *verification* of Ed25519 signatures over contributor proofs
// is performed by the off-chain resolver (see backend `didResolver`), which
// reads this on-chain state. On-chain we only store the binding so the
// resolver can fetch the trusted public key.

#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, Address, Bytes, BytesN, Env, Map, String, Symbol, Vec,
};

/// A single signed contributor proof claim (PR or issue milestone).
#[derive(Clone)]
#[contracttype]
pub struct ContributorProof {
    /// Kind of contribution: "pr" or "issue".
    pub claim_type: String,
    /// GitHub repository, e.g. "StellarDevHub/Web3-Student-Lab".
    pub repo: String,
    /// Identifier of the PR/issue (number or node id).
    pub item_id: String,
    /// GitHub handle of the contributor (must match the bound handle).
    pub github_handle: String,
    /// Unix timestamp (seconds) the claim was issued.
    pub issued_at: u64,
    /// Raw Ed25519 signature bytes over the canonical claim payload.
    pub signature: Bytes,
}

#[derive(Clone)]
#[contracttype]
pub struct DIDDocument {
    pub owner: Address,
    /// Off-chain GitHub handle bound to this DID.
    pub github_handle: Option<String>,
    /// Ed25519 verification key (32 bytes) used to sign contributor proofs.
    pub verification_key: Option<BytesN<32>>,
    pub attributes: Map<Symbol, Bytes>,
    pub controllers: Vec<Address>,
    pub revoked: bool,
    /// Stored contributor proofs (mirror of on-chain claims).
    pub proofs: Vec<ContributorProof>,
}

#[contracttype]
pub enum DataKey {
    DIDs,
    /// Map<BytesN<32>, Vec<ContributorProof>> — claims per DID.
    Proofs,
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
        dids.set(did.clone(), doc);
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
            doc.owner == sender || doc.controllers.contains(&sender),
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
            doc.owner == sender || doc.controllers.contains(&sender),
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

    /// Returns the bound GitHub handle for a DID, if any.
    pub fn get_github_handle(env: Env, did: BytesN<32>) -> Option<String> {
        let dids: Map<BytesN<32>, DIDDocument> = env
            .storage()
            .persistent()
            .get(&DataKey::DIDs)
            .unwrap_or_else(|| Map::new(&env));
        dids.get(did).and_then(|d| d.github_handle)
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
mod test {
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
        let key = BytesN::from_array(&env, &[9u8; 32]);
        client.set_verification_key(&owner, &did, &key);

        let doc = client.resolve(&did).unwrap();
        assert_eq!(doc.github_handle, Some(handle));
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
