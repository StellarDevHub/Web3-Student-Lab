#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token, Address, Env, String,
};

fn create_test_env() -> Env {
    let env = Env::default();
    env.ledger().with_mut(|li| {
        li.protocol_version = 22;
        li.timestamp = 12345;
    });
    env
}

fn create_token_contract<'a>(
    env: &Env,
    admin: &Address,
) -> (Address, token::Client<'a>, token::StellarAssetClient<'a>) {
    let token_address = env.register_stellar_asset_contract(admin.clone());
    let token = token::Client::new(env, &token_address);
    let token_admin = token::StellarAssetClient::new(env, &token_address);
    (token_address, token, token_admin)
}

#[test]
fn test_initialize() {
    let env = create_test_env();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let token_address = Address::generate(&env);

    let contract_id = env.register(TestnetFaucetIntegration, ());
    let client = TestnetFaucetIntegrationClient::new(&env, &contract_id);

    client.initialize(&admin, &token_address);

    assert_eq!(client.get_token_address(), token_address);
}

#[test]
fn test_create_project() {
    let env = create_test_env();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let token_address = Address::generate(&env);
    let creator = Address::generate(&env);

    let contract_id = env.register(TestnetFaucetIntegration, ());
    let client = TestnetFaucetIntegrationClient::new(&env, &contract_id);

    client.initialize(&admin, &token_address);

    let project_id = client.create_project(
        &creator,
        &String::from_str(&env, "DeFi Lending Platform"),
        &String::from_str(&env, "A decentralized lending platform"),
        &5000_0000000,
    );

    assert_eq!(project_id, 0);

    let project = client.get_project(&project_id).unwrap();
    assert_eq!(project.creator, creator);
    assert_eq!(project.required_tokens, 5000_0000000);
}

#[test]
fn test_request_tokens() {
    let env = create_test_env();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let (token_address, _token, token_admin) = create_token_contract(&env, &admin);
    let user = Address::generate(&env);

    let contract_id = env.register(TestnetFaucetIntegration, ());
    let client = TestnetFaucetIntegrationClient::new(&env, &contract_id);

    client.initialize(&admin, &token_address);

    // Fund the faucet
    token_admin.mint(&contract_id, &100000_0000000);

    // Create a project
    let project_id = client.create_project(
        &user,
        &String::from_str(&env, "Test Project"),
        &String::from_str(&env, "Description"),
        &1000_0000000,
    );

    // Request tokens
    client.request_tokens(&user, &500_0000000, &project_id);
}

#[test]
fn test_request_tokens_exceeds_limit() {
    let env = create_test_env();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let (token_address, _token, _token_admin) = create_token_contract(&env, &admin);
    let user = Address::generate(&env);

    let contract_id = env.register(TestnetFaucetIntegration, ());
    let client = TestnetFaucetIntegrationClient::new(&env, &contract_id);

    client.initialize(&admin, &token_address);

    let project_id = client.create_project(
        &user,
        &String::from_str(&env, "Test Project"),
        &String::from_str(&env, "Description"),
        &1000_0000000,
    );

    // Try to request more than limit
    let result = client.try_request_tokens(&user, &2000_0000000, &project_id);
    assert!(result.is_err());
}

#[test]
fn test_request_too_soon() {
    let env = create_test_env();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let (token_address, _token, token_admin) = create_token_contract(&env, &admin);
    let user = Address::generate(&env);

    let contract_id = env.register(TestnetFaucetIntegration, ());
    let client = TestnetFaucetIntegrationClient::new(&env, &contract_id);

    client.initialize(&admin, &token_address);

    // Fund the faucet
    token_admin.mint(&contract_id, &100000_0000000);

    let project_id = client.create_project(
        &user,
        &String::from_str(&env, "Test Project"),
        &String::from_str(&env, "Description"),
        &1000_0000000,
    );

    // First request succeeds
    client.request_tokens(&user, &500_0000000, &project_id);

    // Second request too soon - should fail
    let result = client.try_request_tokens(&user, &500_0000000, &project_id);
    assert!(result.is_err());
}

#[test]
fn test_can_request() {
    let env = create_test_env();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let token_address = Address::generate(&env);
    let user = Address::generate(&env);

    let contract_id = env.register(TestnetFaucetIntegration, ());
    let client = TestnetFaucetIntegrationClient::new(&env, &contract_id);

    client.initialize(&admin, &token_address);

    // User can request initially
    assert!(client.can_request(&user));
}

#[test]
fn test_list_projects() {
    let env = create_test_env();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let token_address = Address::generate(&env);
    let creator = Address::generate(&env);

    let contract_id = env.register(TestnetFaucetIntegration, ());
    let client = TestnetFaucetIntegrationClient::new(&env, &contract_id);

    client.initialize(&admin, &token_address);

    // Create multiple projects
    client.create_project(
        &creator,
        &String::from_str(&env, "Project 1"),
        &String::from_str(&env, "Description 1"),
        &1000_0000000,
    );

    client.create_project(
        &creator,
        &String::from_str(&env, "Project 2"),
        &String::from_str(&env, "Description 2"),
        &2000_0000000,
    );

    let projects = client.list_projects();
    assert_eq!(projects.len(), 2);
}

#[test]
fn test_fund_faucet() {
    let env = create_test_env();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let (token_address, token, token_admin) = create_token_contract(&env, &admin);
    let funder = Address::generate(&env);

    let contract_id = env.register(TestnetFaucetIntegration, ());
    let client = TestnetFaucetIntegrationClient::new(&env, &contract_id);

    client.initialize(&admin, &token_address);

    // Mint tokens to funder
    token_admin.mint(&funder, &10000_0000000);

    // Fund the faucet
    client.fund_faucet(&funder, &5000_0000000);

    // Check balance
    let balance = token.balance(&contract_id);
    assert_eq!(balance, 5000_0000000);
}

#[test]
fn test_set_limits() {
    let env = create_test_env();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let token_address = Address::generate(&env);

    let contract_id = env.register(TestnetFaucetIntegration, ());
    let client = TestnetFaucetIntegrationClient::new(&env, &contract_id);

    client.initialize(&admin, &token_address);

    // Set new limits
    client.set_request_limit(&2000_0000000);
    client.set_daily_limit(&20000_0000000);

    assert_eq!(client.get_request_limit(), 2000_0000000);
}
