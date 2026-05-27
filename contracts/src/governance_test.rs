#![cfg(test)]

use crate::governance::{
    ExecutableAction, GovernanceContract, GovernanceContractClient, GovernanceError,
    ProposalStatus, TransferTokenParams,
};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token, Address, Env, String,
};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

fn setup() -> (
    Env,
    Address,
    Address,
    GovernanceContractClient<'static>,
) {
    let env = Env::default();
    env.mock_all_auths();

    // Deploy a real SAC token to use as governance token.
    let token_admin = Address::generate(&env);
    let token_contract = env.register_stellar_asset_contract_v2(token_admin.clone());
    let gov_token = token_contract.address();

    let contract_id = env.register(GovernanceContract, ());
    let client = GovernanceContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);

    client.initialize(&admin, &gov_token);

    (env, admin, gov_token, client)
}

/// Mint governance tokens to an address and deposit them as credits.
fn fund_voter(
    env: &Env,
    gov_token: &Address,
    gov_contract: &Address,
    voter: &Address,
    amount: i128,
) {
    // Mint via the SAC admin (mock_all_auths covers this).
    let sac_client = token::StellarAssetClient::new(env, gov_token);
    sac_client.mint(voter, &amount);

    // Deposit into governance contract.
    let client = GovernanceContractClient::new(env, gov_contract);
    client.deposit_credits(voter, &amount);
}

