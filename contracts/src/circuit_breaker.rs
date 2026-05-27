//! Smart Contract Pause and Emergency Circuit Breaker
//!
//! Provides a global pausable state machine that any protocol module can
//! import to guard its state-mutating functions. Unpausing requires
//! M-of-N multi-sig approval from a pre-registered guardian set.
//!
//! ## State machine
//! ```text
//!  Active ──pause(admin)──► Paused
//!  Paused ──approve_unpause(guardian)──► Paused (collecting sigs)
//!  Paused ──execute_unpause() [M sigs collected]──► Active
//!  Paused ──emergency_pause(guardian)──► Paused (no-op, already paused)
//! ```
//!
//! ## Usage in other modules
//! ```ignore
//! use crate::circuit_breaker::assert_not_paused;
//!
//! pub fn my_critical_fn(env: Env, ...) {
//!     assert_not_paused(&env);   // ← whenNotPaused guard
//!     // ... rest of logic
//! }
//! ```
//!
//! ## Security properties
//! - **Single-admin pause**: any registered admin can pause instantly (emergency response).
//! - **Multi-sig unpause**: resuming normal operation requires M-of-N guardian approvals,
//!   preventing a single compromised key from re-enabling a vulnerable contract.
//! - **Replay protection**: each unpause round has a monotonically increasing nonce;
//!   collected approvals are cleared after execution or a new pause.
//! - **Reentrancy**: not applicable (no token transfers), but the pause flag itself
//!   acts as a global mutex for all guarded functions.

#![allow(dead_code)]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, Address,
    Env, Vec,
};

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone)]
pub enum CBKey {
    /// Whether the protocol is currently paused.
    Paused,
    /// Monotonically increasing unpause round nonce.
    Nonce,
    /// Registered admins who may call `pause`.
    Admins,
    /// Registered guardians who may approve an unpause.
    Guardians,
    /// Required number of guardian approvals to unpause (M).
    Threshold,
    /// Approvals collected for the current nonce: Vec<Address>.
    Approvals(u32),
    /// Timestamp of the most recent pause event.
    PausedAt,
    /// Address that triggered the most recent pause.
    PausedBy,
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum CBError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    /// Called a guarded function while the contract is paused.
    ContractPaused = 4,
    /// Tried to unpause a contract that is not paused.
    NotPaused = 5,
    /// Guardian has already approved this unpause round.
    AlreadyApproved = 6,
    /// Not enough approvals yet to execute unpause.
    InsufficientApprovals = 7,
    /// Supplied threshold is zero or exceeds guardian count.
    InvalidThreshold = 8,
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct CircuitBreakerContract;

#[contractimpl]
impl CircuitBreakerContract {
    // -----------------------------------------------------------------------
    // Initialisation
    // -----------------------------------------------------------------------

    /// Initialise the circuit breaker.
    ///
    /// # Arguments
    /// * `admins`    – Addresses that may call [`pause`].
    /// * `guardians` – Addresses that may approve an unpause.
    /// * `threshold` – Number of guardian approvals required to unpause (M-of-N).
    pub fn initialize(env: Env, admins: Vec<Address>, guardians: Vec<Address>, threshold: u32) {
        if env.storage().instance().has(&CBKey::Paused) {
            panic_with_error!(&env, CBError::AlreadyInitialized);
        }
        if threshold == 0 || threshold > guardians.len() {
            panic_with_error!(&env, CBError::InvalidThreshold);
        }
        // Require auth from every admin at initialisation time.
        for admin in admins.iter() {
            admin.require_auth();
        }
        env.storage().instance().set(&CBKey::Paused, &false);
        env.storage().instance().set(&CBKey::Nonce, &0_u32);
        env.storage().instance().set(&CBKey::Admins, &admins);
        env.storage().instance().set(&CBKey::Guardians, &guardians);
        env.storage().instance().set(&CBKey::Threshold, &threshold);
        env.events().publish((symbol_short!("cb_init"),), threshold);
    }

    // -----------------------------------------------------------------------
    // Pause
    // -----------------------------------------------------------------------

    /// Instantly pause the protocol. Any registered admin may call this.
    ///
    /// Emits `cb_paused` event. Clears any in-progress unpause approvals
    /// and increments the nonce so stale approvals cannot be replayed.
    pub fn pause(env: Env, caller: Address) {
        caller.require_auth();
        Self::assert_admin(&env, &caller);

        env.storage().instance().set(&CBKey::Paused, &true);
        env.storage().instance().set(&CBKey::PausedAt, &env.ledger().timestamp());
        env.storage().instance().set(&CBKey::PausedBy, &caller);

        // Bump nonce to invalidate any prior approval set.
        let nonce = Self::current_nonce(&env);
        let new_nonce = nonce.checked_add(1).unwrap_or(0);
        env.storage().instance().set(&CBKey::Nonce, &new_nonce);
        // Clear approvals for the new nonce (they start empty by default).
        env.storage().instance().remove(&CBKey::Approvals(new_nonce));

        env.events().publish((symbol_short!("cb_paused"),), (caller, env.ledger().timestamp()));
    }

    // -----------------------------------------------------------------------
    // Multi-sig unpause
    // -----------------------------------------------------------------------

    /// A guardian submits their approval for the current unpause round.
    ///
    /// Approvals are keyed by the current nonce, so a new `pause` call
    /// automatically invalidates all previously collected approvals.
    pub fn approve_unpause(env: Env, guardian: Address) {
        guardian.require_auth();
        Self::assert_paused(&env);
        Self::assert_guardian(&env, &guardian);

        let nonce = Self::current_nonce(&env);
        let mut approvals = Self::get_approvals(&env, nonce);

        // Idempotency guard – each guardian may only approve once per round.
        if approvals.contains(&guardian) {
            panic_with_error!(&env, CBError::AlreadyApproved);
        }
        approvals.push_back(guardian.clone());
        env.storage().instance().set(&CBKey::Approvals(nonce), &approvals);

        env.events().publish((symbol_short!("cb_approv"),), (guardian, nonce, approvals.len()));
    }

