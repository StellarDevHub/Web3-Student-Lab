#![cfg(test)]

use crate::oracle_aggregator::{
    AggregatedPrice, OracleAggregatorContract, OracleAggregatorContractClient, OracleError,
    PriceSubmission,
};
use soroban_sdk::{
    symbol_short,
    testutils::{Address as _, Ledger},
    Address, Env, Symbol,
};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

fn setup() -> (Env, Address, OracleAggregatorContractClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(OracleAggregatorContract, ());
    let client = OracleAggregatorContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    (env, admin, client)
}

fn pair(env: &Env) -> Symbol {
    symbol_short!("XLMUSD")
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

#[test]
fn test_initialize() {
    let (env, admin, client) = setup();
    client.initialize(&admin);

    assert_eq!(client.get_staleness(), 300);
    assert_eq!(client.get_min_sources(), 1);
    assert_eq!(client.get_oracles().len(), 0);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn test_double_init_panics() {
    let (env, admin, client) = setup();
    client.initialize(&admin);
    client.initialize(&admin);
}

// ---------------------------------------------------------------------------
// Oracle node management
// ---------------------------------------------------------------------------

#[test]
fn test_register_and_remove_oracle() {
    let (env, admin, client) = setup();
    client.initialize(&admin);

    let oracle_a = Address::generate(&env);
    let oracle_b = Address::generate(&env);

    client.register_oracle(&admin, &oracle_a);
    client.register_oracle(&admin, &oracle_b);

    let oracles = client.get_oracles();
    assert_eq!(oracles.len(), 2);

    client.remove_oracle(&admin, &oracle_a);
    let oracles = client.get_oracles();
    assert_eq!(oracles.len(), 1);
    assert_eq!(oracles.get(0).unwrap(), oracle_b);
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn test_register_duplicate_oracle() {
    let (env, admin, client) = setup();
    client.initialize(&admin);

    let oracle = Address::generate(&env);
    client.register_oracle(&admin, &oracle);
    client.register_oracle(&admin, &oracle);
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn test_remove_nonexistent_oracle() {
    let (env, admin, client) = setup();
    client.initialize(&admin);

    let oracle = Address::generate(&env);
    client.remove_oracle(&admin, &oracle);
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_register_oracle_unauthorized() {
    let (env, admin, client) = setup();
    client.initialize(&admin);

    let not_admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    client.register_oracle(&not_admin, &oracle);
}

// ---------------------------------------------------------------------------
// Price submission
// ---------------------------------------------------------------------------

#[test]
fn test_submit_price() {
    let (env, admin, client) = setup();
    client.initialize(&admin);

    let oracle = Address::generate(&env);
    client.register_oracle(&admin, &oracle);

    env.ledger().set_timestamp(1000);

    let p = pair(&env);
    client.submit_price(&oracle, &p, &100_000_000);

    let raw = client.get_raw_prices(&p);
    assert_eq!(raw.len(), 1);
    assert_eq!(raw.get(0).unwrap().price, 100_000_000);
    assert_eq!(raw.get(0).unwrap().timestamp, 1000);
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn test_submit_price_unauthorized() {
    let (env, admin, client) = setup();
    client.initialize(&admin);

    let not_oracle = Address::generate(&env);
    let p = pair(&env);
    client.submit_price(&not_oracle, &p, &100_000_000);
}

#[test]
#[should_panic(expected = "Error(Contract, #6)")]
fn test_submit_invalid_price() {
    let (env, admin, client) = setup();
    client.initialize(&admin);

    let oracle = Address::generate(&env);
    client.register_oracle(&admin, &oracle);

    let p = pair(&env);
    client.submit_price(&oracle, &p, &0);
}

// ---------------------------------------------------------------------------
// Median calculation
// ---------------------------------------------------------------------------

#[test]
fn test_get_median_odd_count() {
    let (env, admin, client) = setup();
    client.initialize(&admin);

    let o1 = Address::generate(&env);
    let o2 = Address::generate(&env);
    let o3 = Address::generate(&env);
    client.register_oracle(&admin, &o1);
    client.register_oracle(&admin, &o2);
    client.register_oracle(&admin, &o3);

    env.ledger().set_timestamp(1000);

    let p = pair(&env);
    client.submit_price(&o1, &p, &100);
    client.submit_price(&o2, &p, &200);
    client.submit_price(&o3, &p, &150);

    let result = client.get_price(&p);
    // Sorted: [100, 150, 200], median = 150
    assert_eq!(result.median_price, 150);
    assert_eq!(result.num_sources, 3);
}

#[test]
fn test_get_median_even_count() {
    let (env, admin, client) = setup();
    client.initialize(&admin);

    let o1 = Address::generate(&env);
    let o2 = Address::generate(&env);
    let o3 = Address::generate(&env);
    let o4 = Address::generate(&env);
    client.register_oracle(&admin, &o1);
    client.register_oracle(&admin, &o2);
    client.register_oracle(&admin, &o3);
    client.register_oracle(&admin, &o4);

    env.ledger().set_timestamp(1000);

    let p = pair(&env);
    client.submit_price(&o1, &p, &100);
    client.submit_price(&o2, &p, &200);
    client.submit_price(&o3, &p, &300);
    client.submit_price(&o4, &p, &400);

    let result = client.get_price(&p);
    // Sorted: [100, 200, 300, 400], median = (200+300)/2 = 250
    assert_eq!(result.median_price, 250);
    assert_eq!(result.num_sources, 4);
}

// ---------------------------------------------------------------------------
// Staleness
// ---------------------------------------------------------------------------

#[test]
fn test_stale_data_rejected() {
    let (env, admin, client) = setup();
    client.initialize(&admin);

    let o1 = Address::generate(&env);
    let o2 = Address::generate(&env);
    let o3 = Address::generate(&env);
    client.register_oracle(&admin, &o1);
    client.register_oracle(&admin, &o2);
    client.register_oracle(&admin, &o3);

    let p = pair(&env);

    // o1 submits at t=100 (will become stale)
    env.ledger().set_timestamp(100);
    client.submit_price(&o1, &p, &999_999);

    // o2 and o3 submit at t=500 (fresh)
    env.ledger().set_timestamp(500);
    client.submit_price(&o2, &p, &200);
    client.submit_price(&o3, &p, &300);

    // Query at t=500. Staleness=300, so cutoff=200. o1's t=100 < 200 -> stale.
    let result = client.get_price(&p);
    assert_eq!(result.num_sources, 2);
    assert_eq!(result.median_price, 250); // (200+300)/2
}

#[test]
#[should_panic(expected = "Error(Contract, #7)")]
fn test_all_stale_reverts() {
    let (env, admin, client) = setup();
    client.initialize(&admin);

    let o1 = Address::generate(&env);
    client.register_oracle(&admin, &o1);

    let p = pair(&env);

    // Submit at t=0
    env.ledger().set_timestamp(0);
    client.submit_price(&o1, &p, &100);

    // Query at t=1000 (staleness=300, cutoff=700, submission at 0 is stale)
    env.ledger().set_timestamp(1000);
    client.get_price(&p);
}

// ---------------------------------------------------------------------------
// Outlier rejection
// ---------------------------------------------------------------------------

#[test]
fn test_outlier_rejection() {
    let (env, admin, client) = setup();
    client.initialize(&admin);

    let o1 = Address::generate(&env);
    let o2 = Address::generate(&env);
    let o3 = Address::generate(&env);
    let o4 = Address::generate(&env);
    let o5 = Address::generate(&env);
    client.register_oracle(&admin, &o1);
    client.register_oracle(&admin, &o2);
    client.register_oracle(&admin, &o3);
    client.register_oracle(&admin, &o4);
    client.register_oracle(&admin, &o5);

    env.ledger().set_timestamp(1000);
    let p = pair(&env);

    // 4 oracles report ~100, one extreme outlier at 10000
    client.submit_price(&o1, &p, &100);
    client.submit_price(&o2, &p, &102);
    client.submit_price(&o3, &p, &98);
    client.submit_price(&o4, &p, &101);
    client.submit_price(&o5, &p, &10000); // outlier

    let result = client.get_price(&p);
    // The outlier (10000) should be rejected by MAD filtering.
    // Remaining prices: [98, 100, 101, 102], median = (100+101)/2 = 100
    assert_eq!(result.num_sources, 4);
    assert_eq!(result.median_price, 100);
}

// ---------------------------------------------------------------------------
// Min sources
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected = "Error(Contract, #7)")]
fn test_min_sources_enforced() {
    let (env, admin, client) = setup();
    client.initialize(&admin);

    // Require 3 sources minimum
    client.set_min_sources(&admin, &3);

    let o1 = Address::generate(&env);
    let o2 = Address::generate(&env);
    client.register_oracle(&admin, &o1);
    client.register_oracle(&admin, &o2);

    env.ledger().set_timestamp(1000);
    let p = pair(&env);
    client.submit_price(&o1, &p, &100);
    client.submit_price(&o2, &p, &200);

    // Only 2 sources, but min is 3 -> should panic
    client.get_price(&p);
}

// ---------------------------------------------------------------------------
// Oracle overwrite
// ---------------------------------------------------------------------------

#[test]
fn test_oracle_overwrite() {
    let (env, admin, client) = setup();
    client.initialize(&admin);

    let oracle = Address::generate(&env);
    client.register_oracle(&admin, &oracle);

    let p = pair(&env);

    env.ledger().set_timestamp(1000);
    client.submit_price(&oracle, &p, &100);

    env.ledger().set_timestamp(1100);
    client.submit_price(&oracle, &p, &200);

    let raw = client.get_raw_prices(&p);
    assert_eq!(raw.len(), 1);
    assert_eq!(raw.get(0).unwrap().price, 200);
    assert_eq!(raw.get(0).unwrap().timestamp, 1100);
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

#[test]
fn test_set_staleness_and_min_sources() {
    let (env, admin, client) = setup();
    client.initialize(&admin);

    client.set_staleness(&admin, &600);
    assert_eq!(client.get_staleness(), 600);

    client.set_min_sources(&admin, &5);
    assert_eq!(client.get_min_sources(), 5);
}

#[test]
#[should_panic(expected = "Error(Contract, #9)")]
fn test_set_staleness_zero_panics() {
    let (env, admin, client) = setup();
    client.initialize(&admin);
    client.set_staleness(&admin, &0);
}

#[test]
#[should_panic(expected = "Error(Contract, #9)")]
fn test_set_min_sources_zero_panics() {
    let (env, admin, client) = setup();
    client.initialize(&admin);
    client.set_min_sources(&admin, &0);
}
