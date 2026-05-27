//! Tests for the Smart Contract Pause and Emergency Circuit Breaker.
//!
//! Coverage:
//! - Initialisation (happy path, double-init, invalid threshold)
//! - Pause (by admin, by non-admin)
//! - approve_unpause (guardian approval, duplicate approval, non-guardian)
//! - execute_unpause (insufficient approvals, exact threshold, 2-of-3)
//! - Nonce replay protection (approvals invalidated after re-pause)
//! - assert_not_paused guard (active vs paused)
//! - Admin/guardian management (add_admin, add_guardian, set_threshold)

#![cfg(test)]

extern crate std;

use soroban_sdk::{
    testutils::Address as _,
    vec, Address, Env,
};

use crate::circuit_breaker::{assert_not_paused, CBError, CircuitBreakerClient};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

struct Setup<'a> {
    env: Env,
    cb: CircuitBreakerClient<'a>,
    admin: Address,
    guardian1: Address,
    guardian2: Address,
    guardian3: Address,
}

impl<'a> Setup<'a> {
    /// 1-of-2 threshold by default; override with `setup_with_threshold`.
    fn new() -> Self {
        Self::with_threshold(1)
    }

    fn with_threshold(threshold: u32) -> Self {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let guardian1 = Address::generate(&env);
        let guardian2 = Address::generate(&env);
        let guardian3 = Address::generate(&env);

        let id = env.register(crate::circuit_breaker::CircuitBreakerContract, ());
        let cb = CircuitBreakerClient::new(&env, &id);

        cb.initialize(
            &vec![&env, admin.clone()],
            &vec![&env, guardian1.clone(), guardian2.clone(), guardian3.clone()],
            &threshold,
        );

        Setup { env, cb, admin, guardian1, guardian2, guardian3 }
    }
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

#[test]
fn test_initialize_ok() {
    let s = Setup::new();
    assert!(!s.cb.is_paused());
    assert_eq!(s.cb.nonce(), 0);
}

#[test]
#[should_panic]
fn test_initialize_twice_panics() {
    let s = Setup::new();
    s.cb.initialize(
        &vec![&s.env, s.admin.clone()],
        &vec![&s.env, s.guardian1.clone()],
        &1,
    );
}

#[test]
#[should_panic]
fn test_initialize_zero_threshold_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let g = Address::generate(&env);
    let id = env.register(crate::circuit_breaker::CircuitBreakerContract, ());
    let cb = CircuitBreakerClient::new(&env, &id);
    cb.initialize(&vec![&env, admin], &vec![&env, g], &0);
}

#[test]
#[should_panic]
fn test_initialize_threshold_exceeds_guardians_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let g = Address::generate(&env);
    let id = env.register(crate::circuit_breaker::CircuitBreakerContract, ());
    let cb = CircuitBreakerClient::new(&env, &id);
    // threshold=2 but only 1 guardian
    cb.initialize(&vec![&env, admin], &vec![&env, g], &2);
}

// ---------------------------------------------------------------------------
// Pause
// ---------------------------------------------------------------------------

#[test]
fn test_pause_by_admin_sets_paused() {
    let s = Setup::new();
    s.cb.pause(&s.admin);
    assert!(s.cb.is_paused());
}

#[test]
fn test_pause_increments_nonce() {
    let s = Setup::new();
    assert_eq!(s.cb.nonce(), 0);
    s.cb.pause(&s.admin);
    assert_eq!(s.cb.nonce(), 1);
}

#[test]
#[should_panic]
fn test_pause_by_non_admin_panics() {
    let s = Setup::new();
    let rogue = Address::generate(&s.env);
    s.cb.pause(&rogue);
}

// ---------------------------------------------------------------------------
// assert_not_paused guard
// ---------------------------------------------------------------------------

#[test]
fn test_assert_not_paused_when_active_ok() {
    let s = Setup::new();
    // Should not panic when not paused.
    assert_not_paused(&s.env);
}

#[test]
#[should_panic]
fn test_assert_not_paused_when_paused_panics() {
    let s = Setup::new();
    s.cb.pause(&s.admin);
    // The guard reads from instance storage of the *same* env.
    assert_not_paused(&s.env);
}

// ---------------------------------------------------------------------------
// approve_unpause
// ---------------------------------------------------------------------------

#[test]
fn test_approve_unpause_increments_count() {
    let s = Setup::new();
    s.cb.pause(&s.admin);
    assert_eq!(s.cb.approval_count(), 0);
    s.cb.approve_unpause(&s.guardian1);
    assert_eq!(s.cb.approval_count(), 1);
}

#[test]
#[should_panic]
fn test_approve_unpause_when_not_paused_panics() {
    let s = Setup::new();
    s.cb.approve_unpause(&s.guardian1);
}

#[test]
#[should_panic]
fn test_approve_unpause_duplicate_panics() {
    let s = Setup::new();
    s.cb.pause(&s.admin);
    s.cb.approve_unpause(&s.guardian1);
    s.cb.approve_unpause(&s.guardian1); // second call must panic
}

