//! DEX Aggregator – Best Price Routing and Split Trade Execution (#378)
//!
//! Features:
//! - Pool registry (up to 8 pools per pair)
//! - Best route finding via route_optimizer
//! - Split execution across multiple pools
//! - Slippage tolerance enforcement
//! - MEV protection via minimum output check
//! - Atomic execution (all-or-nothing)
//! - Full event emission

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, Address,
    Env,
};

use crate::route_optimizer::{amm_out, optimal_split, slippage_bps, PoolSnapshot};

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone)]
pub enum AggKey {
    Admin,
    PoolCount,
    Pool(u32),
    /// Per-user nonce for MEV / replay protection.
    Nonce(Address),
    Paused,
}

// ---------------------------------------------------------------------------
// On-chain pool record
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PoolRecord {
    pub pool_id: u32,
    pub token_in: Address,
    pub token_out: Address,
    pub reserve_in: u128,
    pub reserve_out: u128,
    /// Fee in basis points.
    pub fee_bps: u128,
    /// Estimated gas cost in output-token units.
    pub gas_cost: u128,
    pub active: bool,
}

// ---------------------------------------------------------------------------
// Trade result
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TradeResult {
    pub amount_in: u128,
    pub gross_out: u128,
    pub net_out: u128,
    pub total_gas: u128,
    pub pools_used: u32,
    /// Price improvement over best single pool in basis points.
    pub improvement_bps: u128,
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum AggError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    Paused = 4,
    NoPoolsFound = 5,
    SlippageExceeded = 6,
    MinOutputNotMet = 7,
    InvalidPool = 8,
    TooManyPools = 9,
    InvalidNonce = 10,
}

const MAX_POOLS: u32 = 8;
/// Maximum per-pool slippage allowed (5%).
const MAX_SLIPPAGE_BPS: u128 = 500;

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct DexAggregatorContract;

