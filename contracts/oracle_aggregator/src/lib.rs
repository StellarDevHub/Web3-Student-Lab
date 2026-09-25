//! Decentralized multi-source price oracle aggregator.
//!
//! Whitelisted reporters submit price observations. The aggregator computes
//! a medianized price across all fresh (non-stale) reports, excludes and
//! slashes reporters whose submission deviates too far from the median, and
//! exposes the resulting price for downstream contracts (e.g. AMMs, vaults).

#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, Symbol, Vec};

/// Reports older than this many seconds are rejected as stale.
pub const MAX_STALENESS_SECONDS: u64 = 300; // 5 minutes

/// Reports deviating more than this percentage from the median are outliers.
pub const OUTLIER_DEVIATION_BPS: i128 = 1500; // 15.00% expressed in bps/100

/// Percentage (in bps/100, i.e. 1000 = 10%) of stake slashed on an outlier.
pub const SLASH_BPS: i128 = 1000; // 10%

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PriceReport {
    pub reporter: Address,
    pub price: i128,
    pub timestamp: u64,
}

#[contracttype]
pub enum DataKey {
    Admin,
    Reporters,               // Vec<Address> whitelist
    Stake(Address),          // reporter -> staked amount
    LatestReport(Address),   // reporter -> last submitted PriceReport
    LastMedian,              // i128 last computed median price
    LastMedianTimestamp,     // u64
}

#[contract]
pub struct OracleAggregatorContract;

