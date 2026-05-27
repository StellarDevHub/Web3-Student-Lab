#![cfg(test)]

use crate::flash_loan::{FlashLoanProviderContract, FlashLoanProviderContractClient};
use soroban_sdk::{
    testutils::Address as _,
    token, Address, Bytes, Env,
};

// ---------------------------------------------------------------------------
// Mock flash-loan receivers
//
// Each receiver is placed in its own submodule so that the symbols generated
// by `#[contractimpl]` for `execute_operation` don't collide in the same
// compilation unit.
// ---------------------------------------------------------------------------

mod good_receiver {
    use soroban_sdk::{contract, contractimpl, token, Address, Bytes, Env};

    /// Repays amount + fee from its pre-funded balance.
    #[contract]
    pub struct GoodReceiver;

    #[contractimpl]
    impl GoodReceiver {
        pub fn execute_operation(
            env: Env,
            token: Address,
            amount: i128,
            fee: i128,
            provider: Address,
            _data: Bytes,
        ) {
            let repayment = amount + fee;
            token::Client::new(&env, &token).transfer(
                &env.current_contract_address(),
                &provider,
                &repayment,
            );
        }
    }
}

mod bad_receiver {
    use soroban_sdk::{contract, contractimpl, Address, Bytes, Env};

    /// Does nothing – the loan is never repaid.
    #[contract]
    pub struct BadReceiver;

    #[contractimpl]
    impl BadReceiver {
        pub fn execute_operation(
            _env: Env,
            _token: Address,
            _amount: i128,
            _fee: i128,
            _provider: Address,
            _data: Bytes,
        ) {
        }
    }
}

mod partial_receiver {
    use soroban_sdk::{contract, contractimpl, token, Address, Bytes, Env};

    /// Repays principal only – the fee is missing.
    #[contract]
    pub struct PartialReceiver;

    #[contractimpl]
    impl PartialReceiver {
        pub fn execute_operation(
            env: Env,
            token: Address,
            amount: i128,
            _fee: i128,
            provider: Address,
            _data: Bytes,
        ) {
            token::Client::new(&env, &token).transfer(
                &env.current_contract_address(),
                &provider,
                &amount,
            );
        }
    }
}

use bad_receiver::BadReceiver;
use good_receiver::GoodReceiver;
use partial_receiver::PartialReceiver;

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

struct TestEnv {
    env: Env,
    admin: Address,
    token: Address,
    provider_client: FlashLoanProviderContractClient<'static>,
    provider_addr: Address,
}

fn setup(fee_bps: i128) -> TestEnv {
    let env = Env::default();
    env.mock_all_auths();

    let token_admin = Address::generate(&env);
    let token_contract = env.register_stellar_asset_contract_v2(token_admin);
    let token_addr = token_contract.address();

    let provider_id = env.register(FlashLoanProviderContract, ());
    let provider_client = FlashLoanProviderContractClient::new(&env, &provider_id);
    let admin = Address::generate(&env);
    provider_client.initialize(&admin, &fee_bps);

    TestEnv {
        env,
        admin,
        token: token_addr,
        provider_client,
        provider_addr: provider_id,
    }
}

