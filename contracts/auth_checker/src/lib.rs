//! Auth Checker Contract – Lesson 3 – Issue #688
//!
//! Educational contract demonstrating Soroban's `require_auth` pattern for
//! access control. Unauthorized callers are rejected at the SDK level before
//! any state mutation occurs.
//!
//! ## Learning objectives
//! - `address.require_auth()` enforces caller authorization on-chain.
//! - State-mutating functions are gated; read functions are public.
//! - Admin-only mutations make it impossible for arbitrary callers to tamper
//!   with lesson state, satisfying the "unauthorized calls are rejected" criterion.

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, Address,
    Env, String,
};

#[contracttype]
#[derive(Clone)]
pub enum AuthKey {
    Admin,
    LessonValue,
    MutationCount,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum AuthError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
}

#[contract]
pub struct AuthChecker;

#[contractimpl]
impl AuthChecker {
    /// Initialize with an admin address. The lesson value is set to an empty string.
    pub fn init(env: Env, admin: Address) {
        if env.storage().instance().has(&AuthKey::Admin) {
            panic_with_error!(&env, AuthError::AlreadyInitialized);
        }
        env.storage().instance().set(&AuthKey::Admin, &admin);
        env.storage().instance().set(&AuthKey::MutationCount, &0u32);
    }

    /// Set the lesson value. **Requires admin authorization.**
    ///
    /// Calling this without a valid auth entry for `caller` causes Soroban to
    /// revert the transaction before the body executes – a hard on-chain rejection.
    pub fn set_value(env: Env, caller: Address, value: String) {
        // `require_auth` is the core of this lesson: the SDK verifies the caller
        // signed this invocation; if not, the transaction aborts here.
        caller.require_auth();
        Self::assert_admin(&env, &caller);

        env.storage().instance().set(&AuthKey::LessonValue, &value);

        let count: u32 = env
            .storage()
            .instance()
            .get(&AuthKey::MutationCount)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&AuthKey::MutationCount, &(count + 1));

        env.events()
            .publish((symbol_short!("set_val"),), (caller, value));
    }

    /// Read the lesson value. No auth required – anyone may read.
    pub fn get_value(env: Env) -> Option<String> {
        env.storage().instance().get(&AuthKey::LessonValue)
    }

    /// Number of times `set_value` has been called successfully.
    pub fn mutation_count(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&AuthKey::MutationCount)
            .unwrap_or(0)
    }

    /// Transfer admin rights. Requires current admin auth.
    pub fn transfer_admin(env: Env, caller: Address, new_admin: Address) {
        caller.require_auth();
        Self::assert_admin(&env, &caller);
        env.storage().instance().set(&AuthKey::Admin, &new_admin);
    }

    // -----------------------------------------------------------------------

    fn assert_admin(env: &Env, caller: &Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&AuthKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, AuthError::NotInitialized));
        if *caller != admin {
            panic_with_error!(env, AuthError::Unauthorized);
        }
    }
}
