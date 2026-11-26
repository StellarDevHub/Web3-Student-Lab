use crate::AcError;
use soroban_sdk::{contracttype, symbol_short, Address, Env};

/// Roles supported by the shared access-control module.
///
/// `Operator` and `Guardian` remain available for contracts using the older
/// access-control API. New integrations should use Instructor, Minter, and
/// Auditor for application-specific permissions.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Role {
    Admin,
    Instructor,
    Minter,
    Auditor,
    Operator,
    Guardian,
}

#[contracttype]
#[derive(Clone)]
pub(crate) enum StorageKey {
    Admin,
    RoleMember(Role, Address),
}

/// Initializes access control once. Repeated calls never replace the admin.
pub fn initialize(env: &Env, initial_admin: &Address) {
    let key = StorageKey::Admin;
    if env.storage().instance().has(&key) {
        return;
    }
    initial_admin.require_auth();
    env.storage().instance().set(&key, initial_admin);
    // The admin is the initial guardian; the breaker's unpause timelock lives
    // in `circuit_breaker`.
    crate::circuit_breaker::initialize(env, initial_admin, initial_admin);
    env.events().publish(
        (symbol_short!("AC_ROLE"), Role::Admin),
        (initial_admin.clone(), true, initial_admin.clone()),
    );
}

/// Returns whether `addr` holds `role`.
pub fn has_role(env: &Env, addr: &Address, role: Role) -> bool {
    match role {
        Role::Admin => admin(env).as_ref() == Some(addr),
        _ => env
            .storage()
            .instance()
            .get::<_, bool>(&StorageKey::RoleMember(role, addr.clone()))
            .unwrap_or(false),
    }
}

/// Returns the configured admin, or `None` before initialization.
pub(crate) fn admin(env: &Env) -> Option<Address> {
    env.storage().instance().get(&StorageKey::Admin)
}

pub(crate) fn set_admin(env: &Env, new_admin: &Address) {
    env.storage().instance().set(&StorageKey::Admin, new_admin);
}

/// Grant a non-admin role to `account`. Admin ownership only changes through
/// the timelocked `propose_admin` / `claim_admin` flow.
pub fn grant_role(env: &Env, caller: &Address, role: Role, account: &Address) {
    caller.require_auth();
    crate::require_admin(env, caller);
    if role == Role::Admin {
        soroban_sdk::panic_with_error!(env, AcError::InvalidRole);
    }
    let key = StorageKey::RoleMember(role, account.clone());
    if env
        .storage()
        .instance()
        .get::<_, bool>(&key)
        .unwrap_or(false)
    {
        soroban_sdk::panic_with_error!(env, AcError::AlreadyHasRole);
    }
    env.storage().instance().set(&key, &true);
    env.events().publish(
        (symbol_short!("AC_ROLE"), role),
        (account.clone(), true, caller.clone()),
    );
}

/// Revoke a non-admin role from `account`.
pub fn revoke_role(env: &Env, caller: &Address, role: Role, account: &Address) {
    caller.require_auth();
    crate::require_admin(env, caller);
    if role == Role::Admin {
        soroban_sdk::panic_with_error!(env, AcError::InvalidRole);
    }
    let key = StorageKey::RoleMember(role, account.clone());
    if !env
        .storage()
        .instance()
        .get::<_, bool>(&key)
        .unwrap_or(false)
    {
        soroban_sdk::panic_with_error!(env, AcError::RoleNotGranted);
    }
    env.storage().instance().remove(&key);
    env.events().publish(
        (symbol_short!("AC_ROLE"), role),
        (account.clone(), false, caller.clone()),
    );
}
