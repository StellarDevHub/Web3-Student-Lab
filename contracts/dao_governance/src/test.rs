use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    Env, String,
};

fn setup() -> (Env, DaoGovernanceClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register(DaoGovernance, ());
    let client = DaoGovernanceClient::new(&env, &id);
    let admin = Address::generate(&env);
    client.initialize(&admin);
    (env, client, admin)
}

#[test]
fn quadratic_cost_deducted_correctly() {
    let (env, client, admin) = setup();
    let voter = Address::generate(&env);
    client.grant_credits(&voter, &100u128);

    let pid = client.create_proposal(
        &admin,
        &String::from_str(&env, "Test"),
        &String::from_str(&env, "Desc"),
        &3600,
    );

    // 3 votes → cost = 9
    client.vote(&voter, &pid, &3i64);
    assert_eq!(client.credits_of(&voter), 91);

    let p = client.get_proposal(&pid).unwrap();
    assert_eq!(p.tally, 3);
    assert_eq!(p.credits_spent, 9);
}

#[test]
fn proposal_passes_when_tally_positive() {
    let (env, client, admin) = setup();
    let voter = Address::generate(&env);
    client.grant_credits(&voter, &1_000u128);

    let pid = client.create_proposal(
        &admin,
        &String::from_str(&env, "Upgrade"),
        &String::from_str(&env, "Details"),
        &100,
    );
    client.vote(&voter, &pid, &5i64);

    env.ledger().with_mut(|l| l.timestamp += 200);
    client.finalize(&pid);

    assert_eq!(
        client.get_proposal(&pid).unwrap().status,
        ProposalStatus::Passed
    );
}

#[test]
fn proposal_fails_when_tally_non_positive() {
    let (env, client, admin) = setup();
    let voter = Address::generate(&env);
    client.grant_credits(&voter, &1_000u128);

    let pid = client.create_proposal(
        &admin,
        &String::from_str(&env, "Bad idea"),
        &String::from_str(&env, "No"),
        &100,
    );
    client.vote(&voter, &pid, &-4i64);

    env.ledger().with_mut(|l| l.timestamp += 200);
    client.finalize(&pid);

    assert_eq!(
        client.get_proposal(&pid).unwrap().status,
        ProposalStatus::Failed
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #7)")]
fn cannot_vote_twice() {
    let (env, client, admin) = setup();
    let voter = Address::generate(&env);
    client.grant_credits(&voter, &1_000u128);

    let pid = client.create_proposal(
        &admin,
        &String::from_str(&env, "D"),
        &String::from_str(&env, "D"),
        &3600,
    );
    client.vote(&voter, &pid, &1i64);
    client.vote(&voter, &pid, &1i64); // panic
}

#[test]
#[should_panic(expected = "Error(Contract, #8)")]
fn insufficient_credits_rejected() {
    let (env, client, admin) = setup();
    let voter = Address::generate(&env);
    client.grant_credits(&voter, &3u128); // only 3 credits

    let pid = client.create_proposal(
        &admin,
        &String::from_str(&env, "Big"),
        &String::from_str(&env, "Big"),
        &3600,
    );
    client.vote(&voter, &pid, &5i64); // cost = 25 > 3 → panic
}

// ── Additional tests ──────────────────────────────────────────────────────────

/// Proposal with zero duration should panic with InvalidDeadline (#10).
#[test]
#[should_panic(expected = "Error(Contract, #10)")]
fn zero_duration_proposal_rejected() {
    let (env, client, admin) = setup();
    // duration = 0 → InvalidDeadline
    client.create_proposal(
        &admin,
        &String::from_str(&env, "ZeroDur"),
        &String::from_str(&env, "Should fail"),
        &0,
    );
}

/// execute() only works once a proposal has status Passed;
/// calling it on an Active proposal must panic with ProposalClosed (#5).
#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn execute_on_active_proposal_rejected() {
    let (env, client, admin) = setup();

    let pid = client.create_proposal(
        &admin,
        &String::from_str(&env, "Active"),
        &String::from_str(&env, "Still active"),
        &3600,
    );
    // Attempt to execute while still Active — must panic
    client.execute(&admin, &pid);
}

/// execute() on a Failed proposal must also panic with ProposalClosed (#5).
#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn execute_on_failed_proposal_rejected() {
    let (env, client, admin) = setup();
    let voter = Address::generate(&env);
    client.grant_credits(&voter, &1_000u128);

    let pid = client.create_proposal(
        &admin,
        &String::from_str(&env, "Fails"),
        &String::from_str(&env, "Negative tally"),
        &100,
    );
    client.vote(&voter, &pid, &-3i64);
    env.ledger().with_mut(|l| l.timestamp += 200);
    client.finalize(&pid);

    assert_eq!(
        client.get_proposal(&pid).unwrap().status,
        ProposalStatus::Failed
    );
    // Attempt to execute a Failed proposal — must panic
    client.execute(&admin, &pid);
}

