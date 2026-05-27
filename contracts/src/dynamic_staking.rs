//! Staking Protocol with Dynamic APY Calculation
//!
//! A token staking vault where users lock tokens to earn yield. APY is dynamic,
//! naturally scaling with the total pool size, and weighted by lock-up duration.
//! Features precision math to prevent overflow and precision loss, and strict
//! early withdrawal penalties.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, Address,
    Env, token::Client as TokenClient,
};

/// 1e18 precision for reward calculations.
pub const PRECISION: u128 = 1_000_000_000_000_000_000;
/// One year in seconds (max lock duration).
pub const MAX_LOCK_DURATION: u64 = 31_536_000;
/// Penalty in basis points (10% = 1000 bps) applied to principal for early withdrawal.
pub const EARLY_WITHDRAWAL_PENALTY_BPS: u128 = 1_000;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UserPosition {
    /// Raw token balance deposited.
    pub balance: u128,
    /// Effective balance after applying lock duration multiplier.
    pub effective_balance: u128,
    /// Unix timestamp when the lock expires.
    pub lock_end: u64,
    /// Snapshot of `rewardPerToken` when the user last updated.
    pub user_reward_per_token_paid: u128,
    /// Accumulated, unclaimed rewards.
    pub rewards: u128,
}

#[contracttype]
#[derive(Clone)]
pub enum StakingDataKey {
    Admin,
    StakingToken,
    RewardToken,
    RewardRate,
    TotalEffectiveSupply,
    RewardPerTokenStored,
    LastUpdateTime,
    Position(Address),
    ReentrancyLock,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum StakingError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    InvalidAmount = 4,
    InvalidLockDuration = 5,
    InsufficientBalance = 6,
    Reentrant = 7,
}

#[contract]
pub struct DynamicStakingContract;

#[contractimpl]
impl DynamicStakingContract {
    /// Initializes the staking contract.
    pub fn initialize(
        env: Env,
        admin: Address,
        staking_token: Address,
        reward_token: Address,
        reward_rate: u128,
    ) {
        if env.storage().instance().has(&StakingDataKey::Admin) {
            panic_with_error!(&env, StakingError::AlreadyInitialized);
        }

        env.storage().instance().set(&StakingDataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&StakingDataKey::StakingToken, &staking_token);
        env.storage()
            .instance()
            .set(&StakingDataKey::RewardToken, &reward_token);
        env.storage()
            .instance()
            .set(&StakingDataKey::RewardRate, &reward_rate);

        env.storage()
            .instance()
            .set(&StakingDataKey::TotalEffectiveSupply, &0u128);
        env.storage()
            .instance()
            .set(&StakingDataKey::RewardPerTokenStored, &0u128);
        env.storage()
            .instance()
            .set(&StakingDataKey::LastUpdateTime, &env.ledger().timestamp());
        env.storage()
            .instance()
            .set(&StakingDataKey::ReentrancyLock, &false);

        env.events()
            .publish((symbol_short!("stk_init"),), admin);
    }

    /// Stake tokens for a specified duration to earn dynamic yield.
    pub fn stake(env: Env, caller: Address, amount: u128, lock_duration_seconds: u64) {
        caller.require_auth();
        Self::require_initialized(&env);
        Self::acquire_lock(&env);

        if amount == 0 {
            panic_with_error!(&env, StakingError::InvalidAmount);
        }
        if lock_duration_seconds > MAX_LOCK_DURATION {
            panic_with_error!(&env, StakingError::InvalidLockDuration);
        }

        Self::update_reward(&env, &caller);

        let staking_token = env
            .storage()
            .instance()
            .get::<_, Address>(&StakingDataKey::StakingToken)
            .unwrap();

        // Calculate multiplier: base (1.0) + (lock_duration / MAX_LOCK_DURATION) * 1.0
        // Resulting multiplier ranges from 1x to 2x.
        let bonus = (lock_duration_seconds as u128)
            .saturating_mul(PRECISION)
            .checked_div(MAX_LOCK_DURATION as u128)
            .unwrap_or(0);
        let multiplier = PRECISION.saturating_add(bonus);

        let effective_amount = amount.saturating_mul(multiplier).checked_div(PRECISION).unwrap_or(0);

        let mut position = Self::get_position(&env, &caller).unwrap_or(UserPosition {
            balance: 0,
            effective_balance: 0,
            lock_end: 0,
            user_reward_per_token_paid: 0,
            rewards: 0,
        });

        // Ensure new lock time extends the old one, but doesn't shrink it
        let new_lock_end = env.ledger().timestamp().saturating_add(lock_duration_seconds);
        if new_lock_end > position.lock_end {
            position.lock_end = new_lock_end;
        }

        position.balance = position.balance.saturating_add(amount);
        position.effective_balance = position.effective_balance.saturating_add(effective_amount);

        // We must re-sync the user's reward paid snapshot *after* updating reward state.
        // Wait, update_reward already set user_reward_per_token_paid to the current global.
        // We just need to persist the updated position balance.
        position.user_reward_per_token_paid = Self::reward_per_token(&env);

        let mut total_supply: u128 = env
            .storage()
            .instance()
            .get(&StakingDataKey::TotalEffectiveSupply)
            .unwrap_or(0);
        total_supply = total_supply.saturating_add(effective_amount);

        env.storage()
            .instance()
            .set(&StakingDataKey::TotalEffectiveSupply, &total_supply);
        env.storage()
            .instance()
            .set(&StakingDataKey::Position(caller.clone()), &position);

        let token_client = TokenClient::new(&env, &staking_token);
        token_client.transfer(&caller, &env.current_contract_address(), &(amount as i128));

        env.events()
            .publish((symbol_short!("stk_stake"), caller), (amount, lock_duration_seconds));

        Self::release_lock(&env);
    }

