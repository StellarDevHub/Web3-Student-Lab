#![no_std]

//! # Standardized State Archival Defense & Dynamic TTL Extension — SC-HARD-16
//!
//! Reusable storage TTL manager trait and helpers applied across all 36
//! workspace contracts to protect against automatic ledger state archival on
//! Stellar Mainnet.
//!
//! ## Design
//!
//! All contracts call `bump_instance` and `bump_persistent` on every state
//! mutation. The bumps use a **floor** semantics: Soroban's `extend_ttl` is
//! a no-op when the remaining TTL is already above the threshold, so calling
//! it on every read/write is safe, idempotent, and cheap.
//!
//! ## Acceptance Criteria
//!
//! All contracts automatically bump persistent and instance storage lifetimes
//! **beyond 100,000 ledgers** upon every execution.
//!
//! ## Constants
//!
//! | Constant                   | Value    | Notes                         |
//! |----------------------------|----------|-------------------------------|
//! | `TTL_THRESHOLD_LEDGERS`    | 10,000   | Trigger bump below this TTL   |
//! | `PERSISTENT_BUMP_LEDGERS`  | 518,400  | 30 days at 5 s/ledger        |
//! | `INSTANCE_BUMP_LEDGERS`    | 518,400  | Matches persistent target     |
//! | `TEMP_BUMP_LEDGERS`        | 17,280   | 1 day (scratchpads)          |

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol, Vec,
};

// ── Acceptance-criteria constants ────────────────────────────────────────────

/// Bump threshold: extend when TTL falls below this many ledgers.
pub const TTL_THRESHOLD_LEDGERS: u32 = 10_000;
/// Target TTL for persistent storage (≥100,000 ledgers per acceptance criteria).
pub const PERSISTENT_BUMP_LEDGERS: u32 = 518_400; // 30 × 17,280
/// Target TTL for instance storage (≥100,000 ledgers per acceptance criteria).
pub const INSTANCE_BUMP_LEDGERS: u32 = 518_400;
/// Target TTL for temporary scratchpad storage.
pub const TEMP_BUMP_LEDGERS: u32 = 17_280; // 1 × 17,280
/// Threshold for temporary storage bumps.
pub const TEMP_THRESHOLD_LEDGERS: u32 = 5_000;

// ── Storage keys ─────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum TTLKey {
    /// Contract administrator.
    Admin,
    /// Persisted bump configuration.
    InstanceConfig,
    /// Persistent user data bucket.
    UserData(Address),
    /// Persistent named config entry.
    Config(Symbol),
    /// Registry of persistent keys tracked for batch auto-bump.
    TrackedKeys,
    /// Temporary scratchpad marker (index).
    Scratchpad(Symbol),
    /// Temporary scratchpad value.
    ScratchpadData(Symbol),
}

// ── Public bump helpers (re-exported for use by any contract) ─────────────────

/// Bump instance storage TTL (SC-HARD-16 — call on every mutation).
///
/// Safe to call even when TTL is already high; Soroban treats it as a no-op
/// in that case.
pub fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD_LEDGERS, INSTANCE_BUMP_LEDGERS);
}

/// Bump a persistent storage entry's TTL.
pub fn bump_persistent(env: &Env, key: &TTLKey) {
    env.storage()
        .persistent()
        .extend_ttl(key, TTL_THRESHOLD_LEDGERS, PERSISTENT_BUMP_LEDGERS);
}

/// Bump a temporary storage entry's TTL.
pub fn bump_temporary(env: &Env, key: &TTLKey) {
    env.storage()
        .temporary()
        .extend_ttl(key, TEMP_THRESHOLD_LEDGERS, TEMP_BUMP_LEDGERS);
}

/// Inspect all tracked persistent keys and bump any whose TTL is below the
/// threshold. Returns the number of entries that were found and bumped.
pub fn auto_bump_persistent(env: &Env) -> u32 {
    let keys: Vec<TTLKey> = env
        .storage()
        .persistent()
        .get(&TTLKey::TrackedKeys)
        .unwrap_or_else(|| Vec::new(env));

    let mut bumped = 0u32;
    for k in keys.iter() {
        if env.storage().persistent().has(&k) {
            bump_persistent(env, &k);
            bumped += 1;
        }
    }
    bumped
}

/// Register a persistent key for inclusion in future `auto_bump_persistent`
/// batches. Duplicate keys are silently ignored.
pub fn track_persistent_key(env: &Env, key: TTLKey) {
    let mut keys: Vec<TTLKey> = env
        .storage()
        .persistent()
        .get(&TTLKey::TrackedKeys)
        .unwrap_or_else(|| Vec::new(env));

    let mut exists = false;
    for k in keys.iter() {
        if k == key {
            exists = true;
            break;
        }
    }
    if !exists {
        keys.push_back(key);
        env.storage()
            .persistent()
            .set(&TTLKey::TrackedKeys, &keys);
    }
}

