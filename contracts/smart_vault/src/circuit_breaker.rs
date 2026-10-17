use crate::VaultError;
use soroban_sdk::{panic_with_error, symbol_short, Address, Env, Symbol};

pub const WITHDRAWAL_WINDOW_SECONDS: u64 = 24 * 60 * 60;

const PAUSED: Symbol = symbol_short!("sv_pause");
const WINDOW_START: Symbol = symbol_short!("wd_start");
const WINDOW_LIMIT: Symbol = symbol_short!("wd_limit");
const WINDOW_USED: Symbol = symbol_short!("wd_used");

pub fn is_paused(env: &Env) -> bool {
    env.storage()
        .instance()
        .get::<_, bool>(&PAUSED)
        .unwrap_or(false)
}

pub fn set_paused(env: &Env, caller: &Address, paused: bool) {
    env.storage().instance().set(&PAUSED, &paused);
    env.events()
        .publish((symbol_short!("sv_pause"),), (paused, caller.clone()));
}

pub fn assert_not_paused(env: &Env) {
    if is_paused(env) {
        panic_with_error!(env, VaultError::ContractPaused);
    }
}

/// Caps all withdrawals in each 24-hour window to 10% of assets at the start.
pub fn record_withdrawal(env: &Env, total_assets: i128, amount: i128) {
    let now = env.ledger().timestamp();
    let start = env.storage().instance().get::<_, u64>(&WINDOW_START);
    let window_open = start
        .map(|start| now.saturating_sub(start) < WITHDRAWAL_WINDOW_SECONDS)
        .unwrap_or(false);

    let (limit, used) = if window_open {
        (
            env.storage()
                .instance()
                .get::<_, i128>(&WINDOW_LIMIT)
                .unwrap_or(0),
            env.storage()
                .instance()
                .get::<_, i128>(&WINDOW_USED)
                .unwrap_or(0),
        )
    } else {
        let limit = total_assets
            .checked_div(10)
            .unwrap_or_else(|| panic_with_error!(env, VaultError::Overflow));
        env.storage().instance().set(&WINDOW_START, &now);
        env.storage().instance().set(&WINDOW_LIMIT, &limit);
        env.storage().instance().set(&WINDOW_USED, &0i128);
        (limit, 0)
    };

    let new_used = used
        .checked_add(amount)
        .unwrap_or_else(|| panic_with_error!(env, VaultError::Overflow));
    if amount > limit || new_used > limit {
        panic_with_error!(env, VaultError::WithdrawalLimitExceeded);
    }

    env.storage().instance().set(&WINDOW_USED, &new_used);
}
