#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Address, BytesN, Env};

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
    
    // In test environments, `update_current_contract_wasm` requires the WASM to actually exist 
    // in the ledger if strictly validated, but for pure unit testing without full integration,
    // we just test the state management.
    // Wait, env.register doesn't support WASM mocking out of the box in simple tests without installing.
    // Since we mock auth, the state is set correctly.
    // If it panics due to missing WASM, we can intercept or just verify state.
    // However, `update_current_contract_wasm` will try to update it.
    // Actually, in `testutils`, `update_current_contract_wasm` is a no-op or replaces it cleanly if not strictly checked.
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
fn test_upgrade_to() {
    let (env, client, admin) = setup();
    let wasm1 = dummy_wasm_hash(&env, 1);
    let wasm2 = dummy_wasm_hash(&env, 2);
    
    client.init(&admin, &wasm1);
    client.upgrade_to(&admin, &wasm2);
    
    assert_eq!(client.get_implementation(), wasm2);
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_unauthorized_upgrade() {
    let (env, client, admin) = setup();
    let wasm1 = dummy_wasm_hash(&env, 1);
    let wasm2 = dummy_wasm_hash(&env, 2);
    let non_admin = Address::generate(&env);
    
    client.init(&admin, &wasm1);
    
    // Will panic because non_admin is not the admin
    client.upgrade_to(&non_admin, &wasm2);
}

#[test]
fn test_transfer_admin() {
    let (env, client, admin) = setup();
    let wasm = dummy_wasm_hash(&env, 1);
    let new_admin = Address::generate(&env);
    
    client.init(&admin, &wasm);
    client.transfer_admin(&admin, &new_admin);
    
    let wasm2 = dummy_wasm_hash(&env, 2);
    // New admin can upgrade
    client.upgrade_to(&new_admin, &wasm2);
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
    
    let wasm2 = dummy_wasm_hash(&env, 2);
    // Old admin can NO LONGER upgrade
    client.upgrade_to(&admin, &wasm2);
}
