#![cfg(test)]

use crate::savings_wallet::{SavingsWalletContract, SavingsWalletContractClient};
use soroban_sdk::{testutils::Address as _, Address, Env};

#[test]
fn test_create_savings_account() {
    let env = Env::default();
    let contract_id = env.register_contract(None, SavingsWalletContract);
    let client = SavingsWalletContractClient::new(&env, &contract_id);

    let owner = Address::generate(&env);
    let penalty_rate = 1000u32;

    client.initialize(&penalty_rate);

    let amount = 1000_0000000i128;
    let lock_period = 86400u64 * 30;
    let interest_rate = 500u32;

    let account = client.create_savings(&owner, &amount, &lock_period, &interest_rate);

    assert_eq!(account.owner, owner);
    assert_eq!(account.balance, amount);
    assert_eq!(account.lock_period, lock_period);
    assert_eq!(account.interest_rate, interest_rate);
}

#[test]
fn test_deposit() {
    let env = Env::default();
    let contract_id = env.register_contract(None, SavingsWalletContract);
    let client = SavingsWalletContractClient::new(&env, &contract_id);

    let owner = Address::generate(&env);
    client.initialize(&1000u32);

    let initial_amount = 1000_0000000i128;
    client.create_savings(&owner, &initial_amount, &(86400u64 * 30), &500u32);

    let deposit_amount = 500_0000000i128;
    let account = client.deposit(&owner, &deposit_amount);

    assert_eq!(account.balance, initial_amount + deposit_amount);
}

#[test]
fn test_early_withdrawal_penalty() {
    let env = Env::default();
    let contract_id = env.register_contract(None, SavingsWalletContract);
    let client = SavingsWalletContractClient::new(&env, &contract_id);

    let owner = Address::generate(&env);
    let penalty_rate = 1000u32;
    client.initialize(&penalty_rate);

    let amount = 1000_0000000i128;
    client.create_savings(&owner, &amount, &(86400u64 * 30), &500u32);

    let withdraw_amount = 500_0000000i128;
    let net_amount = client.withdraw_early(&owner, &withdraw_amount);

    let expected_penalty = (withdraw_amount * penalty_rate as i128) / 10000;
    let expected_net = withdraw_amount - expected_penalty;

    assert_eq!(net_amount, expected_net);
}

#[test]
#[should_panic(expected = "AccountLocked")]
fn test_matured_withdrawal_before_maturity() {
    let env = Env::default();
    let contract_id = env.register_contract(None, SavingsWalletContract);
    let client = SavingsWalletContractClient::new(&env, &contract_id);

    let owner = Address::generate(&env);
    client.initialize(&1000u32);

    let amount = 1000_0000000i128;
    client.create_savings(&owner, &amount, &(86400u64 * 30), &500u32);

    client.withdraw_matured(&owner, &amount);
}

#[test]
fn test_get_penalty_rate() {
    let env = Env::default();
    let contract_id = env.register_contract(None, SavingsWalletContract);
    let client = SavingsWalletContractClient::new(&env, &contract_id);

    let penalty_rate = 1500u32;
    client.initialize(&penalty_rate);

    let retrieved_rate = client.get_penalty_rate();
    assert_eq!(retrieved_rate, penalty_rate);
}
