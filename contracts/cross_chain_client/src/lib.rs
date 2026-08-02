//! Cross-Chain Messaging Client – Issue #716
//!
//! Educational contract demonstrating how a Soroban contract ingests cross-chain
//! messages, verifies their ed25519 signatures, and emits structured execution
//! payload event maps. Designed for the "learning multi-network assets" module.
//!
//! ## Message lifecycle
//! ```text
//! Relayer (off-chain)
//!   │  signs: sha256(chain_id[4] || nonce[8] || sender_bytes || payload)
//!   ▼
//! ingest_message(source_chain, nonce, sender, payload, relayer_pubkey, signature)
//!   │
//!   ├─ verify relayer is registered and active
//!   ├─ replay-protection: reject duplicate (source_chain, nonce)
//!   ├─ ed25519_verify(pubkey, hash, sig)  ← SDK-level crypto, no custom code
//!   ├─ persist MessageRecord in storage
//!   └─ emit event map { msg_id, source_chain, nonce, payload_len }
//! ```
//!
//! ## Acceptance criteria
//! Valid signed payloads → state modification (record stored) + event emitted.
//! Invalid/unsigned payloads → transaction reverts before any state change.

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, Address,
    Bytes, BytesN, Env,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

pub type ChainId = u32;

/// Stored record for every successfully verified inbound message.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MessageRecord {
    pub message_id: BytesN<32>,
    pub source_chain: ChainId,
    pub nonce: u64,
    pub sender: Bytes,
    /// Raw application payload (ABI-encoded, JSON, etc.)
    pub payload: Bytes,
    pub accepted_at: u64,
}

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone)]
pub enum ClientKey {
    Admin,
    /// Active relayer public keys: pubkey → bool (active flag)
    Relayer(BytesN<32>),
    /// Stored message record by its message_id hash
    Message(BytesN<32>),
    /// Replay guard: (source_chain, nonce) → bool
    Nonce(ChainId, u64),
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum ClientError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    UnknownRelayer = 4,
    NonceReplayed = 5,
    InvalidSignature = 6,
    MessageNotFound = 7,
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct CrossChainClient;

#[contractimpl]
impl CrossChainClient {
    /// Initialize the client with an admin address.
    pub fn init(env: Env, admin: Address) {
        if env.storage().instance().has(&ClientKey::Admin) {
            panic_with_error!(&env, ClientError::AlreadyInitialized);
        }
        env.storage().instance().set(&ClientKey::Admin, &admin);
    }

    // -----------------------------------------------------------------------
    // Relayer registry
    // -----------------------------------------------------------------------

    /// Register a trusted relayer public key (admin only).
    pub fn add_relayer(env: Env, caller: Address, pubkey: BytesN<32>) {
        caller.require_auth();
        Self::assert_admin(&env, &caller);
        env.storage()
            .persistent()
            .set(&ClientKey::Relayer(pubkey.clone()), &true);
        env.events().publish((symbol_short!("rly_add"),), pubkey);
    }

    /// Deactivate a relayer (admin only).
    pub fn remove_relayer(env: Env, caller: Address, pubkey: BytesN<32>) {
        caller.require_auth();
        Self::assert_admin(&env, &caller);
        env.storage()
            .persistent()
            .set(&ClientKey::Relayer(pubkey.clone()), &false);
        env.events().publish((symbol_short!("rly_rm"),), pubkey);
    }

    // -----------------------------------------------------------------------
    // Message ingestion
    // -----------------------------------------------------------------------

