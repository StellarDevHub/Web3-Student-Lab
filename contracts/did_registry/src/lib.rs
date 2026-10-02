//! # SC-HARD-11 — Decentralized Identity (DID) Registry & Cryptographic Key Rotation
//!
//! On-chain registry for the `did:stellar` DID method implementing the
//! W3C DID Core 1.0 write/control model:
//!
//! - **DID document storage**: owner, verification key, service endpoints,
//!   social handles, and signed contributor proof claims.
//! - **Multi-key rotation**: owner may transfer control to a new key via
//!   `rotate_key`.
//! - **Service endpoint updates**: arbitrary `Symbol → Bytes` attributes
//!   updated via `update`.
//! - **Controller delegation**: owner may add/remove delegate controllers that
//!   can append proofs and update attributes.
//! - **Deactivation (revoke)**: once revoked, all subsequent mutations are
//!   rejected.
//! - **Cryptographic verification** of Ed25519 signatures is performed by the
//!   off-chain resolver; on-chain we store the trusted public key so the
//!   resolver can fetch it deterministically.

#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, Address, Bytes, BytesN, Env, Map, String, Symbol, Vec,
};

// ── Data types ────────────────────────────────────────────────────────────────

/// A single signed contributor proof claim (PR or issue milestone).
#[derive(Clone)]
#[contracttype]
pub struct ContributorProof {
    /// Kind of contribution: `"pr"` or `"issue"`.
    pub claim_type: String,
    /// GitHub repository, e.g. `"StellarDevHub/Web3-Student-Lab"`.
    pub repo: String,
    /// PR / issue number or node ID.
    pub item_id: String,
    /// GitHub handle of the contributor (must match the bound handle).
    pub github_handle: String,
    /// Unix timestamp (seconds) the claim was issued.
    pub issued_at: u64,
    /// Raw Ed25519 signature bytes over the canonical claim payload.
    pub signature: Bytes,
}

/// W3C-aligned DID document stored on-chain.
#[derive(Clone)]
#[contracttype]
pub struct DIDDocument {
    /// Address that controls this DID.
    pub owner: Address,
    /// Off-chain GitHub handle bound to this DID.
    pub github_handle: Option<String>,
    /// Social handles keyed by provider symbol (`"github"` or `"discord"`).
    pub social_identities: Map<Symbol, String>,
    /// Ed25519 verification key (32 bytes) used to sign contributor proofs.
    pub verification_key: Option<BytesN<32>>,
    /// Arbitrary service-endpoint / attribute bag.
    pub attributes: Map<Symbol, Bytes>,
    /// Delegate controllers (can append proofs and update attributes).
    pub controllers: Vec<Address>,
    /// Whether this DID has been deactivated.
    pub revoked: bool,
    /// Stored contributor proofs (populated during `resolve`).
    pub proofs: Vec<ContributorProof>,
}

// ── Storage keys ──────────────────────────────────────────────────────────────

#[contracttype]
pub enum DataKey {
    /// `Map<BytesN<32>, DIDDocument>` — all registered DID documents.
    DIDs,
    /// `Map<BytesN<32>, Vec<ContributorProof>>` — claims per DID.
    Proofs,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct DIDRegistryContract;

#[contractimpl]
impl DIDRegistryContract {
    // ── Registration ──────────────────────────────────────────────────────────

    /// Register a new DID.  The 32-byte `did` is the Ed25519 public key of the
    /// account, encoded as bytes (`did:stellar:<hex>`).
    ///
    /// # Panics
    /// - DID already registered.
    pub fn register(env: Env, owner: Address, did: BytesN<32>, attributes: Map<Symbol, Bytes>) {
        owner.require_auth();
        let mut dids: Map<BytesN<32>, DIDDocument> = env
            .storage()
            .persistent()
            .get(&DataKey::DIDs)
            .unwrap_or_else(|| Map::new(&env));
        assert!(!dids.contains_key(did.clone()), "DID already registered");
        let doc = DIDDocument {
            owner,
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

    // ── Identity bindings ─────────────────────────────────────────────────────

    /// Bind an off-chain GitHub handle to the DID (owner only).
    pub fn bind_github(env: Env, sender: Address, did: BytesN<32>, handle: String) {
        sender.require_auth();
        let mut dids: Map<BytesN<32>, DIDDocument> =
            env.storage().persistent().get(&DataKey::DIDs).unwrap();
        let mut doc = dids.get(did.clone()).unwrap();
        assert!(!doc.revoked, "DID revoked");
        assert!(doc.owner == sender, "Only owner can bind github handle");
        doc.github_handle = Some(handle.clone());
        doc.social_identities
            .set(Symbol::new(&env, "github"), handle);
        dids.set(did, doc);
        env.storage().persistent().set(&DataKey::DIDs, &dids);
    }

    /// Bind a social handle for a given provider (`"github"` or `"discord"`).
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
        dids.set(did, doc);
        env.storage().persistent().set(&DataKey::DIDs, &dids);
    }

    // ── Contributor proofs ────────────────────────────────────────────────────

    /// Append a signed contributor proof claim.
    ///
    /// Only the owner (or a delegate controller) may call this.  The GitHub
    /// handle in the proof must match the bound handle.
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
        proofs.set(did, list);
        env.storage().persistent().set(&DataKey::Proofs, &proofs);
    }

    // ── Document mutation ─────────────────────────────────────────────────────

    /// Update the service-endpoint / attribute bag (owner or controller).
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

    /// Transfer ownership to `new_owner` (cryptographic key rotation).
    ///
    /// Only the current owner may rotate.  Revoked DIDs cannot rotate.
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

    /// Deactivate (permanently revoke) the DID.
    ///
    /// After revocation no mutations are possible.
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

    // ── Controller management ─────────────────────────────────────────────────

    /// Add a delegate controller (owner only).
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

    /// Remove a delegate controller (owner only).
    pub fn remove_controller(env: Env, sender: Address, did: BytesN<32>, controller: Address) {
        sender.require_auth();
        let mut dids: Map<BytesN<32>, DIDDocument> =
            env.storage().persistent().get(&DataKey::DIDs).unwrap();
        let mut doc = dids.get(did.clone()).unwrap();
        assert!(doc.owner == sender, "Only owner can remove controller");
        if let Some(i) = doc.controllers.iter().position(|c| c == controller) {
            doc.controllers.remove(i as u32);
        }
        dids.set(did, doc);
        env.storage().persistent().set(&DataKey::DIDs, &dids);
    }

    // ── Queries ───────────────────────────────────────────────────────────────

    /// Resolve a DID document (proofs are populated inline).
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

    /// Returns a social handle for a given DID and provider, if any.
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
mod tests;
