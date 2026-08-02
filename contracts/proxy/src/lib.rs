//! DESIGN APPROACH: Option B — UUPS (Universal Upgradeable Proxy Standard)
//!
//! Rationale: In Soroban, there is no `delegatecall` opcode. If Contract A calls
//! Contract B via an Address, execution occurs in Contract B's storage context.
//! Therefore, a Transparent Proxy (Option A) that holds state while executing logic
//! from a different address is technically impossible.
//!
//! To achieve state-preserving upgrades, we must use Soroban's native WASM replacement:
//! `env.deployer().update_current_contract_wasm(new_wasm_hash)`. The contract
//! instance remains the same (holding all state), but its underlying logic is upgraded.
//! In this UUPS model, the "implementation" is the WASM hash, not a separate Address.

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, BytesN, Env,
};

/// Isolated storage keys to prevent collisions with implementation contract data.
/// We use a specific enum `ProxyDataKey` which is strongly typed in Soroban storage.
#[contracttype]
#[derive(Clone)]
pub enum ProxyDataKey {
    Admin,
    ImplementationWasm, // Stores the current WASM hash
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum ProxyError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    InvalidAdmin = 4,
}

#[contract]
pub struct ProxyContract;

#[contractimpl]
impl ProxyContract {
    /// Initializes the proxy with an admin and an initial implementation WASM hash.
    /// Since this acts as the base UUPS logic, we store the admin and immediately
    /// upgrade the WASM to the target logic.
    pub fn init(env: Env, admin: Address, implementation: BytesN<32>) {
        if env.storage().instance().has(&ProxyDataKey::Admin) {
            panic_with_error!(&env, ProxyError::AlreadyInitialized);
        }

        env.storage().instance().set(&ProxyDataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&ProxyDataKey::ImplementationWasm, &implementation);

        // Native Soroban UUPS upgrade: replace this contract's WASM logic
        env.deployer().update_current_contract_wasm(implementation);
    }

    /// Upgrades the contract logic to a new WASM implementation.
    /// Only the current admin can call this function.
    pub fn upgrade_to(env: Env, caller: Address, new_implementation: BytesN<32>) {
        caller.require_auth();
        Self::require_admin(&env, &caller);

        env.storage()
            .instance()
            .set(&ProxyDataKey::ImplementationWasm, &new_implementation);

        env.deployer()
            .update_current_contract_wasm(new_implementation);
    }

    /// Returns the currently active implementation WASM hash.
    pub fn get_implementation(env: Env) -> BytesN<32> {
        env.storage()
            .instance()
            .get(&ProxyDataKey::ImplementationWasm)
            .unwrap_or_else(|| panic_with_error!(&env, ProxyError::NotInitialized))
    }

    /// Transfers the admin ownership to a new address.
    /// The old admin loses all upgrade privileges.
    pub fn transfer_admin(env: Env, caller: Address, new_admin: Address) {
        caller.require_auth();
        Self::require_admin(&env, &caller);

        env.storage()
            .instance()
            .set(&ProxyDataKey::Admin, &new_admin);
    }

    /// Helper to verify the caller is the current admin.
    fn require_admin(env: &Env, caller: &Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&ProxyDataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, ProxyError::NotInitialized));

        if *caller != admin {
            panic_with_error!(env, ProxyError::Unauthorized);
        }
    }
}

#[cfg(test)]
mod tests;
