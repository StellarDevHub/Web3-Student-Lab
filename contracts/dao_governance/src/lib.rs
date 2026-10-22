//! # DAO Governance Module with Quadratic Voting, Quorum and Timelock
//!
//! Closes issues #717 and #1625.
//!
//! A Soroban-native DAO where any voice-credit holder can:
//!  - create proposals (creator must hold at least the proposal threshold),
//!  - cast votes whose *cost* scales quadratically (cost = votes^2),
//!  - finalize proposals once the voting period ends,
//!  - execute passed proposals once the 48-hour timelock has elapsed.
//!
//! ## Parameters
//! - Default voting period: 7 days (`DEFAULT_VOTING_PERIOD`). Custom periods
//!   (set by admin, or passed as `duration` to `create_proposal`) must lie in
//!   `[MIN_VOTING_PERIOD, MAX_VOTING_PERIOD]` = [1 day, 30 days].
//! - Quorum: a proposal passes only if the voice credits spent on it
//!   (`credits_spent`, i.e. participating voting power) reach
//!   `QUORUM_BPS` (20%) of the circulating governance supply, where supply is
//!   the running total of all credits ever granted (`TotalGranted`).
//!   The quorum is fixed at proposal creation.
//! - Timelock: finalize queues a passed proposal with `eta = now + 172800`
//!   (48 hours). `execute` fails until `now >= eta`.
//!
//! ## Flash-loan protection (creation-time snapshot)
//! Every grant is stamped with a monotonically increasing sequence number and
//! appended to the member's grant log. Each proposal records the sequence
//! number at creation (`created_seq`). When a member votes, credits granted
//! with a sequence number greater than `created_seq` are NOT spendable on that
//! proposal: spendable = current balance - (sum of grants after creation).
//! Voting power therefore cannot increase because of grants made after the
//! proposal was created. This is conservative: if a post-creation grant was
//! already spent on another proposal, it is still subtracted here.
//!
//! ## Quadratic voting mechanics
//! Casting `v` votes on a proposal costs `v^2` credits, forcing voters to spread
//! influence across multiple proposals rather than concentrating on one.

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, panic_with_error, symbol_short, Address, Env, String,
    Vec,
};

// ── Constants ─────────────────────────────────────────────────────────────────

/// Default voting period: 7 days.
pub const DEFAULT_VOTING_PERIOD: u64 = 604_800;
/// Minimum allowed voting period: 1 day.
pub const MIN_VOTING_PERIOD: u64 = 86_400;
/// Maximum allowed voting period: 30 days.
pub const MAX_VOTING_PERIOD: u64 = 2_592_000;
/// Mandatory timelock between finalize (queue) and execute: 48 hours.
pub const TIMELOCK_DELAY: u64 = 172_800;
/// Quorum as basis points of circulating supply: 20%.
pub const QUORUM_BPS: u128 = 2_000;
/// Basis-point denominator.
pub const BPS_DENOMINATOR: u128 = 10_000;

// ── Types ─────────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProposalStatus {
    Active,
    /// Passed and queued in the timelock (`eta` set); executable once `now >= eta`.
    Passed,
    Failed,
    Executed,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Proposal {
    pub id: u64,
    pub creator: Address,
    pub title: String,
    pub description: String,
    pub deadline: u64,
    pub status: ProposalStatus,
    /// Net vote tally (positive = support, negative = against).
    pub tally: i128,
    /// Total voice-credits spent across all voters on this proposal
    /// (participating voting power used for quorum).
    pub credits_spent: u128,
    /// Grant sequence number at creation. Later grants are not spendable here.
    pub created_seq: u64,
    /// Quorum in voice credits, fixed at creation (QUORUM_BPS of supply).
    pub quorum_required: u128,
    /// Timelock ETA (ledger timestamp) set when passed; 0 while not queued.
    pub eta: u64,
}