fn mint(env: &Env, token: &Address, to: &Address, amount: i128) {
    token::StellarAssetClient::new(env, token).mint(to, &amount);
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

#[test]
fn test_initialize_success() {
    setup(9);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #1)")]
fn test_initialize_already_initialized() {
    let t = setup(9);
    t.provider_client.initialize(&t.admin, &9i128);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #8)")]
fn test_initialize_fee_too_high() {
    let env = Env::default();
    env.mock_all_auths();
    let token_admin = Address::generate(&env);
    env.register_stellar_asset_contract_v2(token_admin);
    let provider_id = env.register(FlashLoanProviderContract, ());
    let client = FlashLoanProviderContractClient::new(&env, &provider_id);
    let admin = Address::generate(&env);
    client.initialize(&admin, &501i128);
}

// ---------------------------------------------------------------------------
// Liquidity provision
// ---------------------------------------------------------------------------

#[test]
fn test_provide_liquidity() {
    let t = setup(9);
    let lp = Address::generate(&t.env);
    mint(&t.env, &t.token, &lp, 10_000);

    t.provider_client.provide_liquidity(&lp, &t.token, &10_000i128);

    let tok = token::Client::new(&t.env, &t.token);
    assert_eq!(tok.balance(&t.provider_addr), 10_000);
    assert_eq!(tok.balance(&lp), 0);
}

// ---------------------------------------------------------------------------
// Flash loan – success paths
// ---------------------------------------------------------------------------

#[test]
fn test_flash_loan_repaid_full() {
    let t = setup(9); // 9 bps = 0.09%
    let liquidity = 100_000i128;

    mint(&t.env, &t.token, &t.provider_addr, liquidity);

    let good_id = t.env.register(GoodReceiver, ());
    let loan_amount = 10_000i128;
    // fee = ceil(10_000 * 9 / 10_000) = 9
    let expected_fee = ((loan_amount * 9) + 9_999) / 10_000;
    // Pre-fund receiver with just the fee amount (simulates arbitrage profit).
    mint(&t.env, &t.token, &good_id, expected_fee);

    let data = Bytes::new(&t.env);
    let fee_returned = t
        .provider_client
        .flash_loan(&good_id, &t.token, &loan_amount, &data);

    assert_eq!(fee_returned, expected_fee);

    let tok = token::Client::new(&t.env, &t.token);
    assert_eq!(tok.balance(&t.provider_addr), liquidity + expected_fee);
    assert_eq!(tok.balance(&good_id), 0);

    assert_eq!(t.provider_client.get_fees_collected(&t.token), expected_fee);
    assert_eq!(t.provider_client.get_total_volume(&t.token), loan_amount);
}

#[test]
fn test_flash_loan_zero_fee() {
    let t = setup(0);
    mint(&t.env, &t.token, &t.provider_addr, 50_000);
    let good_id = t.env.register(GoodReceiver, ());

    let data = Bytes::new(&t.env);
    let fee = t
        .provider_client
        .flash_loan(&good_id, &t.token, &1_000i128, &data);
    assert_eq!(fee, 0);
}

// ---------------------------------------------------------------------------
// Flash loan – failure paths
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected = "HostError: Error(Contract, #6)")]
fn test_flash_loan_not_repaid() {
    let t = setup(9);
    mint(&t.env, &t.token, &t.provider_addr, 50_000);

    let bad_id = t.env.register(BadReceiver, ());
    let data = Bytes::new(&t.env);
    t.provider_client
        .flash_loan(&bad_id, &t.token, &1_000i128, &data);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #6)")]
fn test_flash_loan_partial_repayment() {
    let t = setup(9);
    mint(&t.env, &t.token, &t.provider_addr, 50_000);

    let partial_id = t.env.register(PartialReceiver, ());
    let data = Bytes::new(&t.env);
    t.provider_client
        .flash_loan(&partial_id, &t.token, &1_000i128, &data);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #5)")]
fn test_flash_loan_insufficient_liquidity() {
    let t = setup(9);
    mint(&t.env, &t.token, &t.provider_addr, 500);

    let good_id = t.env.register(GoodReceiver, ());
    let data = Bytes::new(&t.env);
    t.provider_client
        .flash_loan(&good_id, &t.token, &1_000i128, &data);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #4)")]
fn test_flash_loan_zero_amount() {
    let t = setup(9);
    mint(&t.env, &t.token, &t.provider_addr, 10_000);

    let good_id = t.env.register(GoodReceiver, ());
    let data = Bytes::new(&t.env);
    t.provider_client
        .flash_loan(&good_id, &t.token, &0i128, &data);
}

// ---------------------------------------------------------------------------
// Fee configuration
// ---------------------------------------------------------------------------

#[test]
fn test_set_fee_bps() {
    let t = setup(9);
    assert_eq!(t.provider_client.get_fee_bps(), 9);
    t.provider_client.set_fee_bps(&t.admin, &50i128);
    assert_eq!(t.provider_client.get_fee_bps(), 50);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #3)")]
fn test_set_fee_bps_unauthorized() {
    let t = setup(9);
    let attacker = Address::generate(&t.env);
    t.provider_client.set_fee_bps(&attacker, &0i128);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #8)")]
fn test_set_fee_bps_too_high() {
    let t = setup(9);
    t.provider_client.set_fee_bps(&t.admin, &501i128);
}

// ---------------------------------------------------------------------------
// Fee withdrawal
// ---------------------------------------------------------------------------

#[test]
fn test_withdraw_fees() {
    let t = setup(9);
    mint(&t.env, &t.token, &t.provider_addr, 100_000);

    let good_id = t.env.register(GoodReceiver, ());
    let loan = 10_000i128;
    let fee = ((loan * 9) + 9_999) / 10_000;
    mint(&t.env, &t.token, &good_id, fee);

    let data = Bytes::new(&t.env);
    t.provider_client.flash_loan(&good_id, &t.token, &loan, &data);

    let treasury = Address::generate(&t.env);
    t.provider_client.withdraw_fees(&t.admin, &t.token, &treasury);

    let tok = token::Client::new(&t.env, &t.token);
    assert_eq!(tok.balance(&treasury), fee);
    assert_eq!(t.provider_client.get_fees_collected(&t.token), 0);
}
