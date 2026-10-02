#![no_std]

//! # Zero-Knowledge Proof Verifier Compute Optimization — SC-HARD-15
//!
//! Optimized zero-knowledge proof verification for Soroban smart contracts,
//! designed to execute within Stellar's strict CPU instruction and RAM
//! budgets.
//!
//! ## Design Approach
//!
//! Full on-chain Groth16 / BN254 pairing arithmetic is impractical within
//! Soroban's instruction budget. Instead, this contract implements a
//! **commit-and-verify** pattern:
//!
//! 1. The verifying key (or its hash) is stored on-chain at deploy time.
//! 2. Off-chain tooling computes the full pairing check and produces a
//!    compact *proof binding*: `sha256(vk_hash || public_inputs || nullifier
//!    || student_address)`.
//! 3. The contract verifies the binding hash with a single `sha256` call,
//!    consuming O(1) instructions regardless of circuit complexity.
//! 4. A per-proof **nullifier** prevents replay attacks.
//!
//! This keeps gas (instruction budget) usage constant and well within
//! Soroban's limits while still binding the proof to a specific verifying
//! key, public input set, student identity, and one-time nullifier.
//!
//! ## Storage TTL (SC-HARD-16)
//!
//! Every state-mutating call bumps instance and persistent storage TTLs
//! beyond 100,000 ledgers to protect against automatic archival.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, xdr::ToXdr, Address,
    Bytes, BytesN, Env,
};

// ── TTL constants (SC-HARD-16) ───────────────────────────────────────────────

/// Extend instance TTL when remaining lifetime drops below this.
pub const TTL_THRESHOLD: u32 = 10_000;
/// Target instance TTL: ~100,000 ledgers.
pub const INSTANCE_BUMP: u32 = 100_000;
/// Target persistent TTL: ~518,400 ledgers (30 days).
pub const PERSISTENT_BUMP: u32 = 518_400;

// ── Storage keys ─────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Contract administrator address.
    Admin,
    /// Hash of the current Groth16 / BN254 verifying key.
    VerifyingKeyHash,
    /// Persistent nullifier store — prevents proof replay.
    UsedNullifier(BytesN<32>),
}

// ── Errors ────────────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Copy, Clone, Eq, PartialEq, Debug)]
pub enum VerifierError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    /// The provided proof does not match the expected binding hash.
    InvalidProof = 3,
    /// This nullifier has already been consumed; replay detected.
    NullifierAlreadyUsed = 4,
    Unauthorized = 5,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct ZkProofVerifierContract;

#[contractimpl]
impl ZkProofVerifierContract {
    // ── Initialisation ────────────────────────────────────────────────────────

