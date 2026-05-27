//! Tests for the Decentralized Bounty & Hackathon Escrow contract.
//!
//! Coverage:
//! - Initialisation (happy path, double-init)
//! - create_bounty (ok, deadline in past)
//! - fund_bounty (single funder, multiple funders, wrong status, zero amount)
//! - submit_work (ok, wrong status)
//! - oracle_verify (approve → pay solver, reject → refund funders, wrong oracle, wrong status)
//! - dispute (by creator, by funder, by non-participant, wrong status)
//! - arbiter_vote (approve path, reject path, duplicate vote, non-arbiter, wrong status)
//! - reclaim_expired (ok, deadline not passed, wrong status)
//! - view helpers: get_bounty, contribution_of

#![cfg(test)]

extern crate std;

use soroban_sdk::{
    testutils::{Address as _, Ledger, LedgerInfo},
    token, vec, Address, Env,
};

use crate::bounty_escrow::{BountyEscrowClient, BountyStatus};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn mint(env: &Env, admin: &Address, token_id: &Address, to: &Address, amount: i128) {
    token::StellarAssetClient::new(env, token_id).mint(to, &amount);
}

struct Setup<'a> {
    env: Env,
    escrow: BountyEscrowClient<'a>,
    token: Address,
    admin: Address,
    oracle: Address,
    arbiter1: Address,
    arbiter2: Address,
    arbiter3: Address,
    creator: Address,
    funder1: Address,
    funder2: Address,
    solver: Address,
}

impl<'a> Setup<'a> {
    fn new() -> Self {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);
        let arbiter1 = Address::generate(&env);
        let arbiter2 = Address::generate(&env);
        let arbiter3 = Address::generate(&env);
        let creator = Address::generate(&env);
        let funder1 = Address::generate(&env);
        let funder2 = Address::generate(&env);
        let solver = Address::generate(&env);

        // Deploy token.
        let token_id = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();

        // Mint to funders and escrow (for refund tests).
        mint(&env, &admin, &token_id, &funder1, 100_000);
        mint(&env, &admin, &token_id, &funder2, 100_000);

        // Deploy escrow.
        let escrow_id = env.register(crate::bounty_escrow::BountyEscrowContract, ());
        let escrow = BountyEscrowClient::new(&env, &escrow_id);

        escrow.initialize(
            &admin,
            &oracle,
            &vec![&env, arbiter1.clone(), arbiter2.clone(), arbiter3.clone()],
            &2_u32, // 2-of-3 arbiters
        );

        Setup { env, escrow, token: token_id, admin, oracle, arbiter1, arbiter2, arbiter3, creator, funder1, funder2, solver }
    }

    /// Create a bounty with deadline 1 hour from now and return its ID.
    fn make_bounty(&self) -> u32 {
        let deadline = self.env.ledger().timestamp() + 3600;
        self.escrow.create_bounty(&self.creator, &self.token, &deadline, &2_u32)
    }
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

#[test]
fn test_initialize_ok() {
    let s = Setup::new();
    // Reaching here without panic means init succeeded.
    let _ = s;
}

#[test]
#[should_panic]
fn test_initialize_twice_panics() {
    let s = Setup::new();
    s.escrow.initialize(
        &s.admin,
        &s.oracle,
        &vec![&s.env, s.arbiter1.clone()],
        &1_u32,
    );
}

// ---------------------------------------------------------------------------
// create_bounty
// ---------------------------------------------------------------------------

#[test]
fn test_create_bounty_returns_incrementing_ids() {
    let s = Setup::new();
    let id1 = s.make_bounty();
    let id2 = s.make_bounty();
    assert_eq!(id1, 1);
    assert_eq!(id2, 2);
}

#[test]
#[should_panic]
fn test_create_bounty_past_deadline_panics() {
    let s = Setup::new();
    // deadline in the past
    s.escrow.create_bounty(&s.creator, &s.token, &0_u64, &1_u32);
}

// ---------------------------------------------------------------------------
// fund_bounty
// ---------------------------------------------------------------------------

#[test]
fn test_fund_bounty_single_funder() {
    let s = Setup::new();
    let id = s.make_bounty();
    s.escrow.fund_bounty(&s.funder1, &id, &10_000);
    let b = s.escrow.get_bounty(&id);
    assert_eq!(b.total_reward, 10_000);
    assert_eq!(s.escrow.contribution_of(&id, &s.funder1), 10_000);
}

#[test]
fn test_fund_bounty_multiple_funders_pool_rewards() {
    let s = Setup::new();
    let id = s.make_bounty();
    s.escrow.fund_bounty(&s.funder1, &id, &6_000);
    s.escrow.fund_bounty(&s.funder2, &id, &4_000);
    assert_eq!(s.escrow.get_bounty(&id).total_reward, 10_000);
}

#[test]
fn test_fund_bounty_same_funder_accumulates() {
    let s = Setup::new();
    let id = s.make_bounty();
    s.escrow.fund_bounty(&s.funder1, &id, &3_000);
    s.escrow.fund_bounty(&s.funder1, &id, &2_000);
    assert_eq!(s.escrow.contribution_of(&id, &s.funder1), 5_000);
}

