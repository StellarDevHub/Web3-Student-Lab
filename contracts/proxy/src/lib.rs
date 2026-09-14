//! Universal upgradeable proxy for Soroban.
//!
//! This proxy holds the contract instance state and upgrades the underlying WASM
//! in-place via `env.deployer().update_current_contract_wasm(...)` so the storage
//! and addresses remain stable while the implementation logic changes.
//!
//! The design adds four safeguards required by the upgrade policy:
//! 1. Admin-only upgrades.
//! 2. Mandatory pre-registration of the target bytecode hash.
//! 3. A persisted storage-version marker used for schema/version checks.
//! 4. Two-step admin transfer via a pending-admin acceptance ceremony.

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, Address,
    BytesN, Env, Symbol, Val, Vec,
};

#[contracttype]
#[derive(Clone)]
pub enum ProxyDataKey {
    Admin,
    PendingAdmin,
    ImplementationWasm,
    StorageVersion,
    WasmRegistered(BytesN<32>),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum ProxyError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    InvalidAdmin = 4,
    UnregisteredWasm = 5,
    InvalidStorageVersion = 6,
    PendingAdminMismatch = 7,
}

#[contract]
pub struct ProxyContract;

#[contractimpl]
impl ProxyContract {
    /// Initializes the proxy with an admin and an initial implementation WASM hash.
    /// The supplied implementation must be pre-registered before the first upgrade.
    pub fn init(env: Env, admin: Address, implementation: BytesN<32>) {
        if env.storage().instance().has(&ProxyDataKey::Admin) {
            panic_with_error!(&env, ProxyError::AlreadyInitialized);
        }

        Self::require_valid_wasm(&env, &implementation, false);

        env.storage().instance().set(&ProxyDataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&ProxyDataKey::ImplementationWasm, &implementation);
        env.storage()
            .instance()
            .set(&ProxyDataKey::StorageVersion, &1u32);
        env.storage()
            .instance()
            .set(&ProxyDataKey::WasmRegistered(implementation.clone()), &true);

        #[cfg(not(test))]
        env.deployer().update_current_contract_wasm(implementation);
    }

    pub fn initialize(env: Env, admin: Address, implementation: BytesN<32>) {
        Self::init(env, admin, implementation);
    }

    /// Registers a new bytecode hash so it may later be used in an upgrade.
    pub fn register_wasm(env: Env, caller: Address, wasm_hash: BytesN<32>) {
        caller.require_auth();
        Self::require_admin(&env, &caller);
        Self::require_valid_wasm(&env, &wasm_hash, true);

        env.storage()
            .instance()
            .set(&ProxyDataKey::WasmRegistered(wasm_hash), &true);
    }

    pub fn is_wasm_registered(env: Env, wasm_hash: BytesN<32>) -> bool {
        env.storage()
            .instance()
            .get(&ProxyDataKey::WasmRegistered(wasm_hash))
            .unwrap_or(false)
    }

    /// Upgrades the running contract to a previously-registered WASM hash.
    pub fn upgrade_to(env: Env, caller: Address, new_implementation: BytesN<32>) {
        caller.require_auth();
        Self::require_admin(&env, &caller);
        Self::require_registered_wasm(&env, &new_implementation);

        let storage_version: u32 = env
            .storage()
            .instance()
            .get(&ProxyDataKey::StorageVersion)
            .unwrap_or(1u32);
        env.storage()
            .instance()
            .set(&ProxyDataKey::StorageVersion, &(storage_version + 1));
        env.storage()
            .instance()
            .set(&ProxyDataKey::ImplementationWasm, &new_implementation);

        #[cfg(not(test))]
        env.deployer()
            .update_current_contract_wasm(new_implementation);
    }

    pub fn upgrade(env: Env, caller: Address, new_implementation: BytesN<32>) {
        Self::upgrade_to(env, caller, new_implementation);
    }

    /// Returns the currently active implementation WASM hash.
    pub fn get_implementation(env: Env) -> BytesN<32> {
        env.storage()
            .instance()
            .get(&ProxyDataKey::ImplementationWasm)
            .unwrap_or_else(|| panic_with_error!(&env, ProxyError::NotInitialized))
    }

    pub fn get_impl(env: Env) -> BytesN<32> {
        Self::get_implementation(env)
    }

    pub fn get_storage_version(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&ProxyDataKey::StorageVersion)
            .unwrap_or(1u32)
    }

    pub fn storage_version(env: Env) -> u32 {
        Self::get_storage_version(env)
    }

    pub fn get_admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&ProxyDataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, ProxyError::NotInitialized))
    }

    pub fn get_pending_admin(env: Env) -> Option<Address> {
        env.storage()
            .instance()
            .get(&ProxyDataKey::PendingAdmin)
            .unwrap_or(None)
    }

    pub fn pending_admin(env: Env) -> Option<Address> {
        Self::get_pending_admin(env)
    }

    /// Starts a two-step admin transfer.
    /// The new admin must accept the role before any privileged operation is active.
    pub fn transfer_admin(env: Env, caller: Address, new_admin: Address) {
        caller.require_auth();
        Self::require_admin(&env, &caller);
        if new_admin == caller {
            panic_with_error!(&env, ProxyError::InvalidAdmin);
        }

        env.storage()
            .instance()
            .set(&ProxyDataKey::PendingAdmin, &Some(new_admin.clone()));

        env.events()
            .publish((symbol_short!("admin"),), (caller, new_admin));
    }

    pub fn transfer_admin_to(env: Env, caller: Address, new_admin: Address) {
        Self::transfer_admin(env, caller, new_admin);
    }

    /// Completes the pending admin transfer and updates the active admin.
    pub fn accept_admin(env: Env, caller: Address) {
        caller.require_auth();
        let pending_admin: Option<Address> = env
            .storage()
            .instance()
            .get(&ProxyDataKey::PendingAdmin)
            .unwrap_or(None);

        let pending = pending_admin
            .unwrap_or_else(|| panic_with_error!(&env, ProxyError::PendingAdminMismatch));

        if caller != pending {
            panic_with_error!(&env, ProxyError::Unauthorized);
        }

        env.storage().instance().set(&ProxyDataKey::Admin, &caller);
        env.storage()
            .instance()
            .set(&ProxyDataKey::PendingAdmin, &None::<Address>);
    }

    /// Delegates a host-call through the proxy to another contract address.
    pub fn forward_call(
        env: Env,
        caller: Address,
        target: Address,
        function: Symbol,
        args: Vec<Val>,
    ) -> Val {
        caller.require_auth();
        Self::require_admin(&env, &caller);
        env.invoke_contract(&target, &function, args)
    }

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

    fn require_registered_wasm(env: &Env, wasm_hash: &BytesN<32>) {
        Self::require_valid_wasm(env, wasm_hash, false);
        if !Self::is_wasm_registered_impl(env, wasm_hash) {
            panic_with_error!(env, ProxyError::UnregisteredWasm);
        }
    }

    fn require_valid_wasm(env: &Env, wasm_hash: &BytesN<32>, allow_zero: bool) {
        let zero_hash = BytesN::from_array(env, &[0u8; 32]);
        if !allow_zero && *wasm_hash == zero_hash {
            panic_with_error!(env, ProxyError::UnregisteredWasm);
        }
    }

    fn is_wasm_registered_impl(env: &Env, wasm_hash: &BytesN<32>) -> bool {
        env.storage()
            .instance()
            .get(&ProxyDataKey::WasmRegistered(wasm_hash.clone()))
            .unwrap_or(false)
    }
}

#[cfg(test)]
mod tests;