#[contractimpl]
impl OracleAggregatorContract {
    /// Initializes the aggregator with an admin address.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::Reporters, &Vec::<Address>::new(&env));
    }

    /// Admin-only: whitelist a new price reporter with an initial stake.
    pub fn add_reporter(env: Env, reporter: Address, stake: i128) {
        Self::require_admin(&env);
        if stake <= 0 {
            panic!("Stake must be positive");
        }
        let mut reporters: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::Reporters)
            .unwrap_or_else(|| Vec::new(&env));
        if !reporters.contains(&reporter) {
            reporters.push_back(reporter.clone());
            env.storage().instance().set(&DataKey::Reporters, &reporters);
        }
        env.storage()
            .persistent()
            .set(&DataKey::Stake(reporter.clone()), &stake);

        env.events()
            .publish((Symbol::new(&env, "reporter_added"),), (reporter, stake));
    }

    /// Admin-only: remove a reporter from the whitelist.
    pub fn remove_reporter(env: Env, reporter: Address) {
        Self::require_admin(&env);
        let mut reporters: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::Reporters)
            .unwrap_or_else(|| Vec::new(&env));
        if let Some(idx) = reporters.iter().position(|r| r == reporter) {
            reporters.remove(idx as u32);
            env.storage().instance().set(&DataKey::Reporters, &reporters);
        }
        env.events()
            .publish((Symbol::new(&env, "reporter_removed"),), reporter);
    }

    /// Whitelisted reporters submit a price observation. Requires their auth.
    pub fn submit_price(env: Env, reporter: Address, price: i128) {
        reporter.require_auth();
        if price <= 0 {
            panic!("Price must be positive");
        }
        let reporters: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::Reporters)
            .unwrap_or_else(|| Vec::new(&env));
        if !reporters.contains(&reporter) {
            panic!("Reporter not whitelisted");
        }

        let report = PriceReport {
            reporter: reporter.clone(),
            price,
            timestamp: env.ledger().timestamp(),
        };
        env.storage()
            .persistent()
            .set(&DataKey::LatestReport(reporter.clone()), &report);

        env.events().publish(
            (Symbol::new(&env, "price_submitted"),),
            (reporter, price),
        );
    }

    /// Aggregates all fresh whitelisted reporter prices into a medianized
    /// price, excluding and slashing outliers (> 15% deviation from median).
    /// Reports older than `MAX_STALENESS_SECONDS` are ignored entirely.
    pub fn aggregate(env: Env) -> i128 {
        let reporters: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::Reporters)
            .unwrap_or_else(|| Vec::new(&env));

        let now = env.ledger().timestamp();
        let mut fresh_prices: Vec<i128> = Vec::new(&env);
        let mut fresh_reports: Vec<PriceReport> = Vec::new(&env);

        for reporter in reporters.iter() {
            if let Some(report) = env
                .storage()
                .persistent()
                .get::<DataKey, PriceReport>(&DataKey::LatestReport(reporter.clone()))
            {
                let age = now.saturating_sub(report.timestamp);
                if age <= MAX_STALENESS_SECONDS {
                    fresh_prices.push_back(report.price);
                    fresh_reports.push_back(report);
                }
            }
        }

        if fresh_prices.len() == 0 {
            panic!("No fresh price reports available");
        }

        let median = Self::median(&env, &fresh_prices);

        // Filter outliers and slash their stake.
        let mut inlier_prices: Vec<i128> = Vec::new(&env);
        for report in fresh_reports.iter() {
            let deviation_bps = Self::deviation_bps(report.price, median);
            if deviation_bps > OUTLIER_DEVIATION_BPS {
                Self::slash(&env, &report.reporter);
                env.events().publish(
                    (Symbol::new(&env, "outlier_flagged"),),
                    (report.reporter.clone(), report.price, median),
                );
            } else {
                inlier_prices.push_back(report.price);
            }
        }

        if inlier_prices.len() == 0 {
            panic!("All reports flagged as outliers");
        }

        let final_median = Self::median(&env, &inlier_prices);

        env.storage()
            .instance()
            .set(&DataKey::LastMedian, &final_median);
        env.storage()
            .instance()
            .set(&DataKey::LastMedianTimestamp, &now);

        env.events()
            .publish((Symbol::new(&env, "price_aggregated"),), final_median);

        final_median
    }

    /// Returns the last aggregated (medianized) price. Panics if stale.
    pub fn get_price(env: Env) -> i128 {
        let ts: u64 = env
            .storage()
            .instance()
            .get(&DataKey::LastMedianTimestamp)
            .expect("No price aggregated yet");
        let now = env.ledger().timestamp();
        if now.saturating_sub(ts) > MAX_STALENESS_SECONDS {
            panic!("Latest aggregated price is stale");
        }
        env.storage().instance().get(&DataKey::LastMedian).unwrap()
    }

    /// Returns the current stake for a reporter (post-slashing).
    pub fn get_stake(env: Env, reporter: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Stake(reporter))
            .unwrap_or(0)
    }

    pub fn is_reporter(env: Env, reporter: Address) -> bool {
        let reporters: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::Reporters)
            .unwrap_or_else(|| Vec::new(&env));
        reporters.contains(&reporter)
    }

    // --- internal helpers ---

    fn require_admin(env: &Env) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
    }

    /// Slashes a reporter's stake by SLASH_BPS (10%).
    fn slash(env: &Env, reporter: &Address) {
        let stake: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::Stake(reporter.clone()))
            .unwrap_or(0);
        let penalty = stake * SLASH_BPS / 10_000;
        let new_stake = stake - penalty;
        env.storage()
            .persistent()
            .set(&DataKey::Stake(reporter.clone()), &new_stake);
        env.events().publish(
            (Symbol::new(env, "reporter_slashed"),),
            (reporter.clone(), penalty, new_stake),
        );
    }

    /// Absolute deviation of `price` from `median`, expressed in bps/100
    /// (i.e. 1500 == 15%).
    fn deviation_bps(price: i128, median: i128) -> i128 {
        if median == 0 {
            return i128::MAX;
        }
        let diff = if price > median {
            price - median
        } else {
            median - price
        };
        diff * 10_000 / median
    }

    /// Computes the median of a Vec<i128> via simple insertion sort (small n).
    fn median(env: &Env, values: &Vec<i128>) -> i128 {
        let mut sorted: Vec<i128> = Vec::new(env);
        for v in values.iter() {
            let mut inserted = false;
            let mut i = 0u32;
            while i < sorted.len() {
                if v < sorted.get(i).unwrap() {
                    sorted.insert(i, v);
                    inserted = true;
                    break;
                }
                i += 1;
            }
            if !inserted {
                sorted.push_back(v);
            }
        }
        let n = sorted.len();
        if n % 2 == 1 {
            sorted.get(n / 2).unwrap()
        } else {
            let a = sorted.get(n / 2 - 1).unwrap();
            let b = sorted.get(n / 2).unwrap();
            (a + b) / 2
        }
    }
}

#[cfg(test)]
mod test;
