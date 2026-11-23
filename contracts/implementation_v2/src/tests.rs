#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env, String};

// The proxy contract owns Admin state in a real deployment; tests seed it
// directly to mimic proxy initialization (same pattern as implementation_v1).
fn setup() -> (Env, StudentRecordV2Client<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(StudentRecordV2, ());
    let client = StudentRecordV2Client::new(&env, &contract_id);
    let admin = Address::generate(&env);

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
fn test_score_overflow_saturates() {
    let (env, client, admin) = setup();
    let student = Address::generate(&env);

    client.add_score(&admin, &student, &u32::MAX);
    assert_eq!(client.get_score(&student), u32::MAX);

    client.add_score(&admin, &student, &10);
    assert_eq!(client.get_score(&student), u32::MAX);
}

#[test]
fn test_set_and_get_name() {
    let (env, client, admin) = setup();
    let student = Address::generate(&env);

    assert!(client.get_name(&student).is_none());

    let name = String::from_str(&env, "Ada Lovelace");
    client.set_name(&admin, &student, &name);
    assert_eq!(client.get_name(&student).unwrap(), name);
}

#[test]
fn test_name_and_score_stored_without_collision() {
    let (env, client, admin) = setup();
    let student = Address::generate(&env);

    client.add_score(&admin, &student, &88);

    let name = String::from_str(&env, "Grace Hopper");
    client.set_name(&admin, &student, &name);

    // The additive Name(Address) key must not clobber Score(Address) and
    // vice versa.
    assert_eq!(client.get_score(&student), 88);
    assert_eq!(client.get_name(&student).unwrap(), name);

    client.add_score(&admin, &student, &12);
    assert_eq!(client.get_score(&student), 100);
    assert_eq!(client.get_name(&student).unwrap(), name);
}

#[test]
fn test_v1_state_readable_after_upgrade() {
    let (env, client, admin) = setup();
    let student = Address::generate(&env);

    // Write state using V1's key type, exactly as the V1 contract would have
    // persisted it on-chain before the upgrade.
    env.as_contract(&client.address, || {
        env.storage().persistent().set(
            &implementation_v1::ImplDataKey::Score(student.clone()),
            &42u32,
        );
    });
    assert_eq!(client.get_score(&student), 42);

    // V2 keeps reading the same Score(Address) key and adds Name(Address)
    // alongside it without disturbing existing data.
    let name = String::from_str(&env, "Alan Turing");
    client.set_name(&admin, &student, &name);
    assert_eq!(client.get_score(&student), 42);
    assert_eq!(client.get_name(&student).unwrap(), name);

    client.add_score(&admin, &student, &8);
    assert_eq!(client.get_score(&student), 50);
    assert_eq!(client.get_name(&student).unwrap(), name);
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn test_unauthorized_add_score() {
    let (env, client, _admin) = setup();
    let student = Address::generate(&env);
    let intruder = Address::generate(&env);

    client.add_score(&intruder, &student, &100);
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn test_unauthorized_set_name() {
    let (env, client, _admin) = setup();
    let student = Address::generate(&env);
    let intruder = Address::generate(&env);

    let name = String::from_str(&env, "Mallory");
    client.set_name(&intruder, &student, &name);
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn test_unauthorized_transfer_admin() {
    let (env, client, _admin) = setup();
    let intruder = Address::generate(&env);
    let new_admin = Address::generate(&env);

    client.transfer_admin(&intruder, &new_admin);
}
