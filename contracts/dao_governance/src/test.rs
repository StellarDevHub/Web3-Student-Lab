use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    Env, String,
};

const DAY: u64 = 86_400;

fn setup() -> (Env, DaoGovernanceClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register(DaoGovernance, ());
    let client = DaoGovernanceClient::new(&env, &id);
    let admin = Address::generate(&env);
    client.initialize(&admin);
    (env, client, admin)
}

fn advance(env: &Env, secs: u64) {
    env.ledger().with_mut(|l| l.timestamp += secs);
}

/// Creates a proposal with the minimum voting period (1 day).
fn new_proposal(env: &Env, client: &DaoGovernanceClient<'_>, creator: &Address) -> u64 {
    client.create_proposal(
        creator,
        &String::from_str(env, "P"),
        &String::from_str(env, "D"),
        &DAY,
    )
}

/// Builds a proposal that passes: one voter holds 1000 credits (so quorum is
/// 200), votes +20 (cost 400 >= 200), and the proposal is finalized after its
/// deadline. Returns the proposal id and the voter.
fn passing_proposal(
    env: &Env,
    client: &DaoGovernanceClient<'_>,
    admin: &Address,
) -> (u64, Address) {
    let voter = Address::generate(env);
    client.grant_credits(&voter, &1_000u128);
    let pid = new_proposal(env, client, admin);
    client.vote(&voter, &pid, &20i64);
    advance(env, DAY + 1);
    client.finalize(&pid);
    (pid, voter)
}

#[test]
fn quadratic_cost_deducted_correctly() {
    let (env, client, admin) = setup();
    let voter = Address::generate(&env);
    client.grant_credits(&voter, &100u128);

    let pid = new_proposal(&env, &client, &admin);

    // 3 votes -> cost = 9
    client.vote(&voter, &pid, &3i64);
    assert_eq!(client.credits_of(&voter), 91);

    let p = client.get_proposal(&pid).unwrap();
    assert_eq!(p.tally, 3);
    assert_eq!(p.credits_spent, 9);
}

#[test]
fn proposal_passes_when_quorum_met_and_tally_positive() {
    let (env, client, admin) = setup();
    let (pid, _voter) = passing_proposal(&env, &client, &admin);

    let p = client.get_proposal(&pid).unwrap();
    assert_eq!(p.status, ProposalStatus::Passed);
    // eta = finalize time + 48h
    assert_eq!(p.eta, env.ledger().timestamp() + TIMELOCK_DELAY);
}

#[test]
fn proposal_fails_when_tally_non_positive() {
    let (env, client, admin) = setup();
    let voter = Address::generate(&env);
    client.grant_credits(&voter, &1_000u128);

    let pid = new_proposal(&env, &client, &admin);
    client.vote(&voter, &pid, &-20i64); // cost 400 >= quorum 200, but tally < 0

    advance(&env, DAY + 1);
    client.finalize(&pid);

    let p = client.get_proposal(&pid).unwrap();
    assert_eq!(p.status, ProposalStatus::Failed);
    assert_eq!(p.eta, 0);
}

#[test]
fn quorum_failure_marks_proposal_failed() {
    let (env, client, admin) = setup();
    let a = Address::generate(&env);
    let b = Address::generate(&env);
    client.grant_credits(&a, &1_000u128);
    client.grant_credits(&b, &1_000u128); // total supply 2000 -> quorum 400

    let pid = new_proposal(&env, &client, &admin);
    client.vote(&a, &pid, &5i64); // cost 25 < 400, tally 5 > 0

    advance(&env, DAY + 1);
    client.finalize(&pid);

    let p = client.get_proposal(&pid).unwrap();
    assert_eq!(p.tally, 5);
    assert_eq!(p.credits_spent, 25);
    assert_eq!(p.quorum_required, 400);
    assert_eq!(p.status, ProposalStatus::Failed);
}

#[test]
#[should_panic(expected = "Error(Contract, #407)")]
fn cannot_vote_twice() {
    let (env, client, admin) = setup();
    let voter = Address::generate(&env);
    client.grant_credits(&voter, &1_000u128);

    let pid = new_proposal(&env, &client, &admin);
    client.vote(&voter, &pid, &1i64);
    client.vote(&voter, &pid, &1i64); // panic
}

#[test]
#[should_panic(expected = "Error(Contract, #408)")]
fn insufficient_credits_rejected() {
    let (env, client, admin) = setup();
    let voter = Address::generate(&env);
    client.grant_credits(&voter, &3u128); // only 3 credits

    let pid = new_proposal(&env, &client, &admin);
    client.vote(&voter, &pid, &5i64); // cost = 25 > 3 -> panic
}

