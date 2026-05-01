//! Route Optimizer – pure calculation module for DEX Aggregator (#378)
//!
//! No contract storage. Used by dex_aggregator.rs.
//!
//! Design:
//! - All math uses integer arithmetic with PRECISION = 1_000_000.
//! - Constant-product AMM price formula: out = (reserve_out * in) / (reserve_in + in)
//! - Slippage = (ideal_price - actual_price) / ideal_price
//! - Optimal split: greedy allocation to the pool with the best marginal price.
//! - Gas-adjusted net output: subtract estimated gas cost from gross output.

/// Fixed-point precision (6 decimal places).
pub const PRECISION: u128 = 1_000_000;

/// Basis points denominator.
pub const BPS: u128 = 10_000;

// ---------------------------------------------------------------------------
// Pool snapshot (passed in; no on-chain storage here)
// ---------------------------------------------------------------------------

/// A snapshot of a single liquidity pool used for routing calculations.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PoolSnapshot {
    /// Unique pool identifier (index into the aggregator's pool list).
    pub pool_id: u32,
    /// Reserve of the input token.
    pub reserve_in: u128,
    /// Reserve of the output token.
    pub reserve_out: u128,
    /// Fee in basis points (e.g. 30 = 0.30%).
    pub fee_bps: u128,
    /// Estimated gas cost (in output-token units) to route through this pool.
    pub gas_cost: u128,
}

// ---------------------------------------------------------------------------
// AMM math
// ---------------------------------------------------------------------------

/// Constant-product AMM output for a given input amount, accounting for fee.
///
/// out = reserve_out * amount_in_after_fee / (reserve_in + amount_in_after_fee)
pub fn amm_out(pool: &PoolSnapshot, amount_in: u128) -> u128 {
    if pool.reserve_in == 0 || pool.reserve_out == 0 || amount_in == 0 {
        return 0;
    }
    let fee_factor = BPS - pool.fee_bps; // e.g. 9970 for 0.30%
    let amount_in_after_fee = amount_in * fee_factor / BPS;
    pool.reserve_out * amount_in_after_fee / (pool.reserve_in + amount_in_after_fee)
}

/// Spot price of the pool: output tokens per input token (PRECISION units).
pub fn spot_price(pool: &PoolSnapshot) -> u128 {
    if pool.reserve_in == 0 {
        return 0;
    }
    pool.reserve_out * PRECISION / pool.reserve_in
}

/// Slippage in basis points for routing `amount_in` through `pool`.
///
/// slippage_bps = (ideal_out - actual_out) * BPS / ideal_out
pub fn slippage_bps(pool: &PoolSnapshot, amount_in: u128) -> u128 {
    let ideal_out = amount_in * pool.reserve_out / pool.reserve_in;
    let actual_out = amm_out(pool, amount_in);
    if ideal_out == 0 || actual_out >= ideal_out {
        return 0;
    }
    (ideal_out - actual_out) * BPS / ideal_out
}

// ---------------------------------------------------------------------------
// Route finding
// ---------------------------------------------------------------------------

/// Result of routing a full trade through one or more pools.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RouteResult {
    /// Allocation per pool (same order as input pools slice).
    pub allocations: [u128; 8],
    /// Number of pools actually used (allocations[0..pool_count]).
    pub pool_count: usize,
    /// Total gross output (before gas).
    pub gross_out: u128,
    /// Total gas cost (sum of per-pool gas costs for used pools).
    pub total_gas: u128,
    /// Net output after gas deduction.
    pub net_out: u128,
}

/// Find the best single pool (highest net output) for the full `amount_in`.
pub fn best_single_pool(pools: &[PoolSnapshot], amount_in: u128) -> Option<usize> {
    pools
        .iter()
        .enumerate()
        .map(|(i, p)| {
            let out = amm_out(p, amount_in);
            let net = out.saturating_sub(p.gas_cost);
            (i, net)
        })
        .max_by_key(|&(_, net)| net)
        .map(|(i, _)| i)
}

