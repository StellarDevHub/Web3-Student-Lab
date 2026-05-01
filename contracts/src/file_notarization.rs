#![no_std]
use soroban_sdk::{contracttype, Address, BytesN, Env, String, Vec, Symbol};
use crate::timestamping::{TimestampedProof, get_current_proof};

/// Immutable record of a notarized file hash.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NotarizationRecord {
    /// SHA-256 hash of the notarized file.
    pub hash: BytesN<32>,
    /// Address that performed the notarization.
    pub owner: Address,
    /// On-chain proof including timestamp and ledger sequence.
    pub proof: TimestampedProof,
    /// Optional metadata or descriptive text for the file.
    pub metadata: String,
}

/// Storage keys for notarization data.
#[contracttype]
pub enum NotarizationKey {
    /// Individual record indexed by file hash.
    Record(BytesN<32>),
    /// List of file hashes notarized by a specific address.
    OwnerHistory(Address),
}

/// Logic for the File Notarization System.
pub struct NotarizationManager;

impl NotarizationManager {
    /// Notarizes a file hash on-chain.
    /// 
    /// # Arguments
    /// * `env` - The Soroban environment.
    /// * `owner` - The address notarizing the file (must authorize).
    /// * `hash` - The SHA-256 hash of the file.
    /// * `metadata` - Optional metadata for the notarization.
    pub fn notarize(env: &Env, owner: Address, hash: BytesN<32>, metadata: String) {
        owner.require_auth();

        // Check if already notarized to maintain immutability and uniqueness
        if env.storage().persistent().has(&NotarizationKey::Record(hash.clone())) {
            // We return early instead of panicking to save gas if the file is already protected
            return;
        }

        let record = NotarizationRecord {
            hash: hash.clone(),
            owner: owner.clone(),
            proof: get_current_proof(env),
            metadata,
        };

        // Store the record indexed by hash
        env.storage().persistent().set(&NotarizationKey::Record(hash.clone()), &record);
        
        // Update owner's notarization history
        let mut history: Vec<BytesN<32>> = env
            .storage()
            .persistent()
            .get(&NotarizationKey::OwnerHistory(owner.clone()))
            .unwrap_or_else(|| Vec::new(env));
        
        history.push_back(hash.clone());
        env.storage().persistent().set(&NotarizationKey::OwnerHistory(owner), &history);

        // Emit notarization event
        env.events().publish(
            (Symbol::new(env, "notarize"), Symbol::new(env, "v1")),
            (record.hash, record.owner, record.proof.timestamp),
        );
    }

    /// Verifies if a file hash has been notarized on-chain.
    pub fn verify(env: &Env, hash: BytesN<32>) -> Option<NotarizationRecord> {
        env.storage().persistent().get(&NotarizationKey::Record(hash))
    }

    /// Retrieves all notarization records for a specific address.
    pub fn get_history(env: &Env, owner: Address) -> Vec<NotarizationRecord> {
        let hashes: Vec<BytesN<32>> = env
            .storage()
            .persistent()
            .get(&NotarizationKey::OwnerHistory(owner))
            .unwrap_or_else(|| Vec::new(env));
        
        let mut records = Vec::new(env);
        for hash in hashes.iter() {
            if let Some(record) = Self::verify(env, hash) {
                records.push_back(record);
            }
        }
        records
    }

    /// Bulk notarization helper.
    pub fn bulk_notarize(env: &Env, owner: Address, hashes: Vec<BytesN<32>>, metadata: Vec<String>) {
        owner.require_auth();
        for i in 0..hashes.len() {
            let hash = hashes.get(i).unwrap();
            let meta = metadata.get(i).unwrap_or_else(|| String::from_str(env, ""));
            Self::notarize(env, owner.clone(), hash, meta);
        }
    }
}
