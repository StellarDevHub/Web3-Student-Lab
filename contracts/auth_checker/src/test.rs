#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env, String};

fn setup() -> (Env, AuthCheckerClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(AuthChecker, ());
    let client = AuthCheckerClient::new(&env, &contract_id);
    let admin = Address::generate(&env);

    client.init(&admin);
    (env, client, admin)
}

#[test]
fn test_initialization() {
    let (_env, client, _admin) = setup();
    assert_eq!(client.mutation_count(), 0);
    assert_eq!(client.get_value(), None);
}

#[test]
fn test_set_value_with_admin_auth() {
    let (env, client, admin) = setup();
    let val = String::from_str(&env, "hello_soroban");

    client.set_value(&admin, &val);

    assert_eq!(client.get_value(), Some(val));
    assert_eq!(client.mutation_count(), 1);
}

#[test]
fn test_set_value_with_args_granular_auth() {
    let (env, client, admin) = setup();
    let val = String::from_str(&env, "granular_args_value");

    client.set_value_with_args(&admin, &val);

    assert_eq!(client.get_value(), Some(val));
    assert_eq!(client.mutation_count(), 1);
}

#[test]
fn test_unauthorized_caller_rejected() {
    let (env, client, _admin) = setup();
    let hacker = Address::generate(&env);
    let val = String::from_str(&env, "malicious_payload");

    let res = client.try_set_value(&hacker, &val);
    assert!(res.is_err());
}

#[test]
fn test_transfer_admin() {
    let (env, client, admin) = setup();
    let new_admin = Address::generate(&env);

    client.transfer_admin(&admin, &new_admin);

    let val = String::from_str(&env, "new_admin_value");
    client.set_value(&new_admin, &val);
    assert_eq!(client.get_value(), Some(val.clone()));

    // Old admin can no longer set value
    let res = client.try_set_value(&admin, &val);
    assert!(res.is_err());
}

#[test]
fn test_sep0010_web_auth_execution_and_replay_protection() {
    let (env, client, _admin) = setup();
    let user = Address::generate(&env);
    let domain = String::from_str(&env, "auth.studentlab.stellar.org");
    let nonce = 123456789u64;
    let payload = String::from_str(&env, "verified_sep0010_session");

    // First execution succeeds
    client.verify_and_execute_sep0010(&user, &domain, &nonce, &payload);
    assert_eq!(client.get_value(), Some(payload.clone()));
    assert_eq!(client.mutation_count(), 1);

    // Replay with identical nonce fails
    let replay_res = client.try_verify_and_execute_sep0010(&user, &domain, &nonce, &payload);
    assert!(replay_res.is_err());

    // Subsequent call with fresh nonce succeeds
    let fresh_nonce = 123456790u64;
    let payload2 = String::from_str(&env, "second_session");
    client.verify_and_execute_sep0010(&user, &domain, &fresh_nonce, &payload2);
    assert_eq!(client.get_value(), Some(payload2));
    assert_eq!(client.mutation_count(), 2);
}

#[test]
fn test_multicall_authorization_pipeline() {
    let (env, client, _admin) = setup();
    let invoker = Address::generate(&env);

    let op1 = String::from_str(&env, "step_transfer_token");
    let op2 = String::from_str(&env, "step_mint_certificate");

    client.execute_multicall_step(&invoker, &1u64, &op1);
    client.execute_multicall_step(&invoker, &2u64, &op2);

    // Attempting step replay fails
    let replay = client.try_execute_multicall_step(&invoker, &1u64, &op1);
    assert!(replay.is_err());
}