/// Full lifecycle: create → vote (multiple voters) → finalize → execute.
#[test]
fn execute_passed_proposal_succeeds() {
    let (env, client, admin) = setup();
    let voter1 = Address::generate(&env);
    let voter2 = Address::generate(&env);
    client.grant_credits(&voter1, &500u128);
    client.grant_credits(&voter2, &500u128);

    let pid = client.create_proposal(
        &admin,
        &String::from_str(&env, "Upgrade"),
        &String::from_str(&env, "Details"),
        &100,
    );
    client.vote(&voter1, &pid, &4i64); // cost = 16
    client.vote(&voter2, &pid, &3i64); // cost = 9

    env.ledger().with_mut(|l| l.timestamp += 200);
    client.finalize(&pid);

    assert_eq!(
        client.get_proposal(&pid).unwrap().status,
        ProposalStatus::Passed
    );

    client.execute(&admin, &pid);

    assert_eq!(
        client.get_proposal(&pid).unwrap().status,
        ProposalStatus::Executed
    );
}

/// Quorum simulation: multiple voters cast votes; final tally aggregates correctly.
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
        client.grant_credits(addr, &1_000u128);
    }

    let pid = client.create_proposal(
        &admin,
        &String::from_str(&env, "Quorum test"),
        &String::from_str(&env, "Many voters"),
        &500,
    );

    // 3 supporters each cast 2 votes (+2 tally each, cost = 4 each)
    for addr in &supporters {
        client.vote(addr, &pid, &2i64);
    }
    // 2 opponents each cast -1 vote (−1 tally each, cost = 1 each)
    for addr in &opponents {
        client.vote(addr, &pid, &-1i64);
    }

    let p = client.get_proposal(&pid).unwrap();
    // tally = 3×2 − 2×1 = 4
    assert_eq!(p.tally, 4);
    // credits_spent = 3×4 + 2×1 = 14
    assert_eq!(p.credits_spent, 14);

    env.ledger().with_mut(|l| l.timestamp += 600);
    client.finalize(&pid);
    assert_eq!(
        client.get_proposal(&pid).unwrap().status,
        ProposalStatus::Passed
    );
}

/// finalize() before deadline must panic with VotingDeadlineLive (#6).
#[test]
#[should_panic(expected = "Error(Contract, #6)")]
fn finalize_before_deadline_panics() {
    let (env, client, admin) = setup();

    let pid = client.create_proposal(
        &admin,
        &String::from_str(&env, "TooEarly"),
        &String::from_str(&env, "Not yet"),
        &3600,
    );
    // Ledger timestamp is still 0, deadline is 3600 — finalize must panic
    client.finalize(&pid);
}

/// get_proposal for an unknown ID returns None (does not panic).
#[test]
fn get_proposal_returns_none_for_unknown_id() {
    let (_env, client, _admin) = setup();
    assert!(client.get_proposal(&999u64).is_none());
}

/// vote_of returns the correct vote after casting.
#[test]
fn vote_of_returns_correct_value() {
    let (env, client, admin) = setup();
    let voter = Address::generate(&env);
    client.grant_credits(&voter, &1_000u128);

    let pid = client.create_proposal(
        &admin,
        &String::from_str(&env, "VoteOf"),
        &String::from_str(&env, "Check vote stored"),
        &3600,
    );
    client.vote(&voter, &pid, &-2i64);

    let stored = client.vote_of(&pid, &voter);
    assert_eq!(stored, Some(-2i64));
}

/// vote_of returns None when the voter has not yet cast a vote.
#[test]
fn vote_of_returns_none_before_voting() {
    let (env, client, admin) = setup();
    let non_voter = Address::generate(&env);

    let pid = client.create_proposal(
        &admin,
        &String::from_str(&env, "NoVote"),
        &String::from_str(&env, "Unvoted"),
        &3600,
    );
    assert!(client.vote_of(&pid, &non_voter).is_none());
}

/// Credits accumulate correctly when grant_credits is called multiple times.
#[test]
fn grant_credits_accumulates() {
    let (env, client, _admin) = setup();
    let member = Address::generate(&env);

    client.grant_credits(&member, &100u128);
    client.grant_credits(&member, &50u128);
    assert_eq!(client.credits_of(&member), 150u128);
}

/// After voting the voter's credit balance decreases by votes².
#[test]
fn credits_decrease_by_quadratic_cost_on_negative_vote() {
    let (env, client, admin) = setup();
    let voter = Address::generate(&env);
    client.grant_credits(&voter, &200u128);

    let pid = client.create_proposal(
        &admin,
        &String::from_str(&env, "Neg"),
        &String::from_str(&env, "Against"),
        &3600,
    );
    // −4 votes → cost = 16
    client.vote(&voter, &pid, &-4i64);
    assert_eq!(client.credits_of(&voter), 184u128);
    let p = client.get_proposal(&pid).unwrap();
    assert_eq!(p.tally, -4);
    assert_eq!(p.credits_spent, 16);
}