#[test]
#[should_panic]
fn test_approve_unpause_non_guardian_panics() {
    let s = Setup::new();
    s.cb.pause(&s.admin);
    let rogue = Address::generate(&s.env);
    s.cb.approve_unpause(&rogue);
}

// ---------------------------------------------------------------------------
// execute_unpause
// ---------------------------------------------------------------------------

#[test]
fn test_execute_unpause_1_of_3_succeeds() {
    let s = Setup::new(); // threshold = 1
    s.cb.pause(&s.admin);
    s.cb.approve_unpause(&s.guardian1);
    s.cb.execute_unpause();
    assert!(!s.cb.is_paused());
}

#[test]
#[should_panic]
fn test_execute_unpause_insufficient_approvals_panics() {
    let s = Setup::with_threshold(2);
    s.cb.pause(&s.admin);
    s.cb.approve_unpause(&s.guardian1); // only 1 of 2 required
    s.cb.execute_unpause();
}

#[test]
fn test_execute_unpause_2_of_3_succeeds() {
    let s = Setup::with_threshold(2);
    s.cb.pause(&s.admin);
    s.cb.approve_unpause(&s.guardian1);
    s.cb.approve_unpause(&s.guardian2);
    s.cb.execute_unpause();
    assert!(!s.cb.is_paused());
}

#[test]
fn test_execute_unpause_3_of_3_succeeds() {
    let s = Setup::with_threshold(3);
    s.cb.pause(&s.admin);
    s.cb.approve_unpause(&s.guardian1);
    s.cb.approve_unpause(&s.guardian2);
    s.cb.approve_unpause(&s.guardian3);
    s.cb.execute_unpause();
    assert!(!s.cb.is_paused());
}

#[test]
#[should_panic]
fn test_execute_unpause_when_not_paused_panics() {
    let s = Setup::new();
    s.cb.execute_unpause();
}

// ---------------------------------------------------------------------------
// Nonce replay protection
// ---------------------------------------------------------------------------

#[test]
fn test_approvals_cleared_after_repause() {
    let s = Setup::with_threshold(2);

    // First pause cycle: collect 1 approval but don't unpause.
    s.cb.pause(&s.admin);
    s.cb.approve_unpause(&s.guardian1);
    assert_eq!(s.cb.approval_count(), 1);

    // Unpause then re-pause (simulating a second incident).
    // To unpause we need 2 approvals; add the second.
    s.cb.approve_unpause(&s.guardian2);
    s.cb.execute_unpause();

    // Re-pause: nonce increments, old approvals are gone.
    s.cb.pause(&s.admin);
    assert_eq!(s.cb.approval_count(), 0, "approvals must be cleared after re-pause");
}

#[test]
fn test_nonce_increments_on_each_pause() {
    let s = Setup::new();
    s.cb.pause(&s.admin);
    let n1 = s.cb.nonce();
    s.cb.approve_unpause(&s.guardian1);
    s.cb.execute_unpause();
    s.cb.pause(&s.admin);
    let n2 = s.cb.nonce();
    assert!(n2 > n1, "nonce must increase on each pause");
}

// ---------------------------------------------------------------------------
// Admin / guardian management
// ---------------------------------------------------------------------------

#[test]
fn test_add_admin_allows_new_admin_to_pause() {
    let s = Setup::new();
    let new_admin = Address::generate(&s.env);
    s.cb.add_admin(&s.admin, &new_admin);
    s.cb.pause(&new_admin);
    assert!(s.cb.is_paused());
}

#[test]
fn test_add_guardian_allows_new_guardian_to_approve() {
    let s = Setup::new();
    let new_guardian = Address::generate(&s.env);
    s.cb.add_guardian(&s.admin, &new_guardian);
    s.cb.pause(&s.admin);
    s.cb.approve_unpause(&new_guardian);
    assert_eq!(s.cb.approval_count(), 1);
}

#[test]
fn test_set_threshold_updates_requirement() {
    let s = Setup::with_threshold(1);
    // Raise threshold to 2.
    s.cb.set_threshold(&s.admin, &2);
    s.cb.pause(&s.admin);
    s.cb.approve_unpause(&s.guardian1);
    // 1 approval is no longer enough.
    // execute_unpause should panic.
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        s.cb.execute_unpause();
    }));
    assert!(result.is_err(), "should panic with insufficient approvals after threshold raise");
}

#[test]
#[should_panic]
fn test_add_admin_by_non_admin_panics() {
    let s = Setup::new();
    let rogue = Address::generate(&s.env);
    s.cb.add_admin(&rogue, &rogue);
}

#[test]
#[should_panic]
fn test_set_threshold_exceeds_guardian_count_panics() {
    let s = Setup::new(); // 3 guardians
    s.cb.set_threshold(&s.admin, &10);
}
