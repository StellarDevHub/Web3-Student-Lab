use soroban_sdk::{Env, Address, Symbol, Vec, contracttype};
use crate::crowdfunding::{Campaign, CrowdfundingDataKey, Milestone};

pub fn vote_on_milestone(env: &Env, voter: Address, campaign_id: u64, approve: bool) {
    voter.require_auth();

    let contribution: i128 = env
        .storage()
        .instance()
        .get(&CrowdfundingDataKey::Contribution(campaign_id, voter.clone()))
        .unwrap_or(0);

    if contribution == 0 {
        panic!("Only backers can vote");
    }

    let mut campaign: Campaign = env
        .storage()
        .instance()
        .get(&CrowdfundingDataKey::Campaign(campaign_id))
        .expect("Campaign not found");

    let milestone_idx = campaign.current_milestone_index as u32;
    if milestone_idx >= campaign.milestones.len() {
        panic!("All milestones completed");
    }

    let mut milestones = campaign.milestones.clone();
    let mut milestone = milestones.get(milestone_idx).unwrap();

    if approve {
        milestone.votes_for += contribution;
    } else {
        milestone.votes_against += contribution;
    }

    milestones.set(milestone_idx, milestone);
    campaign.milestones = milestones;

    env.storage().instance().set(&CrowdfundingDataKey::Campaign(campaign_id), &campaign);

    // Emit event
    env.events().publish(
        (Symbol::new(env, "milestone_voted"), voter, campaign_id, milestone_idx),
        approve,
    );
}

pub fn release_milestone_funds(env: &Env, campaign_id: u64) {
    let mut campaign: Campaign = env
        .storage()
        .instance()
        .get(&CrowdfundingDataKey::Campaign(campaign_id))
        .expect("Campaign not found");

    let milestone_idx = campaign.current_milestone_index as u32;
    if milestone_idx >= campaign.milestones.len() {
        panic!("All milestones completed");
    }

    let mut milestones = campaign.milestones.clone();
    let mut milestone = milestones.get(milestone_idx).unwrap();

    if milestone.approved {
        panic!("Milestone already approved");
    }

    // Threshold for approval: > 50% of total funded amount
    if milestone.votes_for > campaign.total_funded / 2 {
        milestone.approved = true;
        milestones.set(milestone_idx, milestone);
        campaign.milestones = milestones;
        campaign.current_milestone_index += 1;

        if campaign.current_milestone_index == campaign.milestones.len() {
            campaign.completed = true;
        }

        env.storage().instance().set(&CrowdfundingDataKey::Campaign(campaign_id), &campaign);

        // Emit event
        env.events().publish(
            (Symbol::new(env, "milestone_approved"), campaign_id, milestone_idx),
            true,
        );
    } else {
        panic!("Milestone not yet approved by backers");
    }
}

pub fn process_refund(env: &Env, contributor: Address, campaign_id: u64) {
    contributor.require_auth();

    let mut campaign: Campaign = env
        .storage()
        .instance()
        .get(&CrowdfundingDataKey::Campaign(campaign_id))
        .expect("Campaign not found");

    let is_failed = env.ledger().timestamp() > campaign.deadline && campaign.total_funded < campaign.goal;
    
    // If goal met but a milestone was rejected or deadline passed without completion
    // For simplicity, we allow refunds if the campaign failed its goal or was manually marked for refund
    if !is_failed && !campaign.refunded {
        panic!("Campaign not eligible for refund");
    }

    let key = CrowdfundingDataKey::Contribution(campaign_id, contributor.clone());
    let contribution: i128 = env.storage().instance().get(&key).unwrap_or(0);

    if contribution == 0 {
        panic!("No contribution to refund");
    }

    // Logic to send funds back would go here (e.g., token transfer)
    // For this lab, we just clear the contribution and emit an event
    env.storage().instance().remove(&key);

    // Emit event
    env.events().publish(
        (Symbol::new(env, "refund_processed"), contributor, campaign_id),
        contribution,
    );
}
