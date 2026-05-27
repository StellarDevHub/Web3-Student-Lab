//! Decentralized Oracle Aggregator for Price Feeds
//!
//! Aggregates price submissions from multiple authorized oracle nodes and computes
//! a secure median price. Features include:
//! - Flexible oracle node registry (add/remove by admin)
//! - Staleness detection: reverts if all price data exceeds a configurable age threshold
//! - Outlier rejection via Median Absolute Deviation (MAD) before final median calculation
//! - Overflow-safe arithmetic throughout

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, Address,
    Env, Symbol, Vec,
};

// ---------------------------------------------------------------------------
// Data structures
// ---------------------------------------------------------------------------

/// A single price submission from an oracle node.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PriceSubmission {
    /// The price value (scaled by `decimals`, e.g. 1_000_000_00 = $1.00 with 8 decimals).
    pub price: i128,
    /// Ledger timestamp at which this price was recorded.
    pub timestamp: u64,
    /// The oracle node that submitted this price.
    pub oracle: Address,
}

/// Result of the aggregation: a manipulation-resistant median price.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AggregatedPrice {
    /// The computed median price after outlier rejection.
    pub median_price: i128,
    /// Number of valid (non-stale, non-outlier) sources used.
    pub num_sources: u32,
    /// The ledger timestamp at which this aggregation was performed.
    pub timestamp: u64,
}

/// Storage keys for the oracle aggregator contract.
#[contracttype]
#[derive(Clone)]
pub enum OracleDataKey {
    /// The admin address that controls oracle registration and config.
    Admin,
    /// List of all registered oracle node addresses.
    Oracles,
    /// Per-oracle, per-pair latest price submission: (oracle, pair) -> PriceSubmission.
    Submission(Address, Symbol),
    /// Maximum age (in seconds) for a price to be considered valid.
    StalenessThreshold,
    /// Minimum number of fresh oracle sources required to produce a median.
    MinSources,
}

/// Contract errors.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum OracleError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    OracleAlreadyRegistered = 4,
    OracleNotRegistered = 5,
    InvalidPrice = 6,
    InsufficientSources = 7,
    AllDataStale = 8,
    InvalidConfig = 9,
}

/// Default staleness threshold: 5 minutes.
const DEFAULT_STALENESS_THRESHOLD: u64 = 300;
/// Default minimum oracle sources for a valid median.
const DEFAULT_MIN_SOURCES: u32 = 1;
/// MAD multiplier for outlier detection (prices deviating > 3x MAD are rejected).
const MAD_MULTIPLIER: i128 = 3;

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct OracleAggregatorContract;

#[contractimpl]
impl OracleAggregatorContract {
    // -----------------------------------------------------------------------
    // Initialization
    // -----------------------------------------------------------------------

