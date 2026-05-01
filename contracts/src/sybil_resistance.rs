use soroban_sdk::{contracttype, Address, Env, String, Symbol, Vec};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IdentityRecord {
    pub student: Address,
    pub did: String,
    pub is_verified: bool,
    pub verified_at: u64,
}

#[contracttype]
pub enum SybilKey {
    Identity(Address),
    DidToAddress(String),
    GovernanceCredits(Address),
    BaseCredits,
}

pub const DEFAULT_BASE_CREDITS: u128 = 100;

/// Get base credit allocation for verified users
pub fn get_base_credits_config(env: &Env) -> u128 {
    env.storage()
        .instance()
        .get(&SybilKey::BaseCredits)
        .unwrap_or(DEFAULT_BASE_CREDITS)
}

/// Set base credit allocation
pub fn set_base_credits_config(env: &Env, amount: u128) {
    env.storage()
        .instance()
        .set(&SybilKey::BaseCredits, &amount);
}

/// Verify an identity for sybil resistance and allocate base credits
pub fn verify_identity(env: &Env, student: Address, did: String) -> bool {
    // Sybil detection: Check if DID is already linked to another address
    if let Some(existing_addr) = env.storage().persistent().get::<_, Address>(&SybilKey::DidToAddress(did.clone())) {
        if existing_addr != student {
            return false; // Sybil attack detected: DID already in use by another address
        }
    }
    
    // Check if address already has a different DID
    if let Some(existing_record) = env.storage().persistent().get::<_, IdentityRecord>(&SybilKey::Identity(student.clone())) {
        if existing_record.did != did {
             return false; // Address already verified with a different DID
        }
    }

    let record = IdentityRecord {
        student: student.clone(),
        did: did.clone(),
        is_verified: true,
        verified_at: env.ledger().timestamp(),
    };
    
    env.storage()
        .persistent()
        .set(&SybilKey::Identity(student.clone()), &record);
    
    env.storage()
        .persistent()
        .set(&SybilKey::DidToAddress(did), &student);
        
    // Allocate base credits if not already initialized
    let current = get_governance_credits(env, &student);
    if current == 0 {
        let base = get_base_credits_config(env);
        set_governance_credits(env, student, base);
    }
    
    true
}

/// Check if an address is sybil-verified
pub fn is_verified(env: &Env, address: &Address) -> bool {
    env.storage()
        .persistent()
        .get::<_, IdentityRecord>(&SybilKey::Identity(address.clone()))
        .map(|r| r.is_verified)
        .unwrap_or(false)
}

/// Get governance credit balance for an address
pub fn get_governance_credits(env: &Env, address: &Address) -> u128 {
    env.storage()
        .persistent()
        .get(&SybilKey::GovernanceCredits(address.clone()))
        .unwrap_or(0)
}

/// Set governance credit balance (internal)
pub fn set_governance_credits(env: &Env, address: Address, amount: u128) {
    env.storage()
        .persistent()
        .set(&SybilKey::GovernanceCredits(address), &amount);
}

/// Use governance credits (returns true if successful)
pub fn consume_credits(env: &Env, address: &Address, amount: u128) -> bool {
    let current = get_governance_credits(env, address);
    if current < amount {
        return false;
    }
    set_governance_credits(env, address.clone(), current - amount);
    true
}
