//! On-Chain Reputation System
//!
//! Tracks per-user reputation scores, records activity contributions,
//! manages peer attestations, and stores decay history.

#![allow(unused)]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, Symbol, Vec};

// ── Storage keys ──────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub enum RepKey {
    Admin,
    Score(Address),
    LastActivity(Address),
    DecayHistory(Address),
    Attestations(Address),
    AttestationCount(Address),
}

// ── Data types ────────────────────────────────────────────────────────────────

/// Activity types that contribute to reputation.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ActivityType {
    CourseCompletion = 0,
    PeerReview = 1,
    ContributionMerged = 2,
    AttendedEvent = 3,
    HackathonWin = 4,
}

/// A single reputation record for a user.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReputationRecord {
    pub score: i64,
    pub raw_score: i64,       // before decay
    pub last_updated: u64,    // ledger timestamp
    pub activity_count: u32,
}

/// One entry in the decay history log.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DecayEntry {
    pub timestamp: u64,
    pub score_before: i64,
    pub score_after: i64,
    pub decay_amount: i64,
}

/// A peer attestation.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Attestation {
    pub attester: Address,
    pub subject: Address,
    pub weight: u32,   // 1–100
    pub timestamp: u64,
    pub verified: bool,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct ReputationContract;

#[contractimpl]
impl ReputationContract {
    // ── Init ──────────────────────────────────────────────────────────────────

    pub fn initialize(env: Env, admin: Address) {
        if env.storage().persistent().has(&RepKey::Admin) {
            panic!("already_initialized");
        }
        env.storage().persistent().set(&RepKey::Admin, &admin);
    }

    // ── Score management ──────────────────────────────────────────────────────

    /// Record an activity for a user and update their score.
    /// `base_points` is the raw contribution before weighting.
    pub fn record_activity(
        env: Env,
        user: Address,
        activity: ActivityType,
        base_points: i64,
    ) {
        user.require_auth();

        let now = env.ledger().timestamp();
        let weighted =
            crate::scoring_algorithm::ScoringAlgorithm::weighted_points(activity, base_points);

        let mut record: ReputationRecord = env
            .storage()
            .persistent()
            .get(&RepKey::Score(user.clone()))
            .unwrap_or(ReputationRecord {
                score: 0,
                raw_score: 0,
                last_updated: now,
                activity_count: 0,
            });

        record.raw_score += weighted;
        record.score += weighted;
        record.activity_count += 1;
        record.last_updated = now;

        env.storage()
            .persistent()
            .set(&RepKey::Score(user.clone()), &record);
        env.storage()
            .persistent()
            .set(&RepKey::LastActivity(user.clone()), &now);

        env.events().publish(
            (Symbol::new(&env, "activity_recorded"), user),
            (activity as u32, weighted),
        );
    }

    /// Apply time-based decay to a user's score and log it.
    /// `decay_rate_bps` is basis points per day (e.g. 50 = 0.5%/day).
    pub fn apply_decay(env: Env, user: Address, decay_rate_bps: u32) {
        let now = env.ledger().timestamp();

        let mut record: ReputationRecord = env
            .storage()
            .persistent()
            .get(&RepKey::Score(user.clone()))
            .unwrap_or(return);

        let elapsed_secs = now.saturating_sub(record.last_updated);
        let elapsed_days = elapsed_secs / 86_400;
        if elapsed_days == 0 {
            return;
        }

        let decay = crate::scoring_algorithm::ScoringAlgorithm::decay_amount(
            record.score,
            decay_rate_bps,
            elapsed_days as u32,
        );

        let score_before = record.score;
        record.score = (record.score - decay).max(0);
        record.last_updated = now;

        env.storage()
            .persistent()
            .set(&RepKey::Score(user.clone()), &record);

        // Append to decay history (keep last 10 entries).
        let mut history: Vec<DecayEntry> = env
            .storage()
            .persistent()
            .get(&RepKey::DecayHistory(user.clone()))
            .unwrap_or(Vec::new(&env));

        if history.len() >= 10 {
            history.pop_front();
        }
        history.push_back(DecayEntry {
            timestamp: now,
            score_before,
            score_after: record.score,
            decay_amount: decay,
        });

        env.storage()
            .persistent()
            .set(&RepKey::DecayHistory(user.clone()), &history);

        env.events().publish(
            (Symbol::new(&env, "decay_applied"), user),
            (score_before, record.score, decay),
        );
    }

    pub fn get_score(env: Env, user: Address) -> ReputationRecord {
        env.storage()
            .persistent()
            .get(&RepKey::Score(user))
            .unwrap_or(ReputationRecord {
                score: 0,
                raw_score: 0,
                last_updated: 0,
                activity_count: 0,
            })
    }

    pub fn get_decay_history(env: Env, user: Address) -> Vec<DecayEntry> {
        env.storage()
            .persistent()
            .get(&RepKey::DecayHistory(user))
            .unwrap_or(Vec::new(&env))
    }

    // ── Attestations ──────────────────────────────────────────────────────────