/// One credit grant, stamped with its global sequence number.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GrantEntry {
    pub seq: u64,
    pub amount: u128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
struct StoredProposal {
    creator: Address,
    title: String,
    description: String,
    deadline: u64,
    status: u32,
    tally: i128,
    credits_spent: u128,
}

impl StoredProposal {
    fn from_proposal(proposal: &Proposal) -> Self {
        Self {
            creator: proposal.creator.clone(),
            title: proposal.title.clone(),
            description: proposal.description.clone(),
            deadline: proposal.deadline,
            status: match proposal.status {
                ProposalStatus::Active => 0,
                ProposalStatus::Passed => 1,
                ProposalStatus::Failed => 2,
                ProposalStatus::Executed => 3,
            },
            tally: proposal.tally,
            credits_spent: proposal.credits_spent,
        }
    }

    fn into_proposal(self, id: u64) -> Proposal {
        Proposal {
            id,
            creator: self.creator,
            title: self.title,
            description: self.description,
            deadline: self.deadline,
            status: match self.status {
                0 => ProposalStatus::Active,
                1 => ProposalStatus::Passed,
                2 => ProposalStatus::Failed,
                _ => panic!("invalid compact proposal status"),
            },
            tally: self.tally,
            credits_spent: self.credits_spent,
        }
    }
}

#[contracttype]
#[derive(Clone)]
pub enum Key {
    Admin,
    NextId,
    Credits(Address),
    Proposal(u64),
    CompactProposal(u64),
    Vote(u64, Address),
    UsedNonce(Address, u64),
    /// Running total of all credits granted (circulating supply).
    TotalGranted,
    /// Global grant/proposal sequence counter.
    Seq,
    /// Per-member list of grants with sequence numbers.
    GrantLog(Address),
    /// Admin-configured default voting period (seconds).
    VotingPeriod,
    /// Minimum credits a proposal creator must hold.
    ProposalThreshold,
}

pub mod errors;
pub mod ragequit;
pub mod treasury;

pub use errors::DaoError;
use ragequit::Ragequit;
use treasury::{Treasury, TreasuryState};


// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct DaoGovernance;

