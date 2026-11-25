//! # Treasury Module for DAO Governance
//!
//! Manages unallocated treasury reserves and token allocations.

use soroban_certificate_contract::storage_ttl;
use soroban_sdk::{contracttype, Address, Env};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TreasuryState {
    pub total_reserves: u128,
    pub total_shares: u128,
}

#[contracttype]
#[derive(Clone)]
pub enum TreasuryKey {
    State,
    UserShares(Address),
}

pub struct Treasury;

impl Treasury {
    pub fn get_state(env: &Env) -> TreasuryState {
        let key = TreasuryKey::State;
        let state = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or(TreasuryState {
                total_reserves: 0,
                total_shares: 0,
            });
        storage_ttl::bump_persistent(env, &key);
        state
    }

    pub fn set_state(env: &Env, state: &TreasuryState) {
        let key = TreasuryKey::State;
        env.storage().persistent().set(&key, state);
        storage_ttl::bump_persistent(env, &key);
    }

    pub fn deposit_reserves(env: &Env, amount: u128) {
        let mut state = Self::get_state(env);
        state.total_reserves = state.total_reserves.saturating_add(amount);
        Self::set_state(env, &state);
    }

    pub fn get_shares(env: &Env, user: &Address) -> u128 {
        let key = TreasuryKey::UserShares(user.clone());
        let shares = env.storage().persistent().get(&key).unwrap_or(0);
        storage_ttl::bump_persistent(env, &key);
        shares
    }

    pub fn set_shares(env: &Env, user: &Address, shares: u128) {
        let prev = Self::get_shares(env, user);
        let mut state = Self::get_state(env);
        if shares >= prev {
            state.total_shares = state.total_shares.saturating_add(shares - prev);
        } else {
            state.total_shares = state.total_shares.saturating_sub(prev - shares);
        }
        let key = TreasuryKey::UserShares(user.clone());
        env.storage().persistent().set(&key, &shares);
        storage_ttl::bump_persistent(env, &key);
        Self::set_state(env, &state);
    }
}
