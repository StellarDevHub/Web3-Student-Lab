//! Reentrancy Guard & Security Primitives Module – Issue #511
//!
//! Reusable security building blocks for Soroban smart contracts.
//!
//! ## Reentrancy Guard
//! Soroban's host prevents same-contract reentrancy for cross-contract calls
//! at the protocol level, but an explicit mutex-style guard adds auditable
//! defence-in-depth and catches any future host-model changes.
//!
//! Typical inline usage pattern inside a protected contract function:
//! ```ignore
//! nonreentrant_acquire(&env, symbol_short!("lock"));
//! // … perform state changes and external token calls …
//! nonreentrant_release(&env, symbol_short!("lock"));
//! ```
//!
//! ## Safe Arithmetic
//! All arithmetic helpers use Rust's `checked_*` methods and panic with a
//! typed [`SecurityError`] rather than a silent wrap-around or a generic panic.
//!
//! ## Role-Based Access Control
//! Roles are `u32` identifiers. An admin grants/revokes them. Other modules
//! call [`has_role`] inline for lightweight permission checks.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, Address,
    Env, Symbol,
};

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone)]
pub enum SecurityKey {
    /// Admin address controlling role management.
    Admin,
    /// Global reentrancy mutex. `true` == locked.
    Lock,
    /// Role membership: (role_id, holder) → bool.
    Role(u32, Address),
}

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum SecurityError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    /// Reentrant call detected – the mutex was already held.
    Reentrant = 4,
    Overflow = 5,
    Underflow = 6,
    DivisionByZero = 7,
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

/// Standalone demonstration contract exposing all security primitives via
/// on-chain entry points. Other modules import the free functions below.
#[contract]
pub struct SecurityPrimitivesContract;

#[contractimpl]
impl SecurityPrimitivesContract {
    /// Initialise the contract. Must be called exactly once.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&SecurityKey::Admin) {
            panic_with_error!(&env, SecurityError::AlreadyInitialized);
        }
        env.storage().instance().set(&SecurityKey::Admin, &admin);
        env.storage().instance().set(&SecurityKey::Lock, &false);
        env.events().publish((symbol_short!("sec_init"),), admin);
    }

    // -----------------------------------------------------------------------
    // Reentrancy guard
    // -----------------------------------------------------------------------

    /// Acquire the global reentrancy lock. Panics with [`SecurityError::Reentrant`]
    /// if already held.
    pub fn acquire_lock(env: Env) {
        Self::assert_initialized(&env);
        nonreentrant_acquire(&env, symbol_short!("Lock"));
        env.events().publish((symbol_short!("lck_acq"),), ());
    }

    /// Release the global reentrancy lock. Must follow every successful
    /// `acquire_lock`.
    pub fn release_lock(env: Env) {
        nonreentrant_release(&env, symbol_short!("Lock"));
        env.events().publish((symbol_short!("lck_rel"),), ());
    }

    /// Returns `true` if the reentrancy lock is currently held.
    pub fn is_locked(env: Env) -> bool {
        env.storage()
            .instance()
            .get::<Symbol, bool>(&symbol_short!("Lock"))
            .unwrap_or(false)
    }

    // -----------------------------------------------------------------------
    // Role-based access control
    // -----------------------------------------------------------------------

    /// Grant `role_id` to `account`. Only the admin may call.
    pub fn grant_role(env: Env, caller: Address, role_id: u32, account: Address) {
        caller.require_auth();
        Self::assert_admin(&env, &caller);
        env.storage()
            .persistent()
            .set(&SecurityKey::Role(role_id, account.clone()), &true);
        env.events()
            .publish((symbol_short!("grnt_rol"), role_id), account);
    }

    /// Revoke `role_id` from `account`. Only the admin may call.
    pub fn revoke_role(env: Env, caller: Address, role_id: u32, account: Address) {
        caller.require_auth();
        Self::assert_admin(&env, &caller);
        env.storage()
            .persistent()
            .set(&SecurityKey::Role(role_id, account.clone()), &false);
        env.events()
            .publish((symbol_short!("revk_rol"), role_id), account);
    }

    /// Returns `true` if `account` holds `role_id`.
    pub fn has_role(env: Env, role_id: u32, account: Address) -> bool {
        has_role(&env, role_id, &account)
    }

    // -----------------------------------------------------------------------
    // Safe arithmetic entry points
    // -----------------------------------------------------------------------

    /// Overflow-safe `i128` addition.
    pub fn safe_add(env: Env, a: i128, b: i128) -> i128 {
        safe_add(&env, a, b)
    }

    /// Underflow-safe `i128` subtraction.
    pub fn safe_sub(env: Env, a: i128, b: i128) -> i128 {
        safe_sub(&env, a, b)
    }

    /// Overflow-safe `i128` multiplication.
    pub fn safe_mul(env: Env, a: i128, b: i128) -> i128 {
        safe_mul(&env, a, b)
    }

    /// Safe integer division – panics on zero divisor.
    pub fn safe_div(env: Env, a: i128, b: i128) -> i128 {
        safe_div(&env, a, b)
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    fn assert_initialized(env: &Env) {
        if !env.storage().instance().has(&SecurityKey::Admin) {
            panic_with_error!(env, SecurityError::NotInitialized);
        }
    }

    fn assert_admin(env: &Env, caller: &Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&SecurityKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, SecurityError::NotInitialized));
        if *caller != admin {
            panic_with_error!(env, SecurityError::Unauthorized);
        }
    }
}

