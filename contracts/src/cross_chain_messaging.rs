//! Cross-Chain Messaging Protocol Interface – Issue #498
//!
//! Standardises how Stellar contracts send and receive messages from external
//! chains (EVM, Cosmos, etc.) via a permissioned relayer network.
//!
//! ## Architecture
//! ```text
//! Source chain                    Soroban
//! ──────────                      ───────
//! Event emitted ──► Relayer signs ──► send_message()
//!                                       │
//!                               ed25519_verify(relayer_pubkey, hash, sig)
//!                               nonce check (replay protection)
//!                               store CrossChainMessage
//!                               emit event
//! ```
//!
//! ## Security Properties
//! - **Signature verification**: every inbound message must carry an ed25519
//!   signature from a registered relayer over `sha256(canonical_bytes)`.
//! - **Replay protection**: `(source_chain_id, nonce)` pairs are persisted;
//!   resubmitting a processed nonce reverts with [`MessagingError::NonceReplayed`].
//! - **Relayer registry**: only admin-approved relayer public keys are accepted.
//! - **Reentrancy guard**: the inbound handler holds a mutex during processing.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, Address,
    Bytes, BytesN, Env, Vec,
};

use crate::security_primitives::{nonreentrant_acquire, nonreentrant_release};

// ---------------------------------------------------------------------------
// Data structures
// ---------------------------------------------------------------------------

/// Chain identifiers follow the CAIP-2 numeric chain ID convention.
/// Stellar Mainnet = 1, Ethereum Mainnet = 100 (arbitrary example), etc.
pub type ChainId = u32;

/// Generic cross-chain message payload stored on Soroban after verification.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CrossChainMessage {
    /// Globally unique identifier: sha256 of the canonical bytes.
    pub message_id: BytesN<32>,
    /// Chain the message originates from.
    pub source_chain: ChainId,
    /// This chain's identifier.
    pub dest_chain: ChainId,
    /// Monotonically increasing counter scoped to (source_chain, relayer_key).
    pub nonce: u64,
    /// Raw sender address on the source chain (e.g. EVM 20-byte address).
    pub sender: Bytes,
    /// Application-level payload (ABI-encoded, JSON, etc.).
    pub payload: Bytes,
    /// Ledger timestamp at which the message was accepted.
    pub accepted_at: u64,
}

/// Record of a registered relayer: ed25519 public key + human label.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RelayerInfo {
    /// ed25519 public key used to verify message signatures (32 bytes).
    pub pubkey: BytesN<32>,
    pub active: bool,
}

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone)]
pub enum MsgKey {
    Admin,
    /// Registered relayer: pubkey bytes → RelayerInfo.
    Relayer(BytesN<32>),
    /// Stored message by its message_id hash.
    Message(BytesN<32>),
    /// Replay protection: (source_chain, nonce) → bool.
    Nonce(ChainId, u64),
    /// This contract's own chain ID.
    ChainId,
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum MessagingError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    /// Relayer public key is not registered or has been deactivated.
    UnknownRelayer = 4,
    /// This (source_chain, nonce) pair was already processed.
    NonceReplayed = 5,
    /// ed25519 signature does not match the message hash.
    InvalidSignature = 6,
    /// Message ID not found in storage.
    MessageNotFound = 7,
    /// Payload exceeds the maximum allowed size.
    PayloadTooLarge = 8,
}

/// Maximum payload size in bytes (8 KiB).
const MAX_PAYLOAD_BYTES: u32 = 8192;

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct CrossChainMessagingContract;

#[contractimpl]
impl CrossChainMessagingContract {
    /// Initialise the contract.
    ///
    /// * `admin` – address that may register/deregister relayers.
    /// * `chain_id` – this Soroban contract's canonical chain identifier.
    pub fn initialize(env: Env, admin: Address, chain_id: ChainId) {
        if env.storage().instance().has(&MsgKey::Admin) {
            panic_with_error!(&env, MessagingError::AlreadyInitialized);
        }
        env.storage().instance().set(&MsgKey::Admin, &admin);
        env.storage().instance().set(&MsgKey::ChainId, &chain_id);
        env.events()
            .publish((symbol_short!("msg_init"),), (admin, chain_id));
    }