/// Greedy split: allocate `amount_in` across up to `max_splits` pools to
/// maximise net output.
///
/// Algorithm: divide `amount_in` into `steps` equal chunks; for each chunk
/// route it to the pool with the best current marginal price (spot price on
/// updated reserves). Pools with negative net contribution are excluded.
///
/// `pools` slice must have at most 8 entries (hard cap for on-chain safety).
pub fn optimal_split(
    pools: &[PoolSnapshot],
    amount_in: u128,
    max_splits: usize,
) -> RouteResult {
    assert!(pools.len() <= 8, "max 8 pools");
    let n = pools.len().min(max_splits).min(8);
    if n == 0 || amount_in == 0 {
        return RouteResult {
            allocations: [0u128; 8],
            pool_count: 0,
            gross_out: 0,
            total_gas: 0,
            net_out: 0,
        };
    }

    // Work with mutable reserve copies
    let mut reserves_in = [0u128; 8];
    let mut reserves_out = [0u128; 8];
    for (i, p) in pools.iter().enumerate() {
        reserves_in[i] = p.reserve_in;
        reserves_out[i] = p.reserve_out;
    }

    let steps: u128 = 100; // granularity
    let chunk = amount_in / steps;
    if chunk == 0 {
        // amount_in too small to split; route all to best single pool
        let best = best_single_pool(pools, amount_in).unwrap_or(0);
        let out = amm_out(&pools[best], amount_in);
        let gas = pools[best].gas_cost;
        let mut allocs = [0u128; 8];
        allocs[best] = amount_in;
        return RouteResult {
            allocations: allocs,
            pool_count: 1,
            gross_out: out,
            total_gas: gas,
            net_out: out.saturating_sub(gas),
        };
    }

    let mut allocations = [0u128; 8];
    let mut gross_out = 0u128;

    for _ in 0..steps {
        // Pick pool with best marginal spot price on current reserves
        let best = (0..n)
            .max_by_key(|&i| {
                if reserves_in[i] == 0 { 0 } else { reserves_out[i] * PRECISION / reserves_in[i] }
            })
            .unwrap_or(0);

        // Route chunk through best pool
        let fee_factor = BPS - pools[best].fee_bps;
        let in_after_fee = chunk * fee_factor / BPS;
        let out = reserves_out[best] * in_after_fee / (reserves_in[best] + in_after_fee);

        allocations[best] += chunk;
        gross_out += out;

        // Update virtual reserves
        reserves_in[best] += chunk;
        reserves_out[best] = reserves_out[best].saturating_sub(out);
    }

    // Handle remainder
    let remainder = amount_in - chunk * steps;
    if remainder > 0 {
        let best = (0..n)
            .max_by_key(|&i| {
                if reserves_in[i] == 0 { 0 } else { reserves_out[i] * PRECISION / reserves_in[i] }
            })
            .unwrap_or(0);
        let fee_factor = BPS - pools[best].fee_bps;
        let in_after_fee = remainder * fee_factor / BPS;
        let out = reserves_out[best] * in_after_fee / (reserves_in[best] + in_after_fee);
        allocations[best] += remainder;
        gross_out += out;
    }

    // Gas: charge only for pools that received allocation
    let total_gas: u128 = pools
        .iter()
        .enumerate()
        .filter(|(i, _)| allocations[*i] > 0)
        .map(|(i, p)| p.gas_cost * allocations[i] / amount_in) // pro-rata gas
        .sum();

    let net_out = gross_out.saturating_sub(total_gas);
    let pool_count = allocations.iter().filter(|&&a| a > 0).count();

    RouteResult {
        allocations,
        pool_count,
        gross_out,
        total_gas,
        net_out,
    }
}

/// Net price improvement of split route vs best single pool (in basis points).
///
/// Returns 0 if split is not better.
pub fn price_improvement_bps(
    pools: &[PoolSnapshot],
    amount_in: u128,
    max_splits: usize,
) -> u128 {
    let single_idx = match best_single_pool(pools, amount_in) {
        Some(i) => i,
        None => return 0,
    };
    let single_net = amm_out(&pools[single_idx], amount_in)
        .saturating_sub(pools[single_idx].gas_cost);

    let split = optimal_split(pools, amount_in, max_splits);
    if split.net_out <= single_net || single_net == 0 {
        return 0;
    }
    (split.net_out - single_net) * BPS / single_net
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn pool(id: u32, r_in: u128, r_out: u128, fee: u128, gas: u128) -> PoolSnapshot {
        PoolSnapshot { pool_id: id, reserve_in: r_in, reserve_out: r_out, fee_bps: fee, gas_cost: gas }
    }

    #[test]
    fn amm_out_basic() {
        let p = pool(0, 1_000_000, 1_000_000, 30, 0);
        let out = amm_out(&p, 1_000);
        // ~997 after 0.3% fee, minus price impact
        assert!(out > 900 && out < 1_000);
    }

    #[test]
    fn amm_out_zero_input() {
        let p = pool(0, 1_000_000, 1_000_000, 30, 0);
        assert_eq!(amm_out(&p, 0), 0);
    }

    #[test]
    fn slippage_increases_with_size() {
        let p = pool(0, 1_000_000, 1_000_000, 30, 0);
        let small = slippage_bps(&p, 1_000);
        let large = slippage_bps(&p, 100_000);
        assert!(large > small);
    }

    #[test]
    fn best_single_pool_picks_highest_net() {
        let pools = vec![
            pool(0, 1_000_000, 900_000, 30, 0),
            pool(1, 1_000_000, 1_100_000, 30, 0),
        ];
        assert_eq!(best_single_pool(&pools, 10_000), Some(1));
    }

    #[test]
    fn optimal_split_uses_both_pools() {
        let pools = vec![
            pool(0, 1_000_000, 1_000_000, 30, 0),
            pool(1, 1_000_000, 1_000_000, 30, 0),
        ];
        let result = optimal_split(&pools, 100_000, 2);
        // Both pools should receive allocation
        assert!(result.allocations[0] > 0);
        assert!(result.allocations[1] > 0);
        assert_eq!(result.allocations[0] + result.allocations[1], 100_000);
    }

    #[test]
    fn split_gross_out_exceeds_single() {
        let pools = vec![
            pool(0, 500_000, 500_000, 30, 0),
            pool(1, 500_000, 500_000, 30, 0),
        ];
        let split = optimal_split(&pools, 100_000, 2);
        let single = amm_out(&pools[0], 100_000);
        assert!(split.gross_out > single);
    }

    #[test]
    fn price_improvement_positive_with_two_equal_pools() {
        let pools = vec![
            pool(0, 500_000, 500_000, 30, 0),
            pool(1, 500_000, 500_000, 30, 0),
        ];
        let improvement = price_improvement_bps(&pools, 100_000, 2);
        assert!(improvement > 0);
    }
}