    /// Initialize the oracle aggregator with an admin address.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&OracleDataKey::Admin) {
            panic_with_error!(&env, OracleError::AlreadyInitialized);
        }

        env.storage()
            .instance()
            .set(&OracleDataKey::Admin, &admin);
        env.storage().instance().set(
            &OracleDataKey::StalenessThreshold,
            &DEFAULT_STALENESS_THRESHOLD,
        );
        env.storage()
            .instance()
            .set(&OracleDataKey::MinSources, &DEFAULT_MIN_SOURCES);

        let empty: Vec<Address> = Vec::new(&env);
        env.storage()
            .instance()
            .set(&OracleDataKey::Oracles, &empty);

        env.events()
            .publish((symbol_short!("orc_init"),), admin);
    }

    // -----------------------------------------------------------------------
    // Oracle node management (admin-only)
    // -----------------------------------------------------------------------

    /// Register a new oracle node. Only callable by admin.
    pub fn register_oracle(env: Env, caller: Address, oracle: Address) {
        caller.require_auth();
        Self::require_admin(&env, &caller);

        let mut oracles = Self::load_oracles(&env);

        // Check for duplicate
        for existing in oracles.iter() {
            if existing == oracle {
                panic_with_error!(&env, OracleError::OracleAlreadyRegistered);
            }
        }

        oracles.push_back(oracle.clone());
        env.storage()
            .instance()
            .set(&OracleDataKey::Oracles, &oracles);

        env.events()
            .publish((symbol_short!("orc_reg"),), oracle);
    }

    /// Remove an oracle node. Only callable by admin.
    pub fn remove_oracle(env: Env, caller: Address, oracle: Address) {
        caller.require_auth();
        Self::require_admin(&env, &caller);

        let oracles = Self::load_oracles(&env);
        let mut new_oracles: Vec<Address> = Vec::new(&env);
        let mut found = false;

        for existing in oracles.iter() {
            if existing == oracle {
                found = true;
            } else {
                new_oracles.push_back(existing);
            }
        }

        if !found {
            panic_with_error!(&env, OracleError::OracleNotRegistered);
        }

        env.storage()
            .instance()
            .set(&OracleDataKey::Oracles, &new_oracles);

        env.events()
            .publish((symbol_short!("orc_rem"),), oracle);
    }

    /// Returns the list of all registered oracle node addresses.
    pub fn get_oracles(env: Env) -> Vec<Address> {
        Self::load_oracles(&env)
    }

    // -----------------------------------------------------------------------
    // Price submission (oracle nodes only)
    // -----------------------------------------------------------------------

    /// Submit a price for a trading pair. Only registered oracle nodes may call.
    /// Overwrites any previous submission by the same oracle for the same pair.
    pub fn submit_price(env: Env, oracle: Address, pair: Symbol, price: i128) {
        oracle.require_auth();
        Self::require_oracle(&env, &oracle);

        if price <= 0 {
            panic_with_error!(&env, OracleError::InvalidPrice);
        }

        let submission = PriceSubmission {
            price,
            timestamp: env.ledger().timestamp(),
            oracle: oracle.clone(),
        };

        env.storage().instance().set(
            &OracleDataKey::Submission(oracle.clone(), pair.clone()),
            &submission,
        );

        env.events()
            .publish((symbol_short!("orc_sub"), pair), (oracle, price));
    }

    // -----------------------------------------------------------------------
    // Medianizer & query
    // -----------------------------------------------------------------------

    /// Compute the aggregated median price for a trading pair.
    ///
    /// 1. Collects all submissions from registered oracles for `pair`.
    /// 2. Filters out stale data (older than staleness threshold).
    /// 3. Applies outlier rejection using Median Absolute Deviation (MAD).
    /// 4. Computes and returns the final median price.
    ///
    /// Reverts if fewer than `min_sources` valid prices remain.
    pub fn get_price(env: Env, pair: Symbol) -> AggregatedPrice {
        let fresh_prices = Self::collect_fresh_prices(&env, &pair);

        let min_sources: u32 = env
            .storage()
            .instance()
            .get(&OracleDataKey::MinSources)
            .unwrap_or(DEFAULT_MIN_SOURCES);

        if (fresh_prices.len() as u32) < min_sources {
            panic_with_error!(&env, OracleError::InsufficientSources);
        }

        if fresh_prices.is_empty() {
            panic_with_error!(&env, OracleError::AllDataStale);
        }

        // Extract price values into a sortable vec
        let mut values: Vec<i128> = Vec::new(&env);
        for sub in fresh_prices.iter() {
            values.push_back(sub.price);
        }

        // Sort for median calculation
        values = Self::sort_vec(&env, &values);

        // Apply MAD outlier rejection if we have ≥ 3 values
        if values.len() >= 3 {
            let raw_median = Self::compute_median(&values);
            let mad = Self::compute_mad(&env, &values, raw_median);

            if mad > 0 {
                let threshold = mad.saturating_mul(MAD_MULTIPLIER);
                let mut filtered: Vec<i128> = Vec::new(&env);
                for v in values.iter() {
                    let deviation = if v > raw_median {
                        v.saturating_sub(raw_median)
                    } else {
                        raw_median.saturating_sub(v)
                    };
                    if deviation <= threshold {
                        filtered.push_back(v);
                    }
                }

                // Re-check min_sources after filtering
                if (filtered.len() as u32) < min_sources {
                    panic_with_error!(&env, OracleError::InsufficientSources);
                }

                values = Self::sort_vec(&env, &filtered);
            }
        }

        let median_price = Self::compute_median(&values);

        AggregatedPrice {
            median_price,
            num_sources: values.len() as u32,
            timestamp: env.ledger().timestamp(),
        }
    }

    /// Returns all raw (unfiltered) submissions for a pair from registered oracles.
    pub fn get_raw_prices(env: Env, pair: Symbol) -> Vec<PriceSubmission> {
        let oracles = Self::load_oracles(&env);
        let mut results: Vec<PriceSubmission> = Vec::new(&env);

        for oracle in oracles.iter() {
            let key = OracleDataKey::Submission(oracle.clone(), pair.clone());
            if let Some(sub) = env.storage().instance().get::<_, PriceSubmission>(&key) {
                results.push_back(sub);
            }
        }

        results
    }

    // -----------------------------------------------------------------------
    // Configuration (admin-only)
    // -----------------------------------------------------------------------

    /// Set the staleness threshold (max age in seconds for valid price data).
    pub fn set_staleness(env: Env, caller: Address, seconds: u64) {
        caller.require_auth();
        Self::require_admin(&env, &caller);

        if seconds == 0 {
            panic_with_error!(&env, OracleError::InvalidConfig);
        }

        env.storage()
            .instance()
            .set(&OracleDataKey::StalenessThreshold, &seconds);

        env.events()
            .publish((symbol_short!("orc_cfg"),), seconds);
    }

    /// Set the minimum number of oracle sources required for a valid aggregation.
    pub fn set_min_sources(env: Env, caller: Address, count: u32) {
        caller.require_auth();
        Self::require_admin(&env, &caller);

        if count == 0 {
            panic_with_error!(&env, OracleError::InvalidConfig);
        }

        env.storage()
            .instance()
            .set(&OracleDataKey::MinSources, &count);

        env.events()
            .publish((symbol_short!("orc_min"),), count);
    }

    /// Returns the current staleness threshold in seconds.
    pub fn get_staleness(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&OracleDataKey::StalenessThreshold)
            .unwrap_or(DEFAULT_STALENESS_THRESHOLD)
    }

    /// Returns the current minimum sources requirement.
    pub fn get_min_sources(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&OracleDataKey::MinSources)
            .unwrap_or(DEFAULT_MIN_SOURCES)
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    /// Load the list of registered oracle addresses from storage.
    fn load_oracles(env: &Env) -> Vec<Address> {
        env.storage()
            .instance()
            .get(&OracleDataKey::Oracles)
            .unwrap_or_else(|| Vec::new(env))
    }

    /// Enforce that the caller is the admin.
    fn require_admin(env: &Env, caller: &Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&OracleDataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, OracleError::NotInitialized));

        if *caller != admin {
            panic_with_error!(env, OracleError::Unauthorized);
        }
    }

    /// Enforce that the address is a registered oracle.
    fn require_oracle(env: &Env, oracle: &Address) {
        let oracles = Self::load_oracles(env);
        let mut found = false;
        for existing in oracles.iter() {
            if existing == *oracle {
                found = true;
                break;
            }
        }
        if !found {
            panic_with_error!(env, OracleError::OracleNotRegistered);
        }
    }

    /// Collect fresh (non-stale) price submissions for a pair from all registered oracles.
    fn collect_fresh_prices(env: &Env, pair: &Symbol) -> Vec<PriceSubmission> {
        let oracles = Self::load_oracles(env);
        let staleness: u64 = env
            .storage()
            .instance()
            .get(&OracleDataKey::StalenessThreshold)
            .unwrap_or(DEFAULT_STALENESS_THRESHOLD);

        let current_time = env.ledger().timestamp();
        let cutoff = current_time.saturating_sub(staleness);

        let mut fresh: Vec<PriceSubmission> = Vec::new(env);

        for oracle in oracles.iter() {
            let key = OracleDataKey::Submission(oracle.clone(), pair.clone());
            if let Some(sub) = env.storage().instance().get::<_, PriceSubmission>(&key) {
                if sub.timestamp >= cutoff {
                    fresh.push_back(sub);
                }
            }
        }

        fresh
    }

    /// Compute the median of a sorted vector of prices.
    ///
    /// For odd counts, returns the middle element.
    /// For even counts, returns the average of the two middle elements.
    fn compute_median(sorted: &Vec<i128>) -> i128 {
        let len = sorted.len();
        if len == 0 {
            return 0;
        }
        if len == 1 {
            return sorted.get(0).unwrap();
        }

        let mid = len / 2;
        if len % 2 == 1 {
            sorted.get(mid).unwrap()
        } else {
            let a = sorted.get(mid - 1).unwrap();
            let b = sorted.get(mid).unwrap();
            // Average of two middle values, overflow-safe
            a.saturating_add(b) / 2
        }
    }

    /// Compute the Median Absolute Deviation (MAD) of values around the given median.
    fn compute_mad(env: &Env, sorted: &Vec<i128>, median: i128) -> i128 {
        let mut deviations: Vec<i128> = Vec::new(env);

        for v in sorted.iter() {
            let dev = if v > median {
                v.saturating_sub(median)
            } else {
                median.saturating_sub(v)
            };
            deviations.push_back(dev);
        }

        deviations = Self::sort_vec(env, &deviations);
        Self::compute_median(&deviations)
    }

    /// Simple insertion sort for a `Vec<i128>`. Returns a new sorted vector.
    /// Suitable for small oracle sets (typically < 20 nodes).
    fn sort_vec(env: &Env, input: &Vec<i128>) -> Vec<i128> {
        let len = input.len();
        if len <= 1 {
            return input.clone();
        }

        // Copy into a working buffer
        let mut buf: Vec<i128> = Vec::new(env);
        for v in input.iter() {
            buf.push_back(v);
        }

        // Insertion sort
        for i in 1..len {
            let key = buf.get(i).unwrap();
            let mut j = i;
            while j > 0 {
                let prev = buf.get(j - 1).unwrap();
                if prev <= key {
                    break;
                }
                buf.set(j, prev);
                j -= 1;
            }
            buf.set(j, key);
        }

        buf
    }
}

#[cfg(test)]
#[path = "oracle_aggregator_test.rs"]
mod oracle_aggregator_test;