    // -----------------------------------------------------------------------
    // Relayer registry
    // -----------------------------------------------------------------------

    /// Register an ed25519 relayer public key. Only admin may call.
    pub fn register_relayer(env: Env, caller: Address, pubkey: BytesN<32>) {
        caller.require_auth();
        Self::assert_admin(&env, &caller);

        let info = RelayerInfo {
            pubkey: pubkey.clone(),
            active: true,
        };
        env.storage()
            .persistent()
            .set(&MsgKey::Relayer(pubkey.clone()), &info);
        env.events()
            .publish((symbol_short!("rly_reg"),), pubkey);
    }

    /// Deactivate a relayer. Messages signed by it will be rejected.
    pub fn deregister_relayer(env: Env, caller: Address, pubkey: BytesN<32>) {
        caller.require_auth();
        Self::assert_admin(&env, &caller);

        let mut info: RelayerInfo = env
            .storage()
            .persistent()
            .get(&MsgKey::Relayer(pubkey.clone()))
            .unwrap_or_else(|| panic_with_error!(&env, MessagingError::UnknownRelayer));
        info.active = false;
        env.storage()
            .persistent()
            .set(&MsgKey::Relayer(pubkey.clone()), &info);
        env.events()
            .publish((symbol_short!("rly_drg"),), pubkey);
    }

    /// Query whether a public key is an active relayer.
    pub fn is_active_relayer(env: Env, pubkey: BytesN<32>) -> bool {
        env.storage()
            .persistent()
            .get::<MsgKey, RelayerInfo>(&MsgKey::Relayer(pubkey))
            .map(|r| r.active)
            .unwrap_or(false)
    }

    // -----------------------------------------------------------------------
    // Inbound message handler
    // -----------------------------------------------------------------------

    /// Accept a cross-chain message from a registered relayer.
    ///
    /// The relayer must provide an ed25519 signature over the canonical message
    /// hash so the contract can verify authenticity without trusting the caller.
    ///
    /// # Canonical hash input (big-endian concatenation)
    /// `sha256( source_chain[4] || dest_chain[4] || nonce[8] || sender || payload )`
    ///
    /// # Replay protection
    /// `(source_chain, nonce)` is marked processed and subsequent calls with
    /// the same pair revert with [`MessagingError::NonceReplayed`].
    pub fn send_message(
        env: Env,
        source_chain: ChainId,
        nonce: u64,
        sender: Bytes,
        payload: Bytes,
        relayer_pubkey: BytesN<32>,
        signature: BytesN<64>,
    ) -> BytesN<32> {
        Self::assert_initialized(&env);

        // Payload size guard.
        if payload.len() > MAX_PAYLOAD_BYTES {
            panic_with_error!(&env, MessagingError::PayloadTooLarge);
        }

        // Relayer must be registered and active.
        let relayer_info: RelayerInfo = env
            .storage()
            .persistent()
            .get(&MsgKey::Relayer(relayer_pubkey.clone()))
            .unwrap_or_else(|| panic_with_error!(&env, MessagingError::UnknownRelayer));
        if !relayer_info.active {
            panic_with_error!(&env, MessagingError::UnknownRelayer);
        }

        // Replay protection – revert on duplicate (source_chain, nonce).
        let nonce_key = MsgKey::Nonce(source_chain, nonce);
        if env
            .storage()
            .persistent()
            .get::<MsgKey, bool>(&nonce_key)
            .unwrap_or(false)
        {
            panic_with_error!(&env, MessagingError::NonceReplayed);
        }

        let dest_chain: ChainId = env
            .storage()
            .instance()
            .get(&MsgKey::ChainId)
            .unwrap_or_else(|| panic_with_error!(&env, MessagingError::NotInitialized));

        // Build the canonical hash input.
        let hash_input =
            Self::build_hash_input(&env, source_chain, dest_chain, nonce, &sender, &payload);

        // Compute sha256 of the canonical bytes (Hash<32> → BytesN<32> via Into).
        let message_hash: BytesN<32> = env.crypto().sha256(&hash_input).into();

        // Verify ed25519 signature. Panics on invalid signature.
        env.crypto()
            .ed25519_verify(&relayer_pubkey, &message_hash.clone().into(), &signature);

        // Reentrancy guard while we mutate state.
        nonreentrant_acquire(&env, symbol_short!("msg_lock"));

        // Persist replay-protection nonce.
        env.storage().persistent().set(&nonce_key, &true);

        // Recompute id as the hash of the full serialised message for storage key.
        let message_id: BytesN<32> = env.crypto().sha256(&hash_input).into();

        let msg = CrossChainMessage {
            message_id: message_id.clone(),
            source_chain,
            dest_chain,
            nonce,
            sender: sender.clone(),
            payload: payload.clone(),
            accepted_at: env.ledger().timestamp(),
        };

        env.storage()
            .persistent()
            .set(&MsgKey::Message(message_id.clone()), &msg);

        nonreentrant_release(&env, symbol_short!("msg_lock"));

        env.events()
            .publish((symbol_short!("msg_rcvd"), source_chain), (nonce, message_id.clone()));

        message_id
    }

