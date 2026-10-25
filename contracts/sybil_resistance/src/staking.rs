use crate::{DataKey, SybilError};
use soroban_sdk::{contracttype, panic_with_error, token, Address, BytesN, Env};

pub const COOLING_OFF_SECONDS: u64 = 14 * 24 * 60 * 60;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StakeConfig {
    pub token: Address,
    pub treasury: Address,
    pub minimum_stake: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StakePosition {
    pub amount: i128,
    pub unlock_at: u64,
}

pub fn configure(env: &Env, token_address: Address, treasury: Address, minimum_stake: i128) {
    let config = StakeConfig {
        token: token_address,
        treasury,
        minimum_stake,
    };
    env.storage().instance().set(&DataKey::StakeConfig, &config);
}

fn get_config(env: &Env) -> StakeConfig {
    env.storage()
        .instance()
        .get(&DataKey::StakeConfig)
        .unwrap_or_else(|| panic_with_error!(env, SybilError::InvalidStakingConfig))
}

pub fn get_stake(env: &Env, user: &Address) -> Option<StakePosition> {
    env.storage()
        .persistent()
        .get(&DataKey::Stake(user.clone()))
}

pub fn deposit(env: &Env, user: &Address, amount: i128) {
    if amount <= 0 {
        panic_with_error!(env, SybilError::InvalidAmount);
    }
    if env
        .storage()
        .persistent()
        .get::<_, bool>(&DataKey::BannedUser(user.clone()))
        .unwrap_or(false)
    {
        panic_with_error!(env, SybilError::UserBanned);
    }
    let config = get_config(env);
    let mut stake = get_stake(env, user).unwrap_or(StakePosition {
        amount: 0,
        unlock_at: 0,
    });
    stake.amount = stake
        .amount
        .checked_add(amount)
        .unwrap_or_else(|| panic_with_error!(env, SybilError::InvalidAmount));
    if stake.amount < config.minimum_stake {
        panic_with_error!(env, SybilError::InsufficientStake);
    }

    token::Client::new(env, &config.token).transfer(user, &env.current_contract_address(), &amount);
    // A new deposit restarts the cooling-off requirement for the combined bond.
    stake.unlock_at = 0;
    env.storage()
        .persistent()
        .set(&DataKey::Stake(user.clone()), &stake);
    env.events()
        .publish((soroban_sdk::symbol_short!("stake"), user.clone()), amount);
}

pub fn request_withdrawal(env: &Env, user: &Address) -> u64 {
    let mut stake =
        get_stake(env, user).unwrap_or_else(|| panic_with_error!(env, SybilError::NoStake));
    if stake.amount <= 0 {
        panic_with_error!(env, SybilError::NoStake);
    }
    let unlock_at = env
        .ledger()
        .timestamp()
        .checked_add(COOLING_OFF_SECONDS)
        .unwrap_or_else(|| panic_with_error!(env, SybilError::InvalidAmount));
    stake.unlock_at = unlock_at;
    env.storage()
        .persistent()
        .set(&DataKey::Stake(user.clone()), &stake);
    env.events().publish(
        (soroban_sdk::symbol_short!("unstake"), user.clone()),
        unlock_at,
    );
    unlock_at
}

pub fn withdraw(env: &Env, user: &Address) -> i128 {
    let stake = get_stake(env, user).unwrap_or_else(|| panic_with_error!(env, SybilError::NoStake));
    if stake.amount <= 0 {
        panic_with_error!(env, SybilError::NoStake);
    }
    if stake.unlock_at == 0 || env.ledger().timestamp() < stake.unlock_at {
        panic_with_error!(env, SybilError::CoolingOffPeriod);
    }
    let config = get_config(env);
    token::Client::new(env, &config.token).transfer(
        &env.current_contract_address(),
        user,
        &stake.amount,
    );
    env.storage()
        .persistent()
        .remove(&DataKey::Stake(user.clone()));
    env.events().publish(
        (soroban_sdk::symbol_short!("withdraw"), user.clone()),
        stake.amount,
    );
    stake.amount
}

pub fn is_eligible(env: &Env, user: &Address) -> bool {
    let config = match env
        .storage()
        .instance()
        .get::<_, StakeConfig>(&DataKey::StakeConfig)
    {
        Some(config) => config,
        None => return false,
    };
    match get_stake(env, user) {
        Some(stake) => stake.amount >= config.minimum_stake && stake.unlock_at == 0,
        None => false,
    }
}

pub fn slash_duplicate(env: &Env, user: &Address, evidence_id: BytesN<32>) {
    if env
        .storage()
        .persistent()
        .has(&DataKey::FraudEvidence(evidence_id.clone()))
    {
        panic_with_error!(env, SybilError::DuplicateEvidence);
    }
    let stake = get_stake(env, user);
    let config = get_config(env);
    env.storage()
        .persistent()
        .set(&DataKey::FraudEvidence(evidence_id.clone()), user);
    env.storage()
        .persistent()
        .set(&DataKey::BannedUser(user.clone()), &true);
    env.storage()
        .persistent()
        .remove(&DataKey::VerifiedUser(user.clone()));
    env.storage()
        .persistent()
        .remove(&DataKey::Attestation(user.clone()));

    if let Some(position) = stake {
        if position.amount > 0 {
            token::Client::new(env, &config.token).transfer(
                &env.current_contract_address(),
                &config.treasury,
                &position.amount,
            );
        }
        env.storage()
            .persistent()
            .remove(&DataKey::Stake(user.clone()));
    }
    env.events().publish(
        (soroban_sdk::symbol_short!("slashed"), user.clone()),
        evidence_id,
    );
}