    /// Withdraw staked tokens. If withdrawn early, penalty applies.
    pub fn unstake(env: Env, caller: Address, amount: u128) {
        caller.require_auth();
        Self::require_initialized(&env);
        Self::acquire_lock(&env);

        if amount == 0 {
            panic_with_error!(&env, StakingError::InvalidAmount);
        }

        Self::update_reward(&env, &caller);

        let mut position = Self::get_position(&env, &caller).unwrap_or_else(|| {
            panic_with_error!(&env, StakingError::InsufficientBalance);
        });

        if position.balance < amount {
            panic_with_error!(&env, StakingError::InsufficientBalance);
        }

        // Calculate proportion of effective balance to remove
        let proportion = amount.saturating_mul(PRECISION).checked_div(position.balance).unwrap_or(0);
        let effective_remove = position.effective_balance.saturating_mul(proportion).checked_div(PRECISION).unwrap_or(0);

        position.balance = position.balance.saturating_sub(amount);
        position.effective_balance = position.effective_balance.saturating_sub(effective_remove);

        let is_early = env.ledger().timestamp() < position.lock_end;
        let mut final_transfer_amount = amount;

        if is_early {
            // Apply 10% penalty to principal
            let penalty = amount.saturating_mul(EARLY_WITHDRAWAL_PENALTY_BPS).checked_div(10_000).unwrap_or(0);
            final_transfer_amount = amount.saturating_sub(penalty);
            // Forfeit all accumulated rewards
            position.rewards = 0;
            env.events().publish((symbol_short!("stk_pnlt"), caller.clone()), penalty);
        }

        let mut total_supply: u128 = env
            .storage()
            .instance()
            .get(&StakingDataKey::TotalEffectiveSupply)
            .unwrap_or(0);
        total_supply = total_supply.saturating_sub(effective_remove);

        env.storage()
            .instance()
            .set(&StakingDataKey::TotalEffectiveSupply, &total_supply);
        env.storage()
            .instance()
            .set(&StakingDataKey::Position(caller.clone()), &position);

        let staking_token = env
            .storage()
            .instance()
            .get::<_, Address>(&StakingDataKey::StakingToken)
            .unwrap();
        let token_client = TokenClient::new(&env, &staking_token);
        
        token_client.transfer(
            &env.current_contract_address(),
            &caller,
            &(final_transfer_amount as i128),
        );

        env.events()
            .publish((symbol_short!("stk_unstk"), caller), amount);

        Self::release_lock(&env);
    }

    /// Claim accumulated rewards.
    pub fn claim_rewards(env: Env, caller: Address) {
        caller.require_auth();
        Self::require_initialized(&env);
        Self::acquire_lock(&env);

        Self::update_reward(&env, &caller);

        let mut position = Self::get_position(&env, &caller).unwrap_or_else(|| {
            panic_with_error!(&env, StakingError::InsufficientBalance);
        });

        let rewards = position.rewards;
        if rewards > 0 {
            position.rewards = 0;
            env.storage()
                .instance()
                .set(&StakingDataKey::Position(caller.clone()), &position);

            let reward_token = env
                .storage()
                .instance()
                .get::<_, Address>(&StakingDataKey::RewardToken)
                .unwrap();
            let token_client = TokenClient::new(&env, &reward_token);
            token_client.transfer(&env.current_contract_address(), &caller, &(rewards as i128));

            env.events()
                .publish((symbol_short!("stk_claim"), caller), rewards);
        }

        Self::release_lock(&env);
    }

