//! Distribution math, validation, and on-chain history for the
//! [`crate::royalty_splitter`] contract.
//!
//! This module is intentionally **not** a Soroban contract — it provides the
//! data types and pure helpers that the splitter calls into. Keeping the math
//! and history layer separate from the entry-point contract makes both pieces
//! easier to unit test and reason about.

use soroban_sdk::{contracttype, Address, Env, Vec};

/// One basis point = 1 / 10_000. A recipient's `share_bps` is its slice of
/// every distribution, and the recipient list must sum to exactly [`TOTAL_BPS`].
pub const TOTAL_BPS: u32 = 10_000;

/// Hard cap on the number of recipients in a single splitter. Bounds the cost
/// of validation, distribution, and on-chain payout records.
pub const MAX_RECIPIENTS: u32 = 50;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Recipient {
    pub address: Address,
    pub share_bps: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Payout {
    pub address: Address,
    pub amount: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DistributionRecord {
    pub index: u64,
    pub total_amount: i128,
    pub timestamp: u64,
    pub ledger: u64,
    pub recipient_count: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ChangeRecord {
    pub index: u64,
    pub timestamp: u64,
    pub ledger: u64,
    pub previous: Vec<Recipient>,
    pub applied: Vec<Recipient>,
    pub applied_by: Address,
}

#[contracttype]
#[derive(Clone)]
pub enum DistKey {
    /// Number of distributions completed (also the next free index).
    DistCount,
    /// Distribution summary by index.
    DistRecord(u64),
    /// Per-recipient payouts for a distribution by index.
    DistPayouts(u64),
    /// Number of recipient-set changes applied.
    ChangeCount,
    /// Change record by index.
    ChangeRecord(u64),
}

/// Compute pro-rata payouts for `total_amount` across `recipients`.
///
/// Integer division leaves dust; the rounding remainder is added to the last
/// recipient so the sum of payouts equals `total_amount` exactly. Callers
/// must ensure recipient shares sum to [`TOTAL_BPS`] (validated by the
/// splitter on configuration).
pub fn compute_payouts(env: &Env, recipients: &Vec<Recipient>, total_amount: i128) -> Vec<i128> {
    let mut out: Vec<i128> = Vec::new(env);
    let len = recipients.len();
    if len == 0 || total_amount <= 0 {
        return out;
    }
    let last = len - 1;
    let mut accumulated: i128 = 0;
    for i in 0..len {
        let r = recipients.get(i).unwrap();
        let amount = if i == last {
            total_amount - accumulated
        } else {
            let share = total_amount * (r.share_bps as i128) / (TOTAL_BPS as i128);
            accumulated += share;
            share
        };
        out.push_back(amount);
    }
    out
}

/// Append a distribution record and its payouts to persistent history.
/// Returns the assigned index.
pub fn record_distribution(
    env: &Env,
    total_amount: i128,
    payouts: &Vec<i128>,
    recipients: &Vec<Recipient>,
) -> u64 {
    let count: u64 = env
        .storage()
        .persistent()
        .get(&DistKey::DistCount)
        .unwrap_or(0);
    let index = count;
    let record = DistributionRecord {
        index,
        total_amount,
        timestamp: env.ledger().timestamp(),
        ledger: env.ledger().sequence() as u64,
        recipient_count: recipients.len(),
    };
    env.storage()
        .persistent()
        .set(&DistKey::DistRecord(index), &record);

    let mut payout_records: Vec<Payout> = Vec::new(env);
    for i in 0..recipients.len() {
        payout_records.push_back(Payout {
            address: recipients.get(i).unwrap().address,
            amount: payouts.get(i).unwrap(),
        });
    }
    env.storage()
        .persistent()
        .set(&DistKey::DistPayouts(index), &payout_records);
    env.storage()
        .persistent()
        .set(&DistKey::DistCount, &(count + 1));
    index
}

/// Append a recipient-set change record to persistent history.
pub fn record_change(
    env: &Env,
    previous: &Vec<Recipient>,
    applied: &Vec<Recipient>,
    applied_by: &Address,
) -> u64 {
    let count: u64 = env
        .storage()
        .persistent()
        .get(&DistKey::ChangeCount)
        .unwrap_or(0);
    let index = count;
    let record = ChangeRecord {
        index,
        timestamp: env.ledger().timestamp(),
        ledger: env.ledger().sequence() as u64,
        previous: previous.clone(),
        applied: applied.clone(),
        applied_by: applied_by.clone(),
    };
    env.storage()
        .persistent()
        .set(&DistKey::ChangeRecord(index), &record);
    env.storage()
        .persistent()
        .set(&DistKey::ChangeCount, &(count + 1));
    index
}

pub fn get_distribution(env: &Env, index: u64) -> Option<DistributionRecord> {
    env.storage().persistent().get(&DistKey::DistRecord(index))
}

pub fn get_distribution_payouts(env: &Env, index: u64) -> Vec<Payout> {
    env.storage()
        .persistent()
        .get(&DistKey::DistPayouts(index))
        .unwrap_or(Vec::new(env))
}

pub fn get_distribution_count(env: &Env) -> u64 {
    env.storage()
        .persistent()
        .get(&DistKey::DistCount)
        .unwrap_or(0)
}

pub fn get_change(env: &Env, index: u64) -> Option<ChangeRecord> {
    env.storage().persistent().get(&DistKey::ChangeRecord(index))
}

pub fn get_change_count(env: &Env) -> u64 {
    env.storage()
        .persistent()
        .get(&DistKey::ChangeCount)
        .unwrap_or(0)
}
