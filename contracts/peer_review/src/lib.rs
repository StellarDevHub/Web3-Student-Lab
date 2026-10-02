#![no_std]

//! # Decentralized Peer Review & Stake-Slashing — SC-HARD-13
//!
//! A game-theoretically sound peer-review contract: student reviewers
//! **stake tokens**, submit **blind reviews** via hash commitments, and
//! earn reputation rewards — or face **stake slashing** — based on how
//! close their revealed grade lands to the **median consensus** grade.
//!
//! ## Flow
//!
//! 1. A creator deposits a reward pool and opens a submission with commit /
//!    reveal deadlines ([`PeerReviewContract::create_submission`]).
//! 2. Reviewers stake tokens ([`PeerReviewContract::stake`]) and commit a
//!    blinded `sha256(grade || salt)` hash
//!    ([`PeerReviewContract::commit_review`]) before the commit deadline,
//!    which prevents copycat grading.
//! 3. After the commit deadline, reviewers reveal their grade + salt
//!    ([`PeerReviewContract::reveal_review`]); the hash must match.
//! 4. Anyone finalizes after the reveal deadline
//!    ([`PeerReviewContract::finalize_submission`]): the **median** grade
//!    is the consensus, reviewers within `tolerance` of it share the reward
//!    pool, and outlier grades are **slashed** into the community treasury.
//!
//! ## Storage TTL (SC-HARD-16)
//!
//! Every state-mutating call bumps the instance TTL beyond 100,000 ledgers
//! to protect against automatic ledger state archival on Stellar Mainnet.

#[cfg(test)]
extern crate std;

use contract_events::{
    publish_commit, publish_reveal, publish_review_done, publish_slash, publish_stake,
    publish_submission,
};
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, token, Address, Bytes,
    BytesN, Env, Vec,
};

// ── TTL constants (SC-HARD-16) ───────────────────────────────────────────────
/// Bump persistent / instance storage beyond this remaining TTL.
pub const TTL_THRESHOLD: u32 = 10_000;
/// Target TTL for instance storage: ~100,000 ledgers (>5 days at 5s/ledger).
pub const INSTANCE_BUMP: u32 = 100_000;
/// Target TTL for persistent entries (reviewer state, submissions, reviews).
pub const PERSISTENT_BUMP: u32 = 518_400; // 30 days

// ── Storage keys ─────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Token,
    Tolerance,
    SlashBps,
    LockSeconds,
    Treasury,
    Reviewer(Address),
    Submission(u64),
    Review(u64, Address),
}

// ── On-chain types ────────────────────────────────────────────────────────────

/// On-chain reviewer state.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReviewerState {
    /// Total staked tokens.
    pub stake: i128,
    /// Earliest ledger timestamp at which stake may be withdrawn.
    pub locked_until: u64,
    /// Number of active (committed, not yet revealed) reviews.
    pub pending: u32,
    /// Total amount slashed from this reviewer to date.
    pub slashed_total: i128,
}

/// A peer-review submission.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Submission {
    pub creator: Address,
    pub reward_pool: i128,
    pub commit_deadline: u64,
    pub reveal_deadline: u64,
    pub finalized: bool,
    pub median: i128,
    pub accurate_count: u32,
    pub slashed_count: u32,
    /// Reviewers that committed to this submission (revealed or not).
    pub reviewers: Vec<Address>,
}

/// A single reviewer's participation in a submission.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReviewState {
    pub commitment: BytesN<32>,
    pub revealed: bool,
    pub grade: i128,
}

// ── Errors ────────────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum ReviewError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    InvalidAmount = 4,
    SubmissionExists = 5,
    SubmissionMissing = 6,
    SubmissionFinalized = 7,
    CommitWindowClosed = 8,
    RevealWindowClosed = 9,
    AlreadyCommitted = 10,
    NotCommitted = 11,
    CommitmentMismatch = 12,
    NotStaked = 13,
    StakeLocked = 14,
    NoReviews = 15,
    InvalidConfig = 16,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct PeerReviewContract;

#[contractimpl]
impl PeerReviewContract {
    // ── Initialisation ────────────────────────────────────────────────────────

