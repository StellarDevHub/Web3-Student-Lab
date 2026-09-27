#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, testutils::Ledger as _, Address, BytesN, Env};

fn setup() -> (Env, CourseProxyClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(CourseProxy, ());
    let client = CourseProxyClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    (env, client, admin)
}

fn dummy_wasm_hash(env: &Env, val: u8) -> BytesN<32> {
    BytesN::from_array(env, &[val; 32])
}

#[test]
fn test_course_proxy_init_and_getters() {
    let (env, client, admin) = setup();
    let wasm = dummy_wasm_hash(&env, 1);

    client.init(&admin, &wasm);

    assert_eq!(client.get_impl(), wasm);
    assert_eq!(client.get_version(), 1u32);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn test_double_init_reverts() {
    let (env, client, admin) = setup();
    let wasm = dummy_wasm_hash(&env, 1);
    client.init(&admin, &wasm);
    client.init(&admin, &wasm);
}

#[test]
fn test_timelocked_upgrade_flow() {
    let (env, client, admin) = setup();
    let wasm1 = dummy_wasm_hash(&env, 1);
    let wasm2 = dummy_wasm_hash(&env, 2);

    client.init(&admin, &wasm1);

    let eta = client.propose_upgrade(&admin, &wasm2);
    assert_eq!(eta, env.ledger().timestamp() + TIMELOCK_DELAY);

    let proposal = client.get_proposal(&wasm2).unwrap();
    assert_eq!(proposal.wasm_hash, wasm2);
    assert!(!proposal.executed);

    let res = client.try_upgrade(&admin, &wasm2);
    assert!(res.is_err());

    // Advance ledger timestamp past 48 hours
    env.ledger().set_timestamp(env.ledger().timestamp() + TIMELOCK_DELAY + 1);

    client.execute_upgrade(&admin, &wasm2);

    assert_eq!(client.get_impl(), wasm2);
    assert_eq!(client.get_version(), 2u32);
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn test_execute_before_timelock_reverts() {
    let (env, client, admin) = setup();
    let wasm1 = dummy_wasm_hash(&env, 1);
    let wasm2 = dummy_wasm_hash(&env, 2);

    client.init(&admin, &wasm1);
    client.propose_upgrade(&admin, &wasm2);

    // Attempt execute immediately without waiting 48h
    client.execute_upgrade(&admin, &wasm2);
}

#[test]
fn test_transfer_admin() {
    let (env, client, admin) = setup();
    let wasm = dummy_wasm_hash(&env, 1);
    let new_admin = Address::generate(&env);

    client.init(&admin, &wasm);
    client.transfer_admin(&admin, &new_admin);

    let wasm2 = dummy_wasm_hash(&env, 2);
    client.propose_upgrade(&new_admin, &wasm2);
    env.ledger().set_timestamp(env.ledger().timestamp() + TIMELOCK_DELAY + 10);
    client.execute_upgrade(&new_admin, &wasm2);

    assert_eq!(client.get_impl(), wasm2);
}