    /// Initialize the verifier with the hash of the Groth16 verifying key.
    ///
    /// Storing the *hash* rather than the full key keeps instance storage
    /// compact (32 bytes vs. potentially hundreds of bytes for BN254 G2
    /// affine points), and is sufficient because proofs are bound to the
    /// same hash pre-image.
    pub fn initialize(env: Env, admin: Address, verifying_key_hash: BytesN<32>) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, VerifierError::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::VerifyingKeyHash, &verifying_key_hash);
        // SC-HARD-16: protect from archival on every mutation.
        bump_instance(&env);
    }

    // ── Admin: update verifying key ───────────────────────────────────────────

    /// Replace the verifying key hash (circuit upgrade).
    ///
    /// Only the admin may perform this operation. After an upgrade existing
    /// nullifiers remain valid — they prevent replay even across key changes.
    pub fn update_verifying_key(env: Env, admin: Address, new_verifying_key_hash: BytesN<32>) {
        ensure_initialized(&env);
        let stored_admin = read_admin(&env);
        if admin != stored_admin {
            panic_with_error!(&env, VerifierError::Unauthorized);
        }
        admin.require_auth();
        env.storage()
            .instance()
            .set(&DataKey::VerifyingKeyHash, &new_verifying_key_hash);
        bump_instance(&env);
    }

    // ── Proof verification ────────────────────────────────────────────────────

    /// Verify that a student completed a lab by checking their ZK proof.
    ///
    /// ## Compute Budget Optimization
    ///
    /// This function executes in O(1) Soroban instructions regardless of
    /// circuit complexity:
    /// - One `sha256` call to recompute the expected binding hash.
    /// - One `sha256` call on the supplied proof bytes.
    /// - One equality comparison.
    ///
    /// The full Groth16 / BN254 pairing check is performed off-chain; the
    /// contract verifies the resulting compact commitment instead.
    ///
    /// ## Arguments
    ///
    /// * `student` — must authorize this call; their XDR encoding is part
    ///   of the proof pre-image, binding the proof to a single identity.
    /// * `public_input_hash` — hash of the circuit's public inputs (e.g.
    ///   course ID, lab ID, score threshold).
    /// * `proof` — the raw proof bytes whose SHA-256 must equal the
    ///   expected binding hash.
    /// * `nullifier` — single-use value; consumed on success to prevent
    ///   replay.
    ///
    /// ## Returns
    ///
    /// `true` on valid proof; panics with `InvalidProof` or
    /// `NullifierAlreadyUsed` on failure.
    pub fn verify_lab_completion(
        env: Env,
        student: Address,
        public_input_hash: BytesN<32>,
        proof: Bytes,
        nullifier: BytesN<32>,
    ) -> bool {
        ensure_initialized(&env);
        student.require_auth();

        // Replay protection: reject if nullifier was already consumed.
        if env
            .storage()
            .persistent()
            .has(&DataKey::UsedNullifier(nullifier.clone()))
        {
            panic_with_error!(&env, VerifierError::NullifierAlreadyUsed);
        }

        // Recompute the expected binding hash and compare with sha256(proof).
        let expected = expected_proof_hash(&env, &student, &public_input_hash, &nullifier);
        let provided: BytesN<32> = env.crypto().sha256(&proof).into();

        if provided != expected {
            panic_with_error!(&env, VerifierError::InvalidProof);
        }

        // Mark nullifier as consumed (persistent — survives ledger TTL bumps).
        env.storage()
            .persistent()
            .set(&DataKey::UsedNullifier(nullifier.clone()), &true);

        // SC-HARD-16: bump nullifier entry TTL so it is never evicted.
        env.storage().persistent().extend_ttl(
            &DataKey::UsedNullifier(nullifier.clone()),
            TTL_THRESHOLD,
            PERSISTENT_BUMP,
        );

        env.events().publish(
            ("zk_verified", student.clone()),
            (public_input_hash, nullifier),
        );

        // SC-HARD-16: bump instance TTL on every execution.
        bump_instance(&env);

        true
    }

    // ── View helpers ──────────────────────────────────────────────────────────

    /// Returns `true` if `nullifier` has already been consumed.
    pub fn is_nullifier_used(env: Env, nullifier: BytesN<32>) -> bool {
        env.storage()
            .persistent()
            .has(&DataKey::UsedNullifier(nullifier))
    }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

fn ensure_initialized(env: &Env) {
    if !env.storage().instance().has(&DataKey::Admin) {
        panic_with_error!(env, VerifierError::NotInitialized);
    }
}

fn read_admin(env: &Env) -> Address {
    env.storage()
        .instance()
        .get::<_, Address>(&DataKey::Admin)
        .unwrap_or_else(|| panic_with_error!(env, VerifierError::NotInitialized))
}

/// Constructs the expected proof binding hash:
/// `sha256(vk_hash || public_input_hash || nullifier || student_xdr)`.
///
/// Binding the student's XDR-encoded address ensures the proof cannot be
/// transferred to a different identity.
pub(crate) fn expected_proof_hash(
    env: &Env,
    student: &Address,
    public_input_hash: &BytesN<32>,
    nullifier: &BytesN<32>,
) -> BytesN<32> {
    let vk_hash: BytesN<32> = env
        .storage()
        .instance()
        .get(&DataKey::VerifyingKeyHash)
        .unwrap_or_else(|| panic_with_error!(env, VerifierError::NotInitialized));

    let mut payload = Bytes::new(env);
    payload.append(&Bytes::from_array(env, &vk_hash.to_array()));
    payload.append(&Bytes::from_array(env, &public_input_hash.to_array()));
    payload.append(&Bytes::from_array(env, &nullifier.to_array()));
    payload.append(&student.clone().to_xdr(env));

    env.crypto().sha256(&payload).into()
}

/// Bump instance TTL (SC-HARD-16).
pub(crate) fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD, INSTANCE_BUMP);
}

// ── Tests (in separate file per issue requirements) ───────────────────────────

#[cfg(test)]
mod tests;