// ── Temporary scratchpad helpers ──────────────────────────────────────────────

/// Write a transient value to temporary storage (cheap, non-restorable).
/// Ideal for multi-step intermediate results that can be recomputed.
pub fn set_scratchpad(env: &Env, key: Symbol, value: i128) {
    let tkey = TTLKey::ScratchpadData(key);
    env.storage().temporary().set(&tkey, &value);
    env.storage()
        .temporary()
        .extend_ttl(&tkey, TEMP_THRESHOLD_LEDGERS, TEMP_BUMP_LEDGERS);
}

/// Read a scratchpad value. Bumps TTL on read to keep hot scratchpads alive.
pub fn get_scratchpad(env: &Env, key: Symbol) -> Option<i128> {
    let tkey = TTLKey::ScratchpadData(key);
    if env.storage().temporary().has(&tkey) {
        bump_temporary(env, &tkey);
    }
    env.storage().temporary().get(&tkey)
}

/// Delete a scratchpad entry after the workflow completes (saves rent).
pub fn clear_scratchpad(env: &Env, key: Symbol) {
    let tkey = TTLKey::ScratchpadData(key);
    env.storage().temporary().remove(&tkey);
}

/// Example multi-step calculation via scratchpad to reduce persistent
/// footprint: stores `a`, reads it back, adds `b`, returns the sum, then
/// clears the scratchpad.
pub fn calc_via_scratchpad(env: &Env, a: i128, b: i128, scratch_key: Symbol) -> i128 {
    set_scratchpad(env, scratch_key.clone(), a);
    let cached_a: i128 = get_scratchpad(env, scratch_key.clone()).unwrap_or(0);
    let result = cached_a + b;
    clear_scratchpad(env, scratch_key);
    result
}

// ── Contract (integration test target) ───────────────────────────────────────

#[contract]
pub struct StorageTTLManager;

#[contractimpl]
impl StorageTTLManager {
    /// Initialize and set up the admin. Bumps instance TTL immediately.
    pub fn initialize(env: Env, admin: Address) {
        admin.require_auth();
        env.storage().instance().set(&TTLKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&TTLKey::InstanceConfig, &PERSISTENT_BUMP_LEDGERS);
        bump_instance(&env);
        env.events().publish((symbol_short!("init"),), (admin,));
    }

    /// Write persistent user data and extend its TTL.
    pub fn set_user_data(env: Env, user: Address, value: i128) {
        user.require_auth();
        let key = TTLKey::UserData(user.clone());
        env.storage().persistent().set(&key, &value);
        bump_persistent(&env, &key);
        track_persistent_key(&env, key);
        bump_instance(&env);
        env.events().publish((symbol_short!("set"),), (user, value));
    }

    /// Read persistent user data. Bumps TTL on access.
    pub fn get_user_data(env: Env, user: Address) -> Option<i128> {
        let key = TTLKey::UserData(user.clone());
        let val: Option<i128> = env.storage().persistent().get(&key);
        if val.is_some() {
            bump_persistent(&env, &key);
            bump_instance(&env);
        }
        val
    }

    /// Trigger a batch bump of all tracked persistent keys. Returns count
    /// of keys found and bumped.
    pub fn inspect_and_bump(env: Env) -> u32 {
        let count = auto_bump_persistent(&env);
        bump_instance(&env);
        env.events().publish((symbol_short!("bump"),), count);
        count
    }

    /// Demonstrate the scratchpad workflow: sum `a` and `b` via temporary
    /// storage and return the result.
    pub fn scratchpad_sum(env: Env, a: i128, b: i128, key: Symbol) -> i128 {
        calc_via_scratchpad(&env, a, b, key)
    }

    // ── Scratchpad primitives for advanced / test use ─────────────────────────

    pub fn scratchpad_set(env: Env, key: Symbol, value: i128) {
        set_scratchpad(&env, key, value);
    }

    pub fn scratchpad_get(env: Env, key: Symbol) -> Option<i128> {
        get_scratchpad(&env, key)
    }

    pub fn scratchpad_clear(env: Env, key: Symbol) {
        clear_scratchpad(&env, key);
    }

    /// Returns the list of persistent keys currently tracked for auto-bump.
    pub fn get_tracked_keys(env: Env) -> Vec<TTLKey> {
        env.storage()
            .persistent()
            .get(&TTLKey::TrackedKeys)
            .unwrap_or_else(|| Vec::new(&env))
    }

    // ── Constants (for off-chain tooling and tests) ───────────────────────────

    pub fn threshold(_env: Env) -> u32 {
        TTL_THRESHOLD_LEDGERS
    }

    pub fn bump_amount(_env: Env) -> u32 {
        PERSISTENT_BUMP_LEDGERS
    }

    pub fn instance_bump_amount(_env: Env) -> u32 {
        INSTANCE_BUMP_LEDGERS
    }
}

// ── Tests (in separate file per issue requirements) ───────────────────────────

#[cfg(test)]
mod tests;
