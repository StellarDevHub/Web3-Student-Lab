#![no_std]

use soroban_sdk::{contract, contractimpl, Address, Env, token};

#[contract]
pub struct YieldFarmingPool;

#[contractimpl]
impl YieldFarmingPool {
    pub fn initialize(env: Env, admin: Address, staking_token: Address, reward_token: Address, reward_rate: i128) {
        env.storage().instance().set(&("admin"), &admin);
        env.storage().instance().set(&("staking_token"), &staking_token);
        env.storage().instance().set(&("reward_token"), &reward_token);
        env.storage().instance().set(&("reward_rate"), &reward_rate);
        env.storage().instance().set(&("total_staked"), &0i128);
    }

    pub fn stake(env: Env, user: Address, amount: i128) {
        let staking_token_addr: Address = env.storage().instance().get(&("staking_token")).unwrap();
        let staking_token = token::Client::new(&env, &staking_token_addr);
        staking_token.transfer(&user, &env.current_contract_address(), &amount);
        let total: i128 = env.storage().instance().get(&("total_staked")).unwrap_or(0);
        env.storage().instance().set(&("total_staked"), &(total + amount));
    }

    pub fn get_reward_per_token(env: Env) -> i128 {
        let total: i128 = env.storage().instance().get(&("total_staked")).unwrap_or(0);
        let rate: i128 = env.storage().instance().get(&("reward_rate")).unwrap_or(1);
        if total == 0 { 0 } else { rate * 1000 / total }
    }
}
