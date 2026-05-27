//! Decentralized Bounty & Hackathon Escrow
//!
//! Instructors post token bounties for coding challenges. Multiple funders can
//! pool rewards into a single bounty. A trusted oracle verifies off-chain
//! completion (e.g. a GitHub PR merge). Disputed submissions go through a
//! simple arbitration vote among registered arbiters.
//!
//! ## Lifecycle
//! ```text
//! create_bounty ──► fund_bounty (any funder, multiple times)
//!                       │
//!                       ▼
//!               submit_work (solver)
//!                       │
//!              ┌────────┴────────┐
//!              │                 │
//!         oracle_verify      dispute (funder/creator)
//!              │                 │
//!         [Approved]      arbiter_vote × threshold
//!              │                 │
//!         release_reward    [Approved / Rejected]
//!              │                 │
//!           Solver ◄─────────────┘
//!                         │
//!                    [Rejected] → refund_funders
//! ```
//!
//! ## Security
//! - Reentrancy: `nonreentrant_acquire/release` wraps every token-moving function.
//! - Overflow: `safe_add` / `safe_sub` from `security_primitives`.
//! - Oracle manipulation: only the registered oracle address may call `oracle_verify`;
//!   the oracle result is a boolean (approved/rejected), not a price feed, so
//!   there is no numeric manipulation surface.
//! - Replay: each bounty has a unique auto-incremented ID; state transitions are
//!   enforced by the `BountyStatus` enum.

#![allow(dead_code)]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, token,
    Address, Env, Vec,
};

use crate::security_primitives::{nonreentrant_acquire, nonreentrant_release, safe_add, safe_sub};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOCK: soroban_sdk::Symbol = symbol_short!("bty_lk");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Lifecycle state of a bounty.
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum BountyStatus {
    /// Accepting funds; no submission yet.
    Open,
    /// A solver has submitted work; awaiting oracle verification.
    UnderReview,
    /// A funder or creator has raised a dispute; awaiting arbiter votes.
    Disputed,
    /// Oracle or arbiters approved; reward paid to solver.
    Completed,
    /// Rejected by oracle or arbiters; funds returned to funders.
    Refunded,
}

/// A single bounty record stored in persistent storage.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Bounty {
    /// Auto-incremented identifier.
    pub id: u32,
    /// Address that created the bounty (instructor).
    pub creator: Address,
    /// Token used for the reward pool.
    pub token: Address,
    /// Total tokens pooled by all funders.
    pub total_reward: i128,
    /// Deadline (ledger timestamp). Funders may reclaim after this if still Open.
    pub deadline: u64,
    /// Current lifecycle state.
    pub status: BountyStatus,
    /// Address of the solver who submitted work (set on `submit_work`).
    pub solver: Option<Address>,
    /// Number of arbiter votes in favour of the solver.
    pub votes_for: u32,
    /// Number of arbiter votes against the solver.
    pub votes_against: u32,
    /// Minimum arbiter votes required to resolve a dispute.
    pub arbiter_threshold: u32,
}

/// Storage keys.
#[contracttype]
#[derive(Clone)]
pub enum BountyKey {
    /// Global admin address.
    Admin,
    /// Oracle address authorised to call `oracle_verify`.
    Oracle,
    /// Registered arbiters: Vec<Address>.
    Arbiters,
    /// Auto-increment counter for bounty IDs.
    NextId,
    /// Bounty record: id → Bounty.
    Bounty(u32),
    /// Per-funder contribution: (id, funder) → i128.
    Contribution(u32, Address),
    /// Funders list for a bounty: id → Vec<Address>.
    Funders(u32),
    /// Arbiter vote record: (id, arbiter) → bool (true = voted).
    ArbiterVoted(u32, Address),
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum BountyError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    NotFound = 4,
    InvalidStatus = 5,
    ZeroAmount = 6,
    DeadlinePassed = 7,
    DeadlineNotPassed = 8,
    AlreadyVoted = 9,
    NotArbiter = 10,
    Overflow = 11,
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct BountyEscrowContract;

#[contractimpl]
impl BountyEscrowContract {
    // -----------------------------------------------------------------------
    // Initialisation
    // -----------------------------------------------------------------------

