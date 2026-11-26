//! Automated harvest-and-compound yield strategy for the smart vault.
//!
//! A strategy is optional: without one, `compound` re-deposits claimed rewards
//! directly. With one configured, rewards are swapped for the deposit token on
//! the configured AMM before being deposited, so the whole claim → swap →
//! deposit → mint sequence stays inside a single vault invocation.

#![no_std]

use soroban_sdk::{contractclient, panic_with_error, symbol_short, Address, Env, Symbol};

use crate::VaultError;

/// Basis points denominator.
pub const BPS: i128 = 10_000;
/// Default maximum acceptable loss against the 1:1 reward value (1%).
pub const DEFAULT_MAX_SLIPPAGE_BPS: u32 = 100;
/// Hard ceiling for a configured slippage tolerance (10%).
pub const MAX_SLIPPAGE_BPS: u32 = 1_000;

/// Storage key for the configured strategy.
pub const STRATEGY_CONFIG: Symbol = symbol_short!("strat_cfg");
/// Storage key for recorded principal (net user deposits).
pub const TOTAL_PRINCIPAL: Symbol = symbol_short!("principal");

/// Configuration for automated harvesting.
#[soroban_sdk::contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HarvestStrategyConfig {
    /// Address allowed to change this configuration.
    pub admin: Address,
    /// AMM implementing [`RewardSwap`]; `None` means direct re-deposit.
    pub swap_contract: Option<Address>,
    /// Reward token produced by staking.
    pub reward_token: Option<Address>,
    /// Token accepted by the yield pool.
    pub deposit_token: Option<Address>,
    /// Maximum loss accepted in the swap, in basis points.
    pub max_slippage_bps: u32,
}

/// Minimal AMM interface used by the vault to convert rewards into deposits.
///
/// Any contract exposing `swap_rewards` can be plugged in; the real AMM can be
/// wrapped by a thin adapter, and tests use a small mock pool.
#[contractclient(name = "RewardSwapClient")]
pub trait RewardSwap {
    /// Swap `amount_in` reward tokens for deposit tokens, never returning less
    /// than `min_amount_out`.
    fn swap_rewards(env: Env, caller: Address, amount_in: i128, min_amount_out: i128) -> i128;
}

/// Validate a slippage tolerance before storing it.
pub fn validate_slippage(env: &Env, max_slippage_bps: u32) {
    if max_slippage_bps == 0 || max_slippage_bps > MAX_SLIPPAGE_BPS {
        panic_with_error!(env, VaultError::InvalidSlippage);
    }
}

/// Smallest output acceptable for `amount_in` under the configured tolerance.
pub fn minimum_output(env: &Env, amount_in: i128, max_slippage_bps: u32) -> i128 {
    validate_slippage(env, max_slippage_bps);
    let bps = BPS - i128::from(max_slippage_bps);
    amount_in
        .checked_mul(bps)
        .unwrap_or_else(|| panic_with_error!(env, VaultError::Overflow))
        / BPS
}

/// Post-condition on the AMM output: a worse-than-tolerated swap must revert.
pub fn assert_no_slippage(env: &Env, amount_out: i128, min_amount_out: i128) {
    if amount_out < min_amount_out {
        panic_with_error!(env, VaultError::SlippageExceeded);
    }
}

/// Conservation post-condition checked after every compounding step.
///
/// Vault assets must never fall below recorded user principal or shares; any
/// harvested yield only ever increases the gap.
pub fn assert_conservation(
    env: &Env,
    total_assets: i128,
    total_principal: i128,
    total_shares: i128,
) {
    if total_assets < 0
        || total_principal < 0
        || total_shares < 0
        || total_assets < total_principal
        || total_assets < total_shares
    {
        panic_with_error!(env, VaultError::InvariantViolated);
    }
}
