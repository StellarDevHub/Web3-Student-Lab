//! Anti-MEV sandwich protection module.
//!
//! Provides defense mechanisms against frontrunning and sandwich attacks on DEX liquidity pools:
//! - User-specified deadline validation (reverts if ledger timestamp exceeds designated deadline).
//! - Minimum output amount checks (strict slippage enforcement).
//! - Same-block bidirectional trade restriction (reverting immediate round-trip arbitrage from the same origin address).

use soroban_sdk::{panic_with_error, Address, Env};
use crate::{storage::DataKey, AmmError};

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum SwapDirection {
    AtoB = 1,
    BtoA = 2,
}

/// Validates that transaction execution does not exceed the user's deadline.
pub fn check_deadline(env: &Env, deadline: u64) {
    if deadline > 0 && env.ledger().timestamp() > deadline {
        panic_with_error!(env, AmmError::DeadlineExceeded);
    }
}

/// Enforces that output amount is at least the user's minimum expected output.
pub fn check_min_output(env: &Env, amount_out: i128, min_amount_out: i128) {
    if amount_out < min_amount_out {
        panic_with_error!(env, AmmError::SlippageExceeded);
    }
}

/// Prevents the same origin address from executing bidirectional round-trip trades
/// (A -> B followed by B -> A or vice-versa) in the same block/ledger sequence.
pub fn check_and_record_trade(env: &Env, user: &Address, direction: SwapDirection) {
    let current_ledger = env.ledger().sequence();
    let key = DataKey::TradeRecord(user.clone());

    let record: Option<(u32, u32)> = env.storage().temporary().get(&key);
    if let Some((recorded_ledger, recorded_direction)) = record {
        if recorded_ledger == current_ledger && recorded_direction != (direction as u32) {
            panic_with_error!(env, AmmError::SameBlockBidirectionalTrade);
        }
    }

    env.storage().temporary().set(&key, &(current_ledger, direction as u32));
    env.storage().temporary().extend_ttl(&key, 100, 1000);
}
