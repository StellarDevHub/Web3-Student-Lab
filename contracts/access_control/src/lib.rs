//! # Access Control — Universal RBAC & Circuit-Breaker Pause (SC-HARD-19)
//!
//! A reusable Soroban library crate providing:
//!
//! * **Role-Based Access Control** — three roles (`Admin`, `Operator`,
//!   `Guardian`) stored in contract instance storage.
//! * **Timelocked role transfers** — `Admin` queues a pending role
//!   assignment; the assignment only becomes effective after a configurable
//!   `unlock_timestamp`.
//! * **Circuit-breaker pause** — `Guardian` (or `Admin`) calls `pause()`
//!   which sets a `PAUSED` flag in instance storage; every state-mutating
//!   caller should call `require_not_paused()` before proceeding.
//!
//! ## Error-code range
//! This crate owns the `300–399` discriminant range.

#![no_std]

use soroban_sdk::{
    contracterror, contracttype, symbol_short, Address, Env, Symbol,
};

// ── Error codes (300–399) ─────────────────────────────────────────────────────

/// Errors emitted by the access-control library.
///
/// Discriminants occupy the `300–399` range reserved for this crate.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum AcError {
    /// `300` — The caller does not have the required role.
    Unauthorized = 300,
    /// `301` — The contract is in circuit-breaker pause mode.
    ContractPaused = 301,
    /// `302` — The role transfer timelock has not yet elapsed.
    TimelockNotExpired = 302,
    /// `303` — No pending role transfer exists for this (role, address) pair.
    NoPendingTransfer = 303,
    /// `304` — The address already holds the requested role.
    AlreadyHasRole = 304,
    /// `305` — Arithmetic overflow in timelock timestamp computation.
    Overflow = 305,
}

// ── Role enum ─────────────────────────────────────────────────────────────────

/// The three supported roles.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Role {
    Admin,
    Operator,
    Guardian,
}

// ── Storage keys ─────────────────────────────────────────────────────────────

/// `PAUSED` flag in instance storage.
pub const PAUSED_KEY: Symbol = symbol_short!("AC_PAUSED");

/// Per-role holder key — stored as `("AC_ROLE", Role)`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum AcKey {
    /// Holder of a given role.
    RoleHolder(Role),
    /// Pending role transfer: (role, candidate) → unlock_timestamp.
    PendingTransfer(Role),
}

// ── Read helpers ──────────────────────────────────────────────────────────────

/// Returns `true` if the contract is currently paused.
pub fn is_paused(env: &Env) -> bool {
    env.storage()
        .instance()
        .get::<Symbol, bool>(&PAUSED_KEY)
        .unwrap_or(false)
}

/// Returns the address currently holding `role`, or `None`.
pub fn role_holder(env: &Env, role: Role) -> Option<Address> {
    env.storage()
        .instance()
        .get::<AcKey, Address>(&AcKey::RoleHolder(role))
}

/// Returns `true` if `addr` holds `role`.
pub fn has_role(env: &Env, addr: &Address, role: Role) -> bool {
    role_holder(env, role).as_ref() == Some(addr)
}

// ── Initialise ────────────────────────────────────────────────────────────────

/// Bootstrap the access-control state: set the initial `Admin`.
///
/// Safe to call at contract initialization. Does nothing if an Admin is
/// already configured (idempotent for upgradeable contracts).
pub fn initialize(env: &Env, admin: &Address) {
    if role_holder(env, Role::Admin).is_none() {
        env.storage()
            .instance()
            .set(&AcKey::RoleHolder(Role::Admin), admin);
        env.storage()
            .instance()
            .set(&PAUSED_KEY, &false);
    }
}

// ── Guard helpers ─────────────────────────────────────────────────────────────

/// Panics with `AcError::ContractPaused` if the circuit-breaker is active.
///
/// Call at the start of every state-mutating entry point (except emergency
/// admin withdrawals which must remain accessible while paused).
#[macro_export]
macro_rules! require_not_paused {
    ($env:expr) => {
        if $crate::is_paused($env) {
            soroban_sdk::panic_with_error!($env, $crate::AcError::ContractPaused);
        }
    };
}

/// Panics with `AcError::Unauthorized` if `addr` does not hold `role`.
#[macro_export]
macro_rules! require_role {
    ($env:expr, $addr:expr, $role:expr) => {
        if !$crate::has_role($env, $addr, $role) {
            soroban_sdk::panic_with_error!($env, $crate::AcError::Unauthorized);
        }
    };
}

// ── Pause / unpause ───────────────────────────────────────────────────────────

/// Guardian (or Admin) pauses the contract.
///
/// Sets the `PAUSED` flag in instance storage. Subsequent calls to
/// `require_not_paused!` in state-mutating entry points will revert.
///
/// # Panics
/// - `AcError::Unauthorized` if `caller` is neither Admin nor Guardian.
pub fn pause(env: &Env, caller: &Address) {
    caller.require_auth();
    let is_admin = has_role(env, caller, Role::Admin);
    let is_guardian = has_role(env, caller, Role::Guardian);
    if !is_admin && !is_guardian {
        soroban_sdk::panic_with_error!(env, AcError::Unauthorized);
    }
    env.storage().instance().set(&PAUSED_KEY, &true);
    env.events()
        .publish((symbol_short!("AC_PAUSE"),), caller.clone());
}

