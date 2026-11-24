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
    /// Accepted transaction roots by source chain.
    TxRoot(ChainId, BytesN<32>),
    /// Most recently accepted block number and hash for each source chain.
    ChainHead(ChainId),
    /// Number of active validators used to derive the quorum.
    ValidatorCount,
    /// Used transaction identifier scoped to its source chain.
    ProcessedSourceTx(ChainId, BytesN<32>),
    /// Unlock record scoped to its source chain.
    SourceUnlock(ChainId, BytesN<32>),
    /// Legacy replay storage retained for API compatibility.
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
    InvalidQuorum = 14,
    InvalidTrieProof = 15,
    InvalidTransaction = 16,
}

#[contract]
pub struct CrossChainClient;

#[contractimpl]
impl CrossChainClient {
    /// Initialize the client with an admin address.
    #[allow(clippy::too_many_arguments)]
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
        if !Self::is_validator(env.clone(), validator.clone()) {
            let count = Self::validator_count(env.clone())
                .checked_add(1)
                .unwrap_or_else(|| panic_with_error!(&env, ClientError::InvalidQuorum));
            env.storage()
                .instance()
                .set(&ClientKey::ValidatorCount, &count);
        }
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
        if Self::is_validator(env.clone(), validator.clone()) {
            let count = Self::validator_count(env.clone()).saturating_sub(1);
            env.storage()
                .instance()
                .set(&ClientKey::ValidatorCount, &count);
        }
        env.storage()
            .persistent()
            .set(&ClientKey::Validator(validator.clone()), &false);
        env.events().publish((symbol_short!("val_rm"),), validator);
    }

    /// Set the minimum number of validator signatures required for block verification.
    pub fn set_threshold(env: Env, caller: Address, threshold: u32) {
        caller.require_auth();
        Self::assert_admin(&env, &caller);
        if threshold == 0 {
            panic_with_error!(&env, ClientError::InvalidThreshold);
        }
        env.storage()
            .instance()
            .set(&ClientKey::Threshold, &threshold);
    }

    pub fn get_threshold(env: Env) -> u32 {
        let configured: u32 = env
            .storage()
            .instance()
            .get(&ClientKey::Threshold)
            .unwrap_or(1u32);
        let count = Self::validator_count(env);
        let quorum = ((count as u64 * 2) / 3 + 1) as u32;
        configured.max(quorum)
    }

    pub fn is_validator(env: Env, validator: BytesN<32>) -> bool {
        env.storage()
            .persistent()
            .get(&ClientKey::Validator(validator))
            .unwrap_or(false)
    }

    /// Validate distinct active-validator signatures over a signing digest.
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
        let mut seen: Vec<BytesN<32>> = Vec::new(&env);
        for i in 0..signers.len() {
            let signer = signers.get(i).unwrap();
            if seen.contains(&signer) {
                return false;
            }
            seen.push_back(signer.clone());
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

    /// Hash the complete header fields validators must authorize.
    pub fn block_header_signing_hash(
        env: Env,
        chain_id: ChainId,
        block_number: u64,
        block_hash: BytesN<32>,
        parent_hash: BytesN<32>,
        state_root: BytesN<32>,
        tx_root: BytesN<32>,
        timestamp: u64,
    ) -> BytesN<32> {
        Self::header_digest(
            &env,
            chain_id,
            block_number,
            &block_hash,
            &parent_hash,
            &state_root,
            &tx_root,
            timestamp,
        )
    }

    /// Accept a linked source-chain header only after quorum signatures.
    #[allow(clippy::too_many_arguments)]
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
        let signing_hash = Self::header_digest(
            &env,
            chain_id,
            block_number,
            &block_hash,
            &parent_hash,
            &state_root,
            &tx_root,
            timestamp,
        );
        if timestamp > env.ledger().timestamp()
            || !Self::verify_block_header(env.clone(), signing_hash, signers, signatures)
        {
            panic_with_error!(&env, ClientError::InvalidHeader);
        }
        if let Some((head_number, head_hash)) = env
            .storage()
            .persistent()
            .get::<ClientKey, (u64, BytesN<32>)>(&ClientKey::ChainHead(chain_id))
        {
            if block_number != head_number.saturating_add(1) || parent_hash != head_hash {
                panic_with_error!(&env, ClientError::InvalidHeader);
            }
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
            .set(&ClientKey::TxRoot(chain_id, tx_root.clone()), &true);
        env.storage().persistent().set(
            &ClientKey::ChainHead(chain_id),
            &(block_number, block_hash.clone()),
        );

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

    fn validator_count(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&ClientKey::ValidatorCount)
            .unwrap_or(0u32)
    }

    fn header_digest(
        env: &Env,
        chain_id: ChainId,
        block_number: u64,
        block_hash: &BytesN<32>,
        parent_hash: &BytesN<32>,
        state_root: &BytesN<32>,
        tx_root: &BytesN<32>,
        timestamp: u64,
    ) -> BytesN<32> {
        let mut bytes = Bytes::from_slice(env, b"cross-chain-client:header:v1:");
        bytes.append(&Bytes::from_slice(env, &chain_id.to_be_bytes()));
        bytes.append(&Bytes::from_slice(env, &block_number.to_be_bytes()));
        bytes.append(&Bytes::from_slice(env, &block_hash.to_array()));
        bytes.append(&Bytes::from_slice(env, &parent_hash.to_array()));
        bytes.append(&Bytes::from_slice(env, &state_root.to_array()));
        bytes.append(&Bytes::from_slice(env, &tx_root.to_array()));
        bytes.append(&Bytes::from_slice(env, &timestamp.to_be_bytes()));
        env.crypto().sha256(&bytes).into()
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

        if amount <= 0
            || !env
                .storage()
                .persistent()
                .get::<ClientKey, bool>(&ClientKey::TxRoot(chain_id, expected_root.clone()))
                .unwrap_or(false)
        {
            panic_with_error!(&env, ClientError::InvalidProof);
        }
        if env
            .storage()
            .persistent()
            .get::<ClientKey, bool>(&ClientKey::ProcessedSourceTx(chain_id, tx_hash.clone()))
            .unwrap_or(false)
        {
            panic_with_error!(&env, ClientError::ReplayDetected);
        }

        if !Self::verify_merkle_proof(env.clone(), leaf_hash, proof, path, expected_root.clone()) {
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
            .set(&ClientKey::SourceUnlock(chain_id, tx_hash.clone()), &record);
        env.storage().persistent().set(
            &ClientKey::ProcessedSourceTx(chain_id, tx_hash.clone()),
            &true,
        );
        env.storage()
            .persistent()
            .set(&ClientKey::ProcessedTx(tx_hash.clone()), &true);

        env.events().publish(
            (symbol_short!("unlock"), chain_id),
            (tx_hash.clone(), recipient, amount),
        );
        true
    }

    /// Verify a transaction-trie MPT proof against an accepted header and
    /// record an unlock. `trie_key` is the canonical RLP transaction index,
    /// and `transaction` is the exact serialized transaction value.
    pub fn unlock_asset_from_header(
        env: Env,
        caller: Address,
        chain_id: ChainId,
        block_number: u64,
        tx_hash: BytesN<32>,
        trie_key: Bytes,
        transaction: Bytes,
        proof_nodes: Vec<Bytes>,
        asset_id: BytesN<32>,
        recipient: Bytes,
        amount: i128,
    ) -> bool {
        caller.require_auth();
        Self::assert_admin(&env, &caller);
        if amount <= 0 {
            panic_with_error!(&env, ClientError::InvalidTransaction);
        }
        let header = env
            .storage()
            .persistent()
            .get::<ClientKey, BridgeHeader>(&ClientKey::Header(chain_id, block_number))
            .unwrap_or_else(|| panic_with_error!(&env, ClientError::InvalidHeader));
        if env.crypto().keccak256(&transaction).to_bytes() != tx_hash {
            panic_with_error!(&env, ClientError::InvalidTransaction);
        }
        if env
            .storage()
            .persistent()
            .get::<ClientKey, bool>(&ClientKey::ProcessedSourceTx(chain_id, tx_hash.clone()))
            .unwrap_or(false)
        {
            panic_with_error!(&env, ClientError::ReplayDetected);
        }
        if !verify_mpt_inclusion(&env, &header.tx_root, &trie_key, &transaction, &proof_nodes) {
            panic_with_error!(&env, ClientError::InvalidTrieProof);
        }

        let record = UnlockRecord {
            chain_id,
            tx_hash: tx_hash.clone(),
            asset_id,
            recipient: recipient.clone(),
            amount,
            block_number,
            proof_root: header.tx_root,
            unlocked_at: env.ledger().timestamp(),
        };
        env.storage()
            .persistent()
            .set(&ClientKey::Unlock(tx_hash.clone()), &record);
        env.storage()
            .persistent()
            .set(&ClientKey::SourceUnlock(chain_id, tx_hash.clone()), &record);
        env.storage().persistent().set(
            &ClientKey::ProcessedSourceTx(chain_id, tx_hash.clone()),
            &true,
        );
        env.storage()
            .persistent()
            .set(&ClientKey::ProcessedTx(tx_hash.clone()), &true);
        env.events().publish(
            (symbol_short!("unlock"), chain_id),
            (tx_hash, recipient, amount),
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

    pub fn get_source_unlock(env: Env, chain_id: ChainId, tx_hash: BytesN<32>) -> UnlockRecord {
        env.storage()
            .persistent()
            .get(&ClientKey::SourceUnlock(chain_id, tx_hash))
            .unwrap_or_else(|| panic_with_error!(&env, ClientError::MessageNotFound))
    }

    pub fn get_processed_tx(env: Env, tx_hash: BytesN<32>) -> bool {
        env.storage()
            .persistent()
            .get::<ClientKey, bool>(&ClientKey::ProcessedTx(tx_hash))
            .unwrap_or(false)
    }

    pub fn is_source_tx_processed(env: Env, chain_id: ChainId, tx_hash: BytesN<32>) -> bool {
        env.storage()
            .persistent()
            .get::<ClientKey, bool>(&ClientKey::ProcessedSourceTx(chain_id, tx_hash))
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
        env.crypto().ed25519_verify(validator, &payload, signature);
        true
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

#[derive(Clone, Copy)]
struct RlpItem {
    is_list: bool,
    start: u32,
    payload_start: u32,
    payload_len: u32,
    total_len: u32,
}

fn verify_mpt_inclusion(
    env: &Env,
    root: &BytesN<32>,
    key: &Bytes,
    expected_value: &Bytes,
    proof_nodes: &Vec<Bytes>,
) -> bool {
    if key.is_empty() || key.len() > 64 || proof_nodes.is_empty() || proof_nodes.len() > 64 {
        return false;
    }

    let mut expected_ref = Bytes::from_slice(env, &root.to_array());
    let mut key_nibble = 0u32;

    for node_index in 0..proof_nodes.len() {
        let encoded_node = proof_nodes.get(node_index).unwrap();
        if encoded_node.is_empty() || encoded_node.len() > 4_096 {
            return false;
        }
        let node_item = match parse_rlp_item(&encoded_node, 0) {
            Some(item) if item.is_list && item.total_len == encoded_node.len() => item,
            _ => return false,
        };

        if expected_ref.len() == 32 {
            let actual_hash: Bytes = env.crypto().keccak256(&encoded_node).into();
            if actual_hash != expected_ref {
                return false;
            }
        } else if encoded_node != expected_ref {
            return false;
        }

        let field_count = match rlp_list_count(&encoded_node, &node_item) {
            Some(count) => count,
            None => return false,
        };

        if field_count == 17 {
            if key_nibble == key.len() * 2 {
                let value_item = match rlp_list_item(&encoded_node, &node_item, 16) {
                    Some(item) if !item.is_list => item,
                    _ => return false,
                };
                return node_index + 1 == proof_nodes.len()
                    && rlp_item_bytes(&encoded_node, &value_item)
                        .map(|value| value == *expected_value)
                        .unwrap_or(false);
            }

            let next_nibble = key_nibble_at(key, key_nibble);
            let child = match rlp_list_item(&encoded_node, &node_item, next_nibble as u32) {
                Some(item) => item,
                None => return false,
            };
            expected_ref = match rlp_reference_bytes(&encoded_node, &child) {
                Some(reference) if !reference.is_empty() => reference,
                _ => return false,
            };
            key_nibble += 1;
        } else if field_count == 2 {
            let compact_item = match rlp_list_item(&encoded_node, &node_item, 0) {
                Some(item) if !item.is_list => item,
                _ => return false,
            };
            let (next_position, is_leaf) =
                match match_compact_path(&encoded_node, &compact_item, key, key_nibble) {
                    Some(result) => result,
                    None => return false,
                };
            let value_or_child = match rlp_list_item(&encoded_node, &node_item, 1) {
                Some(item) => item,
                None => return false,
            };
            if is_leaf {
                return node_index + 1 == proof_nodes.len()
                    && next_position == key.len() * 2
                    && !value_or_child.is_list
                    && rlp_item_bytes(&encoded_node, &value_or_child)
                        .map(|value| value == *expected_value)
                        .unwrap_or(false);
            }

            key_nibble = next_position;
            expected_ref = match rlp_reference_bytes(&encoded_node, &value_or_child) {
                Some(reference) if !reference.is_empty() => reference,
                _ => return false,
            };
        } else {
            return false;
        }
    }

    false
}

fn parse_rlp_item(bytes: &Bytes, offset: u32) -> Option<RlpItem> {
    let prefix = bytes.get(offset)?;
    let (is_list, payload_start, payload_len) = match prefix {
        0x00..=0x7f => (false, offset, 1),
        0x80..=0xb7 => {
            let len = (prefix - 0x80) as u32;
            let payload_start = offset.checked_add(1)?;
            if len == 1 && bytes.get(payload_start)? < 0x80 {
                return None;
            }
            (false, payload_start, len)
        }
        0xb8..=0xbf => {
            let len_of_len = (prefix - 0xb7) as u32;
            let (payload_start, len) = rlp_long_length(bytes, offset, len_of_len)?;
            if len < 56 {
                return None;
            }
            (false, payload_start, len)
        }
        0xc0..=0xf7 => (true, offset.checked_add(1)?, (prefix - 0xc0) as u32),
        0xf8..=0xff => {
            let len_of_len = (prefix - 0xf7) as u32;
            let (payload_start, len) = rlp_long_length(bytes, offset, len_of_len)?;
            if len < 56 {
                return None;
            }
            (true, payload_start, len)
        }
    };
    let end = payload_start.checked_add(payload_len)?;
    if end > bytes.len() {
        return None;
    }
    Some(RlpItem {
        is_list,
        start: offset,
        payload_start,
        payload_len,
        total_len: end.checked_sub(offset)?,
    })
}

fn rlp_long_length(bytes: &Bytes, offset: u32, len_of_len: u32) -> Option<(u32, u32)> {
    let payload_start = offset.checked_add(1)?.checked_add(len_of_len)?;
    let mut length = 0u32;
    for i in 0..len_of_len {
        let byte = bytes.get(offset.checked_add(1)?.checked_add(i)?)? as u32;
        if i == 0 && byte == 0 {
            return None;
        }
        length = length.checked_mul(256)?.checked_add(byte)?;
    }
    Some((payload_start, length))
}

fn rlp_list_item(bytes: &Bytes, list: &RlpItem, wanted_index: u32) -> Option<RlpItem> {
    if !list.is_list {
        return None;
    }
    let mut cursor = list.payload_start;
    let end = cursor.checked_add(list.payload_len)?;
    let mut index = 0u32;
    while cursor < end {
        let item = parse_rlp_item(bytes, cursor)?;
        if item.start.checked_add(item.total_len)? > end {
            return None;
        }
        if index == wanted_index {
            return Some(item);
        }
        cursor = cursor.checked_add(item.total_len)?;
        index += 1;
    }
    None
}

fn rlp_list_count(bytes: &Bytes, list: &RlpItem) -> Option<u32> {
    if !list.is_list {
        return None;
    }
    let mut cursor = list.payload_start;
    let end = cursor.checked_add(list.payload_len)?;
    let mut count = 0u32;
    while cursor < end {
        let item = parse_rlp_item(bytes, cursor)?;
        if item.start.checked_add(item.total_len)? > end {
            return None;
        }
        cursor = cursor.checked_add(item.total_len)?;
        count = count.checked_add(1)?;
    }
    if cursor == end {
        Some(count)
    } else {
        None
    }
}

fn rlp_item_bytes(bytes: &Bytes, item: &RlpItem) -> Option<Bytes> {
    if item.is_list {
        return None;
    }
    Some(bytes.slice(item.payload_start..item.payload_start.checked_add(item.payload_len)?))
}

fn rlp_reference_bytes(bytes: &Bytes, item: &RlpItem) -> Option<Bytes> {
    if item.is_list {
        if item.total_len >= 32 {
            return None;
        }
        return Some(bytes.slice(item.start..item.start.checked_add(item.total_len)?));
    }
    let reference = rlp_item_bytes(bytes, item)?;
    if !reference.is_empty() && reference.len() != 32 {
        return None;
    }
    Some(reference)
}

fn match_compact_path(
    node: &Bytes,
    compact: &RlpItem,
    key: &Bytes,
    key_nibble: u32,
) -> Option<(u32, bool)> {
    let compact_bytes = rlp_item_bytes(node, compact)?;
    if compact_bytes.is_empty() {
        return None;
    }
    let first = compact_bytes.get(0)?;
    let flag = first >> 4;
    if flag > 3 {
        return None;
    }
    let odd = flag & 1 == 1;
    let is_leaf = flag & 2 == 2;
    if !odd && first & 0x0f != 0 {
        return None;
    }
    let path_len = compact_bytes
        .len()
        .checked_mul(2)?
        .checked_sub(if odd { 1 } else { 2 })?;
    if !is_leaf && path_len == 0 {
        return None;
    }
    for i in 0..path_len {
        let nibble_offset = i + if odd { 1 } else { 2 };
        let packed = compact_bytes.get(nibble_offset / 2)?;
        let nibble = if nibble_offset % 2 == 0 {
            packed >> 4
        } else {
            packed & 0x0f
        };
        if key_nibble.checked_add(i)? >= key.len() * 2
            || key_nibble_at(key, key_nibble + i) != nibble
        {
            return None;
        }
    }
    Some((key_nibble.checked_add(path_len)?, is_leaf))
}

fn key_nibble_at(key: &Bytes, nibble_index: u32) -> u8 {
    let byte = key.get(nibble_index / 2).unwrap_or(0);
    if nibble_index % 2 == 0 {
        byte >> 4
    } else {
        byte & 0x0f
    }
}

#[cfg(test)]
mod test;
