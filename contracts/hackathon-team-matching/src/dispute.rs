use crate::escrow::{EscrowError, HackathonEscrow, Milestone};
use soroban_sdk::{panic_with_error, Address, Env};

pub fn cast_vote(
    env: &Env,
    escrow: &HackathonEscrow,
    milestone: &mut Milestone,
    arbiter: &Address,
    release_to_team: bool,
) -> bool {
    if !escrow.arbiters.contains(arbiter) {
        panic_with_error!(env, EscrowError::NotParticipant);
    }
    if milestone.arbiter_release_votes.contains(arbiter)
        || milestone.arbiter_refund_votes.contains(arbiter)
    {
        panic_with_error!(env, EscrowError::AlreadyVoted);
    }

    let votes = if release_to_team {
        &mut milestone.arbiter_release_votes
    } else {
        &mut milestone.arbiter_refund_votes
    };
    votes.push_back(arbiter.clone());
    votes.len() >= escrow.arbiter_threshold
}
