//! # Synthetix-Style Staking Rewards Pool (SC-032)
//!
//! Provides continuous yield farming with $O(1)$ constant time complexity for stake,
//! unstake, and reward claim operations. Uses a global `reward_per_token_stored` accumulator
//! and user reward debt snapshots to prevent iteration loops, eliminating out-of-gas risks.
//! High-precision 128-bit fixed-point math (`WAD = 10^18`) eliminates rounding dilution.

use soroban_sdk::{
    contracttype, panic_with_error, symbol_short, token, Address, Env,
};
use crate::math::{mul_div, Rounding, WAD};
use crate::LPError;

#[contracttype]
#[derive(Clone)]
pub enum StakingKey {
    StakingToken,
    RewardToken,
    RewardRate,            // Reward tokens per second (scaled to WAD)
    PeriodFinish,          // Timestamp when current reward distribution period ends
    LastUpdateTime,        // Last timestamp when reward_per_token was updated
    RewardPerTokenStored,  // Accumulated reward per token stored (scaled to WAD)
    TotalSupply,           // Total tokens currently staked
    UserBalance(Address),  // User staked balance
    UserRewardDebt(Address),// User rewardPerToken snapshot
    UserRewards(Address),  // Unclaimed accumulated rewards for user
}

pub struct StakingRewards;

impl StakingRewards {
    /// Initializes staking parameters.
    pub fn initialize(
        env: &Env,
        staking_token: Address,
        reward_token: Address,
        reward_rate: u128,
        duration_seconds: u64,
    ) {
        let now = env.ledger().timestamp();
        env.storage().instance().set(&StakingKey::StakingToken, &staking_token);
        env.storage().instance().set(&StakingKey::RewardToken, &reward_token);
        env.storage().instance().set(&StakingKey::RewardRate, &reward_rate);
        env.storage().instance().set(&StakingKey::RewardPerTokenStored, &0u128);
        env.storage().instance().set(&StakingKey::TotalSupply, &0u128);
        env.storage().instance().set(&StakingKey::LastUpdateTime, &now);
        env.storage().instance().set(&StakingKey::PeriodFinish, &(now + duration_seconds));
    }

    /// Computes the last timestamp applicable for rewards.
    pub fn last_time_reward_applicable(env: &Env) -> u64 {
        let now = env.ledger().timestamp();
        let finish = env
            .storage()
            .instance()
            .get(&StakingKey::PeriodFinish)
            .unwrap_or(0u64);
        now.min(finish)
    }

    /// Computes the current accumulated reward per staked token (WAD precision).
    pub fn reward_per_token(env: &Env) -> u128 {
        let total_supply: u128 = env
            .storage()
            .instance()
            .get(&StakingKey::TotalSupply)
            .unwrap_or(0u128);

        let stored_rpt: u128 = env
            .storage()
            .instance()
            .get(&StakingKey::RewardPerTokenStored)
            .unwrap_or(0u128);

        if total_supply == 0 {
            return stored_rpt;
        }

        let last_time = env
            .storage()
            .instance()
            .get(&StakingKey::LastUpdateTime)
            .unwrap_or(0u64);
        let applicable_time = Self::last_time_reward_applicable(env);

        if applicable_time <= last_time {
            return stored_rpt;
        }

        let time_delta = (applicable_time - last_time) as u128;
        let reward_rate: u128 = env
            .storage()
            .instance()
            .get(&StakingKey::RewardRate)
            .unwrap_or(0u128);

        // delta_rpt = (time_delta * reward_rate * 1e18) / total_supply
        let reward_accrued = time_delta.saturating_mul(reward_rate);
        let additional_rpt = mul_div(reward_accrued, WAD, total_supply, Rounding::Down);

        stored_rpt.saturating_add(additional_rpt)
    }

    /// Computes the total rewards earned by `account`.
    pub fn earned(env: &Env, account: &Address) -> u128 {
        let balance: u128 = env
            .storage()
            .instance()
            .get(&StakingKey::UserBalance(account.clone()))
            .unwrap_or(0u128);

        let user_debt: u128 = env
            .storage()
            .instance()
            .get(&StakingKey::UserRewardDebt(account.clone()))
            .unwrap_or(0u128);

        let current_rpt = Self::reward_per_token(env);
        let existing_rewards: u128 = env
            .storage()
            .instance()
            .get(&StakingKey::UserRewards(account.clone()))
            .unwrap_or(0u128);

        let rpt_diff = current_rpt.saturating_sub(user_debt);
        let newly_earned = mul_div(balance, rpt_diff, WAD, Rounding::Down);

        existing_rewards.saturating_add(newly_earned)
    }

