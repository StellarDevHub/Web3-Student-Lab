use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, Map, Symbol, Vec};

const KEY_PAYMENTS: Symbol = Symbol::new("payments");
const KEY_PROOFS: Symbol = Symbol::new("proofs");
const KEY_EARNINGS: Symbol = Symbol::new("earnings");
const STORAGE_RATE: i128 = 1; // 1 stroop per byte per day
const PROOF_REWARD: i128 = 100_000; // 0.1 XLM per successful proof
const PENALTY_SLASH: u32 = 10; // 10% slash on data loss

#[contracttype]
#[derive(Clone, Debug)]
pub struct StorageProof {
    pub provider: Address,
    pub file_id: soroban_sdk::BytesN<32>,
    pub shard_index: u32,
    pub proof_hash: soroban_sdk::BytesN<32>,
    pub verified: bool,
    pub submitted_at: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct ProviderEarnings {
    pub total_earned: i128,
    pub total_penalties: i128,
    pub last_payout: u64,
    pub proof_count: u32,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct PaymentDistributedEvent {
    pub provider: Address,
    pub amount: i128,
    pub reason: Symbol,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct ProofVerifiedEvent {
    pub provider: Address,
    pub file_id: soroban_sdk::BytesN<32>,
    pub reward: i128,
    pub timestamp: u64,
}

#[contract]
pub struct StorageIncentives;

#[contractimpl]
impl StorageIncentives {
    pub fn initialize(env: Env) {
        if env.storage().instance().has(&KEY_PAYMENTS) { panic!("Already initialized"); }
        env.storage().instance().set(&KEY_PAYMENTS, &Vec::<(Address, i128, u64)>(&env));
        env.storage().instance().set(&KEY_PROOFS, &Vec::<StorageProof>(&env));
        env.storage().instance().set(&KEY_EARNINGS, &Map::<Address, ProviderEarnings>::new(&env));
    }

    /// Submit a storage proof
    pub fn submit_proof(env: Env, provider: Address, file_id: soroban_sdk::BytesN<32>, shard_index: u32, proof_hash: soroban_sdk::BytesN<32>) -> bool {
        provider.require_auth();
        let proof = StorageProof {
            provider: provider.clone(), file_id: file_id.clone(), shard_index,
            proof_hash, verified: true, submitted_at: env.ledger().timestamp(),
        };

        let mut proofs: Vec<StorageProof> = env.storage().instance().get(&KEY_PROOFS).unwrap_or(Vec::new(&env));
        proofs.push_back(proof);
        env.storage().instance().set(&KEY_PROOFS, &proofs);

        // Reward provider
        let mut earnings: Map<Address, ProviderEarnings> = env.storage().instance().get(&KEY_EARNINGS).unwrap_or(Map::new(&env));
        let mut e = earnings.get(provider.clone()).unwrap_or(ProviderEarnings {
            total_earned: 0, total_penalties: 0, last_payout: 0, proof_count: 0,
        });
        e.total_earned += PROOF_REWARD;
        e.proof_count += 1;
        e.last_payout = env.ledger().timestamp();
        earnings.set(provider.clone(), e);
        env.storage().instance().set(&KEY_EARNINGS, &earnings);

        // Record payment
        let mut payments: Vec<(Address, i128, u64)> = env.storage().instance().get(&KEY_PAYMENTS).unwrap_or(Vec::new(&env));
        payments.push_back((provider.clone(), PROOF_REWARD, env.ledger().timestamp()));
        env.storage().instance().set(&KEY_PAYMENTS, &payments);

        env.events().publish((Symbol::new(&env, "proof_verified"),), ProofVerifiedEvent {
            provider, file_id, reward: PROOF_REWARD, timestamp: env.ledger().timestamp(),
        });

        true
    }

    /// Calculate storage payment for a provider
    pub fn calculate_storage_payment(env: Env, provider: Address, bytes_stored: u64, days: u64) -> i128 {
        (bytes_stored as i128) * STORAGE_RATE * (days as i128)
    }

    /// Apply penalty for data loss
    pub fn apply_penalty(env: Env, provider: Address) {
        let mut earnings: Map<Address, ProviderEarnings> = env.storage().instance().get(&KEY_EARNINGS).unwrap_or(Map::new(&env));
        let mut e = earnings.get(provider.clone()).unwrap_or(ProviderEarnings {
            total_earned: 0, total_penalties: 0, last_payout: 0, proof_count: 0,
        });
        let penalty = e.total_earned * PENALTY_SLASH as i128 / 100;
        e.total_earned -= penalty;
        e.total_penalties += penalty;
        earnings.set(provider.clone(), e);
        env.storage().instance().set(&KEY_EARNINGS, &earnings);

        env.events().publish((Symbol::new(&env, "payment_distributed"),), PaymentDistributedEvent {
            provider, amount: -penalty, reason: Symbol::new(&env, "penalty"),
            timestamp: env.ledger().timestamp(),
        });
    }

    /// Get provider earnings
    pub fn get_provider_earnings(env: Env, provider: Address) -> ProviderEarnings {
        let earnings: Map<Address, ProviderEarnings> = env.storage().instance().get(&KEY_EARNINGS).unwrap_or(Map::new(&env));
        earnings.get(provider).unwrap_or(ProviderEarnings {
            total_earned: 0, total_penalties: 0, last_payout: 0, proof_count: 0,
        })
    }

    /// Distribute payment to provider
    pub fn distribute_payment(env: Env, provider: Address, amount: i128, token: Address) {
        let token_client = soroban_sdk::token::Client::new(&env, &token);
        token_client.transfer(&env.current_contract_address(), &provider, &amount);

        env.events().publish((Symbol::new(&env, "payment_distributed"),), PaymentDistributedEvent {
            provider, amount, reason: Symbol::new(&env, "payout"),
            timestamp: env.ledger().timestamp(),
        });
    }

    /// Get all proofs for a file
    pub fn get_file_proofs(env: Env, file_id: soroban_sdk::BytesN<32>) -> Vec<StorageProof> {
        let proofs: Vec<StorageProof> = env.storage().instance().get(&KEY_PROOFS).unwrap_or(Vec::new(&env));
        let mut result = Vec::new(&env);
        for proof in proofs.iter() {
            if proof.file_id == file_id { result.push_back(proof); }
        }
        result
    }

    /// Get payment history for a provider
    pub fn get_payment_history(env: Env, provider: Address) -> Vec<(Address, i128, u64)> {
        let payments: Vec<(Address, i128, u64)> = env.storage().instance().get(&KEY_PAYMENTS).unwrap_or(Vec::new(&env));
        let mut result = Vec::new(&env);
        for (addr, amount, timestamp) in payments.iter() {
            if addr == provider { result.push_back((addr, amount, timestamp)); }
        }
        result
    }
}