    /// Initialise the escrow.
    ///
    /// # Arguments
    /// * `admin`             – Controls arbiter registration and oracle address.
    /// * `oracle`            – Address authorised to call `oracle_verify`.
    /// * `arbiters`          – Initial set of dispute arbiters.
    /// * `arbiter_threshold` – Default votes required to resolve a dispute.
    pub fn initialize(
        env: Env,
        admin: Address,
        oracle: Address,
        arbiters: Vec<Address>,
        arbiter_threshold: u32,
    ) {
        if env.storage().instance().has(&BountyKey::Admin) {
            panic_with_error!(&env, BountyError::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&BountyKey::Admin, &admin);
        env.storage().instance().set(&BountyKey::Oracle, &oracle);
        env.storage().instance().set(&BountyKey::Arbiters, &arbiters);
        env.storage().instance().set(&BountyKey::NextId, &1_u32);
        env.events().publish((symbol_short!("bty_init"),), (admin, arbiter_threshold));
    }

    // -----------------------------------------------------------------------
    // Bounty creation
    // -----------------------------------------------------------------------

    /// Create a new bounty. The creator may optionally seed it with an initial
    /// reward by also calling `fund_bounty` immediately after.
    ///
    /// # Arguments
    /// * `creator`           – Instructor posting the bounty.
    /// * `token`             – Reward token address.
    /// * `deadline`          – Ledger timestamp after which unfunded bounties expire.
    /// * `arbiter_threshold` – Votes needed to resolve a dispute for this bounty.
    ///
    /// Returns the new bounty ID.
    pub fn create_bounty(
        env: Env,
        creator: Address,
        token: Address,
        deadline: u64,
        arbiter_threshold: u32,
    ) -> u32 {
        creator.require_auth();
        if deadline <= env.ledger().timestamp() {
            panic_with_error!(&env, BountyError::DeadlinePassed);
        }

        let id: u32 = env.storage().instance().get(&BountyKey::NextId).unwrap_or(1);
        env.storage().instance().set(&BountyKey::NextId, &(id + 1));

        let bounty = Bounty {
            id,
            creator: creator.clone(),
            token,
            total_reward: 0,
            deadline,
            status: BountyStatus::Open,
            solver: None,
            votes_for: 0,
            votes_against: 0,
            arbiter_threshold,
        };
        env.storage().persistent().set(&BountyKey::Bounty(id), &bounty);
        env.storage().persistent().set(&BountyKey::Funders(id), &Vec::<Address>::new(&env));

        env.events().publish((symbol_short!("bty_new"),), (creator, id));
        id
    }

    // -----------------------------------------------------------------------
    // Funding (pooled rewards)
    // -----------------------------------------------------------------------

    /// Contribute `amount` tokens to bounty `id`. Any address may fund.
    pub fn fund_bounty(env: Env, funder: Address, id: u32, amount: i128) {
        funder.require_auth();
        if amount <= 0 {
            panic_with_error!(&env, BountyError::ZeroAmount);
        }
        nonreentrant_acquire(&env, LOCK);

        let mut bounty = Self::load_bounty(&env, id);
        if bounty.status != BountyStatus::Open {
            nonreentrant_release(&env, LOCK);
            panic_with_error!(&env, BountyError::InvalidStatus);
        }
        if env.ledger().timestamp() > bounty.deadline {
            nonreentrant_release(&env, LOCK);
            panic_with_error!(&env, BountyError::DeadlinePassed);
        }

        // Transfer tokens into escrow.
        token::Client::new(&env, &bounty.token).transfer(
            &funder,
            &env.current_contract_address(),
            &amount,
        );

        // Record per-funder contribution.
        let ck = BountyKey::Contribution(id, funder.clone());
        let prev: i128 = env.storage().persistent().get(&ck).unwrap_or(0);
        env.storage().persistent().set(&ck, &safe_add(&env, prev, amount));

        // Track funder in list (deduplicated).
        let mut funders: Vec<Address> = env.storage().persistent()
            .get(&BountyKey::Funders(id))
            .unwrap_or_else(|| Vec::new(&env));
        if !funders.contains(&funder) {
            funders.push_back(funder.clone());
            env.storage().persistent().set(&BountyKey::Funders(id), &funders);
        }

        bounty.total_reward = safe_add(&env, bounty.total_reward, amount);
        env.storage().persistent().set(&BountyKey::Bounty(id), &bounty);

        nonreentrant_release(&env, LOCK);
        env.events().publish((symbol_short!("bty_fund"),), (funder, id, amount));
    }

    // -----------------------------------------------------------------------
    // Submission
    // -----------------------------------------------------------------------

    /// Solver submits their work for bounty `id`.
    /// Transitions status from `Open` → `UnderReview`.
    pub fn submit_work(env: Env, solver: Address, id: u32) {
        solver.require_auth();
        let mut bounty = Self::load_bounty(&env, id);
        if bounty.status != BountyStatus::Open {
            panic_with_error!(&env, BountyError::InvalidStatus);
        }
        bounty.status = BountyStatus::UnderReview;
        bounty.solver = Some(solver.clone());
        env.storage().persistent().set(&BountyKey::Bounty(id), &bounty);
        env.events().publish((symbol_short!("bty_sub"),), (solver, id));
    }

    // -----------------------------------------------------------------------
    // Oracle verification
    // -----------------------------------------------------------------------

    /// Called by the registered oracle to report whether the submission is valid
    /// (e.g. the linked GitHub PR was merged into the target repo).
    ///
    /// * `approved = true`  → releases reward to solver.
    /// * `approved = false` → refunds all funders.
    pub fn oracle_verify(env: Env, oracle: Address, id: u32, approved: bool) {
        oracle.require_auth();
        // Verify caller is the registered oracle (oracle manipulation guard).
        let registered: Address = env.storage().instance()
            .get(&BountyKey::Oracle)
            .unwrap_or_else(|| panic_with_error!(&env, BountyError::NotInitialized));
        if oracle != registered {
            panic_with_error!(&env, BountyError::Unauthorized);
        }

        let bounty = Self::load_bounty(&env, id);
        if bounty.status != BountyStatus::UnderReview {
            panic_with_error!(&env, BountyError::InvalidStatus);
        }

        if approved {
            Self::pay_solver(&env, id, bounty);
        } else {
            Self::do_refund(&env, id, bounty);
        }
        env.events().publish((symbol_short!("bty_orc"),), (id, approved));
    }

    // -----------------------------------------------------------------------
    // Dispute
    // -----------------------------------------------------------------------

    /// A funder or the creator raises a dispute on a submission under review.
    /// Transitions status from `UnderReview` → `Disputed`.
    pub fn dispute(env: Env, caller: Address, id: u32) {
        caller.require_auth();
        let mut bounty = Self::load_bounty(&env, id);
        if bounty.status != BountyStatus::UnderReview {
            panic_with_error!(&env, BountyError::InvalidStatus);
        }
        // Only the creator or a funder may dispute.
        let is_creator = caller == bounty.creator;
        let contribution: i128 = env.storage().persistent()
            .get(&BountyKey::Contribution(id, caller.clone()))
            .unwrap_or(0);
        if !is_creator && contribution == 0 {
            panic_with_error!(&env, BountyError::Unauthorized);
        }
        bounty.status = BountyStatus::Disputed;
        env.storage().persistent().set(&BountyKey::Bounty(id), &bounty);
        env.events().publish((symbol_short!("bty_disp"),), (caller, id));
    }

    /// An arbiter casts a vote on a disputed bounty.
    ///
    /// * `approve = true`  → vote in favour of the solver.
    /// * `approve = false` → vote to reject and refund funders.
    ///
    /// Once `votes_for` or `votes_against` reaches `arbiter_threshold`, the
    /// bounty is resolved automatically.
    pub fn arbiter_vote(env: Env, arbiter: Address, id: u32, approve: bool) {
        arbiter.require_auth();
        Self::assert_arbiter(&env, &arbiter);

        let mut bounty = Self::load_bounty(&env, id);
        if bounty.status != BountyStatus::Disputed {
            panic_with_error!(&env, BountyError::InvalidStatus);
        }

        // Each arbiter may vote only once per bounty.
        let voted_key = BountyKey::ArbiterVoted(id, arbiter.clone());
        if env.storage().persistent().get::<BountyKey, bool>(&voted_key).unwrap_or(false) {
            panic_with_error!(&env, BountyError::AlreadyVoted);
        }
        env.storage().persistent().set(&voted_key, &true);

        if approve {
            bounty.votes_for += 1;
        } else {
            bounty.votes_against += 1;
        }

        let threshold = bounty.arbiter_threshold;

        if bounty.votes_for >= threshold {
            env.storage().persistent().set(&BountyKey::Bounty(id), &bounty);
            Self::pay_solver(&env, id, bounty);
        } else if bounty.votes_against >= threshold {
            env.storage().persistent().set(&BountyKey::Bounty(id), &bounty);
            Self::do_refund(&env, id, bounty);
        } else {
            env.storage().persistent().set(&BountyKey::Bounty(id), &bounty);
        }

        env.events().publish((symbol_short!("bty_vote"),), (arbiter, id, approve));
    }

    // -----------------------------------------------------------------------
    // Deadline expiry refund
    // -----------------------------------------------------------------------

    /// Any funder may reclaim their contribution if the bounty is still `Open`
    /// after the deadline has passed.
    pub fn reclaim_expired(env: Env, funder: Address, id: u32) {
        funder.require_auth();
        nonreentrant_acquire(&env, LOCK);

        let bounty = Self::load_bounty(&env, id);
        if bounty.status != BountyStatus::Open {
            nonreentrant_release(&env, LOCK);
            panic_with_error!(&env, BountyError::InvalidStatus);
        }
        if env.ledger().timestamp() <= bounty.deadline {
            nonreentrant_release(&env, LOCK);
            panic_with_error!(&env, BountyError::DeadlineNotPassed);
        }

        let ck = BountyKey::Contribution(id, funder.clone());
        let amount: i128 = env.storage().persistent().get(&ck).unwrap_or(0);
        if amount > 0 {
            env.storage().persistent().set(&ck, &0_i128);
            token::Client::new(&env, &bounty.token).transfer(
                &env.current_contract_address(),
                &funder,
                &amount,
            );
        }

        nonreentrant_release(&env, LOCK);
        env.events().publish((symbol_short!("bty_recl"),), (funder, id, amount));
    }

    // -----------------------------------------------------------------------
    // View helpers
    // -----------------------------------------------------------------------

    /// Returns the bounty record for `id`.
    pub fn get_bounty(env: Env, id: u32) -> Bounty {
        Self::load_bounty(&env, id)
    }

    /// Returns the contribution of `funder` to bounty `id`.
    pub fn contribution_of(env: Env, id: u32, funder: Address) -> i128 {
        env.storage().persistent()
            .get(&BountyKey::Contribution(id, funder))
            .unwrap_or(0)
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    /// Transfer the full reward pool to the solver and mark bounty Completed.
    fn pay_solver(env: &Env, id: u32, mut bounty: Bounty) {
        nonreentrant_acquire(env, LOCK);
        let solver = bounty.solver.clone()
            .unwrap_or_else(|| panic_with_error!(env, BountyError::NotFound));
        let amount = bounty.total_reward;
        bounty.status = BountyStatus::Completed;
        bounty.total_reward = 0;
        env.storage().persistent().set(&BountyKey::Bounty(id), &bounty);
        if amount > 0 {
            token::Client::new(env, &bounty.token).transfer(
                &env.current_contract_address(),
                &solver,
                &amount,
            );
        }
        nonreentrant_release(env, LOCK);
        env.events().publish((symbol_short!("bty_paid"),), (id, solver, amount));
    }

    /// Refund each funder their pro-rata contribution and mark bounty Refunded.
    fn do_refund(env: &Env, id: u32, mut bounty: Bounty) {
        nonreentrant_acquire(env, LOCK);
        let funders: Vec<Address> = env.storage().persistent()
            .get(&BountyKey::Funders(id))
            .unwrap_or_else(|| Vec::new(env));

        for funder in funders.iter() {
            let ck = BountyKey::Contribution(id, funder.clone());
            let amount: i128 = env.storage().persistent().get(&ck).unwrap_or(0);
            if amount > 0 {
                env.storage().persistent().set(&ck, &0_i128);
                token::Client::new(env, &bounty.token).transfer(
                    &env.current_contract_address(),
                    &funder,
                    &amount,
                );
            }
        }

        bounty.status = BountyStatus::Refunded;
        bounty.total_reward = 0;
        env.storage().persistent().set(&BountyKey::Bounty(id), &bounty);
        nonreentrant_release(env, LOCK);
        env.events().publish((symbol_short!("bty_rfnd"),), id);
    }

    fn load_bounty(env: &Env, id: u32) -> Bounty {
        env.storage().persistent()
            .get(&BountyKey::Bounty(id))
            .unwrap_or_else(|| panic_with_error!(env, BountyError::NotFound))
    }

    fn assert_arbiter(env: &Env, caller: &Address) {
        let arbiters: Vec<Address> = env.storage().instance()
            .get(&BountyKey::Arbiters)
            .unwrap_or_else(|| Vec::new(env));
        if !arbiters.contains(caller) {
            panic_with_error!(env, BountyError::NotArbiter);
        }
    }
}
