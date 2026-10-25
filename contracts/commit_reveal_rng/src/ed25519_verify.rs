//! Ed25519 cryptographic signature verification wrapper.

use soroban_sdk::{Bytes, BytesN, Env};

pub struct Ed25519Verifier;

impl Ed25519Verifier {
    /// Verifies an Ed25519 signature over a message against the expected public key.
    ///
    /// # Panics
    /// Panics if the signature is invalid or does not match the public key.
    pub fn verify(env: &Env, public_key: &BytesN<32>, message: &Bytes, signature: &BytesN<64>) {
        env.crypto().ed25519_verify(public_key, message, signature);
    }
}
