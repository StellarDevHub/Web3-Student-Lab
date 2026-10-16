//! Reputation scoring system with decaying trust metrics and score caps.

use crate::decay::{apply_exponential_decay, DEFAULT_HALF_LIFE_SECONDS, MAX_REPUTATION_SCORE};
use crate::DataKey;
use soroban_sdk::{contracttype, symbol_short, Address, Env};

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum ReputationReason {
    CourseCompletion = 1,
    PeerReview = 2,
    HackathonWin = 3,
    TimeDecay = 4,
    AdminAdjustment = 5,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReputationRecord {
    pub user: Address,
    pub score: u64,
    pub last_updated: u64,
}

/// Retrieves current reputation score after applying exponential time decay.
pub fn get_reputation(env: &Env, user: &Address) -> u64 {
    let key = DataKey::Reputation(user.clone());
    if let Some(record) = env.storage().persistent().get::<_, ReputationRecord>(&key) {
        let now = env.ledger().timestamp();
        let elapsed = now.saturating_sub(record.last_updated);
        apply_exponential_decay(record.score, elapsed, DEFAULT_HALF_LIFE_SECONDS)
    } else {
        0
    }
}

/// Retrieves the raw reputation record without auto-decay settlement.
pub fn get_reputation_record(env: &Env, user: &Address) -> Option<ReputationRecord> {
    let key = DataKey::Reputation(user.clone());
    env.storage().persistent().get(&key)
}

/// Adjusts user reputation score according to an action, capping at MAX_REPUTATION_SCORE
/// and emitting a transparent adjustment event with a reasoning code.
pub fn adjust_reputation(
    env: &Env,
    user: Address,
    delta: i64,
    reason: ReputationReason,
) -> u64 {
    let key = DataKey::Reputation(user.clone());
    let now = env.ledger().timestamp();

    let old_score = get_reputation(env, &user);
    let new_score = if delta >= 0 {
        let added = old_score.saturating_add(delta as u64);
        added.min(MAX_REPUTATION_SCORE)
    } else {
        old_score.saturating_sub((-delta) as u64)
    };

    let record = ReputationRecord {
        user: user.clone(),
        score: new_score,
        last_updated: now,
    };
    env.storage().persistent().set(&key, &record);

    env.events().publish(
        (symbol_short!("rep_adj"), user),
        (old_score, new_score, reason as u32, now),
    );

    new_score
}

/// Applies time decay and commits the settled reputation score on-chain.
pub fn settle_decay(env: &Env, user: Address) -> u64 {
    let old_record = get_reputation_record(env, &user);
    if let Some(record) = old_record {
        let now = env.ledger().timestamp();
        let elapsed = now.saturating_sub(record.last_updated);
        let decayed = apply_exponential_decay(record.score, elapsed, DEFAULT_HALF_LIFE_SECONDS);

        let key = DataKey::Reputation(user.clone());
        let updated = ReputationRecord {
            user: user.clone(),
            score: decayed,
            last_updated: now,
        };
        env.storage().persistent().set(&key, &updated);

        env.events().publish(
            (symbol_short!("rep_adj"), user),
            (record.score, decayed, ReputationReason::TimeDecay as u32, now),
        );

        decayed
    } else {
        0
    }
}
