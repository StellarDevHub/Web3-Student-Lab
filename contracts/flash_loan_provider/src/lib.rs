#![no_std]

pub mod receiver;

#[cfg(test)]
mod test;

use receiver::FlashLoanReceiver;
use soroban_sdk::{
    contract, contracterror, contractimpl, panic_with_error, symbol_short, token, Address, Bytes,
    Env, IntoVal, Symbol,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum FlashLoanError {
    InvalidAmount = 1,
    NotRepaid = 2,
    AlreadyInitialized = 3,
    NotInitialized = 4,
    ReentrancyGuardTriggered = 5,
    InsufficientBalance = 6,
    Overflow = 7,
}

#[contract]
pub struct FlashLoanProvider;

const FLASH_LOAN_LOCK: Symbol = symbol_short!("fl_lock");

#[contractimpl]
impl FlashLoanProvider {
    pub fn initialize(env: Env, admin: Address, token: Address, fee_bps: i128) {
        if env.storage().instance().has(&("admin")) {
            panic_with_error!(&env, FlashLoanError::AlreadyInitialized);
        }
        admin.require_auth();
        if fee_bps < 0 {
            panic_with_error!(&env, FlashLoanError::InvalidAmount);
        }
        env.storage().instance().set(&("admin"), &admin);
        env.storage().instance().set(&("token"), &token);
        env.storage().instance().set(&("fee_bps"), &fee_bps);
    }

    pub fn flash_loan(env: Env, borrower: Address, amount: i128) -> i128 {
        let params = Bytes::new(&env);
        Self::flash_loan_with_params(env, borrower, amount, params)
    }

    pub fn flash_loan_with_params(
        env: Env,
        borrower: Address,
        amount: i128,
        params: Bytes,
    ) -> i128 {
        if amount <= 0 {
            panic_with_error!(&env, FlashLoanError::InvalidAmount);
        }

        borrower.require_auth();

        if env.storage().temporary().has(&FLASH_LOAN_LOCK) {
            panic_with_error!(&env, FlashLoanError::ReentrancyGuardTriggered);
        }
        env.storage().temporary().set(&FLASH_LOAN_LOCK, &true);

        let token_addr: Address = env
            .storage()
            .instance()
            .get(&("token"))
            .unwrap_or_else(|| panic_with_error!(&env, FlashLoanError::NotInitialized));
        let fee_bps: i128 = env.storage().instance().get(&("fee_bps")).unwrap_or(10);
        if fee_bps < 0 {
            env.storage().temporary().remove(&FLASH_LOAN_LOCK);
            panic_with_error!(&env, FlashLoanError::InvalidAmount);
        }

        let token = token::Client::new(&env, &token_addr);
        let contract_addr = env.current_contract_address();
        let balance_before = token.balance(&contract_addr);
        if balance_before < amount {
            env.storage().temporary().remove(&FLASH_LOAN_LOCK);
            panic_with_error!(&env, FlashLoanError::InsufficientBalance);
        }

        const BPS: i128 = 10_000;
        let fee = amount
            .checked_mul(fee_bps)
            .and_then(|product| product.checked_add(BPS - 1))
            .and_then(|numerator| numerator.checked_div(BPS))
            .map(|value| value.max(1))
            .unwrap_or_else(|| {
                env.storage().temporary().remove(&FLASH_LOAN_LOCK);
                panic_with_error!(&env, FlashLoanError::Overflow);
            });

        token.transfer(&contract_addr, &borrower, &amount);

        let args = (
            borrower.clone(),
            token_addr.clone(),
            amount,
            fee,
            params,
        );
        env.invoke_contract::<()>(
            &borrower,
            &Symbol::new(&env, "execute_operation"),
            args.into_val(&env),
        );

        let balance_after = token.balance(&contract_addr);
        let required_balance = balance_before
            .checked_add(fee)
            .unwrap_or_else(|| {
                env.storage().temporary().remove(&FLASH_LOAN_LOCK);
                panic_with_error!(&env, FlashLoanError::Overflow);
            });

        if balance_after < required_balance {
            env.storage().temporary().remove(&FLASH_LOAN_LOCK);
            panic_with_error!(&env, FlashLoanError::NotRepaid);
        }

        env.storage().temporary().remove(&FLASH_LOAN_LOCK);
        env.events()
            .publish((symbol_short!("flash"), token_addr), (amount, fee));
        amount.checked_add(fee).unwrap_or_else(|| {
            env.storage().temporary().remove(&FLASH_LOAN_LOCK);
            panic_with_error!(&env, FlashLoanError::Overflow);
        })
    }
}
