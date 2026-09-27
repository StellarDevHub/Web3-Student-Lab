#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, testutils::Ledger as _, Address, BytesN, Env};

fn setup() -> (Env, ProxyContractClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(ProxyContract, ());
    let client = ProxyContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    (env, client, admin)
}

fn dummy_wasm_hash(env: &Env, val: u8) -> BytesN<32> {
    BytesN::from_array(env, &[val; 32])
}

#[test]
fn test_init_and_get_implementation() {
    let (env, client, admin) = setup();
    let wasm = dummy_wasm_hash(&env, 1);

    client.init(&admin, &wasm);

    assert_eq!(client.get_implementation(), wasm);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn test_double_init() {
    let (env, client, admin) = setup();
    let wasm = dummy_wasm_hash(&env, 1);
    client.init(&admin, &wasm);
    client.init(&admin, &wasm);
}

#[test]
fn test_upgrade_to_with_timelock() {
    let (env, client, admin) = setup();
    let wasm1 = dummy_wasm_hash(&env, 1);
    let wasm2 = dummy_wasm_hash(&env, 2);

    client.init(&admin, &wasm1);
    client.register_wasm(&admin, &wasm2);

    let eta = client.propose_upgrade(&admin, &wasm2);
    assert_eq!(eta, env.ledger().timestamp() + TIMELOCK_DELAY);

    let res = client.try_upgrade_to(&admin, &wasm2);
    assert!(res.is_err());

    // Advance ledger timestamp past 48 hours (172,800 seconds)
    env.ledger().set_timestamp(env.ledger().timestamp() + TIMELOCK_DELAY + 1);

    // Call executes upgrade after timelock expiry
    client.upgrade_to(&admin, &wasm2);

    assert_eq!(client.get_implementation(), wasm2);
}

#[test]
#[should_panic(expected = "Error(Contract, #8)")]
fn test_upgrade_before_timelock_reverts() {
    let (env, client, admin) = setup();
    let wasm1 = dummy_wasm_hash(&env, 1);
    let wasm2 = dummy_wasm_hash(&env, 2);

    client.init(&admin, &wasm1);
    client.register_wasm(&admin, &wasm2);

    // Propose upgrade
    client.propose_upgrade(&admin, &wasm2);

    // Executing before timelock expiry must panic with TimelockNotExpired (#8)
    client.execute_upgrade(&admin, &wasm2);
}

#[test]
fn test_propose_approve_and_execute_upgrade() {
    let (env, client, admin) = setup();
    let wasm1 = dummy_wasm_hash(&env, 1);
    let wasm2 = dummy_wasm_hash(&env, 2);

    client.init(&admin, &wasm1);
    client.register_wasm(&admin, &wasm2);

    let eta = client.propose_upgrade(&admin, &wasm2);
    assert_eq!(eta, env.ledger().timestamp() + TIMELOCK_DELAY);

    let proposal = client.get_proposal(&wasm2).unwrap();
    assert_eq!(proposal.wasm_hash, wasm2);
    assert!(!proposal.executed);

    let co_signer = Address::generate(&env);
    client.approve_upgrade(&co_signer, &wasm2);

    env.ledger().set_timestamp(eta + 1);

    client.execute_upgrade(&admin, &wasm2);
    assert_eq!(client.get_implementation(), wasm2);

    let updated_proposal = client.get_proposal(&wasm2).unwrap();
    assert!(updated_proposal.executed);
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_unauthorized_upgrade() {
    let (env, client, admin) = setup();
    let wasm1 = dummy_wasm_hash(&env, 1);
    let wasm2 = dummy_wasm_hash(&env, 2);
    let non_admin = Address::generate(&env);

    client.init(&admin, &wasm1);

    client.upgrade_to(&non_admin, &wasm2);
}

#[test]
fn test_storage_version_and_registered_hashes() {
    let (env, client, admin) = setup();
    let wasm1 = dummy_wasm_hash(&env, 1);
    let wasm2 = dummy_wasm_hash(&env, 2);

    client.init(&admin, &wasm1);
    assert_eq!(client.get_storage_version(), 1u32);

    let upgrade_result = client.try_upgrade_to(&admin, &wasm2);
    assert!(upgrade_result.is_err());

    client.register_wasm(&admin, &wasm2);
    client.propose_upgrade(&admin, &wasm2);
    env.ledger().set_timestamp(env.ledger().timestamp() + TIMELOCK_DELAY + 10);
    client.execute_upgrade(&admin, &wasm2);

    assert_eq!(client.get_implementation(), wasm2);
    assert_eq!(client.get_storage_version(), 2u32);
}

#[test]
fn test_two_step_admin_transfer() {
    let (env, client, admin) = setup();
    let wasm = dummy_wasm_hash(&env, 1);
    let new_admin = Address::generate(&env);

    client.init(&admin, &wasm);
    client.transfer_admin(&admin, &new_admin);

    assert_eq!(client.get_pending_admin().unwrap(), new_admin);
    assert_eq!(client.get_admin(), admin);

    let wasm2 = dummy_wasm_hash(&env, 2);
    let rejected = client.try_upgrade_to(&new_admin, &wasm2);
    assert!(rejected.is_err());

    client.accept_admin(&new_admin);
    assert_eq!(client.get_admin(), new_admin);
    assert!(client.get_pending_admin().is_none());

    client.register_wasm(&new_admin, &wasm2);
    client.propose_upgrade(&new_admin, &wasm2);
    env.ledger().set_timestamp(env.ledger().timestamp() + TIMELOCK_DELAY + 1);
    client.execute_upgrade(&new_admin, &wasm2);
    assert_eq!(client.get_implementation(), wasm2);
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_transfer_admin_revokes_old_admin() {
    let (env, client, admin) = setup();
    let wasm = dummy_wasm_hash(&env, 1);
    let new_admin = Address::generate(&env);

    client.init(&admin, &wasm);
    client.transfer_admin(&admin, &new_admin);
    client.accept_admin(&new_admin);

    let wasm2 = dummy_wasm_hash(&env, 2);
    client.register_wasm(&new_admin, &wasm2);
    client.upgrade_to(&admin, &wasm2);
}
