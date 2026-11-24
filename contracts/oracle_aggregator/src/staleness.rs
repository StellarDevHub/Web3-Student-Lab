use soroban_sdk::Env;

use crate::PriceReport;

pub fn is_fresh(env: &Env, report: &PriceReport, max_age_seconds: u64) -> bool {
    let now = env.ledger().timestamp();
    report.timestamp <= now && now - report.timestamp <= max_age_seconds
}

pub fn is_stale(env: &Env, timestamp: u64, max_age_seconds: u64) -> bool {
    let now = env.ledger().timestamp();
    timestamp > now || now - timestamp > max_age_seconds
}