#[test]
#[should_panic]
fn test_fund_bounty_zero_amount_panics() {
    let s = Setup::new();
    let id = s.make_bounty();
    s.escrow.fund_bounty(&s.funder1, &id, &0);
}

#[test]
#[should_panic]
fn test_fund_bounty_wrong_status_panics() {
    let s = Setup::new();
    let id = s.make_bounty();
    s.escrow.fund_bounty(&s.funder1, &id, &5_000);
    s.escrow.submit_work(&s.solver, &id); // now UnderReview
    s.escrow.fund_bounty(&s.funder2, &id, &1_000); // must panic
}

// ---------------------------------------------------------------------------
// submit_work
// ---------------------------------------------------------------------------

#[test]
fn test_submit_work_transitions_to_under_review() {
    let s = Setup::new();
    let id = s.make_bounty();
    s.escrow.fund_bounty(&s.funder1, &id, &5_000);
    s.escrow.submit_work(&s.solver, &id);
    assert_eq!(s.escrow.get_bounty(&id).status, BountyStatus::UnderReview);
}

#[test]
#[should_panic]
fn test_submit_work_twice_panics() {
    let s = Setup::new();
    let id = s.make_bounty();
    s.escrow.submit_work(&s.solver, &id);
    s.escrow.submit_work(&s.solver, &id);
}

// ---------------------------------------------------------------------------
// oracle_verify
// ---------------------------------------------------------------------------

#[test]
fn test_oracle_approve_pays_solver() {
    let s = Setup::new();
    let id = s.make_bounty();
    s.escrow.fund_bounty(&s.funder1, &id, &10_000);
    s.escrow.submit_work(&s.solver, &id);
    s.escrow.oracle_verify(&s.oracle, &id, &true);
    assert_eq!(s.escrow.get_bounty(&id).status, BountyStatus::Completed);
    // Solver should have received the tokens.
    let bal = token::Client::new(&s.env, &s.token).balance(&s.solver);
    assert_eq!(bal, 10_000);
}

#[test]
fn test_oracle_reject_refunds_funders() {
    let s = Setup::new();
    let id = s.make_bounty();
    s.escrow.fund_bounty(&s.funder1, &id, &6_000);
    s.escrow.fund_bounty(&s.funder2, &id, &4_000);
    s.escrow.submit_work(&s.solver, &id);
    s.escrow.oracle_verify(&s.oracle, &id, &false);
    assert_eq!(s.escrow.get_bounty(&id).status, BountyStatus::Refunded);
    assert_eq!(token::Client::new(&s.env, &s.token).balance(&s.funder1), 100_000);
    assert_eq!(token::Client::new(&s.env, &s.token).balance(&s.funder2), 100_000);
}

#[test]
#[should_panic]
fn test_oracle_verify_wrong_caller_panics() {
    let s = Setup::new();
    let id = s.make_bounty();
    s.escrow.fund_bounty(&s.funder1, &id, &5_000);
    s.escrow.submit_work(&s.solver, &id);
    let rogue = Address::generate(&s.env);
    s.escrow.oracle_verify(&rogue, &id, &true);
}

#[test]
#[should_panic]
fn test_oracle_verify_wrong_status_panics() {
    let s = Setup::new();
    let id = s.make_bounty(); // still Open
    s.escrow.oracle_verify(&s.oracle, &id, &true);
}

// ---------------------------------------------------------------------------
// dispute
// ---------------------------------------------------------------------------

#[test]
fn test_dispute_by_creator_transitions_to_disputed() {
    let s = Setup::new();
    let id = s.make_bounty();
    s.escrow.fund_bounty(&s.funder1, &id, &5_000);
    s.escrow.submit_work(&s.solver, &id);
    s.escrow.dispute(&s.creator, &id);
    assert_eq!(s.escrow.get_bounty(&id).status, BountyStatus::Disputed);
}

#[test]
fn test_dispute_by_funder_ok() {
    let s = Setup::new();
    let id = s.make_bounty();
    s.escrow.fund_bounty(&s.funder1, &id, &5_000);
    s.escrow.submit_work(&s.solver, &id);
    s.escrow.dispute(&s.funder1, &id);
    assert_eq!(s.escrow.get_bounty(&id).status, BountyStatus::Disputed);
}

#[test]
#[should_panic]
fn test_dispute_by_non_participant_panics() {
    let s = Setup::new();
    let id = s.make_bounty();
    s.escrow.fund_bounty(&s.funder1, &id, &5_000);
    s.escrow.submit_work(&s.solver, &id);
    let rogue = Address::generate(&s.env);
    s.escrow.dispute(&rogue, &id);
}

#[test]
#[should_panic]
fn test_dispute_wrong_status_panics() {
    let s = Setup::new();
    let id = s.make_bounty(); // Open, not UnderReview
    s.escrow.dispute(&s.creator, &id);
}

// ---------------------------------------------------------------------------
// arbiter_vote
// ---------------------------------------------------------------------------

