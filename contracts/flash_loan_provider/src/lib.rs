#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, token, Address, Env,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum FlashLoanError {
    InvalidAmount = 1,
    NotRepaid = 2,
    AlreadyInitialized = 3,
    NotInitialized = 4,
}

/// Typed instance-storage keys. Each variant XDR-encodes as its own key, so
/// these cannot collide with keys written by other modules or other versions.
#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Token,
    FeeBps,
}

#[contract]
pub struct FlashLoanProvider;

#[contractimpl]
impl FlashLoanProvider {
    pub fn initialize(env: Env, admin: Address, token: Address, fee_bps: i128) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, FlashLoanError::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::FeeBps, &fee_bps);
    }

    pub fn flash_loan(env: Env, borrower: Address, amount: i128) -> i128 {
        if amount <= 0 {
            panic_with_error!(&env, FlashLoanError::InvalidAmount);
        }
        let token_addr: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let fee_bps: i128 = env.storage().instance().get(&DataKey::FeeBps).unwrap_or(10);
        let token = token::Client::new(&env, &token_addr);
        let contract_addr = env.current_contract_address();
        token.transfer(&contract_addr, &borrower, &amount);
        let fee = (amount * fee_bps) / 10_000;
        let repay = amount + fee;
        token.transfer(&borrower, &contract_addr, &repay);
        repay
    }
}