/// Admin unpauses the contract.
///
/// # Panics
/// - `AcError::Unauthorized` if `caller` is not the Admin.
pub fn unpause(env: &Env, caller: &Address) {
    caller.require_auth();
    if !has_role(env, caller, Role::Admin) {
        soroban_sdk::panic_with_error!(env, AcError::Unauthorized);
    }
    env.storage().instance().set(&PAUSED_KEY, &false);
    env.events()
        .publish((symbol_short!("AC_UNPAUSE"),), caller.clone());
}

// ── Role assignment (timelocked) ──────────────────────────────────────────────

/// Admin queues a pending role transfer for `candidate` to receive `role`
/// after `unlock_timestamp` (UNIX seconds).
///
/// The pending transfer is stored as `AcKey::PendingTransfer(role)` →
/// `(candidate, unlock_timestamp)`. Only one pending transfer per role is
/// held at a time; a new call overwrites the previous pending transfer.
///
/// # Panics
/// - `AcError::Unauthorized` if `admin` is not the current Admin.
/// - `AcError::AlreadyHasRole` if `candidate` already holds `role`.
pub fn queue_role_transfer(
    env: &Env,
    admin: &Address,
    role: Role,
    candidate: Address,
    unlock_timestamp: u64,
) {
    admin.require_auth();
    if !has_role(env, admin, Role::Admin) {
        soroban_sdk::panic_with_error!(env, AcError::Unauthorized);
    }
    if has_role(env, &candidate, role) {
        soroban_sdk::panic_with_error!(env, AcError::AlreadyHasRole);
    }
    env.storage()
        .instance()
        .set(&AcKey::PendingTransfer(role), &(candidate.clone(), unlock_timestamp));
    env.events().publish(
        (symbol_short!("AC_QROLE"),),
        (role as u32, candidate, unlock_timestamp),
    );
}

/// Execute a previously queued role transfer once the timelock has elapsed.
///
/// The `candidate` must be the address stored in the pending transfer.
/// After execution the pending transfer entry is removed.
///
/// # Panics
/// - `AcError::NoPendingTransfer` if no transfer was queued for `role`.
/// - `AcError::TimelockNotExpired` if `now < unlock_timestamp`.
pub fn execute_role_transfer(env: &Env, role: Role, candidate: &Address) {
    let pending: Option<(Address, u64)> = env
        .storage()
        .instance()
        .get(&AcKey::PendingTransfer(role));

    let (stored_candidate, unlock_at) = match pending {
        Some(p) => p,
        None => soroban_sdk::panic_with_error!(env, AcError::NoPendingTransfer),
    };

    if candidate != &stored_candidate {
        soroban_sdk::panic_with_error!(env, AcError::NoPendingTransfer);
    }

    let now = env.ledger().timestamp();
    if now < unlock_at {
        soroban_sdk::panic_with_error!(env, AcError::TimelockNotExpired);
    }

    // Apply the transfer.
    env.storage()
        .instance()
        .set(&AcKey::RoleHolder(role), candidate);
    // Clear the pending entry.
    env.storage()
        .instance()
        .remove(&AcKey::PendingTransfer(role));

    env.events().publish(
        (symbol_short!("AC_ROLE"),),
        (role as u32, candidate.clone()),
    );
}

/// Admin revokes a role from its current holder.
///
/// After revocation the role has no holder until it is re-assigned.
///
/// # Panics
/// - `AcError::Unauthorized` if `admin` is not the current Admin.
pub fn revoke_role(env: &Env, admin: &Address, role: Role) {
    admin.require_auth();
    if !has_role(env, admin, Role::Admin) {
        soroban_sdk::panic_with_error!(env, AcError::Unauthorized);
    }
    env.storage()
        .instance()
        .remove(&AcKey::RoleHolder(role));
    env.events()
        .publish((symbol_short!("AC_REVOKE"),), role as u32);
}

/// Directly assign `role` to `addr` without a timelock.
///
/// This is an **admin-only** convenience for the initial bootstrap phase
/// (e.g. assigning `Operator` and `Guardian` at deployment time). For
/// post-deployment changes prefer the timelocked path.
///
/// # Panics
/// - `AcError::Unauthorized` if `admin` is not the current Admin.
pub fn assign_role_direct(env: &Env, admin: &Address, role: Role, addr: Address) {
    admin.require_auth();
    if !has_role(env, admin, Role::Admin) {
        soroban_sdk::panic_with_error!(env, AcError::Unauthorized);
    }
    env.storage()
        .instance()
        .set(&AcKey::RoleHolder(role), &addr);
    env.events()
        .publish((symbol_short!("AC_ASSIGN"),), (role as u32, addr));
}
