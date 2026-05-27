#![cfg(test)]

use crate::dao_treasury::{DaoTreasuryContract, DaoTreasuryContractClient, TreasuryError, SweepInfo};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token, Address, Env,
};

fn setup_test() -> (Env, Address, DaoTreasuryContractClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(DaoTreasuryContract, ());
    let client = DaoTreasuryContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    
    (env, admin, client)
}

#[test]
fn test_initialize_success() {
    let (env, admin, client) = setup_test();
    client.initialize(&admin);
    // Should pass without panicking
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #1)")]
fn test_initialize_already_initialized() {
    let (env, admin, client) = setup_test();
    client.initialize(&admin);
    client.initialize(&admin);
}

#[test]
fn test_proposal_allowance() {
    let (env, admin, client) = setup_test();
    client.initialize(&admin);

    let proposal_id = 42;
    let token = Address::generate(&env);
    let amount = 1000;

    // Set allowance
    client.set_proposal_allowance(&admin, &proposal_id, &token, &amount);

    // Get allowance
    let allowance = client.get_proposal_allowance(&proposal_id, &token);
    assert_eq!(allowance, amount);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #3)")]
fn test_set_allowance_unauthorized() {
    let (env, admin, client) = setup_test();
    client.initialize(&admin);

    let not_admin = Address::generate(&env);
    let token = Address::generate(&env);
    
    client.set_proposal_allowance(&not_admin, &1, &token, &100);
}

#[test]
fn test_execute_proposal_transfer() {
    let env = Env::default();
    env.mock_all_auths();

    // Create a mock token contract
    let token_admin = Address::generate(&env);
    let token_contract = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_client = token::StellarAssetClient::new(&env, &token_contract.address());
    let token = token_contract.address();

    // Register treasury contract
    let contract_id = env.register(DaoTreasuryContract, ());
    let client = DaoTreasuryContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);

    // Mint some tokens to the treasury
    token_client.mint(&client.address, &5000);

    // Setup allowance
    let proposal_id = 99;
    let amount = 1500;
    client.set_proposal_allowance(&admin, &proposal_id, &token, &amount);

    // Execute transfer
    let target = Address::generate(&env);
    client.execute_proposal_transfer(&proposal_id, &token, &target, &1000);

    // Check balances
    let token_reader = token::Client::new(&env, &token);
    assert_eq!(token_reader.balance(&client.address), 4000);
    assert_eq!(token_reader.balance(&target), 1000);

    // Check allowance updated
    assert_eq!(client.get_proposal_allowance(&proposal_id, &token), 500);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #4)")]
fn test_execute_proposal_transfer_insufficient_allowance() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(DaoTreasuryContract, ());
    let client = DaoTreasuryContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);

    let token = Address::generate(&env);
    client.set_proposal_allowance(&admin, &1, &token, &50);
    
    // Attempting to transfer 100 but allowance is 50
    client.execute_proposal_transfer(&1, &token, &Address::generate(&env), &100);
}

#[test]
fn test_emergency_sweep() {
    let env = Env::default();
    env.mock_all_auths();

    // Setup token and treasury
    let token_admin = Address::generate(&env);
    let token_contract = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_client = token::StellarAssetClient::new(&env, &token_contract.address());
    let token = token_contract.address();

    let contract_id = env.register(DaoTreasuryContract, ());
    let client = DaoTreasuryContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);

    // Treasury gets 10,000 tokens
    token_client.mint(&client.address, &10000);

    let sweep_target = Address::generate(&env);
    
    // Initial time is 0, so sweep unlock time will be 0 + 86400
    env.ledger().set_timestamp(0);

    // Initiate sweep
    client.initiate_sweep(&admin, &token, &sweep_target);

    // Fast forward time past 86400 (e.g., 90000)
    env.ledger().set_timestamp(90000);

    // Execute sweep
    client.execute_sweep(&token);

    // Ensure all balances transferred
    let token_reader = token::Client::new(&env, &token);
    assert_eq!(token_reader.balance(&client.address), 0);
    assert_eq!(token_reader.balance(&sweep_target), 10000);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #6)")]
fn test_emergency_sweep_timelock_not_expired() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(DaoTreasuryContract, ());
    let client = DaoTreasuryContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);

    let token = Address::generate(&env);
    let target = Address::generate(&env);

    env.ledger().set_timestamp(100);
    client.initiate_sweep(&admin, &token, &target);

    // Time is still 100, sweep unlock is at 86500. This should panic.
    client.execute_sweep(&token);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #7)")]
fn test_emergency_sweep_no_sweep_active() {
    let (env, admin, client) = setup_test();
    client.initialize(&admin);

    let token = Address::generate(&env);
    client.execute_sweep(&token);
}
