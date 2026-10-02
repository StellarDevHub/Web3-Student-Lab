//! # SC-HARD-16 — Storage TTL Manager: Test Suite
//!
//! Tests verify:
//!  - `set_user_data` / `get_user_data` call `extend_ttl` without panicking.
//!  - `inspect_and_bump` batch-bumps all tracked persistent keys.
//!  - The scratchpad workflow (set → get → clear) works correctly.
//!  - Calling `inspect_and_bump` twice is idempotent.
//!  - Constants meet the acceptance criteria (≥ 100,000 ledger bump target).

use super::*;
use soroban_sdk::{testutils::Address as _, Env};

// ── Helper ────────────────────────────────────────────────────────────────────

fn setup() -> (Env, StorageTTLManagerClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(StorageTTLManager, ());
    let client = StorageTTLManagerClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);
    (env, client, admin)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

/// Writing and reading user data should round-trip correctly, and the
/// TTL extension calls must not panic.
#[test]
fn test_set_and_get_bumps_ttl() {
    let (env, client, _) = setup();
    let user = Address::generate(&env);

    client.set_user_data(&user, &42);
    let val = client.get_user_data(&user);
    assert_eq!(val, Some(42));

    // Reading again should still auto-bump without panic.
    let val2 = client.get_user_data(&user);
    assert_eq!(val2, Some(42));
}

/// After writing two users, `inspect_and_bump` should report at least two
/// tracked entries and bump them all without error.
#[test]
fn test_inspect_and_bump() {
    let (env, client, _) = setup();
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);

    client.set_user_data(&user1, &10);
    client.set_user_data(&user2, &20);

    let count = client.inspect_and_bump();
    assert!(count >= 2, "expected at least 2 tracked keys, got {count}");

    let keys = client.get_tracked_keys();
    assert_eq!(keys.len(), 2);
}

/// Scratchpad set → get → clear lifecycle.
#[test]
fn test_scratchpad_workflow() {
    let (env, client, _) = setup();
    let key = Symbol::new(&env, "calc");

    client.scratchpad_set(&key, &100);
    assert_eq!(client.scratchpad_get(&key), Some(100));

    let sum = client.scratchpad_sum(&50, &25, &Symbol::new(&env, "tmp"));
    assert_eq!(sum, 75);

    // `scratchpad_sum` clears the temp entry on completion.
    assert_eq!(client.scratchpad_get(&Symbol::new(&env, "tmp")), None);

    client.scratchpad_clear(&key);
    assert_eq!(client.scratchpad_get(&key), None);
}

/// Constants must meet the acceptance criteria: bump targets must exceed
/// 100,000 ledgers.
#[test]
fn test_threshold_and_bump_constants_meet_acceptance_criteria() {
    let (_env, client, _) = setup();

    assert_eq!(
        client.threshold(),
        10_000,
        "threshold must be 10,000 ledgers"
    );

    let bump = client.bump_amount();
    assert!(
        bump >= 100_000,
        "persistent bump must be ≥ 100,000 ledgers (got {bump})"
    );

    let instance_bump = client.instance_bump_amount();
    assert!(
        instance_bump >= 100_000,
        "instance bump must be ≥ 100,000 ledgers (got {instance_bump})"
    );

    // Verify the exact values match the 30-day target.
    assert_eq!(bump, 518_400);
    assert_eq!(instance_bump, 518_400);
}

/// Calling `inspect_and_bump` twice must produce the same count — the
/// operation is idempotent.
#[test]
fn test_auto_bump_is_idempotent() {
    let (env, client, _) = setup();
    let user = Address::generate(&env);

    client.set_user_data(&user, &1);

    let c1 = client.inspect_and_bump();
    let c2 = client.inspect_and_bump();
    assert_eq!(c1, c2, "inspect_and_bump must be idempotent");
}

/// `get_user_data` on a non-existent key should return `None`.
#[test]
fn test_get_missing_user_data_returns_none() {
    let (env, client, _) = setup();
    let user = Address::generate(&env);

    let val = client.get_user_data(&user);
    assert_eq!(val, None);
}

/// The scratchpad sum function handles zero and negative values.
#[test]
fn test_scratchpad_sum_edge_cases() {
    let (env, client, _) = setup();

    assert_eq!(
        client.scratchpad_sum(&0, &0, &Symbol::new(&env, "z")),
        0
    );
    assert_eq!(
        client.scratchpad_sum(&-10, &10, &Symbol::new(&env, "neg")),
        0
    );
    assert_eq!(
        client.scratchpad_sum(&i128::MAX / 2, &1, &Symbol::new(&env, "big")),
        i128::MAX / 2 + 1
    );
}
