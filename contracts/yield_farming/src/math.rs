const REWARD_PRECISION: i128 = 1_000_000_000_000_000_000;

pub fn reward_per_token(
    stored: i128,
    elapsed_seconds: u64,
    reward_rate: i128,
    total_staked: i128,
) -> Option<i128> {
    if total_staked == 0 || elapsed_seconds == 0 || reward_rate == 0 {
        return Some(stored);
    }

    let reward = i128::from(elapsed_seconds).checked_mul(reward_rate)?;
    let scaled_reward = reward.checked_mul(REWARD_PRECISION)?;
    stored.checked_add(scaled_reward.checked_div(total_staked)?)
}

pub fn earned(
    user_stake: i128,
    reward_per_token: i128,
    reward_per_token_paid: i128,
    accrued: i128,
) -> Option<i128> {
    let reward_delta = reward_per_token.checked_sub(reward_per_token_paid)?;
    let newly_earned = user_stake
        .checked_mul(reward_delta)?
        .checked_div(REWARD_PRECISION)?;
    accrued.checked_add(newly_earned)
}