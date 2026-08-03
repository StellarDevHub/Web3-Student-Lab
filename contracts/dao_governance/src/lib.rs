//! # DAO Governance Module with Quadratic Voting
//!
//! Closes issue #717.
//!
//! A Soroban-native DAO where any token holder can:
//!  - create proposals with a configurable voting window,
//!  - cast votes whose *cost* scales quadratically (cost = votes²),
//!    so large stakeholders cannot dominate by raw token weight,
//!  - finalize proposals once the deadline passes,
//!  - execute passed proposals (hook for downstream actions).
//!
//! ## Quadratic voting mechanics
//! Each voter is allocated `voice_credits` upon joining.  Casting `v` votes
//! on a proposal costs `v²` credits, forcing voters to spread influence
//! across multiple proposals rather than concentrating on one.

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, Address,
    Env, String,
};

// ── Types ─────────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProposalStatus {
    Active,
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
    /// Total voice-credits spent across all voters on this proposal.
    pub credits_spent: u128,
}

#[contracttype]
#[derive(Clone)]
pub enum Key {
    Admin,
    NextId,
    Credits(Address),
    Proposal(u64),
    Vote(u64, Address),
}

// ── Errors ────────────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum DaoError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    ProposalNotFound = 4,
    ProposalClosed = 5,
    VotingDeadlineLive = 6,
    AlreadyVoted = 7,
    InsufficientCredits = 8,
    ZeroVotes = 9,
    InvalidDeadline = 10,
}

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
    pub fn grant_credits(env: Env, member: Address, credits: u128) {
        Self::only_admin(&env);
        let key = Key::Credits(member.clone());
        let prev: u128 = env.storage().persistent().get(&key).unwrap_or(0);
        env.storage().persistent().set(&key, &(prev + credits));
        env.events()
            .publish((symbol_short!("credits"),), (member, credits));
    }

    /// Create a new proposal.  Returns the proposal ID.
    ///
    /// * `duration` – voting window in seconds.
    pub fn create_proposal(
        env: Env,
        creator: Address,
        title: String,
        description: String,
        duration: u64,
    ) -> u64 {
        creator.require_auth();
        if duration == 0 {
            panic_with_error!(&env, DaoError::InvalidDeadline);
        }
        let id: u64 = env.storage().instance().get(&Key::NextId).unwrap_or(0);
        env.storage().instance().set(&Key::NextId, &(id + 1));

        let proposal = Proposal {
            id,
            creator: creator.clone(),
            title,
            description,
            deadline: env.ledger().timestamp() + duration,
            status: ProposalStatus::Active,
            tally: 0,
            credits_spent: 0,
        };
        env.storage()
            .persistent()
            .set(&Key::Proposal(id), &proposal);
        env.events()
            .publish((symbol_short!("propose"),), (creator, id));
        id
    }

    /// Cast `votes` on proposal `id`.
    ///
    /// * Positive = support, negative = against.
    /// * Cost = votes² credits (quadratic scaling).
    /// * Each address may vote at most once per proposal.
    pub fn vote(env: Env, voter: Address, proposal_id: u64, votes: i64) {
        voter.require_auth();
        if votes == 0 {
            panic_with_error!(&env, DaoError::ZeroVotes);
        }

        let mut proposal: Proposal = env
            .storage()
            .persistent()
            .get(&Key::Proposal(proposal_id))
            .unwrap_or_else(|| panic_with_error!(&env, DaoError::ProposalNotFound));

        if proposal.status != ProposalStatus::Active || env.ledger().timestamp() > proposal.deadline
        {
            panic_with_error!(&env, DaoError::ProposalClosed);
        }

        let vote_key = Key::Vote(proposal_id, voter.clone());
        if env.storage().persistent().has(&vote_key) {
            panic_with_error!(&env, DaoError::AlreadyVoted);
        }

        // Quadratic cost: cost = |votes|²
        let abs_v = votes.unsigned_abs() as u128;
        let cost: u128 = abs_v.saturating_mul(abs_v);

        let credits_key = Key::Credits(voter.clone());
        let bal: u128 = env.storage().persistent().get(&credits_key).unwrap_or(0);
        if bal < cost {
            panic_with_error!(&env, DaoError::InsufficientCredits);
        }
        env.storage().persistent().set(&credits_key, &(bal - cost));

        proposal.tally += votes as i128;
        proposal.credits_spent = proposal.credits_spent.saturating_add(cost);
        env.storage()
            .persistent()
            .set(&Key::Proposal(proposal_id), &proposal);
        env.storage().persistent().set(&vote_key, &votes);

        env.events()
            .publish((symbol_short!("vote"),), (voter, proposal_id, votes, cost));
    }

    /// Finalize a proposal after its deadline.  Anyone may call this.
    pub fn finalize(env: Env, proposal_id: u64) {
        let mut proposal: Proposal = env
            .storage()
            .persistent()
            .get(&Key::Proposal(proposal_id))
            .unwrap_or_else(|| panic_with_error!(&env, DaoError::ProposalNotFound));

        if proposal.status != ProposalStatus::Active {
            panic_with_error!(&env, DaoError::ProposalClosed);
        }
        if env.ledger().timestamp() <= proposal.deadline {
            panic_with_error!(&env, DaoError::VotingDeadlineLive);
        }

        proposal.status = if proposal.tally > 0 {
            ProposalStatus::Passed
        } else {
            ProposalStatus::Failed
        };
        env.storage()
            .persistent()
            .set(&Key::Proposal(proposal_id), &proposal);
        env.events()
            .publish((symbol_short!("finalize"),), (proposal_id, proposal.tally));
    }

    /// Mark a passed proposal as executed.  Admin only.
    pub fn execute(env: Env, caller: Address, proposal_id: u64) {
        Self::only_admin(&env);
        caller.require_auth();

        let mut proposal: Proposal = env
            .storage()
            .persistent()
            .get(&Key::Proposal(proposal_id))
            .unwrap_or_else(|| panic_with_error!(&env, DaoError::ProposalNotFound));

        if proposal.status != ProposalStatus::Passed {
            panic_with_error!(&env, DaoError::ProposalClosed);
        }
        proposal.status = ProposalStatus::Executed;
        env.storage()
            .persistent()
            .set(&Key::Proposal(proposal_id), &proposal);
        env.events()
            .publish((symbol_short!("execute"),), (caller, proposal_id));
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    pub fn get_proposal(env: Env, id: u64) -> Option<Proposal> {
        env.storage().persistent().get(&Key::Proposal(id))
    }

    pub fn credits_of(env: Env, member: Address) -> u128 {
        env.storage()
            .persistent()
            .get(&Key::Credits(member))
            .unwrap_or(0)
    }

    pub fn vote_of(env: Env, proposal_id: u64, voter: Address) -> Option<i64> {
        env.storage()
            .persistent()
            .get(&Key::Vote(proposal_id, voter))
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
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger as _},
        Env, String,
    };

    fn setup() -> (Env, DaoGovernanceClient<'static>, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let id = env.register(DaoGovernance, ());
        let client = DaoGovernanceClient::new(&env, &id);
        let admin = Address::generate(&env);
        client.initialize(&admin);
        (env, client, admin)
    }

    #[test]
    fn quadratic_cost_deducted_correctly() {
        let (env, client, admin) = setup();
        let voter = Address::generate(&env);
        client.grant_credits(&voter, &100u128);

        let pid = client.create_proposal(
            &admin,
            &String::from_str(&env, "Test"),
            &String::from_str(&env, "Desc"),
            &3600,
        );

        // 3 votes → cost = 9
        client.vote(&voter, &pid, &3i64);
        assert_eq!(client.credits_of(&voter), 91);

        let p = client.get_proposal(&pid).unwrap();
        assert_eq!(p.tally, 3);
        assert_eq!(p.credits_spent, 9);
    }

    #[test]
    fn proposal_passes_when_tally_positive() {
        let (env, client, admin) = setup();
        let voter = Address::generate(&env);
        client.grant_credits(&voter, &1_000u128);

        let pid = client.create_proposal(
            &admin,
            &String::from_str(&env, "Upgrade"),
            &String::from_str(&env, "Details"),
            &100,
        );
        client.vote(&voter, &pid, &5i64);

        env.ledger().with_mut(|l| l.timestamp += 200);
        client.finalize(&pid);

        assert_eq!(
            client.get_proposal(&pid).unwrap().status,
            ProposalStatus::Passed
        );
    }

    #[test]
    fn proposal_fails_when_tally_non_positive() {
        let (env, client, admin) = setup();
        let voter = Address::generate(&env);
        client.grant_credits(&voter, &1_000u128);

        let pid = client.create_proposal(
            &admin,
            &String::from_str(&env, "Bad idea"),
            &String::from_str(&env, "No"),
            &100,
        );
        client.vote(&voter, &pid, &-4i64);

        env.ledger().with_mut(|l| l.timestamp += 200);
        client.finalize(&pid);

        assert_eq!(
            client.get_proposal(&pid).unwrap().status,
            ProposalStatus::Failed
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #7)")]
    fn cannot_vote_twice() {
        let (env, client, admin) = setup();
        let voter = Address::generate(&env);
        client.grant_credits(&voter, &1_000u128);

        let pid = client.create_proposal(
            &admin,
            &String::from_str(&env, "D"),
            &String::from_str(&env, "D"),
            &3600,
        );
        client.vote(&voter, &pid, &1i64);
        client.vote(&voter, &pid, &1i64); // panic
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #8)")]
    fn insufficient_credits_rejected() {
        let (env, client, admin) = setup();
        let voter = Address::generate(&env);
        client.grant_credits(&voter, &3u128); // only 3 credits

        let pid = client.create_proposal(
            &admin,
            &String::from_str(&env, "Big"),
            &String::from_str(&env, "Big"),
            &3600,
        );
        client.vote(&voter, &pid, &5i64); // cost = 25 > 3 → panic
    }
}
