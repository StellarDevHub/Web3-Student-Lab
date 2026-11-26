#![no_std]

pub mod math;

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, token, Address, Env,
};

const TTL_THRESHOLD: u32 = 10_000;
const TTL_BUMP: u32 = 518_400;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum YieldFarmingError {
    AlreadyInitialized = 1,
    Unauthorized = 2,
    InvalidAmount = 3,
    InsufficientStake = 4,
    InvalidRewardRate = 5,
    ArithmeticOverflow = 6,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    StakingToken,
    RewardToken,
    RewardRate,
    TotalStaked,
    RewardPerTokenStored,
    LastUpdateTime,
    UserStake(Address),
    UserRewardPerTokenPaid(Address),
    Rewards(Address),
}

#[contract]
pub struct YieldFarmingPool;

#[contractimpl]
impl YieldFarmingPool {
    pub fn initialize(
        env: Env,
        admin: Address,
        staking_token: Address,
        reward_token: Address,
        reward_rate: i128,
    ) {
        admin.require_auth();
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, YieldFarmingError::AlreadyInitialized);
        }
        if reward_rate < 0 {
            panic_with_error!(&env, YieldFarmingError::InvalidRewardRate);
        }

        let instance = env.storage().instance();
        instance.set(&DataKey::Admin, &admin);
        instance.set(&DataKey::StakingToken, &staking_token);
        instance.set(&DataKey::RewardToken, &reward_token);
        instance.set(&DataKey::RewardRate, &reward_rate);
        instance.set(&DataKey::TotalStaked, &0i128);
        instance.set(&DataKey::RewardPerTokenStored, &0i128);
        instance.set(&DataKey::LastUpdateTime, &env.ledger().timestamp());
        Self::extend_instance_ttl(&env);
    }

    pub fn stake(env: Env, user: Address, amount: i128) {
        user.require_auth();
        Self::require_initialized(&env);
        if amount <= 0 {
            panic_with_error!(&env, YieldFarmingError::InvalidAmount);
        }

        Self::update_reward(&env, Some(&user));
        let staking_token = Self::staking_token(&env);
        token::Client::new(&env, &staking_token).transfer(
            &user,
            &env.current_contract_address(),
            &amount,
        );

        let user_stake = Self::user_stake(&env, &user)
            .checked_add(amount)
            .unwrap_or_else(|| panic_with_error!(&env, YieldFarmingError::ArithmeticOverflow));
        let total_staked = Self::total_staked(&env)
            .checked_add(amount)
            .unwrap_or_else(|| panic_with_error!(&env, YieldFarmingError::ArithmeticOverflow));
        env.storage()
            .persistent()
            .set(&DataKey::UserStake(user.clone()), &user_stake);
        env.storage()
            .instance()
            .set(&DataKey::TotalStaked, &total_staked);
        Self::extend_user_ttl(&env, &user);
        Self::extend_instance_ttl(&env);
    }

    pub fn unstake(env: Env, user: Address, amount: i128) {
        user.require_auth();
        Self::require_initialized(&env);
        if amount <= 0 {
            panic_with_error!(&env, YieldFarmingError::InvalidAmount);
        }

        Self::update_reward(&env, Some(&user));
        let user_stake = Self::user_stake(&env, &user);
        if user_stake < amount {
            panic_with_error!(&env, YieldFarmingError::InsufficientStake);
        }

        let updated_stake = user_stake
            .checked_sub(amount)
            .unwrap_or_else(|| panic_with_error!(&env, YieldFarmingError::ArithmeticOverflow));
        let total_staked = Self::total_staked(&env)
            .checked_sub(amount)
            .unwrap_or_else(|| panic_with_error!(&env, YieldFarmingError::ArithmeticOverflow));
        env.storage()
            .persistent()
            .set(&DataKey::UserStake(user.clone()), &updated_stake);
        env.storage()
            .instance()
            .set(&DataKey::TotalStaked, &total_staked);

        let staking_token = Self::staking_token(&env);
        token::Client::new(&env, &staking_token).transfer(
            &env.current_contract_address(),
            &user,
            &amount,
        );
        Self::extend_user_ttl(&env, &user);
        Self::extend_instance_ttl(&env);
    }

    pub fn claim_rewards(env: Env, user: Address) -> i128 {
        user.require_auth();
        Self::require_initialized(&env);
        Self::update_reward(&env, Some(&user));

        let key = DataKey::Rewards(user.clone());
        let reward: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        if reward > 0 {
            env.storage().persistent().set(&key, &0i128);
            let reward_token = Self::reward_token(&env);
            token::Client::new(&env, &reward_token).transfer(
                &env.current_contract_address(),
                &user,
                &reward,
            );
        }

        Self::extend_user_ttl(&env, &user);
        Self::extend_instance_ttl(&env);
        reward
    }

    pub fn set_reward_rate(env: Env, admin: Address, reward_rate: i128) {
        admin.require_auth();
        Self::require_admin(&env, &admin);
        if reward_rate < 0 {
            panic_with_error!(&env, YieldFarmingError::InvalidRewardRate);
        }

        Self::update_reward(&env, None);
        env.storage()
            .instance()
            .set(&DataKey::RewardRate, &reward_rate);
        Self::extend_instance_ttl(&env);
    }

    pub fn get_reward_per_token(env: Env) -> i128 {
        let stored = Self::reward_per_token_stored(&env);
        let last_update = Self::last_update_time(&env);
        let elapsed = env.ledger().timestamp().saturating_sub(last_update);
        let rate = Self::reward_rate(&env);
        let reward_per_token =
            math::reward_per_token(stored, elapsed, rate, Self::total_staked(&env))
                .unwrap_or_else(|| {
                    panic_with_error!(&env, YieldFarmingError::ArithmeticOverflow)
                });
        Self::extend_instance_ttl(&env);
        reward_per_token
    }

    pub fn earned(env: Env, user: Address) -> i128 {
        let accrued: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::Rewards(user.clone()))
            .unwrap_or(0);
        let paid: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::UserRewardPerTokenPaid(user.clone()))
            .unwrap_or(0);
        let earned = math::earned(
            Self::user_stake(&env, &user),
            Self::get_reward_per_token(env.clone()),
            paid,
            accrued,
        )
        .unwrap_or_else(|| panic_with_error!(&env, YieldFarmingError::ArithmeticOverflow));
        Self::extend_user_ttl(&env, &user);
        Self::extend_instance_ttl(&env);
        earned
    }

    pub fn get_user_stake(env: Env, user: Address) -> i128 {
        let stake = Self::user_stake(&env, &user);
        Self::extend_user_ttl(&env, &user);
        Self::extend_instance_ttl(&env);
        stake
    }

    pub fn get_total_staked(env: Env) -> i128 {
        let total = Self::total_staked(&env);
        Self::extend_instance_ttl(&env);
        total
    }

    pub fn get_admin(env: Env) -> Address {
        let admin = env.storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, YieldFarmingError::Unauthorized));
        Self::extend_instance_ttl(&env);
        admin
    }

    fn update_reward(env: &Env, user: Option<&Address>) {
        let reward_per_token = Self::current_reward_per_token(env);
        env.storage()
            .instance()
            .set(&DataKey::RewardPerTokenStored, &reward_per_token);
        env.storage()
            .instance()
            .set(&DataKey::LastUpdateTime, &env.ledger().timestamp());

        if let Some(user) = user {
            let paid: i128 = env
                .storage()
                .persistent()
                .get(&DataKey::UserRewardPerTokenPaid(user.clone()))
                .unwrap_or(0);
            let accrued: i128 = env
                .storage()
                .persistent()
                .get(&DataKey::Rewards(user.clone()))
                .unwrap_or(0);
            let earned = math::earned(Self::user_stake(env, user), reward_per_token, paid, accrued)
                .unwrap_or_else(|| {
                    panic_with_error!(env, YieldFarmingError::ArithmeticOverflow)
                });
            env.storage()
                .persistent()
                .set(&DataKey::Rewards(user.clone()), &earned);
            env.storage().persistent().set(
                &DataKey::UserRewardPerTokenPaid(user.clone()),
                &reward_per_token,
            );
            Self::extend_user_ttl(env, user);
        }
        Self::extend_instance_ttl(env);
    }

    fn current_reward_per_token(env: &Env) -> i128 {
        let elapsed = env
            .ledger()
            .timestamp()
            .saturating_sub(Self::last_update_time(env));
        math::reward_per_token(
            Self::reward_per_token_stored(env),
            elapsed,
            Self::reward_rate(env),
            Self::total_staked(env),
        )
        .unwrap_or_else(|| panic_with_error!(env, YieldFarmingError::ArithmeticOverflow))
    }

    fn require_initialized(env: &Env) {
        if !env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(env, YieldFarmingError::Unauthorized);
        }
    }

    fn require_admin(env: &Env, admin: &Address) {
        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, YieldFarmingError::Unauthorized));
        if stored_admin != *admin {
            panic_with_error!(env, YieldFarmingError::Unauthorized);
        }
    }

    fn staking_token(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::StakingToken)
            .unwrap_or_else(|| panic_with_error!(env, YieldFarmingError::Unauthorized))
    }

    fn reward_token(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::RewardToken)
            .unwrap_or_else(|| panic_with_error!(env, YieldFarmingError::Unauthorized))
    }

    fn reward_rate(env: &Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::RewardRate)
            .unwrap_or(0)
    }

    fn total_staked(env: &Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::TotalStaked)
            .unwrap_or(0)
    }

    fn reward_per_token_stored(env: &Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::RewardPerTokenStored)
            .unwrap_or(0)
    }

    fn last_update_time(env: &Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::LastUpdateTime)
            .unwrap_or(0)
    }

    fn user_stake(env: &Env, user: &Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::UserStake(user.clone()))
            .unwrap_or(0)
    }

    fn extend_instance_ttl(env: &Env) {
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_BUMP);
    }

    fn extend_user_ttl(env: &Env, user: &Address) {
        for key in [
            DataKey::UserStake(user.clone()),
            DataKey::UserRewardPerTokenPaid(user.clone()),
            DataKey::Rewards(user.clone()),
        ] {
            if env.storage().persistent().has(&key) {
                env.storage()
                    .persistent()
                    .extend_ttl(&key, TTL_THRESHOLD, TTL_BUMP);
            }
        }
    }
}

#[cfg(test)]
mod test;
