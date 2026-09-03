//! Soroban Storage TTL Rent Manager & Auto-Bump Extension — Issue #1103
//!
//! Automated rent maintenance to prevent data eviction on Stellar Mainnet.
//! Covers persistent, instance and temporary tiers.
//!
//! # Design
//! - `TTL_THRESHOLD_LEDGERS = 10_000` : when remaining TTL drops below this, bump.
//! - `PERSISTENT_BUMP_LEDGERS = 518400` (30 days) : target TTL after bump.
//! - `INSTANCE_BUMP_LEDGERS  = 518400` : same for instance (shares one TTL).
//! - `TEMP_BUMP_LEDGERS      = 17280`  (1 day)  : scratchpads are short-lived.
//! - Temporary storage scratchpads (`Scratchpad` keys) hold multi-step
//!   intermediate results and are intentionally cheap + non-restorable.
//!
//! The helper `extend_ttl` is a floor: it only extends when remaining TTL
//! is below `threshold`. Calling it on every read/write is safe and idempotent.
//! Archived entries cannot be extended — they must be restored first.

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, String, Symbol, Vec,
};

/// TTL constants — match mainnet defaults and acceptance criteria.
pub const TTL_THRESHOLD_LEDGERS: u32 = 10_000;
pub const PERSISTENT_BUMP_LEDGERS: u32 = 518_400; // 30 * 17280
pub const INSTANCE_BUMP_LEDGERS: u32 = 518_400;
pub const TEMP_BUMP_LEDGERS: u32 = 17_280; // 1 * 17280
pub const TEMP_THRESHOLD_LEDGERS: u32 = 5_000;

/// Storage keys for the TTL manager.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum TTLKey {
    Admin,
    InstanceConfig,
    /// Persistent user data bucket.
    UserData(Address),
    /// Persistent course / config entry.
    Config(Symbol),
    /// Registry of tracked persistent keys for batch bumping.
    TrackedKeys,
    /// Temporary scratchpad: transient multi-step calculation.
    Scratchpad(Symbol),
    /// Scratchpad index entry.
    ScratchpadData(Symbol),
}

// ─── Helper functions (usable from any contract) ────────────────────────────

/// Bump persistent entry if its TTL is below threshold.
/// Wraps `env.storage().persistent().extend_ttl(&key, threshold, extend_to)`.
pub fn bump_persistent(env: &Env, key: &TTLKey) {
    env.storage()
        .persistent()
        .extend_ttl(key, TTL_THRESHOLD_LEDGERS, PERSISTENT_BUMP_LEDGERS);
}

/// Bump instance TTL (shared across all instance keys).
pub fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD_LEDGERS, INSTANCE_BUMP_LEDGERS);
}

/// Bump temporary entry (scratchpad).
pub fn bump_temporary(env: &Env, key: &TTLKey) {
    env.storage()
        .temporary()
        .extend_ttl(key, TEMP_THRESHOLD_LEDGERS, TEMP_BUMP_LEDGERS);
}

/// Automated inspection: extend every tracked persistent key whose TTL is low.
/// Returns number of keys bumped (extend_ttl is no-op when TTL already high,
/// so count is best-effort: we count keys that existed).
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

