//! On-Chain Governance & Voting Proposal System – Issue #500
//!
//! Core governance contract for the Student DAO:
//! - **Proposal lifecycle**: create → vote → finalize → execute.
//! - **Quadratic voting**: vote weight = `isqrt(credits_spent)`, preventing
//!   token-whale dominance while still rewarding conviction.
//! - **Snapshot tracking**: records the ledger timestamp at proposal creation
//!   so off-chain tooling can reconstruct vote-weight eligibility windows.
//! - **Executor module**: dispatches a structured [`ExecutableAction`] when a
//!   proposal passes, enabling autonomous on-chain execution.
//! - **Reentrancy guard** and **safe arithmetic** throughout.
//!
//! ## Voting model
//! Users submit `credits_to_spend` (any positive amount). The contract computes:
//! ```text
//! vote_weight = isqrt(credits_to_spend)
//! ```
//! Credits are burned (decremented from the voter's governance balance) on first
//! vote. A voter may only vote once per proposal.
//!
//! ## Proposal execution
//! After the voting deadline the admin (or any caller) calls `finalize_proposal`.
//! If `for_votes > against_votes` the proposal is `Passed`; otherwise `Failed`.
//! A `Passed` proposal can then be executed via `execute_proposal` which
//! dispatches the [`ExecutableAction`] stored at creation time.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, token,
    Address, Bytes, Env, String,
};

use crate::security_primitives::{isqrt, nonreentrant_acquire, nonreentrant_release, safe_add};

// ---------------------------------------------------------------------------
// Proposal status
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProposalStatus {
    Active,
    Passed,
    Failed,
    Executed,
}

// ---------------------------------------------------------------------------
// Executable action enum (DAO-dispatchable operations)
// ---------------------------------------------------------------------------

/// Parameters for a treasury token transfer action.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TransferTokenParams {
    pub token: Address,
    pub recipient: Address,
    pub amount: i128,
}

/// A structured on-chain action that executes when a proposal passes.
///
/// Uses tuple variants (required by `#[contracttype]`; struct variants are
/// unsupported). Named parameters live in wrapper structs.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ExecutableAction {
    /// Transfer `amount` of `token` to `recipient` from the governance treasury.
    TransferToken(TransferTokenParams),
    /// No operation – proposal records intent only (e.g. off-chain policy).
    NoOp,
}

// ---------------------------------------------------------------------------
// Core data types
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GovernanceProposal {
    pub id: u64,
    pub creator: Address,
    pub title: String,
    pub description: String,
    /// Voting closes after this ledger timestamp.
    pub deadline: u64,
    /// Ledger timestamp captured at proposal creation (for off-chain snapshots).
    pub snapshot_timestamp: u64,
    pub status: ProposalStatus,
    /// Cumulative quadratic vote weight in favour.
    pub for_votes: i128,
    /// Cumulative quadratic vote weight against.
    pub against_votes: i128,
    /// Total raw credits spent across all voters.
    pub total_credits_spent: i128,
    /// Action dispatched on execution.
    pub action: ExecutableAction,
}

/// Per-vote record stored to prevent double-voting.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VoteRecord {
    pub voter: Address,
    pub credits_spent: i128,
    /// Computed quadratic weight contributed.
    pub vote_weight: i128,
    /// `true` = for, `false` = against.
    pub support: bool,
}

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone)]
pub enum GovKey {
    Admin,
    NextProposalId,
    /// Governance token used for voter credit tracking.
    GovToken,
    /// Proposal by ID.
    Proposal(u64),
    /// Vote by (proposal_id, voter).
    Vote(u64, Address),
    /// Voter's remaining governance credits (deposited balance).
    Credits(Address),
    /// Minimum credits required to create a proposal.
    ProposalThreshold,
    /// Voting duration in seconds.
    VotingPeriod,
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum GovernanceError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    ProposalNotFound = 4,
    ProposalNotActive = 5,
    VotingClosed = 6,
    AlreadyVoted = 7,
    InsufficientCredits = 8,
    ProposalNotPassed = 9,
    AlreadyExecuted = 10,
    InvalidAmount = 11,
    VotingStillOpen = 12,
}

/// Minimum credits a caller must deposit to create a proposal.
const DEFAULT_PROPOSAL_THRESHOLD: i128 = 100;
/// Default voting window: 7 days in seconds.
const DEFAULT_VOTING_PERIOD: u64 = 604_800;

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct GovernanceContract;

#[contractimpl]
impl GovernanceContract {
    /// Initialise the governance contract.
    ///
    /// * `admin`     – may update configuration; not a super-admin over votes.
    /// * `gov_token` – SAC or custom token used for governance credit deposits.
    pub fn initialize(env: Env, admin: Address, gov_token: Address) {
        if env.storage().instance().has(&GovKey::Admin) {
            panic_with_error!(&env, GovernanceError::AlreadyInitialized);
        }
        env.storage().instance().set(&GovKey::Admin, &admin);
        env.storage().instance().set(&GovKey::GovToken, &gov_token);
        env.storage()
            .instance()
            .set(&GovKey::NextProposalId, &0u64);
        env.storage()
            .instance()
            .set(&GovKey::ProposalThreshold, &DEFAULT_PROPOSAL_THRESHOLD);
        env.storage()
            .instance()
            .set(&GovKey::VotingPeriod, &DEFAULT_VOTING_PERIOD);
        env.events()
            .publish((symbol_short!("gov_init"),), admin);
    }