    /// Ingest a cross-chain message.
    ///
    /// Validates the ed25519 signature over the canonical message hash, guards
    /// against replay, stores the record, and emits an execution payload event.
    ///
    /// ### Canonical hash layout
    /// `sha256( source_chain[4] || nonce[8] || sender || payload )`
    pub fn ingest_message(
        env: Env,
        source_chain: ChainId,
        nonce: u64,
        sender: Bytes,
        payload: Bytes,
        relayer_pubkey: BytesN<32>,
        signature: BytesN<64>,
    ) -> BytesN<32> {
        Self::assert_initialized(&env);

        // Relayer must be registered and active.
        let active: bool = env
            .storage()
            .persistent()
            .get(&ClientKey::Relayer(relayer_pubkey.clone()))
            .unwrap_or(false);
        if !active {
            panic_with_error!(&env, ClientError::UnknownRelayer);
        }

        // Replay protection.
        let nonce_key = ClientKey::Nonce(source_chain, nonce);
        if env
            .storage()
            .persistent()
            .get::<ClientKey, bool>(&nonce_key)
            .unwrap_or(false)
        {
            panic_with_error!(&env, ClientError::NonceReplayed);
        }

        // Build canonical hash input and verify signature.
        let hash_input = Self::canonical_bytes(&env, source_chain, nonce, &sender, &payload);
        let message_hash: BytesN<32> = env.crypto().sha256(&hash_input).into();

        // `ed25519_verify` panics (reverts the tx) if the signature is invalid.
        env.crypto()
            .ed25519_verify(&relayer_pubkey, &message_hash.clone().into(), &signature);

        // --- all checks passed, now mutate state ---

        env.storage().persistent().set(&nonce_key, &true);

        let message_id: BytesN<32> = env.crypto().sha256(&hash_input).into();

        let record = MessageRecord {
            message_id: message_id.clone(),
            source_chain,
            nonce,
            sender: sender.clone(),
            payload: payload.clone(),
            accepted_at: env.ledger().timestamp(),
        };
        env.storage()
            .persistent()
            .set(&ClientKey::Message(message_id.clone()), &record);

        // Emit execution payload event map so indexers can act on it.
        env.events().publish(
            (symbol_short!("xc_msg"), source_chain),
            (nonce, message_id.clone(), payload.len()),
        );

        message_id
    }

    // -----------------------------------------------------------------------
    // Queries
    // -----------------------------------------------------------------------

    /// Retrieve a stored message record by its ID.
    pub fn get_message(env: Env, message_id: BytesN<32>) -> MessageRecord {
        env.storage()
            .persistent()
            .get(&ClientKey::Message(message_id))
            .unwrap_or_else(|| panic_with_error!(&env, ClientError::MessageNotFound))
    }

    /// Check whether a (source_chain, nonce) pair has been processed.
    pub fn is_processed(env: Env, source_chain: ChainId, nonce: u64) -> bool {
        env.storage()
            .persistent()
            .get::<ClientKey, bool>(&ClientKey::Nonce(source_chain, nonce))
            .unwrap_or(false)
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    /// `source_chain[4] || nonce[8] || sender || payload` (big-endian)
    fn canonical_bytes(
        env: &Env,
        source_chain: ChainId,
        nonce: u64,
        sender: &Bytes,
        payload: &Bytes,
    ) -> Bytes {
        let mut data = Bytes::new(env);
        data.push_back((source_chain >> 24) as u8);
        data.push_back((source_chain >> 16) as u8);
        data.push_back((source_chain >> 8) as u8);
        data.push_back(source_chain as u8);
        data.push_back((nonce >> 56) as u8);
        data.push_back((nonce >> 48) as u8);
        data.push_back((nonce >> 40) as u8);
        data.push_back((nonce >> 32) as u8);
        data.push_back((nonce >> 24) as u8);
        data.push_back((nonce >> 16) as u8);
        data.push_back((nonce >> 8) as u8);
        data.push_back(nonce as u8);
        data.append(sender);
        data.append(payload);
        data
    }

    fn assert_initialized(env: &Env) {
        if !env.storage().instance().has(&ClientKey::Admin) {
            panic_with_error!(env, ClientError::NotInitialized);
        }
    }

    fn assert_admin(env: &Env, caller: &Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&ClientKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, ClientError::NotInitialized));
        if *caller != admin {
            panic_with_error!(env, ClientError::Unauthorized);
        }
    }
}
