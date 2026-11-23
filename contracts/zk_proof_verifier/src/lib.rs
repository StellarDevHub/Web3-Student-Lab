#![no_std]

//! On-chain Groth16 verification for private exercise completion proofs.
//!
//! Proof submission is identity-free: the course hash and nullifier are
//! public circuit inputs, while the completion witness remains private.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, Bytes,
    BytesN, Env, Vec,
};

mod pairing;
mod verifier;

/// Instance storage is extended when its remaining lifetime gets low.
pub const TTL_THRESHOLD: u32 = 10_000;
/// Target instance lifetime after a mutation.
pub const INSTANCE_BUMP: u32 = 100_000;
/// Keep nullifiers for the longest practical Soroban persistent-entry TTL.
pub const PERSISTENT_BUMP: u32 = 6_000_000;
/// Maximum number of additional public circuit inputs besides course and nullifier.
pub const MAX_PUBLIC_INPUTS: u32 = 32;

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    VerifyingKey,
    UsedNullifier(BytesN<32>),
}

/// Groth16 verification key over BN254.
///
/// Points use the uncompressed encoding documented by Soroban's BN254 API:
/// G1 = X || Y (64 bytes), G2 = X || Y (128 bytes), big-endian field limbs.
#[contracttype]
#[derive(Clone)]
pub struct VerifyingKey {
    pub alpha_g1: Bytes,
    pub beta_g2: Bytes,
    pub gamma_g2: Bytes,
    pub delta_g2: Bytes,
    /// IC points in public-input order, preceded by the constant term.
    pub gamma_abc_g1: Vec<Bytes>,
}

/// A Groth16 proof over BN254.
#[contracttype]
#[derive(Clone)]
pub struct Groth16Proof {
    pub a_g1: Bytes,
    pub b_g2: Bytes,
    pub c_g1: Bytes,
}

#[contracterror]
#[derive(Copy, Clone, Eq, PartialEq, Debug)]
pub enum VerifierError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidProof = 3,
    NullifierAlreadyUsed = 4,
    Unauthorized = 5,
    InvalidPublicInput = 6,
    InvalidVerifyingKey = 7,
}

#[contract]
pub struct ZkProofVerifierContract;

#[contractimpl]
impl ZkProofVerifierContract {
    /// Initialize the verifier with a BN254 Groth16 verifying key.
    pub fn initialize(env: Env, admin: soroban_sdk::Address, verifying_key: VerifyingKey) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, VerifierError::AlreadyInitialized);
        }
        admin.require_auth();
        pairing::validate_verifying_key(&env, &verifying_key);
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::VerifyingKey, &verifying_key);
        bump_instance(&env);
    }

    /// Replace the Groth16 key. Previously consumed nullifiers remain reserved.
    pub fn update_verifying_key(
        env: Env,
        admin: soroban_sdk::Address,
        new_verifying_key: VerifyingKey,
    ) {
        ensure_initialized(&env);
        if admin != read_admin(&env) {
            panic_with_error!(&env, VerifierError::Unauthorized);
        }
        admin.require_auth();
        pairing::validate_verifying_key(&env, &new_verifying_key);
        env.storage()
            .instance()
            .set(&DataKey::VerifyingKey, &new_verifying_key);
        bump_instance(&env);
    }

    /// Verify course completion without requiring or recording a prover address.
    ///
    /// The circuit public inputs are ordered as:
    /// `[course_hash, nullifier, public_inputs...]`.
    /// Both the course hash and nullifier must be canonical BN254 scalar
    /// encodings. The circuit must constrain the nullifier to its private
    /// witness (normally a secret-derived, course-scoped value).
    pub fn verify_completion(
        env: Env,
        course_hash: BytesN<32>,
        nullifier: BytesN<32>,
        public_inputs: Vec<BytesN<32>>,
        proof: Groth16Proof,
    ) -> bool {
        ensure_initialized(&env);
        if public_inputs.len() > MAX_PUBLIC_INPUTS {
            panic_with_error!(&env, VerifierError::InvalidPublicInput);
        }

        let nullifier_key = DataKey::UsedNullifier(nullifier.clone());
        if env.storage().persistent().has(&nullifier_key) {
            panic_with_error!(&env, VerifierError::NullifierAlreadyUsed);
        }

        let verifying_key: VerifyingKey = env
            .storage()
            .instance()
            .get(&DataKey::VerifyingKey)
            .unwrap_or_else(|| panic_with_error!(&env, VerifierError::NotInitialized));

        if !verifier::verify(
            &env,
            &verifying_key,
            &proof,
            &course_hash,
            &nullifier,
            &public_inputs,
        ) {
            panic_with_error!(&env, VerifierError::InvalidProof);
        }

        env.storage().persistent().set(&nullifier_key, &true);
        env.storage()
            .persistent()
            .extend_ttl(&nullifier_key, TTL_THRESHOLD, PERSISTENT_BUMP);
        env.events()
            .publish((symbol_short!("zk_verify"),), (course_hash, nullifier));
        bump_instance(&env);
        true
    }

    /// Returns whether a nullifier has already been consumed.
    pub fn is_nullifier_used(env: Env, nullifier: BytesN<32>) -> bool {
        env.storage()
            .persistent()
            .has(&DataKey::UsedNullifier(nullifier))
    }
}

fn ensure_initialized(env: &Env) {
    if !env.storage().instance().has(&DataKey::Admin) {
        panic_with_error!(env, VerifierError::NotInitialized);
    }
}

fn read_admin(env: &Env) -> soroban_sdk::Address {
    env.storage()
        .instance()
        .get(&DataKey::Admin)
        .unwrap_or_else(|| panic_with_error!(env, VerifierError::NotInitialized))
}

fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD, INSTANCE_BUMP);
}

#[cfg(test)]
mod test;
