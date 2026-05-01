#![no_std]
use soroban_sdk::{Env, contracttype};

/// Proof of existence with high-precision timestamping and ledger sequencing.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TimestampedProof {
    /// Unix timestamp in seconds from the ledger header.
    pub timestamp: u64,
    /// Ledger sequence number at the time of notarization.
    pub ledger_seq: u32,
}

/// Helper function to generate a current proof of existence.
pub fn get_current_proof(env: &Env) -> TimestampedProof {
    TimestampedProof {
        timestamp: env.ledger().timestamp(),
        ledger_seq: env.ledger().sequence(),
    }
}
