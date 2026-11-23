#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env};

// We redefine ProxyDataKey here to initialize the admin state directly in tests.
// In a real environment, the Proxy contract would do this via `init()`.
fn setup() -> (Env, StudentRecordV1Client<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(StudentRecordV1, ());
    let client = StudentRecordV1Client::new(&env, &contract_id);
    let admin = Address::generate(&env);

    // Manually set admin to mimic proxy initialization
    env.as_contract(&contract_id, || {
        env.storage().instance().set(&ProxyDataKey::Admin, &admin);
    });

    (env, client, admin)
}

#[test]
fn test_add_and_get_score() {
    let (env, client, admin) = setup();
    let student = Address::generate(&env);

    assert_eq!(client.get_score(&student), 0);

    client.add_score(&admin, &student, &50);
    assert_eq!(client.get_score(&student), 50);

    client.add_score(&admin, &student, &25);
    assert_eq!(client.get_score(&student), 75);
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn test_unauthorized_add_score() {
    let (env, client, _admin) = setup();
    let student = Address::generate(&env);
    let malicious_user = Address::generate(&env);

    // Panics because malicious_user is not admin
    client.add_score(&malicious_user, &student, &100);
}

#[test]
fn test_score_overflow_prevention() {
    let (env, client, admin) = setup();
    let student = Address::generate(&env);

    // Add max u32
    client.add_score(&admin, &student, &u32::MAX);
    assert_eq!(client.get_score(&student), u32::MAX);

    // Add more, should saturate at MAX instead of panicking/wrapping
    client.add_score(&admin, &student, &10);
    assert_eq!(client.get_score(&student), u32::MAX);
}
