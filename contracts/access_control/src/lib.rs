//! Reusable Soroban role-based access control with a 48-hour admin handover.
//!
//! Call these helpers from the owning contract's privileged entrypoints.

#![no_std]

use soroban_sdk::{contracterror, Env};

pub mod circuit_breaker;
pub mod roles;
pub mod timelock;

pub use circuit_breaker::{
    assert_not_paused, cancel_unpause, is_paused, pause, propose_unpause, unpause,
    unpause_unlock_at,
};
pub use roles::{grant_role, has_role, initialize, revoke_role, Role};
pub use timelock::{
    admin, cancel_admin_proposal, claim_admin, pending_admin, propose_admin, AdminProposal,
    ADMIN_HANDOVER_DELAY,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum AcError {
    Unauthorized = 300,
    ContractPaused = 301,
    TimelockNotExpired = 302,
    NoPendingTransfer = 303,
    AlreadyHasRole = 304,
    Overflow = 305,
    RoleNotGranted = 306,
    InvalidRole = 307,
    InvalidAdminProposal = 308,
    NoPendingUnpause = 309,
    NotPaused = 310,
}

/// Panics with `AcError::ContractPaused` if the circuit-breaker is active.
///
/// A second form lets a host contract surface the pause in its own error
/// space: `require_not_paused!(&env, AmmError::ContractPaused)`.
#[macro_export]
macro_rules! require_not_paused {
    ($env:expr) => {
        if $crate::is_paused($env) {
            soroban_sdk::panic_with_error!($env, $crate::AcError::ContractPaused);
        }
    };
    ($env:expr, $error:expr) => {
        if $crate::is_paused($env) {
            soroban_sdk::panic_with_error!($env, $error);
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

/// Panics unless `addr` holds the Admin role.
pub fn require_admin(env: &Env, addr: &soroban_sdk::Address) {
    crate::require_role!(env, addr, Role::Admin);
}

#[cfg(test)]
mod test;