#[test]
fn test_arbiter_vote_approve_2_of_3_pays_solver() {
    let s = Setup::new();
    let id = s.make_bounty();
    s.escrow.fund_bounty(&s.funder1, &id, &8_000);
    s.escrow.submit_work(&s.solver, &id);
    s.escrow.dispute(&s.creator, &id);
    s.escrow.arbiter_vote(&s.arbiter1, &id, &true);
    s.escrow.arbiter_vote(&s.arbiter2, &id, &true); // threshold reached
    assert_eq!(s.escrow.get_bounty(&id).status, BountyStatus::Completed);
    assert_eq!(token::Client::new(&s.env, &s.token).balance(&s.solver), 8_000);
}

#[test]
fn test_arbiter_vote_reject_2_of_3_refunds_funders() {
    let s = Setup::new();
    let id = s.make_bounty();
    s.escrow.fund_bounty(&s.funder1, &id, &5_000);
    s.escrow.submit_work(&s.solver, &id);
    s.escrow.dispute(&s.creator, &id);
    s.escrow.arbiter_vote(&s.arbiter1, &id, &false);
    s.escrow.arbiter_vote(&s.arbiter2, &id, &false);
    assert_eq!(s.escrow.get_bounty(&id).status, BountyStatus::Refunded);
    assert_eq!(token::Client::new(&s.env, &s.token).balance(&s.funder1), 100_000);
}

#[test]
fn test_arbiter_vote_split_does_not_resolve_early() {
    let s = Setup::new();
    let id = s.make_bounty();
    s.escrow.fund_bounty(&s.funder1, &id, &5_000);
    s.escrow.submit_work(&s.solver, &id);
    s.escrow.dispute(&s.creator, &id);
    s.escrow.arbiter_vote(&s.arbiter1, &id, &true);
    s.escrow.arbiter_vote(&s.arbiter2, &id, &false);
    // 1-1 split, threshold=2 not reached for either side.
    assert_eq!(s.escrow.get_bounty(&id).status, BountyStatus::Disputed);
}

#[test]
#[should_panic]
fn test_arbiter_vote_duplicate_panics() {
    let s = Setup::new();
    let id = s.make_bounty();
    s.escrow.fund_bounty(&s.funder1, &id, &5_000);
    s.escrow.submit_work(&s.solver, &id);
    s.escrow.dispute(&s.creator, &id);
    s.escrow.arbiter_vote(&s.arbiter1, &id, &true);
    s.escrow.arbiter_vote(&s.arbiter1, &id, &true); // duplicate
}

#[test]
#[should_panic]
fn test_arbiter_vote_non_arbiter_panics() {
    let s = Setup::new();
    let id = s.make_bounty();
    s.escrow.fund_bounty(&s.funder1, &id, &5_000);
    s.escrow.submit_work(&s.solver, &id);
    s.escrow.dispute(&s.creator, &id);
    let rogue = Address::generate(&s.env);
    s.escrow.arbiter_vote(&rogue, &id, &true);
}

#[test]
#[should_panic]
fn test_arbiter_vote_wrong_status_panics() {
    let s = Setup::new();
    let id = s.make_bounty(); // Open, not Disputed
    s.escrow.arbiter_vote(&s.arbiter1, &id, &true);
}

// ---------------------------------------------------------------------------
// reclaim_expired
// ---------------------------------------------------------------------------

#[test]
fn test_reclaim_expired_after_deadline() {
    let s = Setup::new();
    let id = s.make_bounty();
    s.escrow.fund_bounty(&s.funder1, &id, &7_000);

    // Advance past deadline.
    s.env.ledger().set(LedgerInfo {
        timestamp: s.env.ledger().timestamp() + 7200,
        protocol_version: 22,
        sequence_number: s.env.ledger().sequence() + 1,
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: 1,
        min_persistent_entry_ttl: 1,
        max_entry_ttl: 6_312_000,
    });

    s.escrow.reclaim_expired(&s.funder1, &id);
    assert_eq!(token::Client::new(&s.env, &s.token).balance(&s.funder1), 100_000);
    assert_eq!(s.escrow.contribution_of(&id, &s.funder1), 0);
}

#[test]
#[should_panic]
fn test_reclaim_expired_before_deadline_panics() {
    let s = Setup::new();
    let id = s.make_bounty();
    s.escrow.fund_bounty(&s.funder1, &id, &5_000);
    s.escrow.reclaim_expired(&s.funder1, &id); // deadline not passed
}

#[test]
#[should_panic]
fn test_reclaim_expired_wrong_status_panics() {
    let s = Setup::new();
    let id = s.make_bounty();
    s.escrow.fund_bounty(&s.funder1, &id, &5_000);
    s.escrow.submit_work(&s.solver, &id); // now UnderReview

    s.env.ledger().set(LedgerInfo {
        timestamp: s.env.ledger().timestamp() + 7200,
        protocol_version: 22,
        sequence_number: s.env.ledger().sequence() + 1,
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: 1,
        min_persistent_entry_ttl: 1,
        max_entry_ttl: 6_312_000,
    });

    s.escrow.reclaim_expired(&s.funder1, &id);
}
