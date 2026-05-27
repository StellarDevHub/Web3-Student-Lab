#![cfg(test)]

use crate::savings_wallet::{SavingsWalletContract, SavingsWalletContractClient, SavingsError};
use crate::interest_accrual::InterestAccrualService;
use soroban_sdk::{testutils::Address as _, Address, Env};

fn setup() -> (Env, Address, SavingsWalletContractClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, SavingsWalletContract);
    let client = SavingsWalletContractClient::new(&env, &contract_id);
    let owner = Address::generate(&env);
    
    client.initialize(&1000u32);
    
    (env, owner, client)
}

#[test]
fn test_create_and_retrieve_account() {
    let (_env, owner, client) = setup();

    let amount = 1000_0000000i128;
    let lock_period = 86400u64 * 30;
    let interest_rate = 500u32;

    let account = client.create_savings(&owner, &amount, &lock_period, &interest_rate);

    assert_eq!(account.owner, owner);
    assert_eq!(account.balance, amount);
    assert_eq!(account.lock_period, lock_period);
    assert_eq!(account.interest_rate, interest_rate);
    
    let retrieved = client.get_account(&owner).unwrap();
    assert_eq!(retrieved.balance, amount);
}

#[test]
fn test_deposit_increases_balance() {
    let (_env, owner, client) = setup();

    let initial_amount = 1000_0000000i128;
    client.create_savings(&owner, &initial_amount, &(86400u64 * 30), &500u32);

    let deposit_amount = 500_0000000i128;
    let account = client.deposit(&owner, &deposit_amount);

    assert_eq!(account.balance, initial_amount + deposit_amount);
}

#[test]
fn test_early_withdrawal_applies_penalty() {
    let (_env, owner, client) = setup();

    let amount = 1000_0000000i128;
    client.create_savings(&owner, &amount, &(86400u64 * 30), &500u32);

    let withdraw_amount = 500_0000000i128;
    let net_amount = client.withdraw_early(&owner, &withdraw_amount);

    let penalty_rate = 1000u32;
    let expected_penalty = (withdraw_amount * penalty_rate as i128) / 10000;
    let expected_net = withdraw_amount - expected_penalty;

    assert_eq!(net_amount, expected_net);
}

#[test]
fn test_penalty_rate_management() {
    let (_env, owner, client) = setup();

    let initial_rate = client.get_penalty_rate();
    assert_eq!(initial_rate, 1000u32);

    let new_rate = 1500u32;
    client.set_penalty_rate(&owner, &new_rate);

    let updated_rate = client.get_penalty_rate();
    assert_eq!(updated_rate, new_rate);
}

#[test]
fn test_interest_calculation() {
    let principal = 1000_0000000i128;
    let annual_rate = 500u32;
    let time_seconds = 31536000u64;

    let interest = InterestAccrualService::compound_interest(principal, annual_rate, time_seconds);
    
    assert!(interest > 0);
    let expected_max = (principal * annual_rate as i128) / 10000;
    assert!(interest <= expected_max);
}

#[test]
fn test_zero_values_return_zero_interest() {
    assert_eq!(InterestAccrualService::compound_interest(0, 500, 31536000), 0);
    assert_eq!(InterestAccrualService::compound_interest(1000_0000000, 0, 31536000), 0);
    assert_eq!(InterestAccrualService::compound_interest(1000_0000000, 500, 0), 0);
}

#[test]
fn test_get_all_accounts() {
    let (_env, owner, client) = setup();

    let accounts_before = client.get_all_accounts();
    assert_eq!(accounts_before.len(), 0);

    client.create_savings(&owner, &1000_0000000i128, &(86400u64 * 30), &500u32);

    let accounts_after = client.get_all_accounts();
    assert_eq!(accounts_after.len(), 1);
    assert_eq!(accounts_after.get(0).unwrap(), owner);
}

#[test]
#[should_panic]
fn test_cannot_create_duplicate_account() {
    let (_env, owner, client) = setup();

    client.create_savings(&owner, &1000_0000000i128, &(86400u64 * 30), &500u32);
    client.create_savings(&owner, &500_0000000i128, &(86400u64 * 60), &300u32);
}

#[test]
#[should_panic]
fn test_invalid_lock_period_too_short() {
    let (_env, owner, client) = setup();

    client.create_savings(&owner, &1000_0000000i128, &1000u64, &500u32);
}

#[test]
#[should_panic]
fn test_invalid_lock_period_too_long() {
    let (_env, owner, client) = setup();

    client.create_savings(&owner, &1000_0000000i128, &(86400u64 * 400), &500u32);
}

#[test]
#[should_panic]
fn test_invalid_interest_rate() {
    let (_env, owner, client) = setup();

    client.create_savings(&owner, &1000_0000000i128, &(86400u64 * 30), &15000u32);
}

#[test]
#[should_panic]
fn test_insufficient_balance_withdrawal() {
    let (_env, owner, client) = setup();

    client.create_savings(&owner, &1000_0000000i128, &(86400u64 * 30), &500u32);
    client.withdraw_early(&owner, &2000_0000000i128);
}