/// Register a persistent key for future auto-bump batches.
pub fn track_persistent_key(env: &Env, key: TTLKey) {
    let mut keys: Vec<TTLKey> = env
        .storage()
        .persistent()
        .get(&TTLKey::TrackedKeys)
        .unwrap_or_else(|| Vec::new(env));
    // Avoid duplicates
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

// ─── Temporary scratchpad helpers ──────────────────────────────────────────

/// Write a transient value to temporary storage (cheap, non-restorable).
/// Used for multi-step calculations that can be recomputed.
pub fn set_scratchpad(env: &Env, key: Symbol, value: i128) {
    let tkey = TTLKey::ScratchpadData(key.clone());
    env.storage().temporary().set(&tkey, &value);
    env.storage()
        .temporary()
        .extend_ttl(&tkey, TEMP_THRESHOLD_LEDGERS, TEMP_BUMP_LEDGERS);
}

/// Read scratchpad value.
pub fn get_scratchpad(env: &Env, key: Symbol) -> Option<i128> {
    let tkey = TTLKey::ScratchpadData(key);
    // Bump on read to keep hot scratchpads alive during a workflow.
    if env.storage().temporary().has(&tkey) {
        bump_temporary(env, &tkey);
    }
    env.storage().temporary().get(&tkey)
}

/// Delete a scratchpad entry after workflow completes (save rent).
pub fn clear_scratchpad(env: &Env, key: Symbol) {
    let tkey = TTLKey::ScratchpadData(key);
    env.storage().temporary().remove(&tkey);
}

/// Example multi-step calculation using temporary scratchpad to reduce
/// persistent footprint: sums two values via scratchpad and persists final.
pub fn calc_via_scratchpad(env: &Env, a: i128, b: i128, scratch_key: Symbol) -> i128 {
    set_scratchpad(env, scratch_key.clone(), a);
    let cached_a: i128 = get_scratchpad(env, scratch_key.clone()).unwrap_or(0);
    let result = cached_a + b;
    clear_scratchpad(env, scratch_key.clone());
    result
}

// ─── Contract wrapper (for integration tests) ──────────────────────────────

#[contract]
pub struct StorageTTLManager;

#[contractimpl]
impl StorageTTLManager {
    pub fn initialize(env: Env, admin: Address) {
        admin.require_auth();
        env.storage().instance().set(&TTLKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&TTLKey::InstanceConfig, &PERSISTENT_BUMP_LEDGERS);
        bump_instance(&env);
        env.events().publish((symbol_short!("init"),), (admin,));
    }

    /// Write persistent user data and auto-extend TTL.
    pub fn set_user_data(env: Env, user: Address, value: i128) {
        user.require_auth();
        let key = TTLKey::UserData(user.clone());
        env.storage().persistent().set(&key, &value);
        bump_persistent(&env, &key);
        track_persistent_key(&env, key.clone());
        // Instance bump on every write keeps contract itself alive.
        bump_instance(&env);
        env.events().publish((symbol_short!("set"),), (user, value));
    }

    /// Read persistent user data — also bumps TTL when below threshold.
    pub fn get_user_data(env: Env, user: Address) -> Option<i128> {
        let key = TTLKey::UserData(user.clone());
        let val: Option<i128> = env.storage().persistent().get(&key);
        if val.is_some() {
            bump_persistent(&env, &key);
            bump_instance(&env);
        }
        val
    }

    /// Inspection routine: caller can trigger batch bump of all tracked keys.
    /// Returns count of bumped entries.
    pub fn inspect_and_bump(env: Env) -> u32 {
        let count = auto_bump_persistent(&env);
        bump_instance(&env);
        env.events().publish((symbol_short!("bump"),), count);
        count
    }

    /// Temporary scratchpad workflow example.
    pub fn scratchpad_sum(env: Env, a: i128, b: i128, key: Symbol) -> i128 {
        calc_via_scratchpad(&env, a, b, key)
    }

    /// Direct scratchpad set/get for tests / advanced flows.
    pub fn scratchpad_set(env: Env, key: Symbol, value: i128) {
        set_scratchpad(&env, key, value);
    }
    pub fn scratchpad_get(env: Env, key: Symbol) -> Option<i128> {
        get_scratchpad(&env, key)
    }
    pub fn scratchpad_clear(env: Env, key: Symbol) {
        clear_scratchpad(&env, key);
    }

    pub fn get_tracked_keys(env: Env) -> Vec<TTLKey> {
        env.storage()
            .persistent()
            .get(&TTLKey::TrackedKeys)
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Expose constants for off-chain tooling / tests.
    pub fn threshold(env: Env) -> u32 {
        let _ = env;
        TTL_THRESHOLD_LEDGERS
    }
    pub fn bump_amount(env: Env) -> u32 {
        let _ = env;
        PERSISTENT_BUMP_LEDGERS
    }
}

// ─── Tests ─────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    fn setup() -> (Env, StorageTTLManagerClient<'static>, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(StorageTTLManager, ());
        let client = StorageTTLManagerClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);
        (env, client, admin)
    }

    #[test]
    fn test_set_and_get_bumps_ttl() {
        let (env, client, _) = setup();
        let user = Address::generate(&env);
        client.set_user_data(&user, &42);
        let val = client.get_user_data(&user);
        assert_eq!(val, Some(42));
        // Reading again should still auto-bump without panic
        let val2 = client.get_user_data(&user);
        assert_eq!(val2, Some(42));
    }

    #[test]
    fn test_inspect_and_bump() {
        let (env, client, _) = setup();
        let user1 = Address::generate(&env);
        let user2 = Address::generate(&env);
        client.set_user_data(&user1, &10);
        client.set_user_data(&user2, &20);
        let count = client.inspect_and_bump();
        assert!(count >= 2);
        let keys = client.get_tracked_keys();
        assert_eq!(keys.len(), 2);
    }

    #[test]
    fn test_scratchpad_workflow() {
        let (env, client, _) = setup();
        let key = Symbol::new(&env, "calc");
        client.scratchpad_set(&key, &100);
        assert_eq!(client.scratchpad_get(&key), Some(100));
        let sum = client.scratchpad_sum(&50, &25, &Symbol::new(&env, "tmp"));
        assert_eq!(sum, 75);
        // scratchpad_sum clears temp entry
        assert_eq!(
            client.scratchpad_get(&Symbol::new(&env, "tmp")),
            None
        );
        client.scratchpad_clear(&key);
        assert_eq!(client.scratchpad_get(&key), None);
    }

    #[test]
    fn test_threshold_constants() {
        let (_env, client, _) = setup();
        assert_eq!(client.threshold(), 10_000);
        assert_eq!(client.bump_amount(), 518_400);
    }

    #[test]
    fn test_auto_bump_idempotent() {
        let (env, client, _) = setup();
        let user = Address::generate(&env);
        client.set_user_data(&user, &1);
        let c1 = client.inspect_and_bump();
        let c2 = client.inspect_and_bump();
        assert_eq!(c1, c2);
    }
}