    /// Initialize the review platform.
    ///
    /// * `admin` — can withdraw the community treasury.
    /// * `token` — the stake / reward asset.
    /// * `tolerance` — max absolute deviation from the median grade for a
    ///   reviewer to count as accurate.
    /// * `slash_bps` — share of an outlier's stake to slash, in basis
    ///   points (`250` == 2.5%).
    /// * `lock_seconds` — how long fresh stake deposits stay locked.
    pub fn initialize(
        env: Env,
        admin: Address,
        token: Address,
        tolerance: i128,
        slash_bps: i128,
        lock_seconds: u64,
    ) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, ReviewError::AlreadyInitialized);
        }
        if tolerance < 0 || slash_bps < 0 || slash_bps > 1_000 {
            panic_with_error!(&env, ReviewError::InvalidConfig);
        }

        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::Tolerance, &tolerance);
        env.storage().instance().set(&DataKey::SlashBps, &slash_bps);
        env.storage().instance().set(&DataKey::LockSeconds, &lock_seconds);
        env.storage().instance().set(&DataKey::Treasury, &0i128);
        // SC-HARD-16: protect contract instance from archival.
        bump_instance(&env);
    }

    // ── Submission lifecycle ──────────────────────────────────────────────────

    /// Open a submission and deposit its reward pool.
    ///
    /// * `submission_id` — caller-chosen unique id.
    /// * `reward_pool` — tokens paid out to accurate reviewers.
    /// * `commit_deadline` — last timestamp for commits.
    /// * `reveal_deadline` — last timestamp for reveals (must be after the
    ///   commit deadline).
    pub fn create_submission(
        env: Env,
        creator: Address,
        submission_id: u64,
        reward_pool: i128,
        commit_deadline: u64,
        reveal_deadline: u64,
    ) {
        ensure_initialized(&env);
        creator.require_auth();

        if reward_pool <= 0 {
            panic_with_error!(&env, ReviewError::InvalidAmount);
        }
        if commit_deadline <= env.ledger().timestamp() || reveal_deadline <= commit_deadline {
            panic_with_error!(&env, ReviewError::InvalidConfig);
        }
        if env
            .storage()
            .instance()
            .has(&DataKey::Submission(submission_id))
        {
            panic_with_error!(&env, ReviewError::SubmissionExists);
        }

        token::Client::new(&env, &read_token(&env))
            .transfer(&creator, &env.current_contract_address(), &reward_pool);

        let submission = Submission {
            creator: creator.clone(),
            reward_pool,
            commit_deadline,
            reveal_deadline,
            finalized: false,
            median: 0,
            accurate_count: 0,
            slashed_count: 0,
            reviewers: Vec::new(&env),
        };
        env.storage()
            .instance()
            .set(&DataKey::Submission(submission_id), &submission);

        publish_submission(
            &env,
            &creator,
            submission_id,
            reward_pool,
            commit_deadline,
            reveal_deadline,
        );
        bump_instance(&env);
    }

    // ── Staking ───────────────────────────────────────────────────────────────

    /// Deposit stake. Stake is locked for `lock_seconds` and while the
    /// reviewer has active (committed but unrevealed) reviews.
    pub fn stake(env: Env, reviewer: Address, amount: i128) {
        ensure_initialized(&env);
        reviewer.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, ReviewError::InvalidAmount);
        }

        token::Client::new(&env, &read_token(&env))
            .transfer(&reviewer, &env.current_contract_address(), &amount);

        let mut state = reviewer_state_internal(&env, &reviewer);
        state.stake += amount;
        let lock = env.ledger().timestamp() + read_lock_seconds(&env);
        state.locked_until = state.locked_until.max(lock);

        env.storage()
            .instance()
            .set(&DataKey::Reviewer(reviewer.clone()), &state);
        publish_stake(&env, &reviewer, amount, state.stake, true);
        bump_instance(&env);
    }

    // ── Commit / Reveal ───────────────────────────────────────────────────────

    /// Commit a blind review: `commitment = sha256(grade || salt)`. The
    /// grade stays hidden until the reveal phase.
    pub fn commit_review(
        env: Env,
        reviewer: Address,
        submission_id: u64,
        commitment: BytesN<32>,
    ) {
        ensure_initialized(&env);
        reviewer.require_auth();

        let submission = read_submission(&env, submission_id);
        if submission.finalized {
            panic_with_error!(&env, ReviewError::SubmissionFinalized);
        }
        if env.ledger().timestamp() > submission.commit_deadline {
            panic_with_error!(&env, ReviewError::CommitWindowClosed);
        }
        if reviewer_state_internal(&env, &reviewer).stake <= 0 {
            panic_with_error!(&env, ReviewError::NotStaked);
        }
        if env
            .storage()
            .instance()
            .has(&DataKey::Review(submission_id, reviewer.clone()))
        {
            panic_with_error!(&env, ReviewError::AlreadyCommitted);
        }

        let review = ReviewState {
            commitment: commitment.clone(),
            revealed: false,
            grade: 0,
        };
        env.storage()
            .instance()
            .set(&DataKey::Review(submission_id, reviewer.clone()), &review);

        // Track the reviewer and lock their stake until revealed.
        let mut submission = submission;
        submission.reviewers.push_back(reviewer.clone());
        env.storage()
            .instance()
            .set(&DataKey::Submission(submission_id), &submission);

        let mut state = reviewer_state_internal(&env, &reviewer);
        state.pending += 1;
        env.storage()
            .instance()
            .set(&DataKey::Reviewer(reviewer.clone()), &state);

        publish_commit(&env, &reviewer, submission_id, &commitment);
        bump_instance(&env);
    }

    /// Reveal a review. The recomputed `sha256(grade || salt)` must match
    /// the committed hash, so reviewers cannot change their grade after
    /// seeing the field.
    pub fn reveal_review(
        env: Env,
        reviewer: Address,
        submission_id: u64,
        grade: i128,
        salt: BytesN<32>,
    ) {
        ensure_initialized(&env);
        reviewer.require_auth();

        let submission = read_submission(&env, submission_id);
        if submission.finalized {
            panic_with_error!(&env, ReviewError::SubmissionFinalized);
        }
        let now = env.ledger().timestamp();
        if now <= submission.commit_deadline {
            panic_with_error!(&env, ReviewError::CommitWindowClosed);
        }
        if now > submission.reveal_deadline {
            panic_with_error!(&env, ReviewError::RevealWindowClosed);
        }

        let mut review: ReviewState = env
            .storage()
            .instance()
            .get(&DataKey::Review(submission_id, reviewer.clone()))
            .unwrap_or_else(|| panic_with_error!(&env, ReviewError::NotCommitted));
        if review.revealed {
            panic_with_error!(&env, ReviewError::AlreadyCommitted);
        }

        let digest = hash_grade_salt(&env, grade, &salt);
        if digest != review.commitment {
            panic_with_error!(&env, ReviewError::CommitmentMismatch);
        }

        review.revealed = true;
        review.grade = grade;
        env.storage()
            .instance()
            .set(&DataKey::Review(submission_id, reviewer.clone()), &review);

        let mut state = reviewer_state_internal(&env, &reviewer);
        state.pending = state.pending.saturating_sub(1);
        env.storage()
            .instance()
            .set(&DataKey::Reviewer(reviewer.clone()), &state);

        publish_reveal(&env, &reviewer, submission_id, grade);
        bump_instance(&env);
    }

    // ── Finalization ──────────────────────────────────────────────────────────

    /// Finalize a submission after the reveal deadline.
    ///
    /// Computes the median consensus grade; reviewers within `tolerance`
    /// share the reward pool; outliers are slashed into the treasury. With
    /// zero revealed reviews the pool is returned to the creator.
    pub fn finalize_submission(env: Env, caller: Address, submission_id: u64) {
        ensure_initialized(&env);
        caller.require_auth();

        let submission = read_submission(&env, submission_id);
        if submission.finalized {
            panic_with_error!(&env, ReviewError::SubmissionFinalized);
        }
        if env.ledger().timestamp() <= submission.reveal_deadline {
            panic_with_error!(&env, ReviewError::RevealWindowClosed);
        }

        // Collect revealed grades.
        let mut grades = Vec::new(&env);
        let mut revealed: Vec<Address> = Vec::new(&env);
        for reviewer in submission.reviewers.iter() {
            let review: ReviewState = env
                .storage()
                .instance()
                .get(&DataKey::Review(submission_id, reviewer.clone()))
                .unwrap_or_else(|| panic_with_error!(&env, ReviewError::NotCommitted));
            if review.revealed {
                grades.push_back(review.grade);
                revealed.push_back(reviewer.clone());
            }
        }

        let mut submission = submission;

        if grades.len() == 0 {
            // No reviews: return the pool to the creator.
            token::Client::new(&env, &read_token(&env)).transfer(
                &env.current_contract_address(),
                &submission.creator,
                &submission.reward_pool,
            );
            submission.finalized = true;
            env.storage()
                .instance()
                .set(&DataKey::Submission(submission_id), &submission);
            bump_instance(&env);
            return;
        }

        let median = median_of(&grades);
        let tolerance = read_tolerance(&env);
        let slash_bps = read_slash_bps(&env);
        let token = read_token(&env);
        let token_client = token::Client::new(&env, &token);

        // First pass: count accurate reviewers.
        let mut accurate_count: u32 = 0;
        let mut idx = 0u32;
        while idx < revealed.len() {
            let grade = grades.get(idx).unwrap();
            if (grade - median).abs() <= tolerance {
                accurate_count += 1;
            }
            idx += 1;
        }

        // Second pass: distribute rewards / apply slashes.
        let mut slashed_count: u32 = 0;
        let mut reward = 0i128;
        if accurate_count > 0 {
            reward = submission.reward_pool / accurate_count as i128;
        }
        let mut treasury = read_treasury_internal(&env);

        idx = 0;
        while idx < revealed.len() {
            let reviewer = revealed.get(idx).unwrap();
            let grade = grades.get(idx).unwrap();
            if (grade - median).abs() <= tolerance {
                if reward > 0 {
                    token_client.transfer(
                        &env.current_contract_address(),
                        &reviewer,
                        &reward,
                    );
                }
            } else {
                // Outlier: slash a share of their stake into the treasury.
                let mut state = reviewer_state_internal(&env, &reviewer);
                let slash = state.stake * slash_bps / 10_000;
                if slash > 0 {
                    state.stake -= slash;
                    state.slashed_total += slash;
                    env.storage()
                        .instance()
                        .set(&DataKey::Reviewer(reviewer.clone()), &state);
                    treasury += slash;
                    publish_slash(&env, &reviewer, submission_id, slash);
                }
                slashed_count += 1;
            }
            idx += 1;
        }

        // Leftover reward rounding goes to the treasury.
        treasury += submission.reward_pool - reward * accurate_count as i128;
        env.storage()
            .instance()
            .set(&DataKey::Treasury, &treasury);

        submission.finalized = true;
        submission.median = median;
        submission.accurate_count = accurate_count;
        submission.slashed_count = slashed_count;
        env.storage()
            .instance()
            .set(&DataKey::Submission(submission_id), &submission);

        publish_review_done(&env, submission_id, median, accurate_count, slashed_count);
        bump_instance(&env);
    }

    // ── Stake management ──────────────────────────────────────────────────────

    /// Withdraw stake once it is unlocked and no reviews are in flight.
    pub fn withdraw_stake(env: Env, reviewer: Address, amount: i128) {
        ensure_initialized(&env);
        reviewer.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, ReviewError::InvalidAmount);
        }
        let mut state = reviewer_state_internal(&env, &reviewer);
        if state.pending > 0 {
            panic_with_error!(&env, ReviewError::StakeLocked);
        }
        if env.ledger().timestamp() < state.locked_until {
            panic_with_error!(&env, ReviewError::StakeLocked);
        }
        if state.stake < amount {
            panic_with_error!(&env, ReviewError::InvalidAmount);
        }

        state.stake -= amount;
        env.storage()
            .instance()
            .set(&DataKey::Reviewer(reviewer.clone()), &state);
        token::Client::new(&env, &read_token(&env))
            .transfer(&env.current_contract_address(), &reviewer, &amount);
        publish_stake(&env, &reviewer, amount, state.stake, false);
        bump_instance(&env);
    }

    /// Admin withdraws from the community treasury (slashed stakes).
    pub fn withdraw_treasury(env: Env, admin: Address, to: Address, amount: i128) {
        ensure_initialized(&env);
        admin.require_auth();
        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, ReviewError::NotInitialized));
        if admin != stored_admin {
            panic_with_error!(&env, ReviewError::Unauthorized);
        }
        if amount <= 0 {
            panic_with_error!(&env, ReviewError::InvalidAmount);
        }
        let treasury = read_treasury_internal(&env);
        if treasury < amount {
            panic_with_error!(&env, ReviewError::InvalidAmount);
        }
        env.storage()
            .instance()
            .set(&DataKey::Treasury, &(treasury - amount));
        token::Client::new(&env, &read_token(&env))
            .transfer(&env.current_contract_address(), &to, &amount);
        bump_instance(&env);
    }

    // ── View helpers ──────────────────────────────────────────────────────────

    pub fn reviewer_state(env: Env, reviewer: Address) -> ReviewerState {
        reviewer_state_internal(&env, &reviewer)
    }

    pub fn submission(env: Env, submission_id: u64) -> Submission {
        read_submission(&env, submission_id)
    }

    pub fn review(env: Env, submission_id: u64, reviewer: Address) -> Option<ReviewState> {
        env.storage()
            .instance()
            .get(&DataKey::Review(submission_id, reviewer))
    }

    pub fn treasury(env: Env) -> i128 {
        read_treasury_internal(&env)
    }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/// Bump instance TTL every state-mutating call (SC-HARD-16).