// ---------------------------------------------------------------------------
// Free-function utilities (import these into other modules as needed)
// ---------------------------------------------------------------------------

/// Acquire a reentrancy lock stored under `lock_key` in instance storage.
///
/// Panics with [`SecurityError::Reentrant`] if the lock is already held.
/// Always pair with [`nonreentrant_release`].
pub fn nonreentrant_acquire(env: &Env, lock_key: Symbol) {
    let locked: bool = env
        .storage()
        .instance()
        .get::<Symbol, bool>(&lock_key)
        .unwrap_or(false);
    if locked {
        panic_with_error!(env, SecurityError::Reentrant);
    }
    env.storage().instance().set(&lock_key, &true);
}

/// Release the lock previously acquired by [`nonreentrant_acquire`].
pub fn nonreentrant_release(env: &Env, lock_key: Symbol) {
    env.storage().instance().set(&lock_key, &false);
}

/// Overflow-safe `i128` addition. Panics with [`SecurityError::Overflow`].
pub fn safe_add(env: &Env, a: i128, b: i128) -> i128 {
    a.checked_add(b)
        .unwrap_or_else(|| panic_with_error!(env, SecurityError::Overflow))
}

/// Underflow-safe `i128` subtraction. Panics with [`SecurityError::Underflow`].
pub fn safe_sub(env: &Env, a: i128, b: i128) -> i128 {
    a.checked_sub(b)
        .unwrap_or_else(|| panic_with_error!(env, SecurityError::Underflow))
}

/// Overflow-safe `i128` multiplication. Panics with [`SecurityError::Overflow`].
pub fn safe_mul(env: &Env, a: i128, b: i128) -> i128 {
    a.checked_mul(b)
        .unwrap_or_else(|| panic_with_error!(env, SecurityError::Overflow))
}

/// Safe integer division. Panics with [`SecurityError::DivisionByZero`] when `b == 0`.
pub fn safe_div(env: &Env, a: i128, b: i128) -> i128 {
    if b == 0 {
        panic_with_error!(env, SecurityError::DivisionByZero);
    }
    a / b
}

/// Returns `true` if `account` holds `role_id` in the contract's persistent storage.
pub fn has_role(env: &Env, role_id: u32, account: &Address) -> bool {
    env.storage()
        .persistent()
        .get::<SecurityKey, bool>(&SecurityKey::Role(role_id, account.clone()))
        .unwrap_or(false)
}

/// Integer square root (floor) via Newton's method – O(log n) iterations.
///
/// Returns the largest `k` such that `k² ≤ n`. Used by the quadratic voting
/// module: `vote_weight = isqrt(credits_spent)`.
pub fn isqrt(n: u128) -> u128 {
    if n == 0 {
        return 0;
    }
    // Guard against (n + 1) overflowing when n == u128::MAX.
    // isqrt(2^128 - 1) = 2^64 - 1 = u64::MAX.
    if n == u128::MAX {
        return u64::MAX as u128;
    }
    let mut x = n;
    let mut y = (x + 1) / 2;
    while y < x {
        x = y;
        y = (x + n / x) / 2;
    }
    x
}
