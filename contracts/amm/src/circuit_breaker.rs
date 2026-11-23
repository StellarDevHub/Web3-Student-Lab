use crate::{AmmError, DataKey};
use soroban_sdk::{panic_with_error, symbol_short, Address, Env, Symbol};

pub const WITHDRAWAL_WINDOW_SECONDS: u64 = 24 * 60 * 60;

const PAUSED: Symbol = symbol_short!("amm_pause");
const WINDOW_START: Symbol = symbol_short!("wstart");
const WINDOW_LIMIT_A: Symbol = symbol_short!("wla");
const WINDOW_LIMIT_B: Symbol = symbol_short!("wlb");
const WINDOW_USED_A: Symbol = symbol_short!("wua");
const WINDOW_USED_B: Symbol = symbol_short!("wub");

pub fn is_paused(env: &Env) -> bool {
    env.storage()
        .instance()
        .get::<_, bool>(&PAUSED)
        .unwrap_or(false)
}

pub fn set_paused(env: &Env, paused: bool, caller: &Address) {
    env.storage().instance().set(&PAUSED, &paused);
    crate::events::pause_changed(env, caller, paused);
}

pub fn assert_not_paused(env: &Env) {
    if is_paused(env) {
        panic_with_error!(env, AmmError::ContractPaused);
    }
}

/// Limit token outflows independently because the AMM has no common price
/// oracle for comparing reserves denominated in different assets.
pub fn record_outflow(env: &Env, reserve_a: i128, reserve_b: i128, amount_a: i128, amount_b: i128) {
    let now = env.ledger().timestamp();
    let start = env.storage().instance().get::<_, u64>(&WINDOW_START);
    let window_open = start
        .map(|start| now.saturating_sub(start) < WITHDRAWAL_WINDOW_SECONDS)
        .unwrap_or(false);

    let (limit_a, limit_b, used_a, used_b) = if window_open {
        (
            env.storage()
                .instance()
                .get::<_, i128>(&WINDOW_LIMIT_A)
                .unwrap_or(0),
            env.storage()
                .instance()
                .get::<_, i128>(&WINDOW_LIMIT_B)
                .unwrap_or(0),
            env.storage()
                .instance()
                .get::<_, i128>(&WINDOW_USED_A)
                .unwrap_or(0),
            env.storage()
                .instance()
                .get::<_, i128>(&WINDOW_USED_B)
                .unwrap_or(0),
        )
    } else {
        let limit_a = daily_limit(env, reserve_a);
        let limit_b = daily_limit(env, reserve_b);
        env.storage().instance().set(&WINDOW_START, &now);
        env.storage().instance().set(&WINDOW_LIMIT_A, &limit_a);
        env.storage().instance().set(&WINDOW_LIMIT_B, &limit_b);
        env.storage().instance().set(&WINDOW_USED_A, &0i128);
        env.storage().instance().set(&WINDOW_USED_B, &0i128);
        (limit_a, limit_b, 0, 0)
    };

    let new_used_a = used_a
        .checked_add(amount_a)
        .unwrap_or_else(|| panic_with_error!(env, AmmError::Overflow));
    let new_used_b = used_b
        .checked_add(amount_b)
        .unwrap_or_else(|| panic_with_error!(env, AmmError::Overflow));
    if amount_a > limit_a || amount_b > limit_b || new_used_a > limit_a || new_used_b > limit_b {
        panic_with_error!(env, AmmError::WithdrawalLimitExceeded);
    }
    env.storage().instance().set(&WINDOW_USED_A, &new_used_a);
    env.storage().instance().set(&WINDOW_USED_B, &new_used_b);
}

fn daily_limit(env: &Env, reserve: i128) -> i128 {
    if reserve < 0 {
        panic_with_error!(env, AmmError::Overflow);
    }
    reserve
        .checked_div(10)
        .unwrap_or_else(|| panic_with_error!(env, AmmError::Overflow))
}

pub fn admin(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&DataKey::Admin)
        .unwrap_or_else(|| panic_with_error!(env, AmmError::NotInitialized))
}

pub fn set_guardian(env: &Env, guardian: &Address) {
    env.storage().instance().set(&DataKey::Guardian, guardian);
}

pub fn is_guardian(env: &Env, account: &Address) -> bool {
    env.storage()
        .instance()
        .get::<_, Address>(&DataKey::Guardian)
        .as_ref()
        == Some(account)
}