pub(crate) fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD, INSTANCE_BUMP);
}

/// `sha256(grade_be_bytes || salt)` as a `BytesN<32>`.
pub(crate) fn hash_grade_salt(env: &Env, grade: i128, salt: &BytesN<32>) -> BytesN<32> {
    let mut buf = Bytes::new(env);
    buf.extend_from_array(&grade.to_be_bytes());
    buf.extend_from_array(&salt.to_array());
    env.crypto().sha256(&buf).into()
}

/// Median of a (possibly unsorted) grade vector, using insertion sort on a
/// copy so the caller's vector stays aligned with its reviewer list.
pub(crate) fn median_of(grades: &Vec<i128>) -> i128 {
    let n = grades.len();
    if n == 0 {
        return 0;
    }
    // Insertion sort on a copy.
    let mut sorted = grades.clone();
    let mut i = 1u32;
    while i < n {
        let key = sorted.get(i).unwrap();
        let mut j = i;
        while j > 0 {
            let prev = sorted.get(j - 1).unwrap();
            if prev <= key {
                break;
            }
            sorted.set(j, prev);
            j -= 1;
        }
        sorted.set(j, key);
        i += 1;
    }
    if n % 2 == 1 {
        sorted.get(n / 2).unwrap()
    } else {
        // Even count: average the two middle values (rounds down).
        (sorted.get(n / 2 - 1).unwrap() + sorted.get(n / 2).unwrap()) / 2
    }
}

