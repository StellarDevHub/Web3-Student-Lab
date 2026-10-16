//! Automated Liquidity Market Maker (AMM) with dynamic swap fees.
//!
//! Implements a constant-product AMM (x * y = k) with:
//! - Pool share token minting for liquidity providers
//! - Dynamic volatility-adjusted swap fees (higher during high-impact trades)
//! - Strict slippage protection (min output / max input enforcement)
//! - Dead-shares burn (first 1,000 shares) to prevent share inflation exploits
//! - Virtual balances to mitigate sandwich attacks

#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, panic_with_error, token, Address, Env,
    Symbol,
};

/// Basis points denominator (10,000 bps = 100%)
const BPS: i128 = 10_000;

/// Dead shares permanently burned on pool initialization
const DEAD_SHARES: i128 = 1_000;

/// Minimum swap fee in basis points (0.1%)
const MIN_SWAP_FEE_BPS: i128 = 10;

/// Maximum swap fee in basis points (10%)
const MAX_SWAP_FEE_BPS: i128 = 1_000;

// ── Errors (SC-HARD-20: range 400+) ──────────────────────────────────────────

/// Typed contract errors for the AMM.
///
/// Discriminants are in the `400+` range (all other contracts partition).
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum AmmError {
    /// `400` — Contract has already been initialised.
    AlreadyInitialized = 400,
    /// `401` — Amounts provided must be positive.
    InvalidAmount = 401,
    /// `402` — Fee is outside the allowed range.
    InvalidFee = 402,
    /// `403` — Slippage tolerance exceeded.
    SlippageExceeded = 403,
    /// `404` — Contract has not been initialised.
    NotInitialized = 404,
    /// `405` — Deadline expired for trade execution.
    DeadlineExceeded = 405,
    /// `406` — Same-block bidirectional trades from the same origin address are prohibited.
    SameBlockBidirectionalTrade = 406,
}

pub mod anti_mev;
pub mod storage;
pub mod twap;

pub use storage::DataKey;

#[contract]
pub struct AMMContract;

