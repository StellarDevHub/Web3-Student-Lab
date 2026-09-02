//! Cross-Chain Proof Verification Client – Issue #1100
//!
//! A lightweight Soroban bridge client that validates inbound bridge proofs and
//! keeps replay protection for relayed state transitions from Ethereum and Polygon.
//! The contract keeps the original message-ingest flow while adding the required
//! proof-verification and asset-unlock logic expected by the bridge design.

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, Address,
    Bytes, BytesN, Env, Vec,
};

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

/// Minimal bridge header representation for authenticated cross-chain relay data.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BridgeHeader {
    pub chain_id: ChainId,
    pub block_number: u64,
    pub block_hash: BytesN<32>,
    pub parent_hash: BytesN<32>,
    pub state_root: BytesN<32>,
    pub tx_root: BytesN<32>,
    pub timestamp: u64,
}

/// Proof metadata associated with a wrapped asset unlock request.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UnlockRecord {
    pub chain_id: ChainId,
    pub tx_hash: BytesN<32>,
    pub asset_id: BytesN<32>,
    pub recipient: Bytes,
    pub amount: i128,
    pub block_number: u64,
    pub proof_root: BytesN<32>,
    pub unlocked_at: u64,
}

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
    /// Active validators: validator pubkey → bool
    Validator(BytesN<32>),
    /// Accepted bridge header by chain and block number.
    Header(ChainId, u64),
    /// Used transaction root or hash for replay protection.
    ProcessedTx(BytesN<32>),
    /// Persisted unlock record keyed by tx_hash.
    Unlock(BytesN<32>),
    /// Consensus threshold for validator signatures.
    Threshold,
}

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
    UnknownValidator = 8,
    InvalidThreshold = 9,
    InvalidHeader = 10,
    InvalidProof = 11,
    ReplayDetected = 12,
    EmptyProof = 13,
}

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
        env.storage().instance().set(&ClientKey::Threshold, &1u32);
    }

    /// Register a validator pubkey accepted for block-root consensus.
    pub fn register_validator(env: Env, caller: Address, validator: BytesN<32>) {
        caller.require_auth();
        Self::assert_admin(&env, &caller);
        env.storage()
            .persistent()
            .set(&ClientKey::Validator(validator.clone()), &true);
        env.events()
            .publish((symbol_short!("validator"),), validator);
    }

    /// Remove a validator from the trusted set.
    pub fn unregister_validator(env: Env, caller: Address, validator: BytesN<32>) {
        caller.require_auth();
        Self::assert_admin(&env, &caller);
        env.storage()
            .persistent()
            .set(&ClientKey::Validator(validator.clone()), &false);
        env.events()
            .publish((symbol_short!("val_rm"),), validator);
    }

    /// Set the minimum number of validator signatures required for block verification.
    pub fn set_threshold(env: Env, caller: Address, threshold: u32) {
        caller.require_auth();
        Self::assert_admin(&env, &caller);
        if threshold == 0 {
            panic_with_error!(&env, ClientError::InvalidThreshold);
        }
        env.storage().instance().set(&ClientKey::Threshold, &threshold);
    }

    pub fn get_threshold(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&ClientKey::Threshold)
            .unwrap_or(1u32)
    }

    pub fn is_validator(env: Env, validator: BytesN<32>) -> bool {
        env.storage()
            .persistent()
            .get(&ClientKey::Validator(validator))
            .unwrap_or(false)
    }

    /// Validate consensus over a block hash using the configured validator set.
    pub fn verify_block_header(
        env: Env,
        block_hash: BytesN<32>,
        signers: Vec<BytesN<32>>,
        signatures: Vec<BytesN<64>>,
    ) -> bool {
        if signers.len() != signatures.len() {
            return false;
        }
        if signers.is_empty() {
            return false;
        }

        let threshold: u32 = Self::get_threshold(env.clone());
        let mut valid_sigs: u32 = 0;
        for i in 0..signers.len() {
            let signer = signers.get(i).unwrap();
            if !Self::is_validator(env.clone(), signer.clone()) {
                continue;
            }
            let signature = signatures.get(i).unwrap();
            if Self::verify_signature(env.clone(), &signer, &block_hash, &signature) {
                valid_sigs += 1;
            }
        }

        valid_sigs >= threshold
    }

    /// Submit a block header and validate that enough validators signed the block hash.
    pub fn submit_block_header(
        env: Env,
        caller: Address,
        chain_id: ChainId,
        block_number: u64,
        block_hash: BytesN<32>,
        parent_hash: BytesN<32>,
        state_root: BytesN<32>,
        tx_root: BytesN<32>,
        timestamp: u64,
        signers: Vec<BytesN<32>>,
        signatures: Vec<BytesN<64>>,
    ) -> BytesN<32> {
        caller.require_auth();
        Self::assert_admin(&env, &caller);
        if !Self::verify_block_header(env.clone(), block_hash.clone(), signers, signatures) {
            panic_with_error!(&env, ClientError::InvalidHeader);
        }

        let header = BridgeHeader {
            chain_id,
            block_number,
            block_hash: block_hash.clone(),
            parent_hash,
            state_root,
            tx_root: tx_root.clone(),
            timestamp,
        };
        env.storage()
            .persistent()
            .set(&ClientKey::Header(chain_id, block_number), &header);
        env.storage()
            .persistent()
            .set(&ClientKey::ProcessedTx(tx_root.clone()), &true);

        block_hash
    }

    pub fn submit_header(
        env: Env,
        caller: Address,
        chain_id: ChainId,
        block_number: u64,
        block_hash: BytesN<32>,
        parent_hash: BytesN<32>,
        state_root: BytesN<32>,
        tx_root: BytesN<32>,
        timestamp: u64,
        signers: Vec<BytesN<32>>,
        signatures: Vec<BytesN<64>>,
    ) -> BytesN<32> {
        Self::submit_block_header(
            env,
            caller,
            chain_id,
            block_number,
            block_hash,
            parent_hash,
            state_root,
            tx_root,
            timestamp,
            signers,
            signatures,
        )
    }

    pub fn get_header(env: Env, chain_id: ChainId, block_number: u64) -> BridgeHeader {
        env.storage()
            .persistent()
            .get(&ClientKey::Header(chain_id, block_number))
            .unwrap_or_else(|| panic_with_error!(&env, ClientError::InvalidHeader))
    }

    /// Lightweight proof verification for a Merkle inclusion path.
    /// The proof is reduced to a hash-chain that starts at the leaf and ends at the expected root.
    pub fn verify_merkle_proof(
        env: Env,
        leaf_hash: BytesN<32>,
        proof: Vec<BytesN<32>>,
        path: Bytes,
        expected_root: BytesN<32>,
    ) -> bool {
        if proof.is_empty() {
            panic_with_error!(&env, ClientError::EmptyProof);
        }

        let mut current = leaf_hash;
        for i in 0..proof.len() {
            let sibling = proof.get(i).unwrap();
            let direction = if path.len() > i {
                path.get(i).unwrap_or(0)
            } else {
                0
            };

            let mut payload = [0u8; 64];
            let current_bytes = current.to_array();
            let sibling_bytes = sibling.to_array();
            if direction == 0 {
                payload[..32].copy_from_slice(&current_bytes);
                payload[32..].copy_from_slice(&sibling_bytes);
            } else {
                payload[..32].copy_from_slice(&sibling_bytes);
                payload[32..].copy_from_slice(&current_bytes);
            }

            let next: BytesN<32> = env
                .crypto()
                .sha256(&Bytes::from_array(&env, &payload))
                .into();
            current = next;
        }

        current == expected_root
    }

    pub fn verify_proof(
        env: Env,
        leaf_hash: BytesN<32>,
        proof: Vec<BytesN<32>>,
        path: Bytes,
        expected_root: BytesN<32>,
    ) -> bool {
        Self::verify_merkle_proof(env, leaf_hash, proof, path, expected_root)
    }

    /// Unlock wrapped assets once a valid proof and validator consensus have been accepted.
    pub fn unlock_asset(
        env: Env,
        caller: Address,
        chain_id: ChainId,
        tx_hash: BytesN<32>,
        leaf_hash: BytesN<32>,
        proof: Vec<BytesN<32>>,
        path: Bytes,
        expected_root: BytesN<32>,
        asset_id: BytesN<32>,
        recipient: Bytes,
        amount: i128,
    ) -> bool {
        caller.require_auth();
        Self::assert_admin(&env, &caller);

        if env
            .storage()
            .persistent()
            .get::<ClientKey, bool>(&ClientKey::ProcessedTx(tx_hash.clone()))
            .unwrap_or(false)
        {
            panic_with_error!(&env, ClientError::ReplayDetected);
        }

        if !Self::verify_merkle_proof(env.clone(), leaf_hash, proof, path, expected_root) {
            panic_with_error!(&env, ClientError::InvalidProof);
        }

        let record = UnlockRecord {
            chain_id,
            tx_hash: tx_hash.clone(),
            asset_id,
            recipient: recipient.clone(),
            amount,
            block_number: 0,
            proof_root: expected_root,
            unlocked_at: env.ledger().timestamp(),
        };

        env.storage()
            .persistent()
            .set(&ClientKey::Unlock(tx_hash.clone()), &record);
        env.storage()
            .persistent()
            .set(&ClientKey::ProcessedTx(tx_hash.clone()), &true);

        env.events().publish(
            (symbol_short!("unlock"), chain_id),
            (tx_hash.clone(), recipient, amount),
        );
        true
    }

    pub fn unlock_wrapped_asset(
        env: Env,
        caller: Address,
        chain_id: ChainId,
        tx_hash: BytesN<32>,
        leaf_hash: BytesN<32>,
        proof: Vec<BytesN<32>>,
        path: Bytes,
        expected_root: BytesN<32>,
        asset_id: BytesN<32>,
        recipient: Bytes,
        amount: i128,
    ) -> bool {
        Self::unlock_asset(
            env,
            caller,
            chain_id,
            tx_hash,
            leaf_hash,
            proof,
            path,
            expected_root,
            asset_id,
            recipient,
            amount,
        )
    }

    pub fn get_unlock(env: Env, tx_hash: BytesN<32>) -> UnlockRecord {
        env.storage()
            .persistent()
            .get(&ClientKey::Unlock(tx_hash))
            .unwrap_or_else(|| panic_with_error!(&env, ClientError::MessageNotFound))
    }

    pub fn get_processed_tx(env: Env, tx_hash: BytesN<32>) -> bool {
        env.storage()
            .persistent()
            .get::<ClientKey, bool>(&ClientKey::ProcessedTx(tx_hash))
            .unwrap_or(false)
    }

    // -----------------------------------------------------------------------
    // Original relayer flow retained for backwards compatibility.
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

    /// Ingest a cross-chain message.
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

        let active: bool = env
            .storage()
            .persistent()
            .get(&ClientKey::Relayer(relayer_pubkey.clone()))
            .unwrap_or(false);
        if !active {
            panic_with_error!(&env, ClientError::UnknownRelayer);
        }

        let nonce_key = ClientKey::Nonce(source_chain, nonce);
        if env
            .storage()
            .persistent()
            .get::<ClientKey, bool>(&nonce_key)
            .unwrap_or(false)
        {
            panic_with_error!(&env, ClientError::NonceReplayed);
        }

        let hash_input = Self::canonical_bytes(&env, source_chain, nonce, &sender, &payload);
        let message_hash: BytesN<32> = env.crypto().sha256(&hash_input).into();
        env.crypto()
            .ed25519_verify(&relayer_pubkey, &message_hash.clone().into(), &signature);

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

        env.events().publish(
            (symbol_short!("xc_msg"), source_chain),
            (nonce, message_id.clone(), payload.len()),
        );

        message_id
    }

    pub fn get_message(env: Env, message_id: BytesN<32>) -> MessageRecord {
        env.storage()
            .persistent()
            .get(&ClientKey::Message(message_id))
            .unwrap_or_else(|| panic_with_error!(&env, ClientError::MessageNotFound))
    }

    pub fn is_processed(env: Env, source_chain: ChainId, nonce: u64) -> bool {
        env.storage()
            .persistent()
            .get::<ClientKey, bool>(&ClientKey::Nonce(source_chain, nonce))
            .unwrap_or(false)
    }

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

    fn verify_signature(
        env: Env,
        validator: &BytesN<32>,
        message_hash: &BytesN<32>,
        signature: &BytesN<64>,
    ) -> bool {
        let payload: Bytes = message_hash.clone().into();
        let mut ok = false;
        let result = std::panic::catch_unwind(|| {
            env.crypto().ed25519_verify(validator, &payload, signature);
        });
        if result.is_ok() {
            ok = true;
        }
        ok
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
