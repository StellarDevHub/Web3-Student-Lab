//! Merkle Airdrop Distributor with cryptographic leaf proofs and 90-day clawback.

use soroban_sdk::{
    contracterror, contracttype, panic_with_error, xdr::ToXdr, Address, Bytes, BytesN, Env, Vec,
};

use crate::bitmap::BitMap;

/// 90 days in seconds = 90 * 24 * 60 * 60 = 7,776,000 seconds.
pub const AIRDROP_CLAWBACK_WINDOW_SECONDS: u64 = 7_776_000;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum DistributorError {
    AlreadyInitialized = 401,
    NotInitialized = 402,
    AlreadyClaimed = 403,
    InvalidProof = 404,
    ClawbackWindowActive = 405,
    Unauthorized = 406,
    ZeroAmount = 407,
    InsufficientRemaining = 408,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MerkleDistributorConfig {
    pub admin: Address,
    pub token: Option<Address>,
    pub merkle_root: BytesN<32>,
    pub total_amount: i128,
    pub claimed_amount: i128,
    pub start_time: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DistributorKey {
    Config,
}

pub struct MerkleDistributor;

impl MerkleDistributor {
    /// Computes the sha256 leaf hash for a claim: sha256(index_be || account_xdr || amount_be).
    pub fn compute_leaf(env: &Env, index: u32, account: &Address, amount: i128) -> BytesN<32> {
        let mut payload = Bytes::new(env);
        payload.extend_from_array(&index.to_be_bytes());
        payload.append(&account.clone().to_xdr(env));
        payload.extend_from_array(&amount.to_be_bytes());
        env.crypto().sha256(&payload).into()
    }

    /// Verifies inclusion proof in O(log N) time against expected root.
    pub fn verify_proof(
        env: &Env,
        leaf: &BytesN<32>,
        proof: &Vec<BytesN<32>>,
        root: &BytesN<32>,
    ) -> bool {
        let mut current = leaf.clone();
        for sibling in proof.iter() {
            let current_array = current.to_array();
            let sibling_array = sibling.to_array();
            let mut pair = [0u8; 64];
            if current_array < sibling_array {
                pair[..32].copy_from_slice(&current_array);
                pair[32..].copy_from_slice(&sibling_array);
            } else {
                pair[..32].copy_from_slice(&sibling_array);
                pair[32..].copy_from_slice(&current_array);
            }
            current = env.crypto().sha256(&Bytes::from_array(env, &pair)).into();
        }
        current == *root
    }

    /// Initializes airdrop distribution configuration.
    pub fn initialize(
        env: &Env,
        admin: Address,
        token: Option<Address>,
        merkle_root: BytesN<32>,
        total_amount: i128,
    ) {
        admin.require_auth();
        if env.storage().instance().has(&DistributorKey::Config) {
            panic_with_error!(env, DistributorError::AlreadyInitialized);
        }
        if total_amount <= 0 {
            panic_with_error!(env, DistributorError::ZeroAmount);
        }

        let config = MerkleDistributorConfig {
            admin,
            token,
            merkle_root,
            total_amount,
            claimed_amount: 0,
            start_time: env.ledger().timestamp(),
        };
        env.storage()
            .instance()
            .set(&DistributorKey::Config, &config);
    }

    /// Retrieves current airdrop distribution configuration.
    pub fn get_config(env: &Env) -> MerkleDistributorConfig {
        env.storage()
            .instance()
            .get(&DistributorKey::Config)
            .unwrap_or_else(|| panic_with_error!(env, DistributorError::NotInitialized))
    }

    /// Checks if a recipient index has already claimed via the bit-packed bitmap.
    pub fn is_claimed(env: &Env, index: u32) -> bool {
        BitMap::is_claimed(env, index)
    }

    /// Processes claim with cryptographic Merkle proof and marks index in bitmap.
    pub fn claim(env: &Env, index: u32, account: Address, amount: i128, proof: Vec<BytesN<32>>) {
        account.require_auth();
        if amount <= 0 {
            panic_with_error!(env, DistributorError::ZeroAmount);
        }

        let mut config = Self::get_config(env);

        if BitMap::is_claimed(env, index) {
            panic_with_error!(env, DistributorError::AlreadyClaimed);
        }

        let leaf = Self::compute_leaf(env, index, &account, amount);
        if !Self::verify_proof(env, &leaf, &proof, &config.merkle_root) {
            panic_with_error!(env, DistributorError::InvalidProof);
        }

        BitMap::set_claimed(env, index);

        config.claimed_amount = config
            .claimed_amount
            .checked_add(amount)
            .unwrap_or_else(|| panic_with_error!(env, DistributorError::InsufficientRemaining));

        if config.claimed_amount > config.total_amount {
            panic_with_error!(env, DistributorError::InsufficientRemaining);
        }

        env.storage()
            .instance()
            .set(&DistributorKey::Config, &config);

        if let Some(token_addr) = config.token {
            let client = soroban_sdk::token::Client::new(env, &token_addr);
            client.transfer(&env.current_contract_address(), &account, &amount);
        }
    }

    /// Allows admin to reclaim unclaimed tokens after the 90-day window expires.
    pub fn clawback(env: &Env, admin: Address, to: Address) -> i128 {
        admin.require_auth();
        let mut config = Self::get_config(env);
        if admin != config.admin {
            panic_with_error!(env, DistributorError::Unauthorized);
        }

        let current_time = env.ledger().timestamp();
        if current_time
            < config
                .start_time
                .saturating_add(AIRDROP_CLAWBACK_WINDOW_SECONDS)
        {
            panic_with_error!(env, DistributorError::ClawbackWindowActive);
        }

        let remaining = config
            .total_amount
            .checked_sub(config.claimed_amount)
            .unwrap_or_else(|| panic_with_error!(env, DistributorError::InsufficientRemaining));

        if remaining > 0 {
            config.claimed_amount = config.total_amount;
            env.storage()
                .instance()
                .set(&DistributorKey::Config, &config);

            if let Some(token_addr) = config.token {
                let client = soroban_sdk::token::Client::new(env, &token_addr);
                client.transfer(&env.current_contract_address(), &to, &remaining);
            }
        }

        remaining
    }
}
