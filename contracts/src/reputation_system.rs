//! On-Chain Reputation System (#399)
//!
//! Features:
//! - Per-user reputation score with weighted activity points
//! - Time-based decay applied on every read/update
//! - Streak tracking for consistency multiplier
//! - Peer attestations with weight contribution
//! - Admin-configurable decay and scoring parameters
//! - Full event emission

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, Address,
    Env, Vec,
};

use crate::scoring_algorithm::{
    calculate_activity_points, effective_score, ActivityType, PRECISION,
};

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone)]
pub enum RepKey {
    Admin,
    /// Full reputation record for a user.
    Record(Address),
    /// Attestation from attester → subject.
    Attestation(Address, Address),
    /// Count of attestations received by subject.
    AttestationCount(Address),
}

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

/// Activity type stored on-chain (mirrors scoring_algorithm::ActivityType).
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum OnChainActivity {
    CourseCompletion,
    PeerReview,
    Attestation,
    OpenSourceContribution,
    HackathonParticipation,
    DailyEngagement,
}

impl OnChainActivity {
    fn to_algo(self) -> ActivityType {
        match self {
            OnChainActivity::CourseCompletion => ActivityType::CourseCompletion,
            OnChainActivity::PeerReview => ActivityType::PeerReview,
            OnChainActivity::Attestation => ActivityType::Attestation,
            OnChainActivity::OpenSourceContribution => ActivityType::OpenSourceContribution,
            OnChainActivity::HackathonParticipation => ActivityType::HackathonParticipation,
            OnChainActivity::DailyEngagement => ActivityType::DailyEngagement,
        }
    }
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReputationRecord {
    /// Raw accumulated score (PRECISION units, before decay).
    pub raw_score: u128,
    /// Ledger at which raw_score was last updated.
    pub last_update_ledger: u32,
    /// Consecutive active days (for consistency multiplier).
    pub streak_days: u32,
    /// Ledger of last activity (used to detect streak breaks).
    pub last_activity_ledger: u32,
    /// Total attestations received.
    pub attestation_count: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AttestationRecord {
    pub attester: Address,
    pub subject: Address,
    /// Weight of this attestation (PRECISION units).
    pub weight: u128,
    pub ledger: u32,
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum RepError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    SelfAttestation = 4,
    DuplicateAttestation = 5,
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Ledgers per day (≈5 s/ledger).
const LEDGERS_PER_DAY: u32 = 17_280;

/// Base weight for a peer attestation (PRECISION units).
const ATTESTATION_BASE_WEIGHT: u128 = 50 * PRECISION;

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct ReputationContract;

#[contractimpl]
impl ReputationContract {
    // -----------------------------------------------------------------------
    // Init
    // -----------------------------------------------------------------------

    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&RepKey::Admin) {
            panic_with_error!(&env, RepError::AlreadyInitialized);
        }
        env.storage().instance().set(&RepKey::Admin, &admin);
    }

    // -----------------------------------------------------------------------
    // Record activity
    // -----------------------------------------------------------------------

    /// Record an activity for `user`, updating their reputation score.
    pub fn record_activity(env: Env, user: Address, activity: OnChainActivity) {
        user.require_auth();
        Self::assert_initialized(&env);

        let current_ledger = env.ledger().sequence();
        let mut record = Self::load_or_default(&env, &user, current_ledger);

        // Update streak
        let ledgers_since_last = current_ledger.saturating_sub(record.last_activity_ledger);
        if ledgers_since_last <= LEDGERS_PER_DAY * 2 {
            // Active within 2 days — extend streak
            if ledgers_since_last >= LEDGERS_PER_DAY {
                record.streak_days += 1;
            }
        } else {
            // Gap too large — reset streak
            record.streak_days = 0;
        }

        // Apply decay to existing raw score before adding new points
        record.raw_score =
            effective_score(record.raw_score, record.last_update_ledger, current_ledger);

        // Add new points
        let points = calculate_activity_points(activity.to_algo(), record.streak_days);
        record.raw_score = record.raw_score.saturating_add(points);
        record.last_update_ledger = current_ledger;
        record.last_activity_ledger = current_ledger;

        env.storage()
            .instance()
            .set(&RepKey::Record(user.clone()), &record);

        env.events().publish(
            (symbol_short!("rep"), symbol_short!("activity")),
            (user, activity, points),
        );
    }

    // -----------------------------------------------------------------------
    // Attestations
    // -----------------------------------------------------------------------

    /// Attester endorses subject, boosting subject's reputation.
    pub fn attest(env: Env, attester: Address, subject: Address) {
        attester.require_auth();
        Self::assert_initialized(&env);

        if attester == subject {
            panic_with_error!(&env, RepError::SelfAttestation);
        }

        let att_key = RepKey::Attestation(attester.clone(), subject.clone());
        if env.storage().instance().has(&att_key) {
            panic_with_error!(&env, RepError::DuplicateAttestation);
        }

        let current_ledger = env.ledger().sequence();

        // Attester's own score influences attestation weight (capped at 2×)
        let attester_record = Self::load_or_default(&env, &attester, current_ledger);
        let attester_score =
            effective_score(attester_record.raw_score, attester_record.last_update_ledger, current_ledger);
        // weight = base + min(attester_score / 1000, base)  (capped at 2× base)
        let bonus = (attester_score / 1_000).min(ATTESTATION_BASE_WEIGHT);
        let weight = ATTESTATION_BASE_WEIGHT + bonus;

        // Record attestation
        let record = AttestationRecord {
            attester: attester.clone(),
            subject: subject.clone(),
            weight,
            ledger: current_ledger,
        };
        env.storage().instance().set(&att_key, &record);

        // Apply weight to subject's score
        let mut subject_record = Self::load_or_default(&env, &subject, current_ledger);
        subject_record.raw_score =
            effective_score(subject_record.raw_score, subject_record.last_update_ledger, current_ledger);
        subject_record.raw_score = subject_record.raw_score.saturating_add(weight);
        subject_record.last_update_ledger = current_ledger;
        subject_record.attestation_count += 1;

        env.storage()
            .instance()
            .set(&RepKey::Record(subject.clone()), &subject_record);

        env.events().publish(
            (symbol_short!("rep"), symbol_short!("attest")),
            (attester, subject, weight),
        );
    }

    // -----------------------------------------------------------------------
    // Queries
    // -----------------------------------------------------------------------

    /// Returns the current effective (decayed) score for `user`.
    pub fn get_score(env: Env, user: Address) -> u128 {
        let current_ledger = env.ledger().sequence();
        let record: ReputationRecord = env
            .storage()
            .instance()
            .get(&RepKey::Record(user))
            .unwrap_or(ReputationRecord {
                raw_score: 0,
                last_update_ledger: current_ledger,
                streak_days: 0,
                last_activity_ledger: 0,
                attestation_count: 0,
            });
        effective_score(record.raw_score, record.last_update_ledger, current_ledger)
    }

    /// Returns the full reputation record for `user`.
    pub fn get_record(env: Env, user: Address) -> ReputationRecord {
        let current_ledger = env.ledger().sequence();
        env.storage()
            .instance()
            .get(&RepKey::Record(user))
            .unwrap_or(ReputationRecord {
                raw_score: 0,
                last_update_ledger: current_ledger,
                streak_days: 0,
                last_activity_ledger: 0,
                attestation_count: 0,
            })
    }

    /// Returns the attestation record from `attester` to `subject`, if any.
    pub fn get_attestation(
        env: Env,
        attester: Address,
        subject: Address,
    ) -> Option<AttestationRecord> {
        env.storage()
            .instance()
            .get(&RepKey::Attestation(attester, subject))
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    fn assert_initialized(env: &Env) {
        if !env.storage().instance().has(&RepKey::Admin) {
            panic_with_error!(env, RepError::NotInitialized);
        }
    }

    fn load_or_default(env: &Env, user: &Address, current_ledger: u32) -> ReputationRecord {
        env.storage()
            .instance()
            .get(&RepKey::Record(user.clone()))
            .unwrap_or(ReputationRecord {
                raw_score: 0,
                last_update_ledger: current_ledger,
                streak_days: 0,
                last_activity_ledger: 0,
                attestation_count: 0,
            })
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Address, Env};

    fn setup() -> (Env, Address, ReputationContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let id = env.register(ReputationContract, ());
        let client = ReputationContractClient::new(&env, &id);
        client.initialize(&admin);
        (env, admin, client)
    }

    #[test]
    fn record_activity_increases_score() {
        let (env, _, client) = setup();
        let user = Address::generate(&env);
        assert_eq!(client.get_score(&user), 0);
        client.record_activity(&user, &OnChainActivity::CourseCompletion);
        assert!(client.get_score(&user) > 0);
    }

    #[test]
    fn multiple_activities_accumulate() {
        let (env, _, client) = setup();
        let user = Address::generate(&env);
        client.record_activity(&user, &OnChainActivity::CourseCompletion);
        let after_one = client.get_score(&user);
        client.record_activity(&user, &OnChainActivity::PeerReview);
        assert!(client.get_score(&user) > after_one);
    }

    #[test]
    fn attestation_boosts_subject_score() {
        let (env, _, client) = setup();
        let attester = Address::generate(&env);
        let subject = Address::generate(&env);
        let before = client.get_score(&subject);
        client.attest(&attester, &subject);
        assert!(client.get_score(&subject) > before);
    }

    #[test]
    fn attestation_recorded() {
        let (env, _, client) = setup();
        let attester = Address::generate(&env);
        let subject = Address::generate(&env);
        client.attest(&attester, &subject);
        let att = client.get_attestation(&attester, &subject).unwrap();
        assert_eq!(att.attester, attester);
        assert_eq!(att.subject, subject);
    }

    #[test]
    #[should_panic]
    fn self_attestation_rejected() {
        let (env, _, client) = setup();
        let user = Address::generate(&env);
        client.attest(&user, &user);
    }

    #[test]
    #[should_panic]
    fn duplicate_attestation_rejected() {
        let (env, _, client) = setup();
        let attester = Address::generate(&env);
        let subject = Address::generate(&env);
        client.attest(&attester, &subject);
        client.attest(&attester, &subject);
    }

    #[test]
    fn attestation_count_increments() {
        let (env, _, client) = setup();
        let attester = Address::generate(&env);
        let subject = Address::generate(&env);
        client.attest(&attester, &subject);
        let record = client.get_record(&subject);
        assert_eq!(record.attestation_count, 1);
    }

    #[test]
    #[should_panic]
    fn double_initialize_panics() {
        let (env, admin, client) = setup();
        client.initialize(&admin);
    }
}