#[contractimpl]
impl DaoGovernance {
    /// Initialise the DAO.  Must be called exactly once.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&Key::Admin) {
            panic_with_error!(&env, DaoError::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&Key::Admin, &admin);
        env.storage().instance().set(&Key::NextId, &0u64);
    }

    /// Grant `credits` voice-credits to `member`.  Admin only.
    /// Updates the circulating supply and the member's grant log.
    pub fn grant_credits(env: Env, member: Address, credits: u128) {
        Self::only_admin(&env);
        let key = Key::Credits(member.clone());
        let prev: u128 = env.storage().persistent().get(&key).unwrap_or(0);
        env.storage()
            .persistent()
            .set(&key, &prev.saturating_add(credits));

        let total = read_total_granted(&env).saturating_add(credits);
        env.storage().instance().set(&Key::TotalGranted, &total);

        let seq = next_seq(&env);
        let log_key = Key::GrantLog(member.clone());
        let mut log = env
            .storage()
            .persistent()
            .get::<Key, Vec<GrantEntry>>(&log_key)
            .unwrap_or_else(|| Vec::new(&env));
        log.push_back(GrantEntry {
            seq,
            amount: credits,
        });
        env.storage().persistent().set(&log_key, &log);

        env.events()
            .publish((symbol_short!("credits"),), (member, credits));
    }

    /// Create a new proposal.  Returns the proposal ID.
    ///
    /// * `duration` - voting window in seconds. `0` selects the configured
    ///   default voting period (7 days unless changed by admin). Any non-zero
    ///   value must be within [1 day, 30 days], otherwise `InvalidVotingPeriod`.
    /// * The creator must hold at least the proposal threshold (default 0).
    pub fn create_proposal(
        env: Env,
        creator: Address,
        title: String,
        description: String,
        duration: u64,
    ) -> u64 {
        creator.require_auth();

        let period = if duration == 0 {
            read_voting_period(&env)
        } else {
            check_voting_period(&env, duration);
            duration
        };

        if credits_balance(&env, &creator) < read_proposal_threshold(&env) {
            panic_with_error!(&env, DaoError::BelowProposalThreshold);
        }

        let id: u64 = env.storage().instance().get(&Key::NextId).unwrap_or(0);
        env.storage().instance().set(&Key::NextId, &(id + 1));

        let quorum_required =
            read_total_granted(&env).saturating_mul(QUORUM_BPS) / BPS_DENOMINATOR;

        let proposal = Proposal {
            id,
            creator: creator.clone(),
            title,
            description,
            deadline: env.ledger().timestamp().saturating_add(period),
            status: ProposalStatus::Active,
            tally: 0,
            credits_spent: 0,
            created_seq: next_seq(&env),
            quorum_required,
            eta: 0,
        };
        Self::store_proposal(&env, &proposal);
        env.events()
            .publish((symbol_short!("propose"),), (creator, id));
        id
    }

    /// Cast `votes` on proposal `id`.
    ///
    /// * Positive = support, negative = against.
    /// * Cost = votes^2 credits (quadratic scaling).
    /// * Each address may vote at most once per proposal.
    /// * Only credits not granted after the proposal was created are spendable.
    pub fn vote(env: Env, voter: Address, proposal_id: u64, votes: i64) {
        voter.require_auth();
        Self::internal_vote(&env, voter, proposal_id, votes);
    }

    /// Cast votes with SEP-0010 Web Auth nonce tracking to prevent replay across web clients.
    pub fn vote_sep0010(
        env: Env,
        voter: Address,
        proposal_id: u64,
        votes: i64,
        nonce: u64,
        _home_domain: String,
    ) {
        voter.require_auth();
        let nonce_key = Key::UsedNonce(voter.clone(), nonce);
        if env.storage().persistent().has(&nonce_key) {
            panic_with_error!(&env, DaoError::AlreadyVoted);
        }
        env.storage().persistent().set(&nonce_key, &true);
        Self::internal_vote(&env, voter, proposal_id, votes);
    }

    fn internal_vote(env: &Env, voter: Address, proposal_id: u64, votes: i64) {
        if votes == 0 {
            panic_with_error!(env, DaoError::ZeroVotes);
        }

        let mut proposal = load_proposal(env, proposal_id)
            .unwrap_or_else(|| panic_with_error!(env, DaoError::ProposalNotFound));

        if proposal.status != ProposalStatus::Active || env.ledger().timestamp() > proposal.deadline
        {
            panic_with_error!(env, DaoError::ProposalClosed);
        }

        let vote_key = Key::Vote(proposal_id, voter.clone());
        if env.storage().persistent().has(&vote_key) {
            panic_with_error!(env, DaoError::AlreadyVoted);
        }

        // Quadratic cost: cost = |votes|^2
        let abs_v = votes.unsigned_abs() as u128;
        let cost: u128 = abs_v.saturating_mul(abs_v);

        let spendable = eligible_credits(env, &voter, proposal.created_seq);
        if spendable < cost {
            panic_with_error!(env, DaoError::InsufficientCredits);
        }
        let credits_key = Key::Credits(voter.clone());
        let bal = credits_balance(env, &voter);
        env.storage()
            .persistent()
            .set(&credits_key, &bal.saturating_sub(cost));

        proposal.tally += votes as i128;
        proposal.credits_spent = proposal.credits_spent.saturating_add(cost);
        Self::store_proposal(env, &proposal);
        env.storage().persistent().set(&vote_key, &votes);

        env.events()
            .publish((symbol_short!("vote"),), (voter, proposal_id, votes, cost));
    }

    /// Finalize a proposal after its deadline.  Anyone may call this.
    ///
    /// The proposal passes only if `credits_spent >= quorum_required` AND
    /// `tally > 0`. A passing proposal is queued: status `Passed` with
    /// `eta = now + TIMELOCK_DELAY`. Otherwise it is marked `Failed`
    /// (including quorum failure); no panic is raised for that outcome.
    pub fn finalize(env: Env, proposal_id: u64) {
        let mut proposal = load_proposal(&env, proposal_id)
            .unwrap_or_else(|| panic_with_error!(&env, DaoError::ProposalNotFound));

        if proposal.status != ProposalStatus::Active {
            panic_with_error!(&env, DaoError::ProposalClosed);
        }
        let now = env.ledger().timestamp();
        if now <= proposal.deadline {
            panic_with_error!(&env, DaoError::VotingDeadlineLive);
        }

        if proposal.credits_spent >= proposal.quorum_required && proposal.tally > 0 {
            proposal.status = ProposalStatus::Passed;
            proposal.eta = now.saturating_add(TIMELOCK_DELAY);
            proposal.status = ProposalStatus::Failed;
        }
        Self::store_proposal(&env, &proposal);
        env.events()
            .publish((symbol_short!("finalize"),), (proposal_id, proposal.tally));
    }

    /// Mark a queued (passed) proposal as executed.  Admin only.
    ///
    /// Fails with `ProposalClosed` unless the status is `Passed`, and with
    /// `TimelockNotElapsed` until `now >= eta` (48 hours after finalize).
    pub fn execute(env: Env, caller: Address, proposal_id: u64) {
        Self::only_admin(&env);
        caller.require_auth();

        let mut proposal = load_proposal(&env, proposal_id)
            .unwrap_or_else(|| panic_with_error!(&env, DaoError::ProposalNotFound));

        if proposal.status != ProposalStatus::Passed {
            panic_with_error!(&env, DaoError::ProposalClosed);
        }
        if env.ledger().timestamp() < proposal.eta {
            panic_with_error!(&env, DaoError::TimelockNotElapsed);
        }
        proposal.status = ProposalStatus::Executed;
        Self::store_proposal(&env, &proposal);
        env.events()
            .publish((symbol_short!("execute"),), (caller, proposal_id));
    }

    // ── Configuration (admin) ─────────────────────────────────────────────────

    /// Set the default voting period. Must be within [1 day, 30 days]. Admin only.
    pub fn set_voting_period(env: Env, period: u64) {
        Self::only_admin(&env);
        check_voting_period(&env, period);
        env.storage().instance().set(&Key::VotingPeriod, &period);
        env.events()
            .publish((symbol_short!("vp_set"),), period);
    }

    /// Set the minimum credits a proposal creator must hold. Admin only.
    pub fn set_proposal_threshold(env: Env, min_credits: u128) {
        Self::only_admin(&env);
        env.storage()
            .instance()
            .set(&Key::ProposalThreshold, &min_credits);
        env.events()
            .publish((symbol_short!("thr_set"),), min_credits);
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    pub fn get_proposal(env: Env, id: u64) -> Option<Proposal> {
        load_proposal(&env, id)
    }

    pub fn credits_of(env: Env, member: Address) -> u128 {
        credits_balance(&env, &member)
    }

    pub fn vote_of(env: Env, proposal_id: u64, voter: Address) -> Option<i64> {
        env.storage()
            .persistent()
            .get(&Key::Vote(proposal_id, voter))
    }

    /// Circulating governance supply: total credits ever granted.
    pub fn total_granted(env: Env) -> u128 {
        read_total_granted(&env)
    }

    pub fn get_voting_period(env: Env) -> u64 {
        read_voting_period(&env)
    }

    pub fn get_proposal_threshold(env: Env) -> u128 {
        read_proposal_threshold(&env)
    }

    // ── Treasury & Ragequit (SC-042) ──────────────────────────────────────────

    pub fn deposit_treasury(env: Env, caller: Address, amount: u128) {
        caller.require_auth();
        Treasury::deposit_reserves(&env, amount);
        env.events()
            .publish((symbol_short!("tres_dep"),), (caller, amount));
    }

    pub fn grant_shares(env: Env, member: Address, shares: u128) {
        Self::only_admin(&env);
        let current = Treasury::get_shares(&env, &member);
        Treasury::set_shares(&env, &member, current.saturating_add(shares));
        env.events()
            .publish((symbol_short!("sh_grant"),), (member, shares));
    }

    pub fn treasury_shares_of(env: Env, member: Address) -> u128 {
        Treasury::get_shares(&env, &member)
    }

    pub fn get_treasury_state(env: Env) -> TreasuryState {
        Treasury::get_state(&env)
    }

    pub fn ragequit(env: Env, voter: Address, proposal_id: u64, shares_to_burn: u128) -> u128 {
        let payout = Ragequit::execute_ragequit(&env, voter.clone(), proposal_id, shares_to_burn);
        env.events().publish(
            (symbol_short!("ragequit"),),
            (voter, proposal_id, shares_to_burn, payout),
        );
        payout
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    fn only_admin(env: &Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&Key::Admin)
            .unwrap_or_else(|| panic_with_error!(env, DaoError::NotInitialized));
        admin.require_auth();
    }

    fn store_proposal(env: &Env, proposal: &Proposal) {
        env.storage().persistent().set(
            &Key::CompactProposal(proposal.id),
            &StoredProposal::from_proposal(proposal),
        );
        env.storage()
            .persistent()
            .remove(&Key::Proposal(proposal.id));
    }
}