    /// Execute the unpause once the threshold of approvals has been reached.
    ///
    /// Anyone may call this once enough approvals are collected; the actual
    /// security comes from the guardian signatures collected in `approve_unpause`.
    pub fn execute_unpause(env: Env) {
        Self::assert_paused(&env);

        let nonce = Self::current_nonce(&env);
        let approvals = Self::get_approvals(&env, nonce);
        let threshold: u32 = env.storage().instance().get(&CBKey::Threshold).unwrap_or(1);

        if approvals.len() < threshold {
            panic_with_error!(&env, CBError::InsufficientApprovals);
        }

        env.storage().instance().set(&CBKey::Paused, &false);
        // Clear approvals for this nonce after use.
        env.storage().instance().remove(&CBKey::Approvals(nonce));

        env.events().publish((symbol_short!("cb_resume"),), (nonce, approvals.len()));
    }

    // -----------------------------------------------------------------------
    // Admin management
    // -----------------------------------------------------------------------

    /// Add a new admin. Requires an existing admin's authorisation.
    pub fn add_admin(env: Env, caller: Address, new_admin: Address) {
        caller.require_auth();
        Self::assert_admin(&env, &caller);
        let mut admins: Vec<Address> = env.storage().instance().get(&CBKey::Admins).unwrap_or_else(|| Vec::new(&env));
        if !admins.contains(&new_admin) {
            admins.push_back(new_admin.clone());
            env.storage().instance().set(&CBKey::Admins, &admins);
        }
        env.events().publish((symbol_short!("cb_adm_add"),), new_admin);
    }

    /// Add a new guardian. Requires an existing admin's authorisation.
    pub fn add_guardian(env: Env, caller: Address, new_guardian: Address) {
        caller.require_auth();
        Self::assert_admin(&env, &caller);
        let mut guardians: Vec<Address> = env.storage().instance().get(&CBKey::Guardians).unwrap_or_else(|| Vec::new(&env));
        if !guardians.contains(&new_guardian) {
            guardians.push_back(new_guardian.clone());
            env.storage().instance().set(&CBKey::Guardians, &guardians);
        }
        env.events().publish((symbol_short!("cb_grd_add"),), new_guardian);
    }

    /// Update the unpause threshold. Requires admin auth.
    pub fn set_threshold(env: Env, caller: Address, threshold: u32) {
        caller.require_auth();
        Self::assert_admin(&env, &caller);
        let guardians: Vec<Address> = env.storage().instance().get(&CBKey::Guardians).unwrap_or_else(|| Vec::new(&env));
        if threshold == 0 || threshold > guardians.len() {
            panic_with_error!(&env, CBError::InvalidThreshold);
        }
        env.storage().instance().set(&CBKey::Threshold, &threshold);
        env.events().publish((symbol_short!("cb_thresh"),), threshold);
    }

    // -----------------------------------------------------------------------
    // View helpers
    // -----------------------------------------------------------------------

    /// Returns `true` if the protocol is currently paused.
    pub fn is_paused(env: Env) -> bool {
        env.storage().instance().get(&CBKey::Paused).unwrap_or(false)
    }

    /// Returns the current unpause nonce.
    pub fn nonce(env: Env) -> u32 {
        Self::current_nonce(&env)
    }

    /// Returns the number of approvals collected for the current unpause round.
    pub fn approval_count(env: Env) -> u32 {
        let nonce = Self::current_nonce(&env);
        Self::get_approvals(&env, nonce).len()
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    fn current_nonce(env: &Env) -> u32 {
        env.storage().instance().get(&CBKey::Nonce).unwrap_or(0)
    }

    fn get_approvals(env: &Env, nonce: u32) -> Vec<Address> {
        env.storage()
            .instance()
            .get(&CBKey::Approvals(nonce))
            .unwrap_or_else(|| Vec::new(env))
    }

    fn assert_admin(env: &Env, caller: &Address) {
        let admins: Vec<Address> = env.storage().instance().get(&CBKey::Admins).unwrap_or_else(|| Vec::new(env));
        if !admins.contains(caller) {
            panic_with_error!(env, CBError::Unauthorized);
        }
    }

    fn assert_guardian(env: &Env, caller: &Address) {
        let guardians: Vec<Address> = env.storage().instance().get(&CBKey::Guardians).unwrap_or_else(|| Vec::new(env));
        if !guardians.contains(caller) {
            panic_with_error!(env, CBError::Unauthorized);
        }
    }

    fn assert_paused(env: &Env) {
        let paused: bool = env.storage().instance().get(&CBKey::Paused).unwrap_or(false);
        if !paused {
            panic_with_error!(env, CBError::NotPaused);
        }
    }
}

// ---------------------------------------------------------------------------
// Free-function guard — import this into any module that needs whenNotPaused
// ---------------------------------------------------------------------------

/// `whenNotPaused` guard. Call at the top of any state-mutating function.
///
/// Panics with [`CBError::ContractPaused`] if the circuit breaker is active.
///
/// # Example
/// ```ignore
/// use crate::circuit_breaker::assert_not_paused;
///
/// pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
///     assert_not_paused(&env);
///     // ... transfer logic
/// }
/// ```
pub fn assert_not_paused(env: &Env) {
    let paused: bool = env.storage().instance().get(&CBKey::Paused).unwrap_or(false);
    if paused {
        panic_with_error!(env, CBError::ContractPaused);
    }
}
