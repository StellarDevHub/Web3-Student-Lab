//! Quadratic voting with DID-signed identity nullifiers and Sybil checks.
//!
//! Vote credits follow the strict quadratic cost (votes²). A DID-signed
//! nullifier can be used by only one address per proposal.

#![no_std]

pub mod math;

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, BytesN, Env,
    IntoVal, String, Symbol,
};

const TTL_THRESHOLD: u32 = 10_000;
const TTL_BUMP: u32 = 518_400;

// ── Errors (SC-HARD-20: range 400+) ──────────────────────────────────────────

/// Typed contract errors for the quadratic voting contract.
///
/// Discriminants are in the `400+` range.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum VotingError {
    /// `440` — Contract has already been initialised.
    AlreadyInitialized = 440,
    /// `441` — Caller is not the admin.
    Unauthorized = 441,
    /// `442` — Must cast at least one vote.
    ZeroVotes = 442,
    /// `443` — Proposal has already been executed.
    ProposalAlreadyExecuted = 443,
    /// `444` — Insufficient voting credits for this operation.
    InsufficientCredits = 444,
    /// `445` — User has not passed Sybil resistance verification.
    NotSybilVerified = 445,
    /// `446` — Proposal was not found.
    ProposalNotFound = 446,
    /// `447` — Arithmetic overflow while computing votes or cost.
    Overflow = 447,
    /// `448` — Identity nullifier has already voted from another address.
    DuplicateIdentity = 448,
    /// `449` — DID registry did not authorize the identity nullifier.
    InvalidIdentityProof = 449,
}

pub type QVError = VotingError;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Proposal {
    pub id: u32,
    pub creator: Address,
    pub title: String,
    pub votes_received: u32,
    pub credits_contributed: i128,
    pub executed: bool,
}

#[contracttype]
pub enum DataKey {
    Admin,
    SybilContract,
    DIDRegistry,
    CreditsPerUser,
    ProposalCount,
    Proposal(u32),
    UserCredits(Address),
    UserVotes(Address, u32),     // User Address, Proposal ID -> votes cast
    VoterDID(Address),           // Voter Address -> Their DID (32 bytes)
    VoterHumanityScore(Address), // Voter Address -> # of verified proofs (humanity score)
    SpentNullifier(u32, BytesN<32>),
    SpentDID(u32, BytesN<32>),
    VoterIdentity(Address, u32),
}

#[contract]
pub struct QuadraticVotingContract;