    /// Internal hook called before any balance/state mutation to sync reward indices.
    pub fn update_reward(env: &Env, account: Option<&Address>) {
        let rpt = Self::reward_per_token(env);
        env.storage().instance().set(&StakingKey::RewardPerTokenStored, &rpt);
        env.storage().instance().set(
            &StakingKey::LastUpdateTime,
            &Self::last_time_reward_applicable(env),
        );

        if let Some(user) = account {
            let total_earned = Self::earned(env, user);
            env.storage().instance().set(&StakingKey::UserRewards(user.clone()), &total_earned);
            env.storage().instance().set(&StakingKey::UserRewardDebt(user.clone()), &rpt);
        }
    }

    /// Stakes `amount` tokens into the yield farming pool.
    pub fn stake(env: &Env, user: Address, amount: u128) {
        if amount == 0 {
            panic_with_error!(env, LPError::ZeroAmount);
        }

        Self::update_reward(env, Some(&user));

        let staking_token: Address = env
            .storage()
            .instance()
            .get(&StakingKey::StakingToken)
            .unwrap();

        token::Client::new(env, &staking_token).transfer(
            &user,
            &env.current_contract_address(),
            &(amount as i128),
        );

        let cur_supply: u128 = env
            .storage()
            .instance()
            .get(&StakingKey::TotalSupply)
            .unwrap_or(0u128);
        let cur_bal: u128 = env
            .storage()
            .instance()
            .get(&StakingKey::UserBalance(user.clone()))
            .unwrap_or(0u128);

        env.storage()
            .instance()
            .set(&StakingKey::TotalSupply, &cur_supply.saturating_add(amount));
        env.storage()
            .instance()
            .set(&StakingKey::UserBalance(user.clone()), &cur_bal.saturating_add(amount));

        env.events().publish((symbol_short!("staked"), user), amount as i128);
    }

    /// Unstakes `amount` tokens from the pool.
    pub fn unstake(env: &Env, user: Address, amount: u128) {
        if amount == 0 {
            panic_with_error!(env, LPError::ZeroAmount);
        }

        let cur_bal: u128 = env
            .storage()
            .instance()
            .get(&StakingKey::UserBalance(user.clone()))
            .unwrap_or(0u128);

        if cur_bal < amount {
            panic_with_error!(env, LPError::InsufficientBal);
        }

        Self::update_reward(env, Some(&user));

        let cur_supply: u128 = env
            .storage()
            .instance()
            .get(&StakingKey::TotalSupply)
            .unwrap_or(0u128);

        env.storage()
            .instance()
            .set(&StakingKey::TotalSupply, &cur_supply.saturating_sub(amount));
        env.storage()
            .instance()
            .set(&StakingKey::UserBalance(user.clone()), &cur_bal.saturating_sub(amount));

        let staking_token: Address = env
            .storage()
            .instance()
            .get(&StakingKey::StakingToken)
            .unwrap();

        token::Client::new(env, &staking_token).transfer(
            &env.current_contract_address(),
            &user,
            &(amount as i128),
        );

        env.events().publish((symbol_short!("unstake"), user), amount as i128);
    }

    /// Claims all accumulated reward tokens.
    pub fn claim_reward(env: &Env, user: Address) -> u128 {
        Self::update_reward(env, Some(&user));

        let reward: u128 = env
            .storage()
            .instance()
            .get(&StakingKey::UserRewards(user.clone()))
            .unwrap_or(0u128);

        if reward > 0 {
            env.storage().instance().set(&StakingKey::UserRewards(user.clone()), &0u128);

            let reward_token: Address = env
                .storage()
                .instance()
                .get(&StakingKey::RewardToken)
                .unwrap();

            token::Client::new(env, &reward_token).transfer(
                &env.current_contract_address(),
                &user,
                &(reward as i128),
            );

            env.events().publish((symbol_short!("reward"), user), reward as i128);
        }

        reward
    }
}
