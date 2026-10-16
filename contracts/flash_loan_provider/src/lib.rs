#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, panic_with_error, Address, Env, token};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum FlashLoanError {
    InvalidAmount = 1,
    NotRepaid = 2,
    AlreadyInitialized = 3,
    NotInitialized = 4,
}

#[contract]
pub struct FlashLoanProvider;

#[contractimpl]
impl FlashLoanProvider {
    pub fn initialize(env: Env, admin: Address, token: Address, fee_bps: i128) {
        if env.storage().instance().has(&("admin")) {
            panic_with_error!(&env, FlashLoanError::AlreadyInitialized);
        }
        env.storage().instance().set(&("admin"), &admin);
        env.storage().instance().set(&("token"), &token);
        env.storage().instance().set(&("fee_bps"), &fee_bps);
    }

    pub fn flash_loan(env: Env, borrower: Address, amount: i128) -> i128 {
        if amount <= 0 {
            panic_with_error!(&env, FlashLoanError::InvalidAmount);
        }
        let token_addr: Address = env.storage().instance().get(&("token")).unwrap();
        let fee_bps: i128 = env.storage().instance().get(&("fee_bps")).unwrap_or(10);
        let token = token::Client::new(&env, &token_addr);
        let contract_addr = env.current_contract_address();
        token.transfer(&contract_addr, &borrower, &amount);
        let fee = (amount * fee_bps) / 10_000;
        let repay = amount + fee;
        token.transfer(&borrower, &contract_addr, &repay);
        repay
    }
}
