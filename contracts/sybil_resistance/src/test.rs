use super::*;
use soroban_sdk::{testutils::Address as _, Env};

fn setup(env: &Env) -> (SybilResistanceContractClient<'static>, Address, Address) {
    let id = env.register(SybilResistanceContract, ());
    let client = SybilResistanceContractClient::new(env, &id);
    let admin = Address::generate(env);
    let user = Address::generate(env);
    client.initialize(&admin);
    (client, admin, user)
}

#[test]
fn verify_then_check() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, user) = setup(&env);

    assert!(!client.is_verified(&user));
    client.verify_user(&user);
    assert!(client.is_verified(&user));
}

#[test]
fn revoke_removes_verification() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, user) = setup(&env);

    client.verify_user(&user);
    client.revoke_user(&user);
    assert!(!client.is_verified(&user));
}

#[test]
#[should_panic(expected = "Error(Contract, #462)")]
fn revoke_unverified_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, user) = setup(&env);
    client.revoke_user(&user);
}

#[test]
#[should_panic(expected = "Error(Contract, #460)")]
fn double_initialize_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _) = setup(&env);
    let admin2 = Address::generate(&env);
    client.initialize(&admin2);
}

#[test]
fn test_reputation_awarding_and_cap() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, user) = setup(&env);

    assert_eq!(client.get_reputation(&user), 0);

    // Award points for course completion (+500)
    client.adjust_reputation(
        &user,
        &500,
        &reputation::ReputationReason::CourseCompletion,
    );
    assert_eq!(client.get_reputation(&user), 500);

    // Award points for peer review (+200)
    client.adjust_reputation(
        &user,
        &200,
        &reputation::ReputationReason::PeerReview,
    );
    assert_eq!(client.get_reputation(&user), 700);

    // Award massive points for winning hackathon (+15000), should cap at MAX_REPUTATION_SCORE (10,000)
    client.adjust_reputation(
        &user,
        &15000,
        &reputation::ReputationReason::HackathonWin,
    );
    assert_eq!(client.get_reputation(&user), 10_000);
}

#[test]
fn test_exponential_time_decay_halving() {
    let env = Env::default();
    env.mock_all_auths();
    use soroban_sdk::testutils::Ledger as _;

    env.ledger().with_mut(|li| {
        li.timestamp = 1_000_000;
    });

    let (client, _, user) = setup(&env);

    // Give user 8000 points
    client.adjust_reputation(
        &user,
        &8000,
        &reputation::ReputationReason::HackathonWin,
    );
    assert_eq!(client.get_reputation(&user), 8000);

    // Advance ledger by 1 epoch (180 days = 15,552,000s)
    let half_life = decay::DEFAULT_HALF_LIFE_SECONDS;
    env.ledger().with_mut(|li| {
        li.timestamp += half_life;
    });

    // Score should decay by half: 8000 * 2^(-1) = 4000
    let decayed_score = client.get_reputation(&user);
    assert_eq!(decayed_score, 4000);

    // Advance ledger by another 1 epoch (total 2 epochs = 360 days)
    env.ledger().with_mut(|li| {
        li.timestamp += half_life;
    });

    // Score should decay by half again: 4000 * 2^(-1) = 2000
    assert_eq!(client.get_reputation(&user), 2000);

    // Settle decay on-chain
    let settled = client.settle_decay(&user);
    assert_eq!(settled, 2000);

    let record = client.get_reputation_record(&user).unwrap();
    assert_eq!(record.score, 2000);
}

#[test]
fn test_decay_pure_math() {
    // Exact halving
    assert_eq!(decay::apply_exponential_decay(1000, 100, 100), 500);
    assert_eq!(decay::apply_exponential_decay(1000, 200, 100), 250);
    assert_eq!(decay::apply_exponential_decay(1000, 300, 100), 125);
    // Partial decay (t = 50, T = 100 -> ~70.7% = 701)
    let half_decay = decay::apply_exponential_decay(1000, 50, 100);
    assert!(half_decay >= 700 && half_decay <= 710);
}