pub(crate) fn load_proposal(env: &Env, id: u64) -> Option<Proposal> {
    if let Some(proposal) = env
        .storage()
        .persistent()
        .get::<Key, StoredProposal>(&Key::CompactProposal(id))
    {
        return Some(proposal.into_proposal(id));
    }
    env.storage().persistent().get(&Key::Proposal(id))
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Advance and return the global grant/proposal sequence counter.
fn next_seq(env: &Env) -> u64 {
    let seq: u64 = env.storage().instance().get(&Key::Seq).unwrap_or(0) + 1;
    env.storage().instance().set(&Key::Seq, &seq);
    seq
}

fn read_total_granted(env: &Env) -> u128 {
    env.storage()
        .instance()
        .get(&Key::TotalGranted)
        .unwrap_or(0)
}

fn read_voting_period(env: &Env) -> u64 {
    env.storage()
        .instance()
        .get(&Key::VotingPeriod)
        .unwrap_or(DEFAULT_VOTING_PERIOD)
}

fn read_proposal_threshold(env: &Env) -> u128 {
    env.storage()
        .instance()
        .get(&Key::ProposalThreshold)
        .unwrap_or(0)
}

fn check_voting_period(env: &Env, period: u64) {
    if period < MIN_VOTING_PERIOD || period > MAX_VOTING_PERIOD {
        panic_with_error!(env, DaoError::InvalidVotingPeriod);
    }
}

fn credits_balance(env: &Env, member: &Address) -> u128 {
    env.storage()
        .persistent()
        .get::<Key, u128>(&Key::Credits(member.clone()))
        .unwrap_or(0)
}

/// Credits `voter` may spend on a proposal created at `created_seq`:
/// current balance minus every grant received after that proposal was created.
fn eligible_credits(env: &Env, voter: &Address, created_seq: u64) -> u128 {
    let balance = credits_balance(env, voter);
    let log = env
        .storage()
        .persistent()
        .get::<Key, Vec<GrantEntry>>(&Key::GrantLog(voter.clone()))
        .unwrap_or_else(|| Vec::new(env));
    let mut late: u128 = 0;
    for entry in log.iter() {
        if entry.seq > created_seq {
            late = late.saturating_add(entry.amount);
        }
    }
    balance.saturating_sub(late)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod test;
