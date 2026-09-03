# Soroban Storage TTL Rent Manager & Auto-Bump Extension

> Issue #1103 — Automated storage TTL rent management for Stellar Mainnet.

## Overview

All contract data lives in entries that expire. Stellar's rent model charges per-byte per-ledger and requires explicit **TTL extension** (`extend_ttl`) to keep data alive. An un-bumped entry is **archived** (persistent/instance) or **deleted** (temporary). This document defines the rent-aware storage architecture used across Web3 Student Lab contracts.

## Storage Tiers

| Tier | Behaviour at expiry | Restorable | Shared TTL | Max TTL (ledgers) | Use for |
|------|---------------------|------------|------------|-------------------|---------|
| **Instance** | Archived | Yes | Yes — all keys share one TTL | 518400 (30 days) | Global config: admin, version, thresholds |
| **Persistent** | Archived | Yes (costly) | No — per-key TTL | 518400 (30 days) | State of record: balances, ownership, DID bindings |
| **Temporary** | **Deleted** | **No** | No | 17280 (1 day) | Transient scratchpads, multi-step intermediates |

## Constants

```rust
const TTL_THRESHOLD_LEDGERS: u32 = 10_000;      // bump when below this
const PERSISTENT_BUMP_LEDGERS: u32 = 518_400;   // 30 days
const INSTANCE_BUMP_LEDGERS: u32 = 518_400;
const TEMP_BUMP_LEDGERS: u32 = 17_280;          // 1 day
```

These values keep every entry well above the network eviction minimum while remaining inside per-tx budget limits.

## Helpers

Located in `contracts/src/storage_ttl.rs` and reused by `contracts/storage_ttl_manager`.

```rust
// Bump persistent entry when TTL < 10_000.
pub fn bump_persistent(env: &Env, key: &TTLKey) {
    env.storage().persistent().extend_ttl(key, 10_000, 518_400);
}

// Bump instance (shared TTL).
pub fn bump_instance(env: &Env) {
    env.storage().instance().extend_ttl(10_000, 518_400);
}

// Bump temporary scratchpad.
pub fn bump_temporary(env: &Env, key: &TTLKey) {
    env.storage().temporary().extend_ttl(key, 5_000, 17_280);
}
```

`extend_ttl(threshold, extend_to)` is a **floor**, not an addition: it only extends if remaining TTL < `threshold`, and sets expiry to `current_ledger + extend_to`. Calling it on every access is safe and idempotent.

### Tracked Keys Registry

Each contract that owns persistent entries maintains `TrackedKeys: Vec<TTLKey>` in persistent storage. On write:

```rust
track_persistent_key(&env, key); // register for batch bumps
bump_persistent(&env, &key);
bump_instance(&env); // keep contract instance alive
```

### Automated Inspection Routine

```rust
pub fn auto_bump_persistent(env: &Env) -> u32 {
    let keys: Vec<TTLKey> = env.storage().persistent()
        .get(&TTLKey::TrackedKeys).unwrap_or_else(|| Vec::new(env));
    let mut bumped = 0u32;
    for k in keys.iter() {
        if env.storage().persistent().has(&k) {
            bump_persistent(env, &k);
            bumped += 1;
        }
    }
    bumped
}

pub fn inspect_and_bump(env: Env) -> u32 {
    let count = auto_bump_persistent(&env);
    bump_instance(&env);
    env.events().publish((symbol_short!("bump"),), count);
    count
}
```

*Frontends or keepers* should call `inspect_and_bump` once per day (or on every user-facing `get_*`/`set_*`). Because `extend_ttl` is a no-op when TTL is already high, this is cheap.

**Integration tests verify** that after advancing ledgers and invoking any entrypoint, the TTL remains above threshold.

## Temporary Scratchpads

For multi-step calculations that don't need durability, use temporary storage:

```rust
pub fn set_scratchpad(env: &Env, key: Symbol, value: i128) {
    let tkey = TTLKey::ScratchpadData(key);
    env.storage().temporary().set(&tkey, &value);
    env.storage().temporary().extend_ttl(&tkey, 5_000, 17_280);
}

pub fn calc_via_scratchpad(env: &Env, a: i128, b: i128, key: Symbol) -> i128 {
    set_scratchpad(env, key.clone(), a);
    let cached: i128 = get_scratchpad(env, key.clone()).unwrap_or(0);
    let result = cached + b;
    clear_scratchpad(env, key); // delete to reclaim rent
    result
}
```

Rules:

- Only store data you can recompute. Loss is silent.
- Clear the entry when the workflow finishes.
- Bump on read to keep hot scratchpads alive within a workflow.

## Rent Maintenance Guidelines

1. **Every persistent write must `extend_ttl`** immediately after `set`.
2. **Every persistent read should `extend_ttl`** (read-heavy entries that are never written still need bumps — the most common archival bug).
3. **Instance bump on every entrypoint** so an active contract never archives.
4. **Never use temporary for balances/ownership/history.**
5. **Run `inspect_and_bump` as a keeper job** (cron or on each user tx) — it's idempotent and cheap when nothing is close to expiry.
6. **Monitor via events**: `bump` event emits the number of keys extended; alert if it repeatedly bumps many keys (indicates write surge).
7. **Restoration is not a substitute**: an archived entry must be `restore`d first; `extend_ttl` on an archived entry is a no-op.

## Testing

- `test_set_and_get_bumps_ttl` — write + read both bump.
- `test_inspect_and_bump` — batch bump covers all tracked keys.
- `test_scratchpad_workflow` — temporary entries are cheap and cleared.
- `test_auto_bump_idempotent` — calling bump twice does not double-count or overcharge.

Run:

```bash
cargo test -p storage-ttl-manager --lib
cargo test --lib storage_ttl
```

## References

- Soroban storage model: `frontend/src/lib/soroban-storage-model.ts`
- Content system example: `contracts/content_management_system/src/storage.rs`
- SDK: `soroban-sdk 26.1.0` — `Storage::extend_ttl`, `Storage::temporary`
