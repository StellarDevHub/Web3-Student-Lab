//! # Ragequit Module for Minority Shareholders
//!
//! Allows dissenting voters to burn governance tokens/shares and exit with their
//! pro-rata share of unallocated treasury reserves during timelock before proposal execution.

use crate::treasury::Treasury;
use crate::{load_proposal, DaoError, Key, ProposalStatus};
use soroban_sdk::{panic_with_error, Address, Env};

pub struct Ragequit;

impl Ragequit {
    pub fn execute_ragequit(
        env: &Env,
        voter: Address,
        proposal_id: u64,
        shares_to_burn: u128,
    ) -> u128 {
        voter.require_auth();

        if shares_to_burn == 0 {
            panic_with_error!(env, DaoError::ZeroShares);
        }

        let proposal = load_proposal(env, proposal_id)
            .unwrap_or_else(|| panic_with_error!(env, DaoError::ProposalNotFound));

        // Proposal must be passed and not yet executed
        if proposal.status != ProposalStatus::Passed {
            panic_with_error!(env, DaoError::ProposalNotPassed);
        }

        // Voter must not have voted "Yes" (positive vote) on the active proposal
        let vote_key = Key::Vote(proposal_id, voter.clone());
        if let Some(voted) = env.storage().persistent().get::<Key, i64>(&vote_key) {
            if voted > 0 {
                panic_with_error!(env, DaoError::YesVoterCannotRagequit);
            }
        }

        let user_shares = Treasury::get_shares(env, &voter);
        if user_shares < shares_to_burn {
            panic_with_error!(env, DaoError::InsufficientShares);
        }

        let treasury = Treasury::get_state(env);
        if treasury.total_shares == 0 || treasury.total_reserves == 0 {
            panic_with_error!(env, DaoError::InsufficientReserves);
        }

        // Compute pro-rata share of unallocated reserves: (shares_to_burn * total_reserves) / total_shares
        let payout = (shares_to_burn as u128)
            .checked_mul(treasury.total_reserves)
            .and_then(|prod| prod.checked_div(treasury.total_shares))
            .unwrap_or(0);

        if payout == 0 {
            panic_with_error!(env, DaoError::InsufficientReserves);
        }

        // Burn governance shares atomically
        Treasury::set_shares(env, &voter, user_shares - shares_to_burn);

        // Deduct paid out reserves from treasury
        let mut updated_treasury = Treasury::get_state(env);
        updated_treasury.total_reserves = updated_treasury.total_reserves.saturating_sub(payout);
        Treasury::set_state(env, &updated_treasury);

        payout
    }
}
