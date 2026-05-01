use soroban_sdk::{contracttype, Address, Env, String, Symbol, Vec};

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
pub struct QVProposal {
    pub id: u64,
    pub creator: Address,
    pub title: String,
    pub description: String,
    pub deadline: u64,
    pub status: ProposalStatus,
    pub tally_support: i128, // Using i128 for total weight (can be negative if we allow against votes)
    pub total_credits_spent: u128,
}

#[contracttype]
pub enum QVKey {
    Proposal(u64),
    NextId,
    UserVote(u64, Address), // (ProposalID, UserAddress)
}

/// Create a new quadratic voting proposal
pub fn create_proposal(env: &Env, creator: Address, title: String, description: String, duration: u64) -> u64 {
    let id: u64 = env.storage().instance().get(&QVKey::NextId).unwrap_or(0);
    env.storage().instance().set(&QVKey::NextId, &(id + 1));
    
    let proposal = QVProposal {
        id,
        creator,
        title,
        description,
        deadline: env.ledger().timestamp() + duration,
        status: ProposalStatus::Active,
        tally_support: 0,
        total_credits_spent: 0,
    };
    
    env.storage().persistent().set(&QVKey::Proposal(id), &proposal);
    id
}

/// Get proposal by ID
pub fn get_proposal(env: &Env, id: u64) -> Option<QVProposal> {
    env.storage().persistent().get(&QVKey::Proposal(id))
}

/// Cast a vote using quadratic cost calculation (cost = votes^2)
pub fn cast_vote(env: &Env, user: Address, proposal_id: u64, votes: i128) -> bool {
    let mut proposal = match get_proposal(env, proposal_id) {
        Some(p) => p,
        None => return false,
    };
    
    // Check if proposal is active and not expired
    if proposal.status != ProposalStatus::Active || env.ledger().timestamp() > proposal.deadline {
        return false;
    }
    
    // Sybil verification check
    if !crate::sybil_resistance::is_verified(env, &user) {
        return false; // Only verified users can vote
    }
    
    // Quadratic cost calculation: cost = votes^2
    let abs_votes = if votes < 0 { -votes } else { votes };
    let cost = (abs_votes as u128).checked_mul(abs_votes as u128).unwrap_or(u128::MAX);
    
    // Standard QV implementation: check if user has enough credits
    if !crate::sybil_resistance::consume_credits(env, &user, cost) {
        return false;
    }
    
    // Update tally and metadata
    proposal.tally_support += votes;
    proposal.total_credits_spent += cost;
    
    env.storage().persistent().set(&QVKey::Proposal(proposal_id), &proposal);
    
    // Store user's vote for transparency/history
    env.storage().persistent().set(&QVKey::UserVote(proposal_id, user), &votes);
    
    true
}

/// Finalize proposal and execute based on results
pub fn execute_proposal(env: &Env, id: u64) -> bool {
    let mut proposal = match get_proposal(env, id) {
        Some(p) => p,
        None => return false,
    };
    
    if proposal.status != ProposalStatus::Active {
        return false;
    }
    
    // Check if deadline passed
    if env.ledger().timestamp() <= proposal.deadline {
        return false;
    }
    
    // Simple execution logic: if tally > 0, it passes
    if proposal.tally_support > 0 {
        proposal.status = ProposalStatus::Passed;
        // Mark as Executed (in a real scenario, this would trigger external effects)
        proposal.status = ProposalStatus::Executed;
    } else {
        proposal.status = ProposalStatus::Failed;
    }
    
    env.storage().persistent().set(&QVKey::Proposal(id), &proposal);
    true
}
