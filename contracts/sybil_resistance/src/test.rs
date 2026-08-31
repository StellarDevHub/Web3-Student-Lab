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
#[should_panic(expected = "User is not verified")]
fn revoke_unverified_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, user) = setup(&env);
    client.revoke_user(&user);
}

#[test]
#[should_panic(expected = "Already initialized")]
fn double_initialize_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _) = setup(&env);
    let admin2 = Address::generate(&env);
    client.initialize(&admin2);
}
