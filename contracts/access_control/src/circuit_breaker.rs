//! Reusable two-tier emergency circuit breaker.
//!
//! A designated guardian (or the admin) can pause a contract instantly, but
//! resuming requires the admin — the "security council" — to propose the
//! unpause and wait out [`UNPAUSE_TIMELOCK_SECONDS`]. This keeps a compromised
//! guardian from flipping the protocol back on during an incident while still
//! allowing a single operator to stop the bleeding immediately.
//!
//! Consuming contracts initialise the breaker once, gate state-mutating
//! entrypoints with [`crate::require_not_paused!`], and deliberately leave
//! emergency-exit paths ungated.
//!
//! State lives under a dedicated key namespace so it cannot collide with the
//! host contract's own storage.

use crate::AcError;
use soroban_sdk::{contracttype, panic_with_error, symbol_short, Address, Env};

/// Delay between proposing and executing an unpause: 24 hours.
pub const UNPAUSE_TIMELOCK_SECONDS: u64 = 24 * 60 * 60;

const CB_TOPIC: soroban_sdk::Symbol = symbol_short!("CB");

#[contracttype]
#[derive(Clone)]
enum BreakerKey {
    Admin,
    Guardian,
    Paused,
    UnpauseUnlockAt,
}

/// Initialise the breaker for the calling contract.
///
/// The caller (the host contract's `initialize`) is responsible for
/// authenticating `admin`; this function only stores the hierarchy. The admin
/// is also the initial guardian so a fresh deployment can always pause.
pub fn initialize(env: &Env, admin: &Address, guardian: &Address) {
    env.storage().instance().set(&BreakerKey::Admin, admin);
    env.storage()
        .instance()
        .set(&BreakerKey::Guardian, guardian);
    env.storage().instance().set(&BreakerKey::Paused, &false);
    env.storage()
        .instance()
        .remove(&BreakerKey::UnpauseUnlockAt);
}

/// Returns the configured breaker admin, if initialised.
pub fn admin(env: &Env) -> Option<Address> {
    env.storage().instance().get(&BreakerKey::Admin)
}

/// Returns the configured guardian, if any.
pub fn guardian(env: &Env) -> Option<Address> {
    env.storage().instance().get(&BreakerKey::Guardian)
}

/// Replace the guardian. Admin only; a new guardian can pause but never unpause.
pub fn set_guardian(env: &Env, caller: &Address, new_guardian: &Address) {
    require_admin(env, caller);
    env.storage()
        .instance()
        .set(&BreakerKey::Guardian, new_guardian);
    env.events().publish(
        (CB_TOPIC, symbol_short!("guardian")),
        (caller.clone(), new_guardian.clone()),
    );
}

/// Pause immediately. The admin and the guardian may call this; anyone else is
/// rejected. Re-pausing clears any pending unpause so the timelock restarts.
pub fn pause(env: &Env, caller: &Address) {
    caller.require_auth();
    let is_admin = admin(env).as_ref() == Some(caller);
    let is_guardian = guardian(env).as_ref() == Some(caller);
    if !is_admin && !is_guardian {
        panic_with_error!(env, AcError::Unauthorized);
    }
    env.storage().instance().set(&BreakerKey::Paused, &true);
    env.storage()
        .instance()
        .remove(&BreakerKey::UnpauseUnlockAt);
    env.events()
        .publish((CB_TOPIC, symbol_short!("pause")), (caller.clone(), true));
}

/// Schedule an unpause and return the timestamp at which it becomes executable.
///
/// Admin only. Requires the contract to be paused, otherwise there is nothing
/// to resume and the call likely indicates a mistaken operator.
pub fn propose_unpause(env: &Env, caller: &Address) -> u64 {
    require_admin(env, caller);
    if !is_paused(env) {
        panic_with_error!(env, AcError::NotPaused);
    }
    let unlock_at = env
        .ledger()
        .timestamp()
        .checked_add(UNPAUSE_TIMELOCK_SECONDS)
        .unwrap_or_else(|| panic_with_error!(env, AcError::Overflow));
    env.storage()
        .instance()
        .set(&BreakerKey::UnpauseUnlockAt, &unlock_at);
    env.events().publish(
        (CB_TOPIC, symbol_short!("propose")),
        (caller.clone(), unlock_at),
    );
    unlock_at
}

/// Resume the contract. Admin only, and only after the unpause proposal has
/// passed its timelock. A guardian can never unpause.
pub fn unpause(env: &Env, caller: &Address) {
    require_admin(env, caller);
    if !is_paused(env) {
        panic_with_error!(env, AcError::NotPaused);
    }
    let unlock_at: u64 = env
        .storage()
        .instance()
        .get(&BreakerKey::UnpauseUnlockAt)
        .unwrap_or_else(|| panic_with_error!(env, AcError::NoPendingUnpause));
    if env.ledger().timestamp() < unlock_at {
        panic_with_error!(env, AcError::TimelockNotExpired);
    }
    env.storage().instance().set(&BreakerKey::Paused, &false);
    env.storage()
        .instance()
        .remove(&BreakerKey::UnpauseUnlockAt);
    env.events().publish(
        (CB_TOPIC, symbol_short!("unpause")),
        (caller.clone(), false),
    );
}

/// Cancel a pending unpause while remaining paused. Admin only.
pub fn cancel_unpause(env: &Env, caller: &Address) {
    require_admin(env, caller);
    if !env.storage().instance().has(&BreakerKey::UnpauseUnlockAt) {
        panic_with_error!(env, AcError::NoPendingUnpause);
    }
    env.storage()
        .instance()
        .remove(&BreakerKey::UnpauseUnlockAt);
    env.events()
        .publish((CB_TOPIC, symbol_short!("cancel")), (caller.clone(), true));
}

/// Returns the timestamp at which a pending unpause becomes executable.
pub fn unpause_unlock_at(env: &Env) -> Option<u64> {
    env.storage().instance().get(&BreakerKey::UnpauseUnlockAt)
}

/// Returns true while the breaker is active.
pub fn is_paused(env: &Env) -> bool {
    env.storage()
        .instance()
        .get(&BreakerKey::Paused)
        .unwrap_or(false)
}

/// Panics with [`AcError::ContractPaused`] while the breaker is active.
pub fn assert_not_paused(env: &Env) {
    if is_paused(env) {
        panic_with_error!(env, AcError::ContractPaused);
    }
}

fn require_admin(env: &Env, caller: &Address) {
    caller.require_auth();
    if admin(env).as_ref() != Some(caller) {
        panic_with_error!(env, AcError::Unauthorized);
    }
}
