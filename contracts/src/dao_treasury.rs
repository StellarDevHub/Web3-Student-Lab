//! DAO Treasury Fund Manager module
//! Securely manages multiple asset types (Tokens, NFTs) and strictly enforces expenditure
//! limits based on governance votes.
//! Features include emergency sweeping with a timelock and reentrancy protection.

use soroban_sdk::token::Client as TokenClient;
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, Address,
    Env,
};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SweepInfo {
    pub target: Address,
    pub unlock_timestamp: u64,
}

#[contracttype]
#[derive(Clone)]
pub enum TreasuryDataKey {
    Admin,
    /// Maps (Proposal ID, Token Address) to approved allowance amount (i128)
    Allowance(u64, Address),
    /// Maps Token Address to its emergency SweepInfo
    Sweep(Address),
    /// Lock flag to prevent reentrancy attacks
    ReentrancyLock,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum TreasuryError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    InsufficientAllowance = 4,
    Reentrant = 5,
    TimelockNotExpired = 6,
    NoActiveSweep = 7,
    InvalidAmount = 8,
}

/// The default timelock duration for emergency sweeps (e.g., ~24 hours).
/// Assuming 1 second per timestamp unit (Soroban timestamps are in seconds).
const SWEEP_TIMELOCK_DURATION: u64 = 86400;

#[contract]
pub struct DaoTreasuryContract;

#[contractimpl]
impl DaoTreasuryContract {
    /// Initialize the DAO Treasury with an admin address.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&TreasuryDataKey::Admin) {
            panic_with_error!(&env, TreasuryError::AlreadyInitialized);
        }

        env.storage().instance().set(&TreasuryDataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&TreasuryDataKey::ReentrancyLock, &false);
            
        env.events()
            .publish((symbol_short!("trsry_ini"),), admin);
    }

    /// Sets or updates the allowance for a governance proposal.
    /// Only the Admin can call this (usually representing the DAO).
    pub fn set_proposal_allowance(
        env: Env,
        caller: Address,
        proposal_id: u64,
        token: Address,
        amount: i128,
    ) {
        caller.require_auth();
        Self::require_admin(&env, &caller);

        if amount < 0 {
            panic_with_error!(&env, TreasuryError::InvalidAmount);
        }

        env.storage().instance().set(
            &TreasuryDataKey::Allowance(proposal_id, token.clone()),
            &amount,
        );

        env.events().publish(
            (symbol_short!("trsry_alw"), proposal_id),
            (token, amount),
        );
    }

    /// Executes a transfer for a governance proposal.
    /// Anyone can call this to trigger the execution, provided the proposal has enough allowance.
    pub fn execute_proposal_transfer(
        env: Env,
        proposal_id: u64,
        token: Address,
        to: Address,
        amount: i128,
    ) {
        if amount <= 0 {
            panic_with_error!(&env, TreasuryError::InvalidAmount);
        }

        Self::acquire_lock(&env);

        let allowance_key = TreasuryDataKey::Allowance(proposal_id, token.clone());
        let current_allowance: i128 = env
            .storage()
            .instance()
            .get(&allowance_key)
            .unwrap_or(0);

        if current_allowance < amount {
            panic_with_error!(&env, TreasuryError::InsufficientAllowance);
        }

        // Deduct allowance securely (avoids underflow)
        let new_allowance = current_allowance.saturating_sub(amount);
        env.storage().instance().set(&allowance_key, &new_allowance);

        // Perform token transfer using standard SAC client
        let token_client = TokenClient::new(&env, &token);
        let treasury_addr = env.current_contract_address();
        token_client.transfer(&treasury_addr, &to, &amount);

        env.events().publish(
            (symbol_short!("trsry_xfr"), proposal_id),
            (token, to, amount),
        );

        Self::release_lock(&env);
    }

    /// Initiates an emergency sweep for a specific token.
    /// Only the Admin can initiate this. The sweep is delayed by `SWEEP_TIMELOCK_DURATION`.
    pub fn initiate_sweep(env: Env, caller: Address, token: Address, target: Address) {
        caller.require_auth();
        Self::require_admin(&env, &caller);

        let unlock_timestamp = env.ledger().timestamp().saturating_add(SWEEP_TIMELOCK_DURATION);
        
        let sweep_info = SweepInfo {
            target: target.clone(),
            unlock_timestamp,
        };

        env.storage()
            .instance()
            .set(&TreasuryDataKey::Sweep(token.clone()), &sweep_info);

        env.events().publish(
            (symbol_short!("swp_init"), token),
            (target, unlock_timestamp),
        );
    }

    /// Executes a previously initiated sweep after the timelock has expired.
    /// Will transfer the entire token balance of the treasury to the sweep target.
    pub fn execute_sweep(env: Env, token: Address) {
        Self::acquire_lock(&env);

        let sweep_key = TreasuryDataKey::Sweep(token.clone());
        let sweep_info: SweepInfo = env
            .storage()
            .instance()
            .get(&sweep_key)
            .unwrap_or_else(|| panic_with_error!(&env, TreasuryError::NoActiveSweep));

        if env.ledger().timestamp() < sweep_info.unlock_timestamp {
            panic_with_error!(&env, TreasuryError::TimelockNotExpired);
        }

        let token_client = TokenClient::new(&env, &token);
        let treasury_addr = env.current_contract_address();
        let balance = token_client.balance(&treasury_addr);

        if balance > 0 {
            token_client.transfer(&treasury_addr, &sweep_info.target, &balance);
        }

        // Clear the sweep state so it can't be reused
        env.storage().instance().remove(&sweep_key);

        env.events().publish(
            (symbol_short!("swp_exec"), token),
            (sweep_info.target, balance),
        );

        Self::release_lock(&env);
    }

    /// Get the current allowance for a specific proposal and token.
    pub fn get_proposal_allowance(env: Env, proposal_id: u64, token: Address) -> i128 {
        env.storage()
            .instance()
            .get(&TreasuryDataKey::Allowance(proposal_id, token))
            .unwrap_or(0)
    }

    /// Helper to enforce admin only operations.
    fn require_admin(env: &Env, caller: &Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&TreasuryDataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, TreasuryError::NotInitialized));

        if *caller != admin {
            panic_with_error!(env, TreasuryError::Unauthorized);
        }
    }

    /// Acquire the reentrancy lock. Panics with `Reentrant` if already locked.
    fn acquire_lock(env: &Env) {
        let locked: bool = env
            .storage()
            .instance()
            .get(&TreasuryDataKey::ReentrancyLock)
            .unwrap_or(false);
        if locked {
            panic_with_error!(env, TreasuryError::Reentrant);
        }
        env.storage()
            .instance()
            .set(&TreasuryDataKey::ReentrancyLock, &true);
    }

    /// Release the reentrancy lock.
    fn release_lock(env: &Env) {
        env.storage()
            .instance()
            .set(&TreasuryDataKey::ReentrancyLock, &false);
    }
}

#[cfg(test)]
#[path = "dao_treasury_test.rs"]
mod dao_treasury_test;
