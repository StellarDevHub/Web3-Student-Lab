#![cfg(test)]

use crate::security_primitives::{
    isqrt, safe_add, safe_div, safe_mul, safe_sub, SecurityError,
    SecurityPrimitivesContract, SecurityPrimitivesContractClient,
};
use soroban_sdk::{testutils::Address as _, Address, Env};

fn setup() -> (Env, Address, SecurityPrimitivesContractClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(SecurityPrimitivesContract, ());
    let client = SecurityPrimitivesContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    (env, admin, client)
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

#[test]
fn test_initialize_success() {
    let (_, admin, client) = setup();
    client.initialize(&admin);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #1)")]
fn test_initialize_already_initialized() {
    let (_, admin, client) = setup();
    client.initialize(&admin);
    client.initialize(&admin);
}

// ---------------------------------------------------------------------------
// Reentrancy guard
// ---------------------------------------------------------------------------

#[test]
fn test_acquire_and_release_lock() {
    let (_, admin, client) = setup();
    client.initialize(&admin);

    assert!(!client.is_locked());
    client.acquire_lock();
    assert!(client.is_locked());
    client.release_lock();
    assert!(!client.is_locked());
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #4)")]
fn test_acquire_lock_reentrant() {
    let (_, admin, client) = setup();
    client.initialize(&admin);

    client.acquire_lock();
    // Second acquire while lock is held – must panic.
    client.acquire_lock();
}

#[test]
fn test_release_without_acquire_is_noop() {
    let (_, admin, client) = setup();
    client.initialize(&admin);

    // Releasing an unheld lock must not panic.
    client.release_lock();
    assert!(!client.is_locked());
}

#[test]
fn test_lock_reacquirable_after_release() {
    let (_, admin, client) = setup();
    client.initialize(&admin);

    client.acquire_lock();
    client.release_lock();
    // Should succeed without panic.
    client.acquire_lock();
    assert!(client.is_locked());
}

// ---------------------------------------------------------------------------
// Role-based access control
// ---------------------------------------------------------------------------

#[test]
fn test_grant_and_check_role() {
    let (env, admin, client) = setup();
    client.initialize(&admin);

    let user = Address::generate(&env);
    assert!(!client.has_role(&1u32, &user));
    client.grant_role(&admin, &1u32, &user);
    assert!(client.has_role(&1u32, &user));
}

#[test]
fn test_revoke_role() {
    let (env, admin, client) = setup();
    client.initialize(&admin);

    let user = Address::generate(&env);
    client.grant_role(&admin, &2u32, &user);
    assert!(client.has_role(&2u32, &user));
    client.revoke_role(&admin, &2u32, &user);
    assert!(!client.has_role(&2u32, &user));
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #3)")]
fn test_grant_role_unauthorized() {
    let (env, admin, client) = setup();
    client.initialize(&admin);

    let attacker = Address::generate(&env);
    let victim = Address::generate(&env);
    client.grant_role(&attacker, &1u32, &victim);
}

#[test]
fn test_roles_are_independent_per_address() {
    let (env, admin, client) = setup();
    client.initialize(&admin);

    let user_a = Address::generate(&env);
    let user_b = Address::generate(&env);
    client.grant_role(&admin, &10u32, &user_a);

    assert!(client.has_role(&10u32, &user_a));
    assert!(!client.has_role(&10u32, &user_b));
    assert!(!client.has_role(&11u32, &user_a));
}

// ---------------------------------------------------------------------------
// Safe arithmetic – on-chain entry points
// ---------------------------------------------------------------------------

#[test]
fn test_safe_add_normal() {
    let (_, admin, client) = setup();
    client.initialize(&admin);
    assert_eq!(client.safe_add(&5_i128, &3_i128), 8);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #5)")]
fn test_safe_add_overflow() {
    let (_, admin, client) = setup();
    client.initialize(&admin);
    client.safe_add(&i128::MAX, &1_i128);
}

#[test]
fn test_safe_sub_normal() {
    let (_, admin, client) = setup();
    client.initialize(&admin);
    assert_eq!(client.safe_sub(&10_i128, &4_i128), 6);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #6)")]
fn test_safe_sub_underflow() {
    let (_, admin, client) = setup();
    client.initialize(&admin);
    client.safe_sub(&i128::MIN, &1_i128);
}

#[test]
fn test_safe_mul_normal() {
    let (_, admin, client) = setup();
    client.initialize(&admin);
    assert_eq!(client.safe_mul(&7_i128, &6_i128), 42);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #5)")]
fn test_safe_mul_overflow() {
    let (_, admin, client) = setup();
    client.initialize(&admin);
    client.safe_mul(&i128::MAX, &2_i128);
}

#[test]
fn test_safe_div_normal() {
    let (_, admin, client) = setup();
    client.initialize(&admin);
    assert_eq!(client.safe_div(&20_i128, &4_i128), 5);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #7)")]
fn test_safe_div_zero() {
    let (_, admin, client) = setup();
    client.initialize(&admin);
    client.safe_div(&10_i128, &0_i128);
}

// ---------------------------------------------------------------------------
// Free-function utilities
// ---------------------------------------------------------------------------

#[test]
fn test_safe_add_free_fn() {
    let env = Env::default();
    assert_eq!(safe_add(&env, 100, 200), 300);
    assert_eq!(safe_add(&env, -50, 50), 0);
}

#[test]
fn test_safe_sub_free_fn() {
    let env = Env::default();
    assert_eq!(safe_sub(&env, 100, 40), 60);
}

#[test]
fn test_safe_mul_free_fn() {
    let env = Env::default();
    assert_eq!(safe_mul(&env, 9, 9), 81);
}

#[test]
fn test_safe_div_free_fn() {
    let env = Env::default();
    assert_eq!(safe_div(&env, 81, 9), 9);
}

#[test]
fn test_isqrt_edge_cases() {
    assert_eq!(isqrt(0), 0);
    assert_eq!(isqrt(1), 1);
    assert_eq!(isqrt(3), 1);   // floor(√3) = 1
    assert_eq!(isqrt(4), 2);
    assert_eq!(isqrt(9), 3);
    assert_eq!(isqrt(16), 4);
    assert_eq!(isqrt(25), 5);
    assert_eq!(isqrt(100), 10);
    assert_eq!(isqrt(99), 9);  // floor(√99) = 9
    assert_eq!(isqrt(u128::MAX), u64::MAX as u128);
}

#[test]
fn test_isqrt_quadratic_voting_property() {
    // Property: isqrt(k*k) == k for all k
    for k in 0u128..=100 {
        assert_eq!(isqrt(k * k), k, "isqrt({k}²) should be {k}");
    }
}
