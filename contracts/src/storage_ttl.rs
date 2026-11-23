//! # Storage TTL Rent Manager & Auto-Bump Extension — SC-HARD-16
//!
//! Shared library providing reusable storage TTL management for all Soroban
//! contracts in the Web3 Student Lab workspace.
//!
//! ## Acceptance Criteria
//!
//! All contracts must automatically bump persistent and instance storage
//! lifetimes **beyond 100,000 ledgers** upon every execution.
//!
//! ## Design
//!
//! - `TTL_THRESHOLD_LEDGERS = 10_000` : when remaining TTL drops below this,
//!   trigger a bump.
//! - `PERSISTENT_BUMP_LEDGERS = 518_400` (≈30 days at 5 s/ledger): target
//!   TTL after a persistent bump.
//! - `INSTANCE_BUMP_LEDGERS = 518_400` : target TTL for instance storage.
//! - `TEMP_BUMP_LEDGERS = 17_280` (≈1 day): scratchpad TTL.
//!
//! The `extend_ttl` helper is a **floor**: it only extends when the remaining
//! TTL is below `threshold`. Calling it on every read/write is safe and
//! idempotent. Archived entries must be restored before they can be bumped.
//!
//! ## Usage
//!
//! ```rust,ignore
//! use soroban_sdk::Env;
//!
//! // In any state-mutating contract function:
//! crate::storage_ttl::bump_instance(&env);
//! crate::storage_ttl::bump_persistent(&env, &my_key);
//! ```
//!
//! Or inline, using the canonical constants:
//!
//! ```rust,ignore
//! env.storage().instance().extend_ttl(
//!     storage_ttl::TTL_THRESHOLD_LEDGERS,
//!     storage_ttl::INSTANCE_BUMP_LEDGERS,
//! );
//! ```

use soroban_sdk::{Env, Symbol, Vec};

// ── Canonical TTL constants ───────────────────────────────────────────────────

/// Bump trigger: extend TTL when remaining lifetime drops below this value.
pub const TTL_THRESHOLD_LEDGERS: u32 = 10_000;

/// Target persistent storage TTL: 518,400 ledgers ≈ 30 days at 5 s/ledger.
/// Satisfies the acceptance criterion of > 100,000 ledgers.
pub const PERSISTENT_BUMP_LEDGERS: u32 = 518_400;

/// Target instance storage TTL: same as persistent (518,400 ledgers).
pub const INSTANCE_BUMP_LEDGERS: u32 = 518_400;

/// Target TTL for temporary scratchpad storage (17,280 ledgers ≈ 1 day).
pub const TEMP_BUMP_LEDGERS: u32 = 17_280;

/// Threshold for temporary storage bumps.
pub const TEMP_THRESHOLD_LEDGERS: u32 = 5_000;

// ── Generic bump helpers ──────────────────────────────────────────────────────
//
// These helpers accept generic `K: soroban_sdk::contracttype::val::IntoVal`
// keys via the SDK's storage trait so any contract key type can be passed.

/// Bump the instance storage TTL to `INSTANCE_BUMP_LEDGERS` when the remaining
/// TTL falls below `TTL_THRESHOLD_LEDGERS`.
///
/// **Call this on every state-mutating invocation** to satisfy SC-HARD-16.
#[inline(always)]
pub fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD_LEDGERS, INSTANCE_BUMP_LEDGERS);
}

/// Bump a persistent storage entry's TTL.
///
/// `key` is any value that implements `IntoVal<Env, soroban_sdk::Val>` and
/// `TryFromVal<Env, soroban_sdk::Val>` — i.e. any `#[contracttype]` enum or
/// tuple key.
pub fn bump_persistent_sym(env: &Env, key: &Symbol) {
    env.storage()
        .persistent()
        .extend_ttl(key, TTL_THRESHOLD_LEDGERS, PERSISTENT_BUMP_LEDGERS);
}

/// Bump a temporary storage entry's TTL.
pub fn bump_temporary_sym(env: &Env, key: &Symbol) {
    env.storage()
        .temporary()
        .extend_ttl(key, TEMP_THRESHOLD_LEDGERS, TEMP_BUMP_LEDGERS);
}

// ── Scratchpad helpers ────────────────────────────────────────────────────────

/// Write a transient value to temporary storage. Used for multi-step
/// intermediate results that do not need persistence.
pub fn set_scratchpad(env: &Env, key: Symbol, value: i128) {
    env.storage().temporary().set(&key, &value);
    env.storage()
        .temporary()
        .extend_ttl(&key, TEMP_THRESHOLD_LEDGERS, TEMP_BUMP_LEDGERS);
}

/// Read a scratchpad value. Bumps TTL on access to keep hot scratchpads alive.
pub fn get_scratchpad(env: &Env, key: Symbol) -> Option<i128> {
    if env.storage().temporary().has(&key) {
        env.storage()
            .temporary()
            .extend_ttl(&key, TEMP_THRESHOLD_LEDGERS, TEMP_BUMP_LEDGERS);
    }
    env.storage().temporary().get(&key)
}

/// Delete a scratchpad entry after the workflow completes (saves rent).
pub fn clear_scratchpad(env: &Env, key: Symbol) {
    env.storage().temporary().remove(&key);
}

/// Sum `a` and `b` via temporary scratchpad to demonstrate the workflow.
pub fn calc_via_scratchpad(env: &Env, a: i128, b: i128, scratch_key: Symbol) -> i128 {
    set_scratchpad(env, scratch_key.clone(), a);
    let cached_a: i128 = get_scratchpad(env, scratch_key.clone()).unwrap_or(0);
    let result = cached_a + b;
    clear_scratchpad(env, scratch_key);
    result
}
