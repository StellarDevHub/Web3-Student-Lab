//! DESIGN APPROACH: Option B — UUPS (Universal Upgradeable Proxy Standard)
//!
//! Rationale: In Soroban, native upgrades (`env.deployer().update_current_contract_wasm`)
//! replace the logic of the current contract instance. Therefore, the implementation
//! contract itself MUST include the upgrade logic.
//!
//! Storage collisions are prevented by using explicit enums (`ImplDataKey` vs `ProxyDataKey`)
//! which Soroban hashes into distinct keys securely.

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, BytesN, Env,
};

/// Storage keys specifically for the Proxy/Admin logic, matching the `proxy` crate.
#[contracttype]
#[derive(Clone)]
pub enum ProxyDataKey {
    Admin,
    ImplementationWasm,
}

/// Storage keys specifically for the V1 Implementation logic.
/// Because this is a distinct enum from `ProxyDataKey`, Soroban's XDR serialization
/// guarantees that `ImplDataKey::Score` will never collide with `ProxyDataKey::Admin`.
#[contracttype]
#[derive(Clone)]
pub enum ImplDataKey {
    Score(Address),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum ImplError {
    NotInitialized = 1,
    Unauthorized = 2,
    ScoreOverflow = 3,
}

#[contract]
pub struct StudentRecordV1;

#[contractimpl]
impl StudentRecordV1 {
    // -----------------------------------------------------------------------
    // UUPS Proxy Admin Logic
    // Must be included in every implementation to maintain upgradeability.
    pub fn upgrade_to(env: Env, caller: Address, new_implementation: BytesN<32>) {
        caller.require_auth();
        Self::require_admin(&env, &caller);

        env.storage()
            .instance()
            .set(&ProxyDataKey::ImplementationWasm, &new_implementation);

        env.deployer()
            .update_current_contract_wasm(new_implementation);
    }

    pub fn get_implementation(env: Env) -> BytesN<32> {
        env.storage()
            .instance()
            .get(&ProxyDataKey::ImplementationWasm)
            .unwrap_or_else(|| panic_with_error!(&env, ImplError::NotInitialized))
    }

    pub fn transfer_admin(env: Env, caller: Address, new_admin: Address) {
        caller.require_auth();
        Self::require_admin(&env, &caller);
        env.storage()
            .instance()
            .set(&ProxyDataKey::Admin, &new_admin);
    }

    fn require_admin(env: &Env, caller: &Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&ProxyDataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, ImplError::NotInitialized));

        if *caller != admin {
            panic_with_error!(env, ImplError::Unauthorized);
        }
    }

    // -----------------------------------------------------------------------
    // Implementation V1 Logic (Student Record Store)
    /// Add score to a student's record. Uses `saturating_add` to prevent overflow.
    pub fn add_score(env: Env, caller: Address, student: Address, amount: u32) {
        caller.require_auth();
        Self::require_admin(&env, &caller); // Only admin can add scores

        let current_score: u32 = env
            .storage()
            .persistent()
            .get(&ImplDataKey::Score(student.clone()))
            .unwrap_or(0);

        let new_score = current_score.saturating_add(amount);

        env.storage()
            .persistent()
            .set(&ImplDataKey::Score(student), &new_score);
    }

    /// Retrieve a student's score.
    pub fn get_score(env: Env, student: Address) -> u32 {
        env.storage()
            .persistent()
            .get(&ImplDataKey::Score(student))
            .unwrap_or(0)
    }
}

#[cfg(test)]
mod tests;
