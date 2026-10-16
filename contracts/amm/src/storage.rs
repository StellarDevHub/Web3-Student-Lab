//! # AMM Storage & TWAP Observation Keys
//!
//! Provides typed DataKey enums and helpers for reserves, balances, and
//! time-weighted average price (TWAP) historical accumulators.

use soroban_sdk::contracttype;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TwapSnapshot {
    pub timestamp: u64,
    pub price_a_cumulative: i128,
    pub price_b_cumulative: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Admin,
    TokenA,
    TokenB,
    PoolShare,
    BalanceA,
    BalanceB,
    ReserveA,
    ReserveB,
    TotalShares,
    FeeCollector,
    BaseFeeBps,
    // ── TWAP Storage Keys ─────────────────────────────────────────────
    PriceACumulative,
    PriceBCumulative,
    LastBlockTimestamp,
    SnapshotCount,
    Snapshot(u32),
    // ── Anti-MEV Storage Keys ─────────────────────────────────────────
    TradeRecord(soroban_sdk::Address),
}