#[contractimpl]
impl DexAggregatorContract {
    // -----------------------------------------------------------------------
    // Init
    // -----------------------------------------------------------------------

    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&AggKey::Admin) {
            panic_with_error!(&env, AggError::AlreadyInitialized);
        }
        env.storage().instance().set(&AggKey::Admin, &admin);
        env.storage().instance().set(&AggKey::PoolCount, &0u32);
        env.storage().instance().set(&AggKey::Paused, &false);
    }

    // -----------------------------------------------------------------------
    // Pool registry
    // -----------------------------------------------------------------------

    pub fn register_pool(
        env: Env,
        caller: Address,
        token_in: Address,
        token_out: Address,
        reserve_in: u128,
        reserve_out: u128,
        fee_bps: u128,
        gas_cost: u128,
    ) -> u32 {
        caller.require_auth();
        Self::assert_admin(&env, &caller);

        let count: u32 = env.storage().instance().get(&AggKey::PoolCount).unwrap_or(0);
        if count >= MAX_POOLS {
            panic_with_error!(&env, AggError::TooManyPools);
        }

        let pool = PoolRecord {
            pool_id: count,
            token_in,
            token_out,
            reserve_in,
            reserve_out,
            fee_bps,
            gas_cost,
            active: true,
        };
        env.storage().instance().set(&AggKey::Pool(count), &pool);
        env.storage().instance().set(&AggKey::PoolCount, &(count + 1));

        env.events().publish(
            (symbol_short!("agg"), symbol_short!("pool_add")),
            count,
        );
        count
    }

    pub fn update_reserves(
        env: Env,
        caller: Address,
        pool_id: u32,
        reserve_in: u128,
        reserve_out: u128,
    ) {
        caller.require_auth();
        Self::assert_admin(&env, &caller);

        let mut pool: PoolRecord = env
            .storage()
            .instance()
            .get(&AggKey::Pool(pool_id))
            .unwrap_or_else(|| panic_with_error!(&env, AggError::InvalidPool));
        pool.reserve_in = reserve_in;
        pool.reserve_out = reserve_out;
        env.storage().instance().set(&AggKey::Pool(pool_id), &pool);
    }

    // -----------------------------------------------------------------------
    // Quote
    // -----------------------------------------------------------------------

    pub fn get_quote(
        env: Env,
        token_in: Address,
        token_out: Address,
        amount_in: u128,
        max_splits: u32,
    ) -> TradeResult {
        Self::assert_not_paused(&env);

        let (snaps, count) = Self::load_snapshots(&env, &token_in, &token_out);
        if count == 0 {
            panic_with_error!(&env, AggError::NoPoolsFound);
        }

        let result = optimal_split(&snaps[..count], amount_in, max_splits as usize);
        let improvement_bps = Self::calc_improvement(&snaps[..count], amount_in, result.net_out);

        TradeResult {
            amount_in,
            gross_out: result.gross_out,
            net_out: result.net_out,
            total_gas: result.total_gas,
            pools_used: result.pool_count as u32,
            improvement_bps,
        }
    }

    // -----------------------------------------------------------------------
    // Execute swap
    // -----------------------------------------------------------------------

    pub fn execute_swap(
        env: Env,
        caller: Address,
        token_in: Address,
        token_out: Address,
        amount_in: u128,
        min_out: u128,
        max_splits: u32,
        nonce: u64,
    ) -> TradeResult {
        caller.require_auth();
        Self::assert_not_paused(&env);

        // Nonce check
        let stored_nonce: u64 = env
            .storage()
            .instance()
            .get(&AggKey::Nonce(caller.clone()))
            .unwrap_or(0);
        if nonce != stored_nonce {
            panic_with_error!(&env, AggError::InvalidNonce);
        }

        let (snaps, count) = Self::load_snapshots(&env, &token_in, &token_out);
        if count == 0 {
            panic_with_error!(&env, AggError::NoPoolsFound);
        }

        // Slippage check
        let per_pool = amount_in / count as u128;
        for i in 0..count {
            if per_pool > 0 && slippage_bps(&snaps[i], per_pool) > MAX_SLIPPAGE_BPS {
                panic_with_error!(&env, AggError::SlippageExceeded);
            }
        }

        let result = optimal_split(&snaps[..count], amount_in, max_splits as usize);

        // MEV protection
        if result.net_out < min_out {
            panic_with_error!(&env, AggError::MinOutputNotMet);
        }

        // Update reserves for pools that received allocation
        let pool_count: u32 = env.storage().instance().get(&AggKey::PoolCount).unwrap_or(0);
        let mut snap_idx = 0usize;
        for pid in 0..pool_count {
            if let Some(mut pool) = env
                .storage()
                .instance()
                .get::<AggKey, PoolRecord>(&AggKey::Pool(pid))
            {
                if pool.active && pool.token_in == token_in && pool.token_out == token_out {
                    let alloc = result.allocations[snap_idx];
                    if alloc > 0 {
                        let out = amm_out(&snaps[snap_idx], alloc);
                        pool.reserve_in += alloc;
                        pool.reserve_out = pool.reserve_out.saturating_sub(out);
                        env.storage().instance().set(&AggKey::Pool(pid), &pool);
                    }
                    snap_idx += 1;
                    if snap_idx >= count {
                        break;
                    }
                }
            }
        }

        env.storage()
            .instance()
            .set(&AggKey::Nonce(caller.clone()), &(stored_nonce + 1));

        let improvement_bps = Self::calc_improvement(&snaps[..count], amount_in, result.net_out);

        let trade = TradeResult {
            amount_in,
            gross_out: result.gross_out,
            net_out: result.net_out,
            total_gas: result.total_gas,
            pools_used: result.pool_count as u32,
            improvement_bps,
        };

        env.events().publish(
            (symbol_short!("agg"), symbol_short!("swap")),
            (caller, amount_in, result.net_out, result.pool_count as u32),
        );

        trade
    }

    // -----------------------------------------------------------------------
    // Admin
    // -----------------------------------------------------------------------

    pub fn set_paused(env: Env, caller: Address, paused: bool) {
        caller.require_auth();
        Self::assert_admin(&env, &caller);
        env.storage().instance().set(&AggKey::Paused, &paused);
    }

    // -----------------------------------------------------------------------
    // Queries
    // -----------------------------------------------------------------------

    pub fn get_pool(env: Env, pool_id: u32) -> Option<PoolRecord> {
        env.storage().instance().get(&AggKey::Pool(pool_id))
    }

    pub fn get_pool_count(env: Env) -> u32 {
        env.storage().instance().get(&AggKey::PoolCount).unwrap_or(0)
    }

    pub fn get_nonce(env: Env, user: Address) -> u64 {
        env.storage().instance().get(&AggKey::Nonce(user)).unwrap_or(0)
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    fn assert_admin(env: &Env, caller: &Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&AggKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, AggError::NotInitialized));
        if *caller != admin {
            panic_with_error!(env, AggError::Unauthorized);
        }
    }

    fn assert_not_paused(env: &Env) {
        let paused: bool = env.storage().instance().get(&AggKey::Paused).unwrap_or(false);
        if paused {
            panic_with_error!(env, AggError::Paused);
        }
    }

    /// Load matching active pools as a fixed [PoolSnapshot; 8] array.
    /// Returns (array, count_filled).
    fn load_snapshots(
        env: &Env,
        token_in: &Address,
        token_out: &Address,
    ) -> ([PoolSnapshot; 8], usize) {
        let pool_count: u32 = env.storage().instance().get(&AggKey::PoolCount).unwrap_or(0);
        let mut snaps: [PoolSnapshot; 8] = core::array::from_fn(|_| PoolSnapshot {
            pool_id: 0,
            reserve_in: 0,
            reserve_out: 0,
            fee_bps: 0,
            gas_cost: 0,
        });
        let mut count = 0usize;
        for pid in 0..pool_count {
            if count >= 8 {
                break;
            }
            if let Some(pool) = env
                .storage()
                .instance()
                .get::<AggKey, PoolRecord>(&AggKey::Pool(pid))
            {
                if pool.active && &pool.token_in == token_in && &pool.token_out == token_out {
                    snaps[count] = PoolSnapshot {
                        pool_id: pool.pool_id,
                        reserve_in: pool.reserve_in,
                        reserve_out: pool.reserve_out,
                        fee_bps: pool.fee_bps,
                        gas_cost: pool.gas_cost,
                    };
                    count += 1;
                }
            }
        }
        (snaps, count)
    }

    fn calc_improvement(snaps: &[PoolSnapshot], amount_in: u128, net_out: u128) -> u128 {
        let single_best = snaps
            .iter()
            .map(|p| amm_out(p, amount_in).saturating_sub(p.gas_cost))
            .max()
            .unwrap_or(0);
        if single_best > 0 && net_out > single_best {
            (net_out - single_best) * 10_000 / single_best
        } else {
            0
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Address, Env};

    fn setup() -> (Env, Address, Address, Address, DexAggregatorContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let token_in = Address::generate(&env);
        let token_out = Address::generate(&env);
        let id = env.register(DexAggregatorContract, ());
        let client = DexAggregatorContractClient::new(&env, &id);
        client.initialize(&admin);
        (env, admin, token_in, token_out, client)
    }

    #[test]
    fn register_pool_increments_count() {
        let (env, admin, tin, tout, client) = setup();
        client.register_pool(&admin, &tin, &tout, &1_000_000, &1_000_000, &30, &100);
        assert_eq!(client.get_pool_count(), 1);
    }

    #[test]
    fn pool_record_stored_correctly() {
        let (env, admin, tin, tout, client) = setup();
        let id = client.register_pool(&admin, &tin, &tout, &1_000_000, &1_000_000, &30, &100);
        let pool = client.get_pool(&id).unwrap();
        assert_eq!(pool.reserve_in, 1_000_000);
        assert_eq!(pool.fee_bps, 30);
        assert!(pool.active);
    }

    #[test]
    fn update_reserves_changes_values() {
        let (env, admin, tin, tout, client) = setup();
        let id = client.register_pool(&admin, &tin, &tout, &1_000_000, &1_000_000, &30, &0);
        client.update_reserves(&admin, &id, &2_000_000, &2_000_000);
        let pool = client.get_pool(&id).unwrap();
        assert_eq!(pool.reserve_in, 2_000_000);
    }

    #[test]
    fn get_quote_returns_result() {
        let (env, admin, tin, tout, client) = setup();
        client.register_pool(&admin, &tin, &tout, &1_000_000, &1_000_000, &30, &0);
        let quote = client.get_quote(&tin, &tout, &10_000, &2);
        assert!(quote.net_out > 0);
        assert_eq!(quote.amount_in, 10_000);
    }

    #[test]
    fn two_pools_improve_price() {
        let (env, admin, tin, tout, client) = setup();
        client.register_pool(&admin, &tin, &tout, &500_000, &500_000, &30, &0);
        client.register_pool(&admin, &tin, &tout, &500_000, &500_000, &30, &0);
        let quote = client.get_quote(&tin, &tout, &100_000, &2);
        assert!(quote.improvement_bps > 0);
    }

    #[test]
    fn execute_swap_increments_nonce() {
        let (env, admin, tin, tout, client) = setup();
        client.register_pool(&admin, &tin, &tout, &1_000_000, &1_000_000, &30, &0);
        let user = Address::generate(&env);
        client.execute_swap(&user, &tin, &tout, &1_000, &1, &2, &0);
        assert_eq!(client.get_nonce(&user), 1);
    }

    #[test]
    fn nonce_starts_at_zero() {
        let (env, _, _, _, client) = setup();
        let user = Address::generate(&env);
        assert_eq!(client.get_nonce(&user), 0);
    }

    #[test]
    #[should_panic]
    fn double_initialize_panics() {
        let (env, admin, _, _, client) = setup();
        client.initialize(&admin);
    }

    #[test]
    #[should_panic]
    fn non_admin_cannot_register_pool() {
        let (env, _, tin, tout, client) = setup();
        let rando = Address::generate(&env);
        client.register_pool(&rando, &tin, &tout, &1_000_000, &1_000_000, &30, &0);
    }

    #[test]
    #[should_panic]
    fn paused_blocks_quote() {
        let (env, admin, tin, tout, client) = setup();
        client.register_pool(&admin, &tin, &tout, &1_000_000, &1_000_000, &30, &0);
        client.set_paused(&admin, &true);
        client.get_quote(&tin, &tout, &10_000, &2);
    }

    #[test]
    #[should_panic]
    fn invalid_nonce_rejected() {
        let (env, admin, tin, tout, client) = setup();
        client.register_pool(&admin, &tin, &tout, &1_000_000, &1_000_000, &30, &0);
        let user = Address::generate(&env);
        client.execute_swap(&user, &tin, &tout, &1_000, &1, &2, &99);
    }

    #[test]
    #[should_panic]
    fn min_out_not_met_rejected() {
        let (env, admin, tin, tout, client) = setup();
        client.register_pool(&admin, &tin, &tout, &1_000_000, &1_000_000, &30, &0);
        let user = Address::generate(&env);
        // min_out set impossibly high
        client.execute_swap(&user, &tin, &tout, &1_000, &999_999_999, &2, &0);
    }
}
