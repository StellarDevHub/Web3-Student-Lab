//! DESIGN APPROACH: Option B — UUPS (Universal Upgradeable Proxy Standard)
//!
//! Demonstrating a safe V2 upgrade for the Student Record Store.
//!
//! SAFE MIGRATION: Adding a new storage key variant `Name(Address)` to store strings.
//! This is safe because it uses a new, distinct XDR key. Existing `Score(Address)`
//! keys remain fully accessible and perfectly aligned.
//!
//! UNSAFE MIGRATION: Changing `add_score` to use `u64` instead of `u32`.
//! If we changed the value type of `Score(Address)` from `u32` to `u64`, the contract
//! would panic when trying to deserialize old `u32` XDR data from the ledger into a `u64`.
//! To safely change types, you must use a completely new key (e.g., `ScoreV2(Address)`),
//! or write a one-time migration function to read `u32` and write `u64`.

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, BytesN, Env,
    String,
};

#[contracttype]
#[derive(Clone)]
pub enum ProxyDataKey {
    Admin,
    ImplementationWasm,
}

#[contracttype]
#[derive(Clone)]
pub enum ImplDataKey {
    Score(Address),
    // SAFE MIGRATION: Additive field. Uses a new XDR symbol hash.
    Name(Address),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum ImplError {
    NotInitialized = 1,
    Unauthorized = 2,
    ScoreOverflow = 3,
}

#[contract]
pub struct StudentRecordV2;

#[contractimpl]
impl StudentRecordV2 {
    // -----------------------------------------------------------------------
    // UUPS Proxy Admin Logic (Preserved from V1)
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
    // Implementation Logic (Preserved V1 functions)
    // -----------------------------------------------------------------------

    pub fn add_score(env: Env, caller: Address, student: Address, amount: u32) {
        caller.require_auth();
        Self::require_admin(&env, &caller);

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

    pub fn get_score(env: Env, student: Address) -> u32 {
        env.storage()
            .persistent()
            .get(&ImplDataKey::Score(student))
            .unwrap_or(0)
    }

    // -----------------------------------------------------------------------
    // Implementation V2 Logic (Additive Feature)
    // -----------------------------------------------------------------------

    /// Set a student's name in the new storage key.
    pub fn set_name(env: Env, caller: Address, student: Address, name: String) {
        caller.require_auth();
        Self::require_admin(&env, &caller);

        env.storage()
            .persistent()
            .set(&ImplDataKey::Name(student), &name);
    }

    /// Retrieve a student's name.
    pub fn get_name(env: Env, student: Address) -> Option<String> {
        env.storage().persistent().get(&ImplDataKey::Name(student))
    }
}