    /// View function: get the pending rewards for a user.
    pub fn earned(env: Env, account: Address) -> u128 {
        let position = match Self::get_position(&env, &account) {
            Some(p) => p,
            None => return 0,
        };

        let current_reward_per_token = Self::reward_per_token(&env);
        let new_rewards = position
            .effective_balance
            .saturating_mul(current_reward_per_token.saturating_sub(position.user_reward_per_token_paid))
            .checked_div(PRECISION)
            .unwrap_or(0);

        position.rewards.saturating_add(new_rewards)
    }

    /// Admin function: adjust the global reward rate.
    pub fn set_reward_rate(env: Env, caller: Address, rate: u128) {
        caller.require_auth();
        Self::require_admin(&env, &caller);

        // Must update global accumulator before changing rate
        Self::update_reward_global(&env);

        env.storage()
            .instance()
            .set(&StakingDataKey::RewardRate, &rate);
            
        env.events()
            .publish((symbol_short!("stk_rate"),), rate);
    }

    // -----------------------------------------------------------------------
    // Internal Math & State Updaters
    // -----------------------------------------------------------------------

    fn reward_per_token(env: &Env) -> u128 {
        let total_supply: u128 = env
            .storage()
            .instance()
            .get(&StakingDataKey::TotalEffectiveSupply)
            .unwrap_or(0);

        let stored: u128 = env
            .storage()
            .instance()
            .get(&StakingDataKey::RewardPerTokenStored)
            .unwrap_or(0);

        if total_supply == 0 {
            return stored;
        }

        let last_time: u64 = env
            .storage()
            .instance()
            .get(&StakingDataKey::LastUpdateTime)
            .unwrap_or(env.ledger().timestamp());
        let current_time = env.ledger().timestamp();

        let time_delta = current_time.saturating_sub(last_time) as u128;
        let rate: u128 = env
            .storage()
            .instance()
            .get(&StakingDataKey::RewardRate)
            .unwrap_or(0);

        // rewardPerToken = stored + (time_delta * rate * PRECISION / total_supply)
        let newly_accrued = time_delta
            .saturating_mul(rate)
            .saturating_mul(PRECISION)
            .checked_div(total_supply)
            .unwrap_or(0);

        stored.saturating_add(newly_accrued)
    }

    fn update_reward_global(env: &Env) {
        let rpt = Self::reward_per_token(env);
        env.storage()
            .instance()
            .set(&StakingDataKey::RewardPerTokenStored, &rpt);
        env.storage()
            .instance()
            .set(&StakingDataKey::LastUpdateTime, &env.ledger().timestamp());
    }

    fn update_reward(env: &Env, account: &Address) {
        Self::update_reward_global(env);
        
        if let Some(mut position) = Self::get_position(env, account) {
            let rpt = env
                .storage()
                .instance()
                .get::<_, u128>(&StakingDataKey::RewardPerTokenStored)
                .unwrap_or(0);

            let newly_earned = position
                .effective_balance
                .saturating_mul(rpt.saturating_sub(position.user_reward_per_token_paid))
                .checked_div(PRECISION)
                .unwrap_or(0);

            position.rewards = position.rewards.saturating_add(newly_earned);
            position.user_reward_per_token_paid = rpt;
            env.storage()
                .instance()
                .set(&StakingDataKey::Position(account.clone()), &position);
        }
    }

    // -----------------------------------------------------------------------
    // Internal Helpers
    // -----------------------------------------------------------------------

    fn get_position(env: &Env, account: &Address) -> Option<UserPosition> {
        env.storage()
            .instance()
            .get(&StakingDataKey::Position(account.clone()))
    }

    fn require_initialized(env: &Env) {
        if !env.storage().instance().has(&StakingDataKey::Admin) {
            panic_with_error!(env, StakingError::NotInitialized);
        }
    }

    fn require_admin(env: &Env, caller: &Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&StakingDataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, StakingError::NotInitialized));

        if *caller != admin {
            panic_with_error!(env, StakingError::Unauthorized);
        }
    }

    fn acquire_lock(env: &Env) {
        let locked: bool = env
            .storage()
            .instance()
            .get(&StakingDataKey::ReentrancyLock)
            .unwrap_or(false);
        if locked {
            panic_with_error!(env, StakingError::Reentrant);
        }
        env.storage()
            .instance()
            .set(&StakingDataKey::ReentrancyLock, &true);
    }

    fn release_lock(env: &Env) {
        env.storage()
            .instance()
            .set(&StakingDataKey::ReentrancyLock, &false);
    }
}

#[cfg(test)]
#[path = "dynamic_staking_test.rs"]
mod dynamic_staking_test;