    /// Submit a peer attestation for `subject`.
    /// Weight must be 1–100. Attester cannot attest themselves.
    pub fn attest(env: Env, attester: Address, subject: Address, weight: u32) {
        attester.require_auth();

        if attester == subject {
            panic!("self_attestation_not_allowed");
        }
        if weight == 0 || weight > 100 {
            panic!("invalid_weight");
        }

        let now = env.ledger().timestamp();
        let entry = Attestation {
            attester: attester.clone(),
            subject: subject.clone(),
            weight,
            timestamp: now,
            verified: false,
        };

        let mut list: Vec<Attestation> = env
            .storage()
            .persistent()
            .get(&RepKey::Attestations(subject.clone()))
            .unwrap_or(Vec::new(&env));

        list.push_back(entry);

        let count: u32 = env
            .storage()
            .persistent()
            .get(&RepKey::AttestationCount(subject.clone()))
            .unwrap_or(0);

        env.storage()
            .persistent()
            .set(&RepKey::Attestations(subject.clone()), &list);
        env.storage()
            .persistent()
            .set(&RepKey::AttestationCount(subject.clone()), &(count + 1));

        env.events().publish(
            (Symbol::new(&env, "attestation_submitted"), subject),
            (attester, weight),
        );
    }

    /// Admin verifies an attestation by index, adding its weight to the subject's score.
    pub fn verify_attestation(env: Env, subject: Address, index: u32) {
        let admin: Address = env.storage().persistent().get(&RepKey::Admin).unwrap();
        admin.require_auth();

        let mut list: Vec<Attestation> = env
            .storage()
            .persistent()
            .get(&RepKey::Attestations(subject.clone()))
            .unwrap_or(Vec::new(&env));

        if index as usize >= list.len() as usize {
            panic!("invalid_index");
        }

        let mut entry = list.get(index).unwrap();
        if entry.verified {
            panic!("already_verified");
        }
        entry.verified = true;
        list.set(index, entry.clone());

        env.storage()
            .persistent()
            .set(&RepKey::Attestations(subject.clone()), &list);

        // Add attestation weight to score.
        let bonus = crate::scoring_algorithm::ScoringAlgorithm::attestation_bonus(entry.weight);
        let mut record: ReputationRecord = env
            .storage()
            .persistent()
            .get(&RepKey::Score(subject.clone()))
            .unwrap_or(ReputationRecord {
                score: 0,
                raw_score: 0,
                last_updated: env.ledger().timestamp(),
                activity_count: 0,
            });

        record.score += bonus;
        record.raw_score += bonus;
        env.storage()
            .persistent()
            .set(&RepKey::Score(subject.clone()), &record);

        env.events().publish(
            (Symbol::new(&env, "attestation_verified"), subject),
            (index, bonus),
        );
    }

    pub fn get_attestations(env: Env, subject: Address) -> Vec<Attestation> {
        env.storage()
            .persistent()
            .get(&RepKey::Attestations(subject))
            .unwrap_or(Vec::new(&env))
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    fn setup() -> (Env, Address, ReputationContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let id = env.register_contract(None, ReputationContract);
        let client = ReputationContractClient::new(&env, &id);
        let admin = Address::generate(&env);
        client.initialize(&admin);
        (env, admin, client)
    }

    #[test]
    fn test_record_activity_increases_score() {
        let (env, _, client) = setup();
        let user = Address::generate(&env);
        client.record_activity(&user, &ActivityType::CourseCompletion, &100);
        let rec = client.get_score(&user);
        assert!(rec.score > 0);
        assert_eq!(rec.activity_count, 1);
    }

    #[test]
    fn test_decay_reduces_score() {
        let (env, _, client) = setup();
        let user = Address::generate(&env);
        client.record_activity(&user, &ActivityType::HackathonWin, &200);
        let before = client.get_score(&user).score;

        // Advance time by 10 days.
        env.ledger().with_mut(|l| l.timestamp += 86_400 * 10);
        client.apply_decay(&user, &50); // 0.5%/day
        let after = client.get_score(&user).score;
        assert!(after < before);
    }

    #[test]
    fn test_decay_history_recorded() {
        let (env, _, client) = setup();
        let user = Address::generate(&env);
        client.record_activity(&user, &ActivityType::PeerReview, &50);
        env.ledger().with_mut(|l| l.timestamp += 86_400 * 5);
        client.apply_decay(&user, &100);
        let history = client.get_decay_history(&user);
        assert_eq!(history.len(), 1);
    }

    #[test]
    fn test_attestation_and_verify() {
        let (env, admin, client) = setup();
        let attester = Address::generate(&env);
        let subject = Address::generate(&env);
        client.attest(&attester, &subject, &80);
        let score_before = client.get_score(&subject).score;
        client.verify_attestation(&subject, &0);
        let score_after = client.get_score(&subject).score;
        assert!(score_after > score_before);
    }

    #[test]
    #[should_panic(expected = "self_attestation_not_allowed")]
    fn test_self_attestation_rejected() {
        let (env, _, client) = setup();
        let user = Address::generate(&env);
        client.attest(&user, &user, &50);
    }

    #[test]
    #[should_panic(expected = "invalid_weight")]
    fn test_zero_weight_rejected() {
        let (env, _, client) = setup();
        let a = Address::generate(&env);
        let b = Address::generate(&env);
        client.attest(&a, &b, &0);
    }
}