fn make_title(env: &Env, s: &str) -> String {
    String::from_str(env, s)
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

#[test]
fn test_initialize_success() {
    let (_, _, _, _) = setup();
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #1)")]
fn test_initialize_already_initialized() {
    let (env, admin, gov_token, client) = setup();
    client.initialize(&admin, &gov_token);
}

// ---------------------------------------------------------------------------
// Credit management
// ---------------------------------------------------------------------------

#[test]
fn test_deposit_credits() {
    let (env, _, gov_token, client) = setup();
    let voter = Address::generate(&env);
    let sac = token::StellarAssetClient::new(&env, &gov_token);
    sac.mint(&voter, &500);

    assert_eq!(client.get_credits(&voter), 0);
    client.deposit_credits(&voter, &500);
    assert_eq!(client.get_credits(&voter), 500);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #11)")]
fn test_deposit_zero_credits() {
    let (env, _, _, client) = setup();
    let voter = Address::generate(&env);
    client.deposit_credits(&voter, &0);
}

// ---------------------------------------------------------------------------
// Proposal creation
// ---------------------------------------------------------------------------

#[test]
fn test_create_proposal_success() {
    let (env, _, gov_token, client) = setup();
    let proposer = Address::generate(&env);
    fund_voter(&env, &gov_token, &client.address, &proposer, 200);

    let id = client.create_proposal(
        &proposer,
        &make_title(&env, "Proposal Alpha"),
        &make_title(&env, "Description of Alpha"),
        &ExecutableAction::NoOp,
    );
    assert_eq!(id, 0u64);

    let p = client.get_proposal(&id);
    assert_eq!(p.id, 0u64);
    assert_eq!(p.status, ProposalStatus::Active);
    assert_eq!(p.for_votes, 0);
    assert_eq!(p.against_votes, 0);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #8)")]
fn test_create_proposal_insufficient_credits() {
    let (env, _, _, client) = setup();
    let proposer = Address::generate(&env);
    // proposer has 0 credits – below the threshold of 100.
    client.create_proposal(
        &proposer,
        &make_title(&env, "P"),
        &make_title(&env, "D"),
        &ExecutableAction::NoOp,
    );
}

// ---------------------------------------------------------------------------
// Voting – success paths
// ---------------------------------------------------------------------------

#[test]
fn test_cast_vote_for() {
    let (env, _, gov_token, client) = setup();
    let proposer = Address::generate(&env);
    let voter = Address::generate(&env);

    fund_voter(&env, &gov_token, &client.address, &proposer, 200);
    fund_voter(&env, &gov_token, &client.address, &voter, 400);

    let id = client.create_proposal(
        &proposer,
        &make_title(&env, "P"),
        &make_title(&env, "D"),
        &ExecutableAction::NoOp,
    );

    // Spend 400 credits → weight = isqrt(400) = 20.
    client.cast_vote(&voter, &id, &400, &true);

    let p = client.get_proposal(&id);
    assert_eq!(p.for_votes, 20);
    assert_eq!(p.against_votes, 0);
    assert_eq!(p.total_credits_spent, 400);
    assert_eq!(client.get_credits(&voter), 0);
}

#[test]
fn test_cast_vote_against() {
    let (env, _, gov_token, client) = setup();
    let proposer = Address::generate(&env);
    let voter = Address::generate(&env);

    fund_voter(&env, &gov_token, &client.address, &proposer, 200);
    fund_voter(&env, &gov_token, &client.address, &voter, 100);

    let id = client.create_proposal(
        &proposer,
        &make_title(&env, "P"),
        &make_title(&env, "D"),
        &ExecutableAction::NoOp,
    );

    // Spend 100 credits → weight = isqrt(100) = 10.
    client.cast_vote(&voter, &id, &100, &false);

    let p = client.get_proposal(&id);
    assert_eq!(p.for_votes, 0);
    assert_eq!(p.against_votes, 10);
}

#[test]
fn test_quadratic_voting_prevents_whale_dominance() {
    // Whale has 10 000 credits, 10 small voters have 100 each.
    // Whale weight = isqrt(10000) = 100.
    // Small voters combined = 10 * isqrt(100) = 10 * 10 = 100.
    // Outcome: tied – quadratic voting constrains whale power.
    let (env, _, gov_token, client) = setup();
    let proposer = Address::generate(&env);
    fund_voter(&env, &gov_token, &client.address, &proposer, 200);

    let id = client.create_proposal(
        &proposer,
        &make_title(&env, "P"),
        &make_title(&env, "D"),
        &ExecutableAction::NoOp,
    );

    let whale = Address::generate(&env);
    fund_voter(&env, &gov_token, &client.address, &whale, 10_000);
    client.cast_vote(&whale, &id, &10_000, &true);

    for _ in 0..10 {
        let v = Address::generate(&env);
        fund_voter(&env, &gov_token, &client.address, &v, 100);
        client.cast_vote(&v, &id, &100, &false);
    }

    let p = client.get_proposal(&id);
    assert_eq!(p.for_votes, 100);    // whale: isqrt(10000)
    assert_eq!(p.against_votes, 100); // 10 × isqrt(100)
}

// ---------------------------------------------------------------------------
// Voting – failure paths
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected = "HostError: Error(Contract, #7)")]
fn test_double_vote_rejected() {
    let (env, _, gov_token, client) = setup();
    let proposer = Address::generate(&env);
    let voter = Address::generate(&env);

    fund_voter(&env, &gov_token, &client.address, &proposer, 200);
    fund_voter(&env, &gov_token, &client.address, &voter, 400);

    let id = client.create_proposal(
        &proposer,
        &make_title(&env, "P"),
        &make_title(&env, "D"),
        &ExecutableAction::NoOp,
    );

    client.cast_vote(&voter, &id, &100, &true);
    client.cast_vote(&voter, &id, &100, &true); // should panic
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #6)")]
fn test_vote_after_deadline() {
    let (env, _, gov_token, client) = setup();
    let proposer = Address::generate(&env);
    let voter = Address::generate(&env);

    fund_voter(&env, &gov_token, &client.address, &proposer, 200);
    fund_voter(&env, &gov_token, &client.address, &voter, 100);

    env.ledger().set_timestamp(0);
    let id = client.create_proposal(
        &proposer,
        &make_title(&env, "P"),
        &make_title(&env, "D"),
        &ExecutableAction::NoOp,
    );

    // Jump past the default 7-day voting period.
    env.ledger().set_timestamp(604_801);
    client.cast_vote(&voter, &id, &100, &true);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #8)")]
fn test_vote_insufficient_credits() {
    let (env, _, gov_token, client) = setup();
    let proposer = Address::generate(&env);
    let voter = Address::generate(&env);

    fund_voter(&env, &gov_token, &client.address, &proposer, 200);
    fund_voter(&env, &gov_token, &client.address, &voter, 50);

    let id = client.create_proposal(
        &proposer,
        &make_title(&env, "P"),
        &make_title(&env, "D"),
        &ExecutableAction::NoOp,
    );

    client.cast_vote(&voter, &id, &100, &true); // only has 50
}

// ---------------------------------------------------------------------------
// Finalization
// ---------------------------------------------------------------------------

#[test]
fn test_finalize_proposal_passed() {
    let (env, _, gov_token, client) = setup();
    let proposer = Address::generate(&env);
    let voter = Address::generate(&env);

    fund_voter(&env, &gov_token, &client.address, &proposer, 200);
    fund_voter(&env, &gov_token, &client.address, &voter, 100);

    env.ledger().set_timestamp(0);
    let id = client.create_proposal(
        &proposer,
        &make_title(&env, "P"),
        &make_title(&env, "D"),
        &ExecutableAction::NoOp,
    );
    client.cast_vote(&voter, &id, &100, &true);

    env.ledger().set_timestamp(604_801);
    client.finalize_proposal(&id);

    let p = client.get_proposal(&id);
    assert_eq!(p.status, ProposalStatus::Passed);
}

#[test]
fn test_finalize_proposal_failed() {
    let (env, _, gov_token, client) = setup();
    let proposer = Address::generate(&env);
    let voter = Address::generate(&env);

    fund_voter(&env, &gov_token, &client.address, &proposer, 200);
    fund_voter(&env, &gov_token, &client.address, &voter, 100);

    env.ledger().set_timestamp(0);
    let id = client.create_proposal(
        &proposer,
        &make_title(&env, "P"),
        &make_title(&env, "D"),
        &ExecutableAction::NoOp,
    );
    client.cast_vote(&voter, &id, &100, &false);

    env.ledger().set_timestamp(604_801);
    client.finalize_proposal(&id);

    let p = client.get_proposal(&id);
    assert_eq!(p.status, ProposalStatus::Failed);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #12)")]
fn test_finalize_before_deadline() {
    let (env, _, gov_token, client) = setup();
    let proposer = Address::generate(&env);

    fund_voter(&env, &gov_token, &client.address, &proposer, 200);
    env.ledger().set_timestamp(0);

    let id = client.create_proposal(
        &proposer,
        &make_title(&env, "P"),
        &make_title(&env, "D"),
        &ExecutableAction::NoOp,
    );

    client.finalize_proposal(&id); // still active
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

#[test]
fn test_execute_proposal_token_transfer() {
    let (env, admin, gov_token, client) = setup();
    let proposer = Address::generate(&env);
    let voter = Address::generate(&env);
    let recipient = Address::generate(&env);

    fund_voter(&env, &gov_token, &client.address, &proposer, 200);
    fund_voter(&env, &gov_token, &client.address, &voter, 400);

    // Mint extra tokens directly to the governance contract (treasury funds).
    let sac = token::StellarAssetClient::new(&env, &gov_token);
    sac.mint(&client.address, &1000);

    env.ledger().set_timestamp(0);
    let action = ExecutableAction::TransferToken(TransferTokenParams {
        token: gov_token.clone(),
        recipient: recipient.clone(),
        amount: 500,
    });
    let id = client.create_proposal(
        &proposer,
        &make_title(&env, "Transfer"),
        &make_title(&env, "Send 500 tokens to recipient"),
        &action,
    );

    client.cast_vote(&voter, &id, &400, &true);

    env.ledger().set_timestamp(604_801);
    client.finalize_proposal(&id);
    client.execute_proposal(&id);

    let tok = token::Client::new(&env, &gov_token);
    assert_eq!(tok.balance(&recipient), 500);

    let p = client.get_proposal(&id);
    assert_eq!(p.status, ProposalStatus::Executed);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #9)")]
fn test_execute_failed_proposal() {
    let (env, _, gov_token, client) = setup();
    let proposer = Address::generate(&env);
    let voter = Address::generate(&env);

    fund_voter(&env, &gov_token, &client.address, &proposer, 200);
    fund_voter(&env, &gov_token, &client.address, &voter, 100);

    env.ledger().set_timestamp(0);
    let id = client.create_proposal(
        &proposer,
        &make_title(&env, "P"),
        &make_title(&env, "D"),
        &ExecutableAction::NoOp,
    );
    client.cast_vote(&voter, &id, &100, &false);

    env.ledger().set_timestamp(604_801);
    client.finalize_proposal(&id);
    client.execute_proposal(&id); // proposal failed – must panic
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

#[test]
fn test_get_vote_record() {
    let (env, _, gov_token, client) = setup();
    let proposer = Address::generate(&env);
    let voter = Address::generate(&env);

    fund_voter(&env, &gov_token, &client.address, &proposer, 200);
    fund_voter(&env, &gov_token, &client.address, &voter, 225);

    let id = client.create_proposal(
        &proposer,
        &make_title(&env, "P"),
        &make_title(&env, "D"),
        &ExecutableAction::NoOp,
    );
    client.cast_vote(&voter, &id, &225, &true);

    let record = client.get_vote(&id, &voter);
    assert_eq!(record.credits_spent, 225);
    // isqrt(225) = 15
    assert_eq!(record.vote_weight, 15);
    assert!(record.support);
}