fn ensure_initialized(env: &Env) {
    if !env.storage().instance().has(&DataKey::Admin) {
        panic_with_error!(env, ReviewError::NotInitialized);
    }
}

fn read_token(env: &Env) -> Address {
    env.storage()
        .instance()
        .get::<_, Address>(&DataKey::Token)
        .unwrap_or_else(|| panic_with_error!(env, ReviewError::NotInitialized))
}

fn read_tolerance(env: &Env) -> i128 {
    env.storage()
        .instance()
        .get::<_, i128>(&DataKey::Tolerance)
        .unwrap_or(0)
}

fn read_slash_bps(env: &Env) -> i128 {
    env.storage()
        .instance()
        .get::<_, i128>(&DataKey::SlashBps)
        .unwrap_or(0)
}

fn read_lock_seconds(env: &Env) -> u64 {
    env.storage()
        .instance()
        .get::<_, u64>(&DataKey::LockSeconds)
        .unwrap_or(0)
}

fn read_treasury_internal(env: &Env) -> i128 {
    env.storage()
        .instance()
        .get(&DataKey::Treasury)
        .unwrap_or(0)
}

fn read_submission(env: &Env, submission_id: u64) -> Submission {
    env.storage()
        .instance()
        .get(&DataKey::Submission(submission_id))
        .unwrap_or_else(|| panic_with_error!(env, ReviewError::SubmissionMissing))
}

fn reviewer_state_internal(env: &Env, reviewer: &Address) -> ReviewerState {
    env.storage()
        .instance()
        .get(&DataKey::Reviewer(reviewer.clone()))
        .unwrap_or(ReviewerState {
            stake: 0,
            locked_until: 0,
            pending: 0,
            slashed_total: 0,
        })
}

// ── Tests (in separate file per issue requirements) ───────────────────────────

#[cfg(test)]
mod tests;

#[cfg(test)]
mod proptests;
