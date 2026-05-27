use soroban_sdk::{contracttype, Address, Env, Map, String, Symbol, Vec};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Milestone {
    pub description: String,
    pub amount: i128,
    pub approved: bool,
    pub votes_for: i128,
    pub votes_against: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Campaign {
    pub id: u64,
    pub creator: Address,
    pub goal: i128,
    pub deadline: u64,
    pub total_funded: i128,
    pub milestones: Vec<Milestone>,
    pub current_milestone_index: u32,
    pub completed: bool,
    pub refunded: bool,
}

#[contracttype]
pub enum CrowdfundingDataKey {
    Campaign(u64),
    CampaignCount,
    Contribution(u64, Address),
}

pub fn create_campaign(
    env: &Env,
    creator: Address,
    goal: i128,
    deadline: u64,
    milestones: Vec<Milestone>,
) -> u64 {
    creator.require_auth();

    let mut count: u64 = env
        .storage()
        .instance()
        .get(&CrowdfundingDataKey::CampaignCount)
        .unwrap_or(0);
    count += 1;

    let campaign = Campaign {
        id: count,
        creator: creator.clone(),
        goal,
        deadline,
        total_funded: 0,
        milestones,
        current_milestone_index: 0,
        completed: false,
        refunded: false,
    };

    env.storage()
        .instance()
        .set(&CrowdfundingDataKey::Campaign(count), &campaign);
    env.storage()
        .instance()
        .set(&CrowdfundingDataKey::CampaignCount, &count);

    // Emit event
    env.events()
        .publish((Symbol::new(env, "campaign_created"), creator), count);

    count
}

pub fn contribute(env: &Env, contributor: Address, campaign_id: u64, amount: i128) {
    contributor.require_auth();

    let mut campaign: Campaign = env
        .storage()
        .instance()
        .get(&CrowdfundingDataKey::Campaign(campaign_id))
        .expect("Campaign not found");

    if env.ledger().timestamp() > campaign.deadline {
        panic!("Campaign deadline passed");
    }

    if campaign.completed || campaign.refunded {
        panic!("Campaign is no longer active");
    }

    // Update contribution
    let key = CrowdfundingDataKey::Contribution(campaign_id, contributor.clone());
    let current_contribution: i128 = env.storage().instance().get(&key).unwrap_or(0);
    env.storage()
        .instance()
        .set(&key, &(current_contribution + amount));

    // Update campaign total
    campaign.total_funded += amount;
    env.storage()
        .instance()
        .set(&CrowdfundingDataKey::Campaign(campaign_id), &campaign);

    // Emit event
    env.events().publish(
        (
            Symbol::new(env, "contribution_made"),
            contributor,
            campaign_id,
        ),
        amount,
    );
}