    // -----------------------------------------------------------------------
    // Credit management
    // -----------------------------------------------------------------------

    /// Deposit governance tokens as voting credits. Tokens are transferred from
    /// `depositor` into the governance contract.
    pub fn deposit_credits(env: Env, depositor: Address, amount: i128) {
        depositor.require_auth();
        if amount <= 0 {
            panic_with_error!(&env, GovernanceError::InvalidAmount);
        }
        let gov_token: Address = env
            .storage()
            .instance()
            .get(&GovKey::GovToken)
            .unwrap_or_else(|| panic_with_error!(&env, GovernanceError::NotInitialized));

        token::Client::new(&env, &gov_token).transfer(
            &depositor,
            &env.current_contract_address(),
            &amount,
        );

        let prev: i128 = env
            .storage()
            .persistent()
            .get(&GovKey::Credits(depositor.clone()))
            .unwrap_or(0);
        env.storage()
            .persistent()
            .set(&GovKey::Credits(depositor.clone()), &safe_add(&env, prev, amount));
        env.events()
            .publish((symbol_short!("crd_dep"),), (depositor, amount));
    }

    /// Query remaining governance credits for a voter.
    pub fn get_credits(env: Env, voter: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&GovKey::Credits(voter))
            .unwrap_or(0)
    }

    // -----------------------------------------------------------------------
    // Proposal lifecycle
    // -----------------------------------------------------------------------

    /// Create a new governance proposal.
    ///
    /// The creator must hold at least `proposal_threshold` governance credits
    /// (which are not consumed – only a balance check is performed).
    pub fn create_proposal(
        env: Env,
        creator: Address,
        title: String,
        description: String,
        action: ExecutableAction,
    ) -> u64 {
        creator.require_auth();
        Self::assert_initialized(&env);

        let threshold: i128 = env
            .storage()
            .instance()
            .get(&GovKey::ProposalThreshold)
            .unwrap_or(DEFAULT_PROPOSAL_THRESHOLD);
        let credits: i128 = env
            .storage()
            .persistent()
            .get(&GovKey::Credits(creator.clone()))
            .unwrap_or(0);
        if credits < threshold {
            panic_with_error!(&env, GovernanceError::InsufficientCredits);
        }

        let voting_period: u64 = env
            .storage()
            .instance()
            .get(&GovKey::VotingPeriod)
            .unwrap_or(DEFAULT_VOTING_PERIOD);

        let id: u64 = env
            .storage()
            .instance()
            .get(&GovKey::NextProposalId)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&GovKey::NextProposalId, &(id + 1));

        let now = env.ledger().timestamp();
        let proposal = GovernanceProposal {
            id,
            creator: creator.clone(),
            title,
            description,
            deadline: now + voting_period,
            snapshot_timestamp: now,
            status: ProposalStatus::Active,
            for_votes: 0,
            against_votes: 0,
            total_credits_spent: 0,
            action,
        };

        env.storage()
            .persistent()
            .set(&GovKey::Proposal(id), &proposal);
        env.events()
            .publish((symbol_short!("prop_crt"), id), creator);

        id
    }

    /// Cast a quadratic vote on an active proposal.
    ///
    /// `credits_to_spend` credits are deducted from the voter's balance.
    /// The quadratic vote weight contributed is `isqrt(credits_to_spend)`.
    pub fn cast_vote(
        env: Env,
        voter: Address,
        proposal_id: u64,
        credits_to_spend: i128,
        support: bool,
    ) {
        voter.require_auth();

        if credits_to_spend <= 0 {
            panic_with_error!(&env, GovernanceError::InvalidAmount);
        }

        let mut proposal: GovernanceProposal = env
            .storage()
            .persistent()
            .get(&GovKey::Proposal(proposal_id))
            .unwrap_or_else(|| panic_with_error!(&env, GovernanceError::ProposalNotFound));

        if proposal.status != ProposalStatus::Active {
            panic_with_error!(&env, GovernanceError::ProposalNotActive);
        }

        if env.ledger().timestamp() > proposal.deadline {
            panic_with_error!(&env, GovernanceError::VotingClosed);
        }

        // Double-vote protection.
        let vote_key = GovKey::Vote(proposal_id, voter.clone());
        if env.storage().persistent().has(&vote_key) {
            panic_with_error!(&env, GovernanceError::AlreadyVoted);
        }

        // Deduct credits.
        let credits: i128 = env
            .storage()
            .persistent()
            .get(&GovKey::Credits(voter.clone()))
            .unwrap_or(0);
        if credits < credits_to_spend {
            panic_with_error!(&env, GovernanceError::InsufficientCredits);
        }
        env.storage()
            .persistent()
            .set(&GovKey::Credits(voter.clone()), &(credits - credits_to_spend));

        // Quadratic vote weight.
        let vote_weight = isqrt(credits_to_spend as u128) as i128;

        // Update proposal tallies.
        if support {
            proposal.for_votes = safe_add(&env, proposal.for_votes, vote_weight);
        } else {
            proposal.against_votes = safe_add(&env, proposal.against_votes, vote_weight);
        }
        proposal.total_credits_spent =
            safe_add(&env, proposal.total_credits_spent, credits_to_spend);

        env.storage()
            .persistent()
            .set(&GovKey::Proposal(proposal_id), &proposal);

        // Record vote to prevent double-voting.
        let record = VoteRecord {
            voter: voter.clone(),
            credits_spent: credits_to_spend,
            vote_weight,
            support,
        };
        env.storage().persistent().set(&vote_key, &record);

        env.events().publish(
            (symbol_short!("vote_cst"), proposal_id),
            (voter, vote_weight, support),
        );
    }

    /// Finalise a proposal after its voting deadline has passed.
    ///
    /// Transitions the proposal to `Passed` or `Failed`. Anyone may call.
    pub fn finalize_proposal(env: Env, proposal_id: u64) {
        let mut proposal: GovernanceProposal = env
            .storage()
            .persistent()
            .get(&GovKey::Proposal(proposal_id))
            .unwrap_or_else(|| panic_with_error!(&env, GovernanceError::ProposalNotFound));

        if proposal.status != ProposalStatus::Active {
            panic_with_error!(&env, GovernanceError::ProposalNotActive);
        }
        if env.ledger().timestamp() <= proposal.deadline {
            panic_with_error!(&env, GovernanceError::VotingStillOpen);
        }

        proposal.status = if proposal.for_votes > proposal.against_votes {
            ProposalStatus::Passed
        } else {
            ProposalStatus::Failed
        };

        env.storage()
            .persistent()
            .set(&GovKey::Proposal(proposal_id), &proposal);
        env.events()
            .publish((symbol_short!("prop_fin"), proposal_id), proposal.status.clone());
    }

    /// Execute the action of a `Passed` proposal.
    ///
    /// Protected by a reentrancy guard to prevent re-execution via callbacks.
    pub fn execute_proposal(env: Env, proposal_id: u64) {
        let mut proposal: GovernanceProposal = env
            .storage()
            .persistent()
            .get(&GovKey::Proposal(proposal_id))
            .unwrap_or_else(|| panic_with_error!(&env, GovernanceError::ProposalNotFound));

        if proposal.status != ProposalStatus::Passed {
            panic_with_error!(&env, GovernanceError::ProposalNotPassed);
        }

        nonreentrant_acquire(&env, symbol_short!("gov_lock"));

        // Mark executed before dispatching to prevent re-entry.
        proposal.status = ProposalStatus::Executed;
        env.storage()
            .persistent()
            .set(&GovKey::Proposal(proposal_id), &proposal);

        // Dispatch the stored action.
        match proposal.action.clone() {
            ExecutableAction::TransferToken(p) => {
                token::Client::new(&env, &p.token).transfer(
                    &env.current_contract_address(),
                    &p.recipient,
                    &p.amount,
                );
            }
            ExecutableAction::NoOp => {}
        }

        nonreentrant_release(&env, symbol_short!("gov_lock"));

        env.events()
            .publish((symbol_short!("prop_exe"), proposal_id), ());
    }

    // -----------------------------------------------------------------------
    // Queries
    // -----------------------------------------------------------------------

    /// Retrieve a proposal by ID.
    pub fn get_proposal(env: Env, proposal_id: u64) -> GovernanceProposal {
        env.storage()
            .persistent()
            .get(&GovKey::Proposal(proposal_id))
            .unwrap_or_else(|| panic_with_error!(&env, GovernanceError::ProposalNotFound))
    }

    /// Retrieve a vote record.
    pub fn get_vote(env: Env, proposal_id: u64, voter: Address) -> VoteRecord {
        env.storage()
            .persistent()
            .get(&GovKey::Vote(proposal_id, voter))
            .unwrap_or_else(|| panic_with_error!(&env, GovernanceError::ProposalNotFound))
    }

    /// Update the proposal creation threshold. Only admin.
    pub fn set_proposal_threshold(env: Env, caller: Address, threshold: i128) {
        caller.require_auth();
        Self::assert_admin(&env, &caller);
        env.storage()
            .instance()
            .set(&GovKey::ProposalThreshold, &threshold);
    }

    /// Update the voting period. Only admin.
    pub fn set_voting_period(env: Env, caller: Address, period_secs: u64) {
        caller.require_auth();
        Self::assert_admin(&env, &caller);
        env.storage()
            .instance()
            .set(&GovKey::VotingPeriod, &period_secs);
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    fn assert_initialized(env: &Env) {
        if !env.storage().instance().has(&GovKey::Admin) {
            panic_with_error!(env, GovernanceError::NotInitialized);
        }
    }

    fn assert_admin(env: &Env, caller: &Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&GovKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, GovernanceError::NotInitialized));
        if *caller != admin {
            panic_with_error!(env, GovernanceError::Unauthorized);
        }
    }
}
