//! Quadratic Voting contract with sybil-resistance checks.
//!
//! Users vote with quadratic cost logic (cost = votes²) using bounded
//! voting credits, and can only interact after passing a sybil check.

#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, IntoVal, String, Symbol};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Proposal {
    pub id: u32,
    pub creator: Address,
    pub title: String,
    pub votes_received: u32,
    pub executed: bool,
}

#[contracttype]
pub enum DataKey {
    Admin,
    SybilContract,
    CreditsPerUser,
    ProposalCount,
    Proposal(u32),
    UserCredits(Address),
    UserVotes(Address, u32), // User Address, Proposal ID -> votes cast
}

#[contract]
pub struct QuadraticVotingContract;

#[contractimpl]
impl QuadraticVotingContract {
    /// Initializes the Quadratic Voting governance system.
    pub fn initialize(env: Env, admin: Address, sybil_contract: Address, credits_per_user: u32) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::SybilContract, &sybil_contract);
        env.storage().instance().set(&DataKey::CreditsPerUser, &credits_per_user);
        env.storage().instance().set(&DataKey::ProposalCount, &0u32);
    }

    /// Creates a new governance proposal. Creator must be sybil-verified.
    pub fn create_proposal(env: Env, creator: Address, title: String) -> u32 {
        creator.require_auth();
        Self::check_sybil(&env, &creator);

        let mut count: u32 = env.storage().instance().get(&DataKey::ProposalCount).unwrap_or(0);
        count += 1;

        let proposal = Proposal {
            id: count,
            creator: creator.clone(),
            title: title.clone(),
            votes_received: 0,
            executed: false,
        };

        env.storage().persistent().set(&DataKey::Proposal(count), &proposal);
        env.storage().instance().set(&DataKey::ProposalCount, &count);

        env.events().publish((Symbol::new(&env, "proposal_created"),), (count, creator, title));
        count
    }

    /// Casts votes for a proposal using quadratic cost calculation.
    pub fn vote(env: Env, voter: Address, proposal_id: u32, additional_votes: u32) {
        voter.require_auth();
        Self::check_sybil(&env, &voter);

        if additional_votes == 0 {
            panic!("Must cast at least 1 vote");
        }

        let mut proposal: Proposal =
            env.storage().persistent().get(&DataKey::Proposal(proposal_id)).expect("Proposal not found");
        if proposal.executed {
            panic!("Proposal already executed");
        }

        let default_credits: u32 = env.storage().instance().get(&DataKey::CreditsPerUser).unwrap();
        let mut current_credits =
            env.storage().persistent().get(&DataKey::UserCredits(voter.clone())).unwrap_or(default_credits);

        let previous_votes: u32 =
            env.storage().persistent().get(&DataKey::UserVotes(voter.clone(), proposal_id)).unwrap_or(0);
        let new_total_votes = previous_votes + additional_votes;

        // Quadratic cost logic: Total cost should be (total_votes)^2.
        let total_cost = new_total_votes.pow(2);
        let previous_cost = previous_votes.pow(2);
        let incremental_cost = total_cost - previous_cost;

        if current_credits < incremental_cost {
            panic!("Insufficient voting credits");
        }

        current_credits -= incremental_cost;
        proposal.votes_received += additional_votes;

        env.storage().persistent().set(&DataKey::UserCredits(voter.clone()), &current_credits);
        env.storage().persistent().set(&DataKey::UserVotes(voter.clone(), proposal_id), &new_total_votes);
        env.storage().persistent().set(&DataKey::Proposal(proposal_id), &proposal);

        env.events()
            .publish((Symbol::new(&env, "voted"),), (voter, proposal_id, additional_votes, incremental_cost));
    }

    /// Executes a proposal after the voting period has concluded.
    pub fn execute_proposal(env: Env, proposal_id: u32) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        let mut proposal: Proposal =
            env.storage().persistent().get(&DataKey::Proposal(proposal_id)).expect("Proposal not found");
        if proposal.executed {
            panic!("Already executed");
        }

        proposal.executed = true;
        env.storage().persistent().set(&DataKey::Proposal(proposal_id), &proposal);

        env.events()
            .publish((Symbol::new(&env, "proposal_executed"),), (proposal_id, proposal.votes_received));
    }

    // --- View & Helper Functions ---

    pub fn get_proposal(env: Env, proposal_id: u32) -> Proposal {
        env.storage().persistent().get(&DataKey::Proposal(proposal_id)).expect("Proposal not found")
    }

    pub fn get_user_credits(env: Env, user: Address) -> u32 {
        let default_credits: u32 = env.storage().instance().get(&DataKey::CreditsPerUser).unwrap();
        env.storage().persistent().get(&DataKey::UserCredits(user)).unwrap_or(default_credits)
    }

    fn check_sybil(env: &Env, user: &Address) {
        let sybil_contract: Address = env.storage().instance().get(&DataKey::SybilContract).unwrap();
        let is_verified: bool = env.invoke_contract(
            &sybil_contract,
            &Symbol::new(env, "is_verified"),
            soroban_sdk::vec![env, user.into_val(env)],
        );
        if !is_verified {
            panic!("User not verified for Sybil resistance");
        }
    }
}

#[cfg(test)]
mod test;