// ── Proposal threshold ────────────────────────────────────────────────────────

#[test]
#[should_panic(expected = "Error(Contract, #416)")]
fn below_threshold_creator_rejected() {
    let (env, client, _admin) = setup();
    client.set_proposal_threshold(&500u128);
    assert_eq!(client.get_proposal_threshold(), 500);

    let creator = Address::generate(&env);
    client.grant_credits(&creator, &499u128);
    new_proposal(&env, &client, &creator);
}

#[test]
fn threshold_met_allows_creation() {
    let (env, client, _admin) = setup();
    client.set_proposal_threshold(&500u128);

    let creator = Address::generate(&env);
    client.grant_credits(&creator, &500u128);
    let pid = new_proposal(&env, &client, &creator);
    assert_eq!(client.get_proposal(&pid).unwrap().creator, creator);
}

// ── Voting period bounds ──────────────────────────────────────────────────────

#[test]
fn zero_duration_uses_default_seven_day_period() {
    let (env, client, admin) = setup();
    assert_eq!(client.get_voting_period(), 604_800);
    assert_eq!(DEFAULT_VOTING_PERIOD, 604_800);

    let pid = client.create_proposal(
        &admin,
        &String::from_str(&env, "Default"),
        &String::from_str(&env, "Default period"),
        &0,
    );
    let p = client.get_proposal(&pid).unwrap();
    assert_eq!(p.deadline, env.ledger().timestamp() + 604_800);
}

