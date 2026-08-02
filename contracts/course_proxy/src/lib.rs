//! Course Version Proxy – Issue #698
//!
//! Implements an upgradeable proxy using Soroban's native WASM-replacement
//! mechanism (UUPS pattern) so instructors can roll out new course metadata
//! logic without losing stored state.
//!
//! ## Storage layout
//! All proxy-specific keys live under `CourseProxyKey` to prevent collisions
//! with metadata stored by the implementation WASM.
//!
//! ## Upgrade flow
//! 1. Admin calls `upgrade(new_wasm_hash)`.
//! 2. Contract persists the hash and calls
//!    `env.deployer().update_current_contract_wasm(hash)`.
//! 3. The contract instance (and its storage) is unchanged; only the logic is
//!    replaced – satisfying the "state preserved across upgrades" requirement.

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, BytesN, Env,
};

#[contracttype]
#[derive(Clone)]
pub enum CourseProxyKey {
    Admin,
    ImplWasm,
    CourseVersion,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum ProxyError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
}

#[contract]
pub struct CourseProxy;

#[contractimpl]
impl CourseProxy {
    /// Initialize with an admin and the initial implementation WASM hash.
    /// Also sets the course version to 1.
    pub fn init(env: Env, admin: Address, wasm_hash: BytesN<32>) {
        if env.storage().instance().has(&CourseProxyKey::Admin) {
            panic_with_error!(&env, ProxyError::AlreadyInitialized);
        }
        env.storage().instance().set(&CourseProxyKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&CourseProxyKey::ImplWasm, &wasm_hash);
        env.storage()
            .instance()
            .set(&CourseProxyKey::CourseVersion, &1u32);
        // Upgrade WASM so the contract immediately executes implementation logic.
        env.deployer().update_current_contract_wasm(wasm_hash);
    }

    /// Upgrade to a new implementation WASM, bumping the course version counter.
    /// Only the admin may call this; `require_auth` enforces on-chain authorization.
    pub fn upgrade(env: Env, caller: Address, new_wasm_hash: BytesN<32>) {
        caller.require_auth();
        Self::assert_admin(&env, &caller);

        // Bump version so consumers can detect the rollout.
        let version: u32 = env
            .storage()
            .instance()
            .get(&CourseProxyKey::CourseVersion)
            .unwrap_or(1);
        env.storage()
            .instance()
            .set(&CourseProxyKey::CourseVersion, &(version + 1));

        env.storage()
            .instance()
            .set(&CourseProxyKey::ImplWasm, &new_wasm_hash);

        // Native UUPS upgrade – state is preserved, only logic changes.
        env.deployer().update_current_contract_wasm(new_wasm_hash);
    }

    /// Return the current implementation WASM hash.
    pub fn get_impl(env: Env) -> BytesN<32> {
        env.storage()
            .instance()
            .get(&CourseProxyKey::ImplWasm)
            .unwrap_or_else(|| panic_with_error!(&env, ProxyError::NotInitialized))
    }

    /// Return the current course version number (increments on each upgrade).
    pub fn get_version(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&CourseProxyKey::CourseVersion)
            .unwrap_or(1)
    }

    /// Transfer admin rights to a new address.
    pub fn transfer_admin(env: Env, caller: Address, new_admin: Address) {
        caller.require_auth();
        Self::assert_admin(&env, &caller);
        env.storage()
            .instance()
            .set(&CourseProxyKey::Admin, &new_admin);
    }

    // -----------------------------------------------------------------------

    fn assert_admin(env: &Env, caller: &Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&CourseProxyKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, ProxyError::NotInitialized));
        if *caller != admin {
            panic_with_error!(env, ProxyError::Unauthorized);
        }
    }
}