#[contractimpl]
impl AMMContract {
    /// Initializes the AMM with two tokens and mints dead shares to prevent share inflation.
    pub fn initialize(
        env: Env,
        admin: Address,
        token_a: Address,
        token_b: Address,
        pool_share: Address,
        fee_collector: Address,
        base_fee_bps: i128,
    ) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, AmmError::AlreadyInitialized);
        }
        if base_fee_bps < MIN_SWAP_FEE_BPS || base_fee_bps > MAX_SWAP_FEE_BPS {
            panic_with_error!(&env, AmmError::InvalidFee);
        }

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::TokenA, &token_a);
        env.storage().instance().set(&DataKey::TokenB, &token_b);
        env.storage()
            .instance()
            .set(&DataKey::PoolShare, &pool_share);
        env.storage()
            .instance()
            .set(&DataKey::FeeCollector, &fee_collector);
        env.storage()
            .instance()
            .set(&DataKey::BaseFeeBps, &base_fee_bps);

        env.storage().instance().set(&DataKey::BalanceA, &0i128);
        env.storage().instance().set(&DataKey::BalanceB, &0i128);
        env.storage().instance().set(&DataKey::ReserveA, &0i128);
        env.storage().instance().set(&DataKey::ReserveB, &0i128);
        // Burn DEAD_SHARES to prevent share inflation exploits.
        env.storage()
            .instance()
            .set(&DataKey::TotalShares, &DEAD_SHARES);

        env.events().publish(
            (Symbol::new(&env, "amm_initialized"),),
            (fee_collector, base_fee_bps),
        );
    }

    /// Adds liquidity and mints pool shares. Requires equal value deposit (x * y = k maintained).
    pub fn add_liquidity(
        env: Env,
        provider: Address,
        amount_a: i128,
        amount_b: i128,
        min_shares: i128,
    ) -> i128 {
        provider.require_auth();
        if amount_a <= 0 || amount_b <= 0 {
            panic_with_error!(&env, AmmError::InvalidAmount);
        }

        let token_a: Address = env.storage().instance().get(&DataKey::TokenA).unwrap();
        let token_b: Address = env.storage().instance().get(&DataKey::TokenB).unwrap();
        let pool_share: Address = env.storage().instance().get(&DataKey::PoolShare).unwrap();

        let token_a_client = token::Client::new(&env, &token_a);
        let token_b_client = token::Client::new(&env, &token_b);
        let pool_share_client = token::StellarAssetClient::new(&env, &pool_share);

        let contract_addr = env.current_contract_address();
        token_a_client.transfer(&provider, &contract_addr, &amount_a);
        token_b_client.transfer(&provider, &contract_addr, &amount_b);

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
        let total_shares: i128 = env.storage().instance().get(&DataKey::TotalShares).unwrap();

        let shares = if balance_a == 0 || balance_b == 0 {
            // Initial liquidity: mint sqrt(amount_a * amount_b) shares, reserving
            // DEAD_SHARES that are permanently locked (seeded in initialize).
            let gross = Self::isqrt(amount_a * amount_b);
            if gross <= DEAD_SHARES {
                panic_with_error!(&env, AmmError::InvalidAmount);
            }
            gross - DEAD_SHARES
        } else {
            // Subsequent liquidity: mint proportional to either ratio (use minimum).
            let shares_from_a = (amount_a * total_shares) / balance_a;
            let shares_from_b = (amount_b * total_shares) / balance_b;
            if shares_from_a < shares_from_b {
                shares_from_a
            } else {
                shares_from_b
            }
        };

        if shares < min_shares {
            panic_with_error!(&env, AmmError::SlippageExceeded);
        }

        env.storage()
            .instance()
            .set(&DataKey::BalanceA, &(balance_a + amount_a));
        env.storage()
            .instance()
            .set(&DataKey::BalanceB, &(balance_b + amount_b));
        env.storage()
            .instance()
            .set(&DataKey::ReserveA, &(balance_a + amount_a));
        env.storage()
            .instance()
            .set(&DataKey::ReserveB, &(balance_b + amount_b));
        env.storage()
            .instance()
            .set(&DataKey::TotalShares, &(total_shares + shares));

        twap::update_cumulative_prices(&env, balance_a + amount_a, balance_b + amount_b);

        pool_share_client.mint(&provider, &shares);

        env.events().publish(
            (Symbol::new(&env, "liquidity_added"),),
            (provider, amount_a, amount_b, shares),
        );

        shares
    }

    /// Removes liquidity by burning pool shares and withdrawing tokens.
    pub fn remove_liquidity(
        env: Env,
        provider: Address,
        shares: i128,
        min_amount_a: i128,
        min_amount_b: i128,
    ) -> (i128, i128) {
        provider.require_auth();
        if shares <= 0 {
            panic_with_error!(&env, AmmError::InvalidAmount);
        }

        let pool_share: Address = env.storage().instance().get(&DataKey::PoolShare).unwrap();
        let token_a: Address = env.storage().instance().get(&DataKey::TokenA).unwrap();
        let token_b: Address = env.storage().instance().get(&DataKey::TokenB).unwrap();

        let pool_share_client = token::StellarAssetClient::new(&env, &pool_share);
        let token_a_client = token::Client::new(&env, &token_a);
        let token_b_client = token::Client::new(&env, &token_b);

        let balance_a: i128 = env.storage().instance().get(&DataKey::BalanceA).unwrap();
        let balance_b: i128 = env.storage().instance().get(&DataKey::BalanceB).unwrap();
        let total_shares: i128 = env.storage().instance().get(&DataKey::TotalShares).unwrap();

        let amount_a = (shares * balance_a) / total_shares;
        let amount_b = (shares * balance_b) / total_shares;

        if amount_a < min_amount_a || amount_b < min_amount_b {
            panic_with_error!(&env, AmmError::SlippageExceeded);
        }

        env.storage()
            .instance()
            .set(&DataKey::BalanceA, &(balance_a - amount_a));
        env.storage()
            .instance()
            .set(&DataKey::BalanceB, &(balance_b - amount_b));
        env.storage()
            .instance()
            .set(&DataKey::ReserveA, &(balance_a - amount_a));
        env.storage()
            .instance()
            .set(&DataKey::ReserveB, &(balance_b - amount_b));
        env.storage()
            .instance()
            .set(&DataKey::TotalShares, &(total_shares - shares));

        twap::update_cumulative_prices(&env, balance_a - amount_a, balance_b - amount_b);

        let contract_addr = env.current_contract_address();
        pool_share_client.burn(&provider, &shares);

        token_a_client.transfer(&contract_addr, &provider, &amount_a);
        token_b_client.transfer(&contract_addr, &provider, &amount_b);

        env.events().publish(
            (Symbol::new(&env, "liquidity_removed"),),
            (provider, amount_a, amount_b, shares),
        );

        (amount_a, amount_b)
    }

    /// Swaps token A for token B with dynamic fee based on price impact.
    pub fn swap_a_for_b(env: Env, user: Address, amount_in: i128, min_amount_out: i128) -> i128 {
        user.require_auth();
        if amount_in <= 0 {
            panic_with_error!(&env, AmmError::InvalidAmount);
        }
        anti_mev::check_and_record_trade(&env, &user, anti_mev::SwapDirection::AtoB);

        let token_a: Address = env.storage().instance().get(&DataKey::TokenA).unwrap();
        let token_b: Address = env.storage().instance().get(&DataKey::TokenB).unwrap();
        let fee_collector: Address = env
            .storage()
            .instance()
            .get(&DataKey::FeeCollector)
            .unwrap();

        let token_a_client = token::Client::new(&env, &token_a);
        let token_b_client = token::Client::new(&env, &token_b);

        let contract_addr = env.current_contract_address();
        token_a_client.transfer(&user, &contract_addr, &amount_in);

        let balance_a: i128 = env.storage().instance().get(&DataKey::BalanceA).unwrap();
        let balance_b: i128 = env.storage().instance().get(&DataKey::BalanceB).unwrap();
        let base_fee_bps: i128 = env.storage().instance().get(&DataKey::BaseFeeBps).unwrap();

        let new_a = balance_a + amount_in;
        let amount_out_before_fee = balance_b - (balance_a * balance_b + new_a - 1) / new_a;

        let price_impact_bps = (amount_out_before_fee * BPS) / balance_b;
        let dynamic_fee_bps = base_fee_bps + (price_impact_bps / 100);
        let capped_fee_bps = if dynamic_fee_bps > MAX_SWAP_FEE_BPS {
            MAX_SWAP_FEE_BPS
        } else {
            dynamic_fee_bps
        };

        let fee = (amount_out_before_fee * capped_fee_bps) / BPS;
        let amount_out = amount_out_before_fee - fee;

        if amount_out < min_amount_out {
            panic_with_error!(&env, AmmError::SlippageExceeded);
        }

        env.storage().instance().set(&DataKey::BalanceA, &new_a);
        env.storage()
            .instance()
            .set(&DataKey::BalanceB, &(balance_b - amount_out - fee));
        env.storage().instance().set(&DataKey::ReserveA, &new_a);
        env.storage()
            .instance()
            .set(&DataKey::ReserveB, &(balance_b - amount_out - fee));

        twap::update_cumulative_prices(&env, new_a, balance_b - amount_out - fee);

        let contract_addr = env.current_contract_address();
        token_b_client.transfer(&contract_addr, &user, &amount_out);
        token_b_client.transfer(&contract_addr, &fee_collector, &fee);

        env.events().publish(
            (Symbol::new(&env, "swap_a_for_b"),),
            (user, amount_in, amount_out, fee),
        );

        amount_out
    }

    /// Swaps token A for token B with user-specified deadline and slippage protection.
    pub fn swap_a_for_b_with_deadline(
        env: Env,
        user: Address,
        amount_in: i128,
        min_amount_out: i128,
        deadline: u64,
    ) -> i128 {
        anti_mev::check_deadline(&env, deadline);
        Self::swap_a_for_b(env, user, amount_in, min_amount_out)
    }

    /// Swaps token B for token A with dynamic fee based on price impact.
    pub fn swap_b_for_a(env: Env, user: Address, amount_in: i128, min_amount_out: i128) -> i128 {
        user.require_auth();
        if amount_in <= 0 {
            panic_with_error!(&env, AmmError::InvalidAmount);
        }
        anti_mev::check_and_record_trade(&env, &user, anti_mev::SwapDirection::BtoA);

        let token_a: Address = env.storage().instance().get(&DataKey::TokenA).unwrap();
        let token_b: Address = env.storage().instance().get(&DataKey::TokenB).unwrap();
        let fee_collector: Address = env
            .storage()
            .instance()
            .get(&DataKey::FeeCollector)
            .unwrap();

        let token_a_client = token::Client::new(&env, &token_a);
        let token_b_client = token::Client::new(&env, &token_b);

        let contract_addr = env.current_contract_address();
        token_b_client.transfer(&user, &contract_addr, &amount_in);

        let balance_a: i128 = env.storage().instance().get(&DataKey::BalanceA).unwrap();
        let balance_b: i128 = env.storage().instance().get(&DataKey::BalanceB).unwrap();
        let base_fee_bps: i128 = env.storage().instance().get(&DataKey::BaseFeeBps).unwrap();

        let new_b = balance_b + amount_in;
        let amount_out_before_fee = balance_a - (balance_a * balance_b + new_b - 1) / new_b;

        let price_impact_bps = (amount_out_before_fee * BPS) / balance_a;
        let dynamic_fee_bps = base_fee_bps + (price_impact_bps / 100);
        let capped_fee_bps = if dynamic_fee_bps > MAX_SWAP_FEE_BPS {
            MAX_SWAP_FEE_BPS
        } else {
            dynamic_fee_bps
        };

        let fee = (amount_out_before_fee * capped_fee_bps) / BPS;
        let amount_out = amount_out_before_fee - fee;

        if amount_out < min_amount_out {
            panic_with_error!(&env, AmmError::SlippageExceeded);
        }

        env.storage()
            .instance()
            .set(&DataKey::BalanceA, &(balance_a - amount_out - fee));
        env.storage().instance().set(&DataKey::BalanceB, &new_b);
        env.storage()
            .instance()
            .set(&DataKey::ReserveA, &(balance_a - amount_out - fee));
        env.storage().instance().set(&DataKey::ReserveB, &new_b);

        twap::update_cumulative_prices(&env, balance_a - amount_out - fee, new_b);

        let contract_addr = env.current_contract_address();
        token_a_client.transfer(&contract_addr, &user, &amount_out);
        token_a_client.transfer(&contract_addr, &fee_collector, &fee);

        env.events().publish(
            (Symbol::new(&env, "swap_b_for_a"),),
            (user, amount_in, amount_out, fee),
        );

        amount_out
    }

    /// Swaps token B for token A with user-specified deadline and slippage protection.
    pub fn swap_b_for_a_with_deadline(
        env: Env,
        user: Address,
        amount_in: i128,
        min_amount_out: i128,
        deadline: u64,
    ) -> i128 {
        anti_mev::check_deadline(&env, deadline);
        Self::swap_b_for_a(env, user, amount_in, min_amount_out)
    }

    /// Returns current pool state for calculations and display.
    pub fn get_pool_state(env: Env) -> (i128, i128, i128) {
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
        let total_shares: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalShares)
            .unwrap_or(0);
        (balance_a, balance_b, total_shares)
    }

    /// Returns current cumulative prices and last block timestamp for TWAP oracle consumers.
    pub fn get_twap_cumulative(env: Env) -> (i128, i128, u64) {
        let price_a: i128 = env.storage().instance().get(&DataKey::PriceACumulative).unwrap_or(0);
        let price_b: i128 = env.storage().instance().get(&DataKey::PriceBCumulative).unwrap_or(0);
        let last_time: u64 = env.storage().instance().get(&DataKey::LastBlockTimestamp).unwrap_or(0);
        (price_a, price_b, last_time)
    }

    /// Queries the TWAP output amount for `token_in` over a custom observation window in seconds.
    pub fn twap_consult(env: Env, token_in: Address, amount_in: i128, period_seconds: u64) -> i128 {
        match twap::consult(&env, &token_in, amount_in, period_seconds) {
            Ok(amt) => amt,
            Err(e) => panic_with_error!(&env, e),
        }
    }

    /// Queries the TWAP output amount for `token_in` over a standard 30-minute window (1,800s).
    pub fn twap_consult_30m(env: Env, token_in: Address, amount_in: i128) -> i128 {
        Self::twap_consult(env, token_in, amount_in, twap::TWAP_PERIOD_30M)
    }

    /// Queries the TWAP output amount for `token_in` over a standard 1-hour window (3,600s).
    pub fn twap_consult_1h(env: Env, token_in: Address, amount_in: i128) -> i128 {
        Self::twap_consult(env, token_in, amount_in, twap::TWAP_PERIOD_1H)
    }

    /// Integer square root for initial share calculation.
    fn isqrt(n: i128) -> i128 {
        if n == 0 {
            return 0;
        }
        let mut x = n;
        let mut y = (x + 1) / 2;
        while y < x {
            x = y;
            y = (x + n / x) / 2;
        }
        x
    }
}

pub mod math;

#[cfg(test)]
mod test;