#[test]
fn period_bounds_are_inclusive() {
    let (env, client, admin) = setup();
    let min_id = client.create_proposal(
        &admin,
        &String::from_str(&env, "Min"),
        &String::from_str(&env, "Min"),
        &MIN_VOTING_PERIOD,
    );
    let max_id = client.create_proposal(
        &admin,
        &String::from_str(&env, "Max"),
        &String::from_str(&env, "Max"),
        &MAX_VOTING_PERIOD,
    );
    assert_eq!(
        client.get_proposal(&min_id).unwrap().deadline,
        MIN_VOTING_PERIOD
    );
    assert_eq!(
        client.get_proposal(&max_id).unwrap().deadline,
        MAX_VOTING_PERIOD
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #417)")]
fn duration_below_min_rejected() {
    let (env, client, admin) = setup();
    new_proposal_with(&env, &client, &admin, MIN_VOTING_PERIOD - 1);
}

#[test]
#[should_panic(expected = "Error(Contract, #417)")]
fn duration_above_max_rejected() {
    let (env, client, admin) = setup();
    new_proposal_with(&env, &client, &admin, MAX_VOTING_PERIOD + 1);
}

#[test]
fn set_voting_period_changes_default() {
    let (env, client, admin) = setup();
    client.set_voting_period(&(2 * DAY));
    assert_eq!(client.get_voting_period(), 2 * DAY);

    let pid = client.create_proposal(
        &admin,
        &String::from_str(&env, "Two days"),
        &String::from_str(&env, "Two days"),
        &0,
    );
    assert_eq!(client.get_proposal(&pid).unwrap().deadline, 2 * DAY);
}

#[test]
#[should_panic(expected = "Error(Contract, #417)")]
fn set_voting_period_out_of_bounds_rejected() {
    let (_env, client, _admin) = setup();
    client.set_voting_period(&(DAY - 1));
}

fn new_proposal_with(env: &Env, client: &DaoGovernanceClient<'_>, creator: &Address, d: u64) {
    client.create_proposal(
        creator,
        &String::from_str(env, "B"),
        &String::from_str(env, "B"),
        &d,
    );
}

// ── Timelock ──────────────────────────────────────────────────────────────────

#[test]
#[should_panic(expected = "Error(Contract, #418)")]
fn timelock_blocks_early_execute() {
    let (env, client, admin) = setup();
    let (pid, _voter) = passing_proposal(&env, &client, &admin);
    assert_eq!(
        client.get_proposal(&pid).unwrap().status,
        ProposalStatus::Passed
    );
    // Only ~1 day has passed since queueing; 48h timelock not elapsed.
    client.execute(&admin, &pid);
}

#[test]
fn execute_after_timelock_succeeds() {
    let (env, client, admin) = setup();
    let (pid, _voter) = passing_proposal(&env, &client, &admin);

    advance(&env, TIMELOCK_DELAY);
    client.execute(&admin, &pid);

    assert_eq!(
        client.get_proposal(&pid).unwrap().status,
        ProposalStatus::Executed
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #405)")]
fn execute_on_active_proposal_rejected() {
    let (env, client, admin) = setup();
    let pid = new_proposal(&env, &client, &admin);
    client.execute(&admin, &pid);
}

#[test]
#[should_panic(expected = "Error(Contract, #405)")]
fn execute_on_failed_proposal_rejected() {
    let (env, client, admin) = setup();
    let voter = Address::generate(&env);
    client.grant_credits(&voter, &1_000u128);

    let pid = new_proposal(&env, &client, &admin);
    client.vote(&voter, &pid, &-3i64);
    advance(&env, DAY + 1);
    client.finalize(&pid);

    assert_eq!(
        client.get_proposal(&pid).unwrap().status,
        ProposalStatus::Failed
    );
    client.execute(&admin, &pid);
}

// ── Snapshot / flash-loan protection ──────────────────────────────────────────

#[test]
#[should_panic(expected = "Error(Contract, #408)")]
fn credits_granted_after_creation_add_no_voting_power() {
    let (env, client, admin) = setup();
    let voter = Address::generate(&env);
    client.grant_credits(&voter, &10u128);

    let pid = new_proposal(&env, &client, &admin);

    // Flash-loan style inflation after creation.
    client.grant_credits(&voter, &1_000u128);

    // Balance is 1010, but only the 10 pre-creation credits are spendable here.
    // cost = 25 > 10 -> panic
    client.vote(&voter, &pid, &5i64);
}

#[test]
fn pre_creation_credits_remain_spendable_after_late_grant() {
    let (env, client, admin) = setup();
    let voter = Address::generate(&env);
    client.grant_credits(&voter, &10u128);

    let pid = new_proposal(&env, &client, &admin);
    client.grant_credits(&voter, &1_000u128);

    client.vote(&voter, &pid, &3i64); // cost 9 <= 10
    assert_eq!(client.credits_of(&voter), 1_001);
    assert_eq!(client.get_proposal(&pid).unwrap().credits_spent, 9);
}

#[test]
fn total_granted_tracks_circulating_supply() {
    let (env, client, _admin) = setup();
    let a = Address::generate(&env);
    let b = Address::generate(&env);
    client.grant_credits(&a, &300u128);
    client.grant_credits(&b, &700u128);
    assert_eq!(client.total_granted(), 1_000);
}

// ── Treasury / ragequit ───────────────────────────────────────────────────────

#[test]
fn test_ragequit_dissenting_voter_burns_shares_and_receives_pro_rata() {
    let (env, client, admin) = setup();
    let voter_no = Address::generate(&env);
    let voter_yes = Address::generate(&env);

    client.grant_credits(&voter_no, &1_000u128);
    client.grant_credits(&voter_yes, &1_000u128); // supply 2000 -> quorum 400

    // 1000 shares total (400 for voter_no, 600 for voter_yes), 50,000 reserves
    client.grant_shares(&voter_no, &400u128);
    client.grant_shares(&voter_yes, &600u128);
    client.deposit_treasury(&admin, &50_000u128);

    let pid = new_proposal(&env, &client, &admin);

    client.vote(&voter_no, &pid, &-2i64); // cost 4
    client.vote(&voter_yes, &pid, &20i64); // cost 400; total spent 404 >= 400

    advance(&env, DAY + 1);
    client.finalize(&pid);
    assert_eq!(
        client.get_proposal(&pid).unwrap().status,
        ProposalStatus::Passed
    );

    // Expected payout: 400 * 50,000 / 1000 = 20,000
    let payout = client.ragequit(&voter_no, &pid, &400u128);
    assert_eq!(payout, 20_000u128);

    assert_eq!(client.treasury_shares_of(&voter_no), 0);
    let treasury = client.get_treasury_state();
    assert_eq!(treasury.total_shares, 600);
    assert_eq!(treasury.total_reserves, 30_000);
}

#[test]
#[should_panic(expected = "Error(Contract, #413)")]
fn test_ragequit_prohibits_yes_voters() {
    let (env, client, admin) = setup();
    let (pid, voter_yes) = passing_proposal(&env, &client, &admin);
    client.grant_shares(&voter_yes, &500u128);
    client.deposit_treasury(&admin, &50_000u128);

    // voter_yes voted +20 (Yes): must be rejected with YesVoterCannotRagequit (413)
    client.ragequit(&voter_yes, &pid, &100u128);
}

// ── SEP-0010 nonce ────────────────────────────────────────────────────────────

#[test]
fn test_vote_sep0010_and_replay_rejection() {
    let (env, client, admin) = setup();
    let voter = Address::generate(&env);
    client.grant_credits(&voter, &100u128);

    let pid = new_proposal(&env, &client, &admin);

    let nonce = 9999u64;
    let domain = String::from_str(&env, "governance.studentlab.stellar.org");

    client.vote_sep0010(&voter, &pid, &3i64, &nonce, &domain);

    let prop = client.get_proposal(&pid).unwrap();
    assert_eq!(prop.tally, 3);
    assert_eq!(client.credits_of(&voter), 100 - 9);

    // Replay with same nonce is rejected
    let res = client.try_vote_sep0010(&voter, &pid, &1i64, &nonce, &domain);
    assert!(res.is_err());
}

// ── Lifecycle, tally, and views ───────────────────────────────────────────────

#[test]
fn execute_passed_proposal_full_lifecycle() {
    let (env, client, admin) = setup();
    let voter1 = Address::generate(&env);
    let voter2 = Address::generate(&env);
    client.grant_credits(&voter1, &500u128);
    client.grant_credits(&voter2, &500u128); // supply 1000 -> quorum 200

    let pid = new_proposal(&env, &client, &admin);
    client.vote(&voter1, &pid, &10i64); // cost 100
    client.vote(&voter2, &pid, &10i64); // cost 100; spent 200 >= 200

    advance(&env, DAY + 1);
    client.finalize(&pid);
    assert_eq!(
        client.get_proposal(&pid).unwrap().status,
        ProposalStatus::Passed
    );

    advance(&env, TIMELOCK_DELAY);
    client.execute(&admin, &pid);
    assert_eq!(
        client.get_proposal(&pid).unwrap().status,
        ProposalStatus::Executed
    );
}

#[test]
fn multiple_voter_tally_aggregates_correctly() {
    let (env, client, admin) = setup();
    let supporters = [
        Address::generate(&env),
        Address::generate(&env),
        Address::generate(&env),
    ];
    let opponents = [Address::generate(&env), Address::generate(&env)];

    for addr in supporters.iter().chain(opponents.iter()) {
        client.grant_credits(addr, &1_000u128); // supply 5000 -> quorum 1000
    }

    let pid = new_proposal(&env, &client, &admin);

    // 3 supporters x (+20, cost 400) = tally +60, spent 1200
    for addr in &supporters {
        client.vote(addr, &pid, &20i64);
    }
    // 2 opponents x (-1, cost 1) = tally -2, spent 2
    for addr in &opponents {
        client.vote(addr, &pid, &-1i64);
    }

    let p = client.get_proposal(&pid).unwrap();
    assert_eq!(p.tally, 58);
    assert_eq!(p.credits_spent, 1_202);

    advance(&env, DAY + 1);
    client.finalize(&pid);
    assert_eq!(
        client.get_proposal(&pid).unwrap().status,
        ProposalStatus::Passed
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #406)")]
fn finalize_before_deadline_panics() {
    let (env, client, admin) = setup();
    let pid = new_proposal(&env, &client, &admin);
    // Timestamp is still 0, deadline is 1 day - finalize must panic
    client.finalize(&pid);
}

#[test]
fn get_proposal_returns_none_for_unknown_id() {
    let (_env, client, _admin) = setup();
    assert!(client.get_proposal(&999u64).is_none());
}

#[test]
fn vote_of_returns_correct_value() {
    let (env, client, admin) = setup();
    let voter = Address::generate(&env);
    client.grant_credits(&voter, &1_000u128);

    let pid = new_proposal(&env, &client, &admin);
    client.vote(&voter, &pid, &-2i64);

    assert_eq!(client.vote_of(&pid, &voter), Some(-2i64));
}

#[test]
fn vote_of_returns_none_before_voting() {
    let (env, client, admin) = setup();
    let non_voter = Address::generate(&env);

    let pid = new_proposal(&env, &client, &admin);
    assert!(client.vote_of(&pid, &non_voter).is_none());
}

#[test]
fn grant_credits_accumulates() {
    let (env, client, _admin) = setup();
    let member = Address::generate(&env);

    client.grant_credits(&member, &100u128);
    client.grant_credits(&member, &50u128);
    assert_eq!(client.credits_of(&member), 150u128);
}

#[test]
fn credits_decrease_by_quadratic_cost_on_negative_vote() {
    let (env, client, admin) = setup();
    let voter = Address::generate(&env);
    client.grant_credits(&voter, &200u128);

    let pid = new_proposal(&env, &client, &admin);
    // -4 votes -> cost 16
    client.vote(&voter, &pid, &-4i64);
    assert_eq!(client.credits_of(&voter), 184u128);
    let p = client.get_proposal(&pid).unwrap();
    assert_eq!(p.tally, -4);
    assert_eq!(p.credits_spent, 16);
}
