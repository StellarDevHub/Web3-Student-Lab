//! Core storage types for the `did:stellar` DID registry.
//!
//! Spec key files for SC-010 split these out of `lib.rs` alongside
//! `verification.rs`.

use soroban_sdk::{contracttype, Address, Bytes, BytesN, Map, String, Symbol, Vec};

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
    /// Social handles keyed by provider symbol (github or discord).
    pub social_identities: Map<Symbol, String>,
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
