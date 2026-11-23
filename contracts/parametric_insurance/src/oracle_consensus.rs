use soroban_sdk::{contracttype, Address, Env, Symbol, Vec};

pub const MIN_ORACLES: u32 = 3;
pub const MAX_ORACLES: u32 = 21;
pub const DEFAULT_STALENESS_SECS: u64 = 3_600;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OracleReport {
    pub value: i128,
    pub timestamp: u64,
}

pub fn median(values: &Vec<i128>) -> Option<i128> {
    if values.is_empty() {
        return None;
    }

    let mut sorted = values.clone();
    for i in 1..sorted.len() {
        let value = sorted.get(i).unwrap();
        let mut j = i;
        while j > 0 && sorted.get(j - 1).unwrap() > value {
            let previous = sorted.get(j - 1).unwrap();
            sorted.set(j, previous);
            j -= 1;
        }
        sorted.set(j, value);
    }

    let middle = sorted.get(sorted.len() / 2).unwrap();
    if sorted.len() % 2 == 1 {
        Some(middle)
    } else {
        let lower = sorted.get(sorted.len() / 2 - 1).unwrap();
        let quotient = lower / 2 + middle / 2;
        let remainder = lower % 2 + middle % 2;
        Some(quotient + remainder / 2)
    }
}

pub fn is_fresh(env: &Env, report: &OracleReport, staleness_secs: u64) -> bool {
    let now = env.ledger().timestamp();
    report.timestamp <= now && now - report.timestamp <= staleness_secs
}

pub fn contains_oracle(oracles: &Vec<Address>, oracle: &Address) -> bool {
    oracles.iter().any(|registered| registered == *oracle)
}
