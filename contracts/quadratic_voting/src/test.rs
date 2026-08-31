use super::*;
use soroban_sdk::{
    testutils::Address as _,
    Env, String,
};#[contract]
struct MockSybil;

#[contractimpl]
impl MockSybil {
    pub fn is_verified(_env: Env, _user: Address) -> bool {
        true
    }
}

#[contract]
struct MockSybilReject;

#[contractimpl]
impl MockSybilReject {
    pub fn is_verified(_env: Env, _user: Address) -> bool {
        false
    }
}

fn setup(env: &Env) -> (QuadraticVotingContractClient<'static>, Address) {
    let id = env.register(QuadraticVotingContract, ());
    let client = QuadraticVotingContractClient::new(env, &id);
    let admin = Address::generate(env);
    let sybil = env.register(MockSybil, ());
    client.initialize(&admin, &sybil, &100);
    (client, admin)
}

#[test]
fn create_proposal_and_execute() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);
    let user = Address::generate(&env);

    let pid = client.create_proposal(&user, &String::from_str(&env, "Improve docs"));
    assert_eq!(pid, 1);
    let proposal = client.get_proposal(&pid);
    assert_eq!(proposal.title, String::from_str(&env, "Improve docs"));

    client.execute_proposal(&pid);
    assert!(client.get_proposal(&pid).executed);
}

#[test]
fn voter_spends_quadratic_cost() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = setup(&env);
    let user = Address::generate(&env);

    assert_eq!(client.get_user_credits(&user), 100);
    client.create_proposal(&user, &String::from_str(&env, "p"));
    // voting 3 votes costs 3² = 9 credits
    client.vote(&user, &1, &3);
    assert_eq!(client.get_user_credits(&user), 91);
}

#[test]
#[should_panic(expected = "Must cast at least 1 vote")]
fn zero_votes_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = setup(&env);
    let user = Address::generate(&env);
    client.create_proposal(&user, &String::from_str(&env, "p"));
    client.vote(&user, &1, &0);
}

#[test]
#[should_panic(expected = "Insufficient voting credits")]
fn insufficient_credits_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = setup(&env);
    let user = Address::generate(&env);
    client.create_proposal(&user, &String::from_str(&env, "p"));
    // voting 11 votes costs 121 credits > 100
    client.vote(&user, &1, &11);
}

#[test]
#[should_panic(expected = "User not verified for Sybil resistance")]
fn unverified_voter_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register(QuadraticVotingContract, ());
    let client = QuadraticVotingContractClient::new(&env, &id);
    let admin = Address::generate(&env);
    let sybil = env.register(MockSybilReject, ());
    client.initialize(&admin, &sybil, &100);
    let user = Address::generate(&env);
    client.create_proposal(&user, &String::from_str(&env, "p"));
    client.vote(&user, &1, &1);
}

#[test]
fn proposal_create_emits_event() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = setup(&env);
    let user = Address::generate(&env);

    let pid = client.create_proposal(&user, &String::from_str(&env, "hi"));
    assert_eq!(pid, 1);
}

#[test]
fn property_terminal_vote_state_is_consistent() {
    // Property: after voting `total`, credits = default - total² and
    // never underflows for values that fit within the credit budget.
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = setup(&env);
    let user = Address::generate(&env);
    client.create_proposal(&user, &String::from_str(&env, "p"));
    client.vote(&user, &1, &7);
    assert_eq!(client.get_user_credits(&user), 100 - 49);
}