#[contractimpl]
impl QuadraticVotingContract {
    /// Initializes the Quadratic Voting governance system with DID registry integration.
    pub fn initialize(
        env: Env,
        admin: Address,
        sybil_contract: Address,
        did_registry: Address,
        credits_per_user: u32,
    ) {
        admin.require_auth();
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, QVError::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::SybilContract, &sybil_contract);
        env.storage()
            .instance()
            .set(&DataKey::DIDRegistry, &did_registry);
        env.storage()
            .instance()
            .set(&DataKey::CreditsPerUser, &credits_per_user);
        env.storage().instance().set(&DataKey::ProposalCount, &0u32);
        Self::extend_instance_ttl(&env);
    }

    /// Registers a voter with their DID, enabling matching pool participation.
    /// Humanity score is derived from the count of verified contributor proofs.
    pub fn register_voter_did(env: Env, voter: Address, did: BytesN<32>) {
        voter.require_auth();

        // Resolve DID from registry to count proofs (humanity score).
        let did_registry: Address = env
            .storage()
            .instance()
            .get(&DataKey::DIDRegistry)
            .unwrap_or_else(|| panic_with_error!(&env, QVError::Unauthorized));

        let is_active_owner: bool = env.invoke_contract(
            &did_registry,
            &Symbol::new(&env, "is_active_owner"),
            soroban_sdk::vec![&env, did.clone().into_val(&env), voter.clone().into_val(&env)],
        );
        if !is_active_owner {
            panic_with_error!(&env, QVError::InvalidIdentityProof);
        }
        let proof_count: u32 = env.invoke_contract(
            &did_registry,
            &Symbol::new(&env, "get_proof_count"),
            soroban_sdk::vec![&env, did.clone().into_val(&env)],
        );

        env.storage()
            .persistent()
            .set(&DataKey::VoterDID(voter.clone()), &did);
        env.storage()
            .persistent()
            .set(&DataKey::VoterHumanityScore(voter.clone()), &proof_count);
        Self::extend_persistent_ttl(&env, &DataKey::VoterDID(voter.clone()));
        Self::extend_persistent_ttl(&env, &DataKey::VoterHumanityScore(voter.clone()));
        Self::extend_instance_ttl(&env);

        env.events().publish(
            (Symbol::new(&env, "voter_registered"),),
            (voter, proof_count),
        );
    }

    /// Creates a new governance proposal. Creator must be sybil-verified.
    pub fn create_proposal(env: Env, creator: Address, title: String) -> u32 {
        creator.require_auth();
        Self::check_sybil(&env, &creator);

        let mut count: u32 = env
            .storage()
            .instance()
            .get(&DataKey::ProposalCount)
            .unwrap_or(0);
        count = count
            .checked_add(1)
            .unwrap_or_else(|| panic_with_error!(&env, QVError::Overflow));

        let proposal = Proposal {
            id: count,
            creator: creator.clone(),
            title: title.clone(),
            votes_received: 0,
            credits_contributed: 0,
            executed: false,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Proposal(count), &proposal);
        Self::extend_persistent_ttl(&env, &DataKey::Proposal(count));
        env.storage()
            .instance()
            .set(&DataKey::ProposalCount, &count);
        Self::extend_instance_ttl(&env);

        env.events().publish(
            (Symbol::new(&env, "proposal_created"),),
            (count, creator, title),
        );
        count
    }

    /// Casts votes for a proposal using quadratic cost calculation.
    pub fn vote(
        env: Env,
        voter: Address,
        proposal_id: u32,
        additional_votes: u32,
        nullifier: BytesN<32>,
        proof: BytesN<64>,
    ) {
        voter.require_auth();
        Self::check_sybil(&env, &voter);

        if additional_votes == 0 {
            panic_with_error!(&env, QVError::ZeroVotes);
        }

        let did: BytesN<32> = env
            .storage()
            .persistent()
            .get(&DataKey::VoterDID(voter.clone()))
            .unwrap_or_else(|| panic_with_error!(&env, QVError::InvalidIdentityProof));
        let did_registry: Address = env
            .storage()
            .instance()
            .get(&DataKey::DIDRegistry)
            .unwrap_or_else(|| panic_with_error!(&env, QVError::Unauthorized));
        let is_active_owner: bool = env.invoke_contract(
            &did_registry,
            &Symbol::new(&env, "is_active_owner"),
            soroban_sdk::vec![&env, did.clone().into_val(&env), voter.clone().into_val(&env)],
        );
        let is_valid_proof: bool = env.invoke_contract(
            &did_registry,
            &Symbol::new(&env, "verify_identity_nullifier"),
            soroban_sdk::vec![
                &env,
                did.clone().into_val(&env),
                proposal_id.into_val(&env),
                nullifier.clone().into_val(&env),
                env.current_contract_address().into_val(&env),
                proof.into_val(&env),
            ],
        );
        if !is_active_owner || !is_valid_proof {
            panic_with_error!(&env, QVError::InvalidIdentityProof);
        }

        let nullifier_key = DataKey::SpentNullifier(proposal_id, nullifier);
        let identity_key = DataKey::SpentDID(proposal_id, did.clone());
        let voter_identity_key = DataKey::VoterIdentity(voter.clone(), proposal_id);
        let used_identity: Option<BytesN<32>> =
            env.storage().persistent().get(&voter_identity_key);
        if used_identity
            .as_ref()
            .map(|identity| identity != &did)
            .unwrap_or(false)
        {
            panic_with_error!(&env, QVError::DuplicateIdentity);
        }
        if used_identity.is_none() {
            env.storage()
                .persistent()
                .set(&voter_identity_key, &did);
        }
        Self::extend_persistent_ttl(&env, &voter_identity_key);
        for key in [&nullifier_key, &identity_key] {
            let spent_by: Option<Address> = env.storage().persistent().get(key);
            if spent_by
                .as_ref()
                .map(|address| address != &voter)
                .unwrap_or(false)
            {
                panic_with_error!(&env, QVError::DuplicateIdentity);
            }
            if spent_by.is_none() {
                env.storage().persistent().set(key, &voter);
            }
            Self::extend_persistent_ttl(&env, key);
        }

        let mut proposal: Proposal = env
            .storage()
            .persistent()
            .get(&DataKey::Proposal(proposal_id))
            .unwrap_or_else(|| panic_with_error!(&env, QVError::ProposalNotFound));
        if proposal.executed {
            panic_with_error!(&env, QVError::ProposalAlreadyExecuted);
        }

        let default_credits: u32 = env
            .storage()
            .instance()
            .get(&DataKey::CreditsPerUser)
            .unwrap_or(0);
        let mut current_credits = env
            .storage()
            .persistent()
            .get(&DataKey::UserCredits(voter.clone()))
            .unwrap_or(default_credits);

        let previous_votes: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::UserVotes(voter.clone(), proposal_id))
            .unwrap_or(0);
        let new_total_votes = previous_votes
            .checked_add(additional_votes)
            .unwrap_or_else(|| panic_with_error!(&env, QVError::Overflow));

        // Quadratic cost logic: incremental cost = (prev + add)^2 - prev^2,
        // so that the total cost of V votes is V^2.
        let incremental_cost =
            math::quadratic_cost(u64::from(previous_votes), u64::from(additional_votes))
                .unwrap_or_else(|| panic_with_error!(&env, QVError::Overflow));

        if i128::from(current_credits) < incremental_cost {
            panic_with_error!(&env, QVError::InsufficientCredits);
        }

        let remaining = i128::from(current_credits)
            .checked_sub(incremental_cost)
            .unwrap_or_else(|| panic_with_error!(&env, QVError::InsufficientCredits));
        // remaining <= current_credits <= u32::MAX, so this conversion succeeds.
        current_credits =
            u32::try_from(remaining).unwrap_or_else(|_| panic_with_error!(&env, QVError::Overflow));

        let previous_credits = math::quadratic_cost(0, u64::from(previous_votes))
            .unwrap_or_else(|| panic_with_error!(&env, QVError::Overflow));
        let total_credits = math::quadratic_cost(0, u64::from(new_total_votes))
            .unwrap_or_else(|| panic_with_error!(&env, QVError::Overflow));
        let previous_tally = math::isqrt_i128(previous_credits);
        let new_tally = math::isqrt_i128(total_credits);
        let tally_delta = u32::try_from(
            new_tally
                .checked_sub(previous_tally)
                .unwrap_or_else(|| panic_with_error!(&env, QVError::Overflow)),
        )
        .unwrap_or_else(|_| panic_with_error!(&env, QVError::Overflow));
        proposal.votes_received = proposal
            .votes_received
            .checked_add(tally_delta)
            .unwrap_or_else(|| panic_with_error!(&env, QVError::Overflow));
        proposal.credits_contributed = proposal
            .credits_contributed
            .checked_add(incremental_cost)
            .unwrap_or_else(|| panic_with_error!(&env, QVError::Overflow));

        env.storage()
            .persistent()
            .set(&DataKey::UserCredits(voter.clone()), &current_credits);
        env.storage().persistent().set(
            &DataKey::UserVotes(voter.clone(), proposal_id),
            &new_total_votes,
        );
        env.storage()
            .persistent()
            .set(&DataKey::Proposal(proposal_id), &proposal);
        Self::extend_persistent_ttl(
            &env,
            &DataKey::UserCredits(voter.clone()),
        );
        Self::extend_persistent_ttl(
            &env,
            &DataKey::UserVotes(voter.clone(), proposal_id),
        );
        Self::extend_persistent_ttl(&env, &DataKey::Proposal(proposal_id));
        Self::extend_instance_ttl(&env);

        env.events().publish(
            (Symbol::new(&env, "voted"),),
            (voter, proposal_id, additional_votes, incremental_cost),
        );
    }

    /// Executes a proposal after the voting period has concluded.
    pub fn execute_proposal(env: Env, proposal_id: u32) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, QVError::Unauthorized));
        admin.require_auth();

        let mut proposal: Proposal = env
            .storage()
            .persistent()
            .get(&DataKey::Proposal(proposal_id))
            .unwrap_or_else(|| panic_with_error!(&env, QVError::ProposalNotFound));
        if proposal.executed {
            panic_with_error!(&env, QVError::ProposalAlreadyExecuted);
        }

        proposal.executed = true;
        env.storage()
            .persistent()
            .set(&DataKey::Proposal(proposal_id), &proposal);
        Self::extend_persistent_ttl(&env, &DataKey::Proposal(proposal_id));
        Self::extend_instance_ttl(&env);

        env.events().publish(
            (Symbol::new(&env, "proposal_executed"),),
            (proposal_id, proposal.votes_received),
        );
    }

    // --- View & Helper Functions ---

    pub fn get_proposal(env: Env, proposal_id: u32) -> Proposal {
        env.storage()
            .persistent()
            .get(&DataKey::Proposal(proposal_id))
            .unwrap_or_else(|| panic_with_error!(&env, QVError::ProposalNotFound))
    }

    pub fn get_proposal_tally(env: Env, proposal_id: u32) -> u32 {
        Self::get_proposal(env, proposal_id).votes_received
    }

    pub fn get_user_credits(env: Env, user: Address) -> u32 {
        let default_credits: u32 = env
            .storage()
            .instance()
            .get(&DataKey::CreditsPerUser)
            .unwrap_or(0);
        env.storage()
            .persistent()
            .get(&DataKey::UserCredits(user))
            .unwrap_or(default_credits)
    }

    /// Returns the humanity score (count of verified proofs) for a voter.
    /// Unregistered/unverified voters have a score of 0.
    pub fn get_humanity_score(env: Env, voter: Address) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::VoterHumanityScore(voter))
            .unwrap_or(0)
    }

    /// Returns the matching pool weight for a voter. Only voters with
    /// verified DID credentials (proof_count > 0) receive non-zero weight.
    /// Unverified voters (score = 0) always return 0 matching pool weight.
    ///
    /// NOTE: this weight is LINEAR in the humanity score (score * 10). It is
    /// not the quadratic consensus weight used by `quadratic_funding::distribute`.
    /// Kept unchanged for compatibility.
    pub fn get_matching_pool_weight(env: Env, voter: Address) -> u32 {
        let score: u32 = Self::get_humanity_score(env, voter.clone());
        // Unverified account: zero matching pool weight.
        if score == 0 {
            return 0;
        }
        // Verified account: matching weight proportional to humanity score.
        score * 10
    }

    fn check_sybil(env: &Env, user: &Address) {
        let sybil_contract: Address = env
            .storage()
            .instance()
            .get(&DataKey::SybilContract)
            .unwrap_or_else(|| panic_with_error!(env, QVError::Unauthorized));
        let is_verified: bool = env.invoke_contract(
            &sybil_contract,
            &Symbol::new(env, "is_verified"),
            soroban_sdk::vec![env, user.into_val(env)],
        );
        if !is_verified {
            panic_with_error!(env, QVError::NotSybilVerified);
        }
    }

    fn extend_instance_ttl(env: &Env) {
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_BUMP);
    }

    fn extend_persistent_ttl(env: &Env, key: &DataKey) {
        env.storage()
            .persistent()
            .extend_ttl(key, TTL_THRESHOLD, TTL_BUMP);
    }
}

#[cfg(test)]
mod test;
