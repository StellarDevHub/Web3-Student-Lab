use soroban_sdk::{contracttype, Address, Env, Vec};

pub const DEFAULT_ARBITRATION_QUORUM: u32 = 2; // At least 2 arbiter votes required for binding ruling

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DisputeRecord {
    pub job_id: u64,
    pub milestone_index: u32,
    pub disputed_by: Address,
    pub votes_for_freelancer: u32,
    pub votes_for_client: u32,
    pub arbiters_voted: Vec<Address>,
    pub is_resolved: bool,
    pub winning_party: Option<Address>,
}

#[contracttype]
#[derive(Clone)]
pub enum ArbKey {
    Arbiter(Address),
    ArbiterList,
    Dispute(u64, u32), // (job_id, milestone_index)
}

pub struct ArbitrationManager;

impl ArbitrationManager {
    /// Register a peer-elected student arbiter
    pub fn add_arbiter(env: &Env, arbiter: Address) {
        let is_registered: bool = env
            .storage()
            .persistent()
            .get(&ArbKey::Arbiter(arbiter.clone()))
            .unwrap_or(false);

        if !is_registered {
            env.storage()
                .persistent()
                .set(&ArbKey::Arbiter(arbiter.clone()), &true);

            let mut list: Vec<Address> = env
                .storage()
                .persistent()
                .get(&ArbKey::ArbiterList)
                .unwrap_or(Vec::new(env));
            list.push_back(arbiter);
            env.storage().persistent().set(&ArbKey::ArbiterList, &list);
        }
    }

    /// Check if address is a registered arbiter
    pub fn is_arbiter(env: &Env, address: &Address) -> bool {
        env.storage()
            .persistent()
            .get(&ArbKey::Arbiter(address.clone()))
            .unwrap_or(false)
    }

    /// Open dispute record
    pub fn open_dispute(
        env: &Env,
        job_id: u64,
        milestone_index: u32,
        disputed_by: Address,
    ) -> DisputeRecord {
        let record = DisputeRecord {
            job_id,
            milestone_index,
            disputed_by,
            votes_for_freelancer: 0,
            votes_for_client: 0,
            arbiters_voted: Vec::new(env),
            is_resolved: false,
            winning_party: None,
        };

        env.storage()
            .persistent()
            .set(&ArbKey::Dispute(job_id, milestone_index), &record);

        record
    }

    /// Get dispute record
    pub fn get_dispute(env: &Env, job_id: u64, milestone_index: u32) -> Option<DisputeRecord> {
        env.storage()
            .persistent()
            .get(&ArbKey::Dispute(job_id, milestone_index))
    }

    /// Cast binding arbitration multi-sig vote
    /// Returns Some(winner) if binding quorum is reached, or None if still collecting votes
    pub fn cast_vote(
        env: &Env,
        job_id: u64,
        milestone_index: u32,
        arbiter: Address,
        vote_for_freelancer: bool,
        client: Address,
        freelancer: Address,
        required_quorum: u32,
    ) -> (DisputeRecord, Option<Address>) {
        let mut dispute = Self::get_dispute(env, job_id, milestone_index)
            .unwrap_or_else(|| Self::open_dispute(env, job_id, milestone_index, arbiter.clone()));

        if dispute.is_resolved {
            return (dispute.clone(), dispute.winning_party);
        }

        // Ensure arbiter hasn't voted already
        for voted_arb in dispute.arbiters_voted.iter() {
            if voted_arb == arbiter {
                // Arbiter already voted
                return (dispute.clone(), dispute.winning_party);
            }
        }

        dispute.arbiters_voted.push_back(arbiter);
        if vote_for_freelancer {
            dispute.votes_for_freelancer += 1;
        } else {
            dispute.votes_for_client += 1;
        }

        let mut winner: Option<Address> = None;

        // Check if binding vote threshold reached
        if dispute.votes_for_freelancer >= required_quorum {
            dispute.is_resolved = true;
            winner = Some(freelancer);
            dispute.winning_party = winner.clone();
        } else if dispute.votes_for_client >= required_quorum {
            dispute.is_resolved = true;
            winner = Some(client);
            dispute.winning_party = winner.clone();
        }

        env.storage()
            .persistent()
            .set(&ArbKey::Dispute(job_id, milestone_index), &dispute);

        (dispute, winner)
    }
}
