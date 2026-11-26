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
    ReentrancyGuardTriggered = 5,
    InsufficientBalance = 6,
    Overflow = 7,
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

const FLASH_LOAN_LOCK: Symbol = symbol_short!("fl_lock");

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
        let token_addr: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let fee_bps: i128 = env.storage().instance().get(&DataKey::FeeBps).unwrap_or(10);
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

        let args = (borrower.clone(), token_addr.clone(), amount, fee, params);
        env.invoke_contract::<()>(
            &borrower,
            &Symbol::new(&env, "execute_operation"),
            args.into_val(&env),
        );

        let balance_after = token.balance(&contract_addr);
        let required_balance = balance_before.checked_add(fee).unwrap_or_else(|| {
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
