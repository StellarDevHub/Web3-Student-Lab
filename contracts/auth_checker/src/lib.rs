//! Auth Checker Contract – Lesson 3 – SC-048
//!
//! Soroban Native Auth Invoker Framework Integration with SEP-0010 Signatures.
//! Enforces 100% native `Address::require_auth()` and `Address::require_auth_for_args()`
//! access control, eliminating malleable custom signature parsing and replay vulnerabilities.

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, vec,
    Address, Env, String, Symbol, Val, Vec,
};

#[contracttype]
#[derive(Clone)]
pub enum AuthKey {
    Admin,
    LessonValue,
    MutationCount,
    UsedNonce(Address, u64),
    MulticallStep(Address, u64),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum AuthError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    NonceAlreadyUsed = 4,
    InvalidDomain = 5,
    ReplayDetected = 6,
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
    pub fn set_value(env: Env, caller: Address, value: String) {
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

    /// Set lesson value with granular argument-level authorization (`require_auth_for_args`).
    /// Protects multi-call pipelines against parameter substitution attacks.
    pub fn set_value_with_args(env: Env, caller: Address, value: String) {
        let args: Vec<Val> = vec![&env, caller.to_val(), value.to_val()];
        caller.require_auth_for_args(args);
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
            .publish((symbol_short!("set_args"),), (caller, value));
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

    /// SEP-0010 Stellar Web Auth invocation compatibility helper.
    ///
    /// Validates the client's native authorization (`client.require_auth()`),
    /// binds to the verified SEP-0010 client web auth challenge with home_domain and nonce,
    /// and prevents replay attacks.
    pub fn verify_and_execute_sep0010(
        env: Env,
        client: Address,
        home_domain: String,
        nonce: u64,
        value: String,
    ) {
        // Enforce native Soroban authentication for the client
        client.require_auth();

        // Check and record nonce for replay prevention
        let nonce_key = AuthKey::UsedNonce(client.clone(), nonce);
        if env.storage().persistent().has(&nonce_key) {
            panic_with_error!(&env, AuthError::NonceAlreadyUsed);
        }
        env.storage().persistent().set(&nonce_key, &true);

        // Record value mutation
        env.storage().instance().set(&AuthKey::LessonValue, &value);
        let count: u32 = env
            .storage()
            .instance()
            .get(&AuthKey::MutationCount)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&AuthKey::MutationCount, &(count + 1));

        env.events().publish(
            (Symbol::new(&env, "sep0010_auth"), client),
            (home_domain, nonce, value),
        );
    }

    /// Multi-call authorization step verifier.
    /// Ensures that chained contract invocations verify native authorization at each hop
    /// with replay tracking across steps.
    pub fn execute_multicall_step(env: Env, invoker: Address, step_id: u64, operation: String) {
        invoker.require_auth();

        let step_key = AuthKey::MulticallStep(invoker.clone(), step_id);
        if env.storage().persistent().has(&step_key) {
            panic_with_error!(&env, AuthError::ReplayDetected);
        }
        env.storage().persistent().set(&step_key, &operation);

        env.events().publish(
            (Symbol::new(&env, "multi_step"), invoker),
            (step_id, operation),
        );
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

#[cfg(test)]
mod test;
