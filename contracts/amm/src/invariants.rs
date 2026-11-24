use soroban_sdk::{panic_with_error, Env};

use crate::{AmmError, DataKey};

pub(crate) fn assert_balance_reserve_invariant(env: &Env) {
    let balance_a: i128 = env
        .storage()
        .instance()
        .get(&DataKey::BalanceA)
        .unwrap_or(0);
    let balance_b: i128 = env
        .storage()
        .instance()
        .get(&DataKey::BalanceB)
        .unwrap_or(0);
    let reserve_a: i128 = env
        .storage()
        .instance()
        .get(&DataKey::ReserveA)
        .unwrap_or(0);
    let reserve_b: i128 = env
        .storage()
        .instance()
        .get(&DataKey::ReserveB)
        .unwrap_or(0);

    if balance_a < 0 || balance_b < 0 || reserve_a < 0 || reserve_b < 0 {
        panic_with_error!(env, AmmError::InvariantViolated);
    }
    if balance_a > reserve_a || balance_b > reserve_b {
        panic_with_error!(env, AmmError::InvariantViolated);
    }

    let balances = balance_a
        .checked_add(balance_b)
        .unwrap_or_else(|| panic_with_error!(env, AmmError::InvariantViolated));
    let reserves = reserve_a
        .checked_add(reserve_b)
        .unwrap_or_else(|| panic_with_error!(env, AmmError::InvariantViolated));
    if balances > reserves {
        panic_with_error!(env, AmmError::InvariantViolated);
    }
}
