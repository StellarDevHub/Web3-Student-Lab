#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Env};

/// Typed instance-storage keys. Each variant XDR-encodes as its own key, so
/// these cannot collide with keys written by other modules or other versions.
#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    StakingToken,
    RewardToken,
    RewardRate,
    TotalStaked,
}

#[contract]
pub struct YieldFarmingPool;

#[contractimpl]
impl YieldFarmingPool {
    pub fn initialize(env: Env, admin: Address, staking_token: Address, reward_token: Address, reward_rate: i128) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::StakingToken, &staking_token);
        env.storage().instance().set(&DataKey::RewardToken, &reward_token);
        env.storage().instance().set(&DataKey::RewardRate, &reward_rate);
        env.storage().instance().set(&DataKey::TotalStaked, &0i128);
    }

    pub fn stake(env: Env, user: Address, amount: i128) {
        let staking_token_addr: Address = env.storage().instance().get(&DataKey::StakingToken).unwrap();
        let staking_token = token::Client::new(&env, &staking_token_addr);
        staking_token.transfer(&user, &env.current_contract_address(), &amount);
        let total: i128 = env.storage().instance().get(&DataKey::TotalStaked).unwrap_or(0);
        env.storage().instance().set(&DataKey::TotalStaked, &(total + amount));
    }

    pub fn get_reward_per_token(env: Env) -> i128 {
        let total: i128 = env.storage().instance().get(&DataKey::TotalStaked).unwrap_or(0);
        let rate: i128 = env.storage().instance().get(&DataKey::RewardRate).unwrap_or(1);
        if total == 0 { 0 } else { rate * 1000 / total }
    }
}