    // -----------------------------------------------------------------------
    // Queries
    // -----------------------------------------------------------------------

    /// Retrieve a stored message by its ID.
    pub fn get_message(env: Env, message_id: BytesN<32>) -> CrossChainMessage {
        env.storage()
            .persistent()
            .get(&MsgKey::Message(message_id))
            .unwrap_or_else(|| panic_with_error!(&env, MessagingError::MessageNotFound))
    }

    /// Check whether a (source_chain, nonce) pair has been processed.
    pub fn is_nonce_processed(env: Env, source_chain: ChainId, nonce: u64) -> bool {
        env.storage()
            .persistent()
            .get::<MsgKey, bool>(&MsgKey::Nonce(source_chain, nonce))
            .unwrap_or(false)
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    /// Canonical byte serialisation used for hashing and signature verification.
    ///
    /// Format: source_chain[4] || dest_chain[4] || nonce[8] || sender || payload
    fn build_hash_input(
        env: &Env,
        source_chain: ChainId,
        dest_chain: ChainId,
        nonce: u64,
        sender: &Bytes,
        payload: &Bytes,
    ) -> Bytes {
        let mut data = Bytes::new(env);

        // source_chain (4 bytes big-endian)
        data.push_back((source_chain >> 24) as u8);
        data.push_back((source_chain >> 16) as u8);
        data.push_back((source_chain >> 8) as u8);
        data.push_back(source_chain as u8);

        // dest_chain (4 bytes big-endian)
        data.push_back((dest_chain >> 24) as u8);
        data.push_back((dest_chain >> 16) as u8);
        data.push_back((dest_chain >> 8) as u8);
        data.push_back(dest_chain as u8);

        // nonce (8 bytes big-endian)
        data.push_back((nonce >> 56) as u8);
        data.push_back((nonce >> 48) as u8);
        data.push_back((nonce >> 40) as u8);
        data.push_back((nonce >> 32) as u8);
        data.push_back((nonce >> 24) as u8);
        data.push_back((nonce >> 16) as u8);
        data.push_back((nonce >> 8) as u8);
        data.push_back(nonce as u8);

        // sender bytes
        data.append(sender);
        // payload bytes
        data.append(payload);

        data
    }

    fn assert_initialized(env: &Env) {
        if !env.storage().instance().has(&MsgKey::Admin) {
            panic_with_error!(env, MessagingError::NotInitialized);
        }
    }

    fn assert_admin(env: &Env, caller: &Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&MsgKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, MessagingError::NotInitialized));
        if *caller != admin {
            panic_with_error!(env, MessagingError::Unauthorized);
        }
    }
}
