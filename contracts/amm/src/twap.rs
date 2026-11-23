//! # Automated Market Maker Time-Weighted Average Price (TWAP) Oracle
//!
//! Provides Uniswap v2-style cumulative price-time accumulators ($P \cdot \Delta t$)
//! resistant to single-block flash-loan and sandwich manipulation.

use crate::storage::{DataKey, TwapSnapshot};
use crate::AmmError;
use soroban_sdk::{Address, Env};

/// Fixed point precision scaling factor (1e9) for fractional exchange rates.
pub const PRICE_PRECISION: i128 = 1_000_000_000;

/// Standard 30-minute observation window in seconds.
pub const TWAP_PERIOD_30M: u64 = 1_800;

/// Standard 1-hour observation window in seconds.
pub const TWAP_PERIOD_1H: u64 = 3_600;

/// Updates the cumulative price accumulators based on time elapsed since last update.
/// If time_elapsed == 0 (e.g. trades in the same ledger/block), cumulative accumulator does NOT advance,
/// guaranteeing immunity against single-block flash loan manipulations.
pub fn update_cumulative_prices(env: &Env, reserve_a: i128, reserve_b: i128) {
    let current_time = env.ledger().timestamp();
    let last_time: u64 = env
        .storage()
        .instance()
        .get(&DataKey::LastBlockTimestamp)
        .unwrap_or(current_time);

    let mut price_a_cumulative: i128 = env
        .storage()
        .instance()
        .get(&DataKey::PriceACumulative)
        .unwrap_or(0);

    let mut price_b_cumulative: i128 = env
        .storage()
        .instance()
        .get(&DataKey::PriceBCumulative)
        .unwrap_or(0);

    let time_elapsed = current_time.saturating_sub(last_time);

    if time_elapsed > 0 && reserve_a > 0 && reserve_b > 0 {
        // Spot price of A denominated in B: (reserve_b / reserve_a)
        let spot_price_a = (reserve_b * PRICE_PRECISION) / reserve_a;
        // Spot price of B denominated in A: (reserve_a / reserve_b)
        let spot_price_b = (reserve_a * PRICE_PRECISION) / reserve_b;

        price_a_cumulative += spot_price_a * (time_elapsed as i128);
        price_b_cumulative += spot_price_b * (time_elapsed as i128);

        env.storage()
            .instance()
            .set(&DataKey::PriceACumulative, &price_a_cumulative);
        env.storage()
            .instance()
            .set(&DataKey::PriceBCumulative, &price_b_cumulative);
        env.storage()
            .instance()
            .set(&DataKey::LastBlockTimestamp, &current_time);

        // Record historical snapshot for windowed observation lookbacks
        let count: u32 = env
            .storage()
            .instance()
            .get(&DataKey::SnapshotCount)
            .unwrap_or(0);

        let snapshot = TwapSnapshot {
            timestamp: current_time,
            price_a_cumulative,
            price_b_cumulative,
        };

        env.storage()
            .instance()
            .set(&DataKey::Snapshot(count), &snapshot);
        env.storage()
            .instance()
            .set(&DataKey::SnapshotCount, &(count + 1));
    } else if !env.storage().instance().has(&DataKey::LastBlockTimestamp) {
        env.storage()
            .instance()
            .set(&DataKey::LastBlockTimestamp, &current_time);
        env.storage()
            .instance()
            .set(&DataKey::PriceACumulative, &0i128);
        env.storage()
            .instance()
            .set(&DataKey::PriceBCumulative, &0i128);

        let snapshot = TwapSnapshot {
            timestamp: current_time,
            price_a_cumulative: 0,
            price_b_cumulative: 0,
        };
        env.storage()
            .instance()
            .set(&DataKey::Snapshot(0), &snapshot);
        env.storage().instance().set(&DataKey::SnapshotCount, &1u32);
    }
}

/// Finds the closest historical snapshot prior to or at `target_timestamp`.
pub fn get_historical_snapshot(env: &Env, target_timestamp: u64) -> Option<TwapSnapshot> {
    let count: u32 = env
        .storage()
        .instance()
        .get(&DataKey::SnapshotCount)
        .unwrap_or(0);

    if count == 0 {
        return None;
    }

    let mut best_match: Option<TwapSnapshot> = None;

    // Linear scan back from newest snapshot
    for i in (0..count).rev() {
        if let Some(snap) = env
            .storage()
            .instance()
            .get::<DataKey, TwapSnapshot>(&DataKey::Snapshot(i))
        {
            if snap.timestamp <= target_timestamp {
                best_match = Some(snap);
                break;
            }
            best_match = Some(snap); // fallback to oldest available if all are newer
        }
    }

    best_match
}

/// Computes the Time-Weighted Average Price (TWAP) for `token_in` over `period_seconds`.
/// Returns the amount of output token received for `amount_in`.
pub fn consult(
    env: &Env,
    token_in: &Address,
    amount_in: i128,
    period_seconds: u64,
) -> Result<i128, AmmError> {
    if amount_in <= 0 {
        return Err(AmmError::InvalidAmount);
    }

    let token_a: Address = env
        .storage()
        .instance()
        .get(&DataKey::TokenA)
        .ok_or(AmmError::NotInitialized)?;
    let token_b: Address = env
        .storage()
        .instance()
        .get(&DataKey::TokenB)
        .ok_or(AmmError::NotInitialized)?;

    let is_token_a = *token_in == token_a;
    let is_token_b = *token_in == token_b;

    if !is_token_a && !is_token_b {
        return Err(AmmError::InvalidAmount);
    }

    let current_time = env.ledger().timestamp();
    let target_time = current_time.saturating_sub(period_seconds);

    let current_cum_a: i128 = env
        .storage()
        .instance()
        .get(&DataKey::PriceACumulative)
        .unwrap_or(0);
    let current_cum_b: i128 = env
        .storage()
        .instance()
        .get(&DataKey::PriceBCumulative)
        .unwrap_or(0);

    let (past_cum, current_cum, effective_delta_t) = match get_historical_snapshot(env, target_time)
    {
        Some(snap) => {
            let dt = current_time.saturating_sub(snap.timestamp);
            let delta_t = if dt > 0 { dt } else { 1 };
            if is_token_a {
                (snap.price_a_cumulative, current_cum_a, delta_t)
            } else {
                (snap.price_b_cumulative, current_cum_b, delta_t)
            }
        }
        None => {
            let dt = if period_seconds > 0 {
                period_seconds
            } else {
                1
            };
            if is_token_a {
                (0, current_cum_a, dt)
            } else {
                (0, current_cum_b, dt)
            }
        }
    };

    let delta_cum = current_cum.saturating_sub(past_cum);
    if delta_cum <= 0 || effective_delta_t == 0 {
        // Fallback to current spot price if no time elapsed
        let res_a: i128 = env
            .storage()
            .instance()
            .get(&DataKey::ReserveA)
            .unwrap_or(1);
        let res_b: i128 = env
            .storage()
            .instance()
            .get(&DataKey::ReserveB)
            .unwrap_or(1);
        return if is_token_a {
            Ok((amount_in * res_b) / res_a)
        } else {
            Ok((amount_in * res_a) / res_b)
        };
    }

    // TWAP = delta_cumulative / delta_time (scaled by PRICE_PRECISION)
    let twap_price = delta_cum / (effective_delta_t as i128);

    // amount_out = (amount_in * twap_price) / PRICE_PRECISION
    let amount_out = (amount_in * twap_price) / PRICE_PRECISION;
    Ok(amount_out)
}
