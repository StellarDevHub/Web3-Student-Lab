//! # Entropy Management
//!
//! Submodule handling entropy accumulation and bias-resistant random generation.
//!
//! Because block timestamps and hashes can be manipulated or front-run by validators,
//! entropy in this commit-reveal beacon is derived purely from participant secrets.
//! During the reveal phase, each revealed secret (or salt) is validated and XORed
//! into the running entropy accumulator. Upon finalisation, the accumulator is hashed
//! using SHA-256 to produce an unpredictable, uniform random result.

use soroban_sdk::{Bytes, BytesN, Env};

/// Compute the SHA-256 hash of a secret/salt.
pub fn hash_secret(env: &Env, secret: &Bytes) -> BytesN<32> {
    env.crypto().sha256(secret).into()
}

/// Element-wise XOR of two 32-byte arrays to accumulate entropy.
pub fn xor_bytes32(env: &Env, a: &BytesN<32>, b: &BytesN<32>) -> BytesN<32> {
    let a_arr = a.to_array();
    let b_arr = b.to_array();
    let mut result = [0u8; 32];
    for i in 0..32 {
        result[i] = a_arr[i] ^ b_arr[i];
    }
    BytesN::from_array(env, &result)
}

/// Accumulate a newly revealed secret hash into the existing entropy accumulator.
pub fn accumulate_entropy(
    env: &Env,
    current_entropy: &BytesN<32>,
    secret_hash: &BytesN<32>,
) -> BytesN<32> {
    xor_bytes32(env, current_entropy, secret_hash)
}

/// Finalize entropy by hashing accumulated entropy with SHA-256 for uniform distribution.
pub fn finalize_entropy(env: &Env, entropy_accumulator: &BytesN<32>) -> BytesN<32> {
    let raw: Bytes = entropy_accumulator.clone().into();
    env.crypto().sha256(&raw).into()
}
