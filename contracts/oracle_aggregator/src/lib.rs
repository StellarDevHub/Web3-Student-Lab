//! Decentralized multi-source price oracle aggregator.
//!
//! Whitelisted reporters submit price observations. The aggregator computes
//! a medianized price across all fresh (non-stale) reports, excludes and
//! slashes reporters whose submission deviates too far from the median, and
//! exposes the resulting price for downstream contracts (e.g. AMMs, vaults).

#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Env, Symbol,
    Vec,
};

/// Reports older than this many seconds are rejected as stale.
pub const MAX_STALENESS_SECONDS: u64 = 300; // 5 minutes

/// Reports deviating more than this percentage from consensus are outliers.
pub const OUTLIER_DEVIATION_BPS: i128 = 1000; // 10.00% expressed in basis points
/// Minimum number of fresh independent reports required to aggregate.
pub const MIN_FRESH_REPORTS: u32 = 3;

/// Percentage (in bps/100, i.e. 1000 = 10%) of stake slashed on an outlier.
pub const SLASH_BPS: i128 = 1000; // 10%

// ── Errors (SC-HARD-20: range 400+) ──────────────────────────────────────────

/// Typed contract errors for the oracle aggregator.
///
/// Discriminants are in the `400+` range.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum OracleError {
    /// `420` — Contract has already been initialised.
    AlreadyInitialized = 420,
    /// `421` — Caller is not the admin.
    Unauthorized = 421,
    /// `422` — Stake must be a positive value.
    InvalidStake = 422,
    /// `423` — Price must be a positive value.
    InvalidPrice = 423,
    /// `424` — Reporter is not on the whitelist.
    NotWhitelisted = 424,
    /// `425` — No price reports have been submitted.
    NoFreshReports = 425,
    /// `426` — All submitted reports were flagged as outliers.
    AllOutliers = 426,
    /// `427` — A report or the latest aggregate exceeds the staleness limit.
    StalePriceFeed = 427,
    /// `428` — Contract has not been initialised.
    NotInitialized = 428,
    /// `429` — Fewer than three fresh independent reports are available.
    InsufficientReports = 429,
}

pub mod median;
pub mod staleness;

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
    Reporters,             // Vec<Address> whitelist
    Stake(Address),        // reporter -> staked amount
    LatestReport(Address), // reporter -> last submitted PriceReport
    LastMedian,            // i128 last computed median price
    LastMedianTimestamp,   // u64
}

#[contract]
pub struct OracleAggregatorContract;

#[contractimpl]
impl OracleAggregatorContract {
    /// Initializes the aggregator with an admin address.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, OracleError::AlreadyInitialized);
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
            panic_with_error!(&env, OracleError::InvalidStake);
        }
        let mut reporters: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::Reporters)
            .unwrap_or_else(|| Vec::new(&env));
        if !reporters.contains(&reporter) {
            reporters.push_back(reporter.clone());
            env.storage()
                .instance()
                .set(&DataKey::Reporters, &reporters);
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
            env.storage()
                .instance()
                .set(&DataKey::Reporters, &reporters);
        }
        env.events()
            .publish((Symbol::new(&env, "reporter_removed"),), reporter);
    }

    /// Whitelisted reporters submit a price observation. Requires their auth.
    pub fn submit_price(env: Env, reporter: Address, price: i128) {
        reporter.require_auth();
        if price <= 0 {
            panic_with_error!(&env, OracleError::InvalidPrice);
        }
        let reporters: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::Reporters)
            .unwrap_or_else(|| Vec::new(&env));
        if !reporters.contains(&reporter) {
            panic_with_error!(&env, OracleError::NotWhitelisted);
        }

        let report = PriceReport {
            reporter: reporter.clone(),
            price,
            timestamp: env.ledger().timestamp(),
        };
        env.storage()
            .persistent()
            .set(&DataKey::LatestReport(reporter.clone()), &report);

        env.events()
            .publish((Symbol::new(&env, "price_submitted"),), (reporter, price));
    }

    /// Aggregates fresh reports after rejecting prices more than 10% from the
    /// robust median consensus. At least three fresh reporters are required.
    pub fn aggregate(env: Env) -> i128 {
        let reporters: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::Reporters)
            .unwrap_or_else(|| Vec::new(&env));

        let now = env.ledger().timestamp();
        let mut fresh_prices: Vec<i128> = Vec::new(&env);
        let mut fresh_reports: Vec<PriceReport> = Vec::new(&env);
        let mut has_reports = false;

        for reporter in reporters.iter() {
            if let Some(report) = env
                .storage()
                .persistent()
                .get::<DataKey, PriceReport>(&DataKey::LatestReport(reporter.clone()))
            {
                has_reports = true;
                if staleness::is_fresh(&env, &report, MAX_STALENESS_SECONDS) {
                    fresh_prices.push_back(report.price);
                    fresh_reports.push_back(report);
                }
            }
        }

        if fresh_prices.len() == 0 {
            let error = if has_reports {
                OracleError::StalePriceFeed
            } else {
                OracleError::NoFreshReports
            };
            panic_with_error!(&env, error);
        }

        if fresh_prices.len() < MIN_FRESH_REPORTS {
            panic_with_error!(&env, OracleError::InsufficientReports);
        }

        let consensus = median::median(&fresh_prices)
            .unwrap_or_else(|| panic_with_error!(&env, OracleError::NoFreshReports));

        // Filter outliers and slash their stake.
        let mut inlier_prices: Vec<i128> = Vec::new(&env);
        for report in fresh_reports.iter() {
            let deviation_bps = median::deviation_bps(report.price, consensus);
            if deviation_bps > OUTLIER_DEVIATION_BPS {
                Self::slash(&env, &report.reporter);
                env.events().publish(
                    (Symbol::new(&env, "outlier_flagged"),),
                    (report.reporter.clone(), report.price, consensus),
                );
            } else {
                inlier_prices.push_back(report.price);
            }
        }

        if inlier_prices.len() == 0 {
            panic_with_error!(&env, OracleError::AllOutliers);
        }

        let final_median = median::median(&inlier_prices)
            .unwrap_or_else(|| panic_with_error!(&env, OracleError::AllOutliers));

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

    /// Returns the last aggregated (medianized) price. Reverts if stale.
    pub fn get_price(env: Env) -> i128 {
        let ts: u64 = env
            .storage()
            .instance()
            .get(&DataKey::LastMedianTimestamp)
            .unwrap_or_else(|| panic_with_error!(&env, OracleError::NotInitialized));
        if staleness::is_stale(&env, ts, MAX_STALENESS_SECONDS) {
            panic_with_error!(&env, OracleError::StalePriceFeed);
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
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, OracleError::NotInitialized));
        admin.require_auth();
    }

    /// Slashes a reporter's stake by SLASH_BPS (10%).
    fn slash(env: &Env, reporter: &Address) {
        let stake: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::Stake(reporter.clone()))
            .unwrap_or(0);
        let penalty = stake / (10_000 / SLASH_BPS);
        let new_stake = stake - penalty;
        env.storage()
            .persistent()
            .set(&DataKey::Stake(reporter.clone()), &new_stake);
        env.events().publish(
            (Symbol::new(env, "reporter_slashed"),),
            (reporter.clone(), penalty, new_stake),
        );
    }
}

#[cfg(test)]
mod test;
