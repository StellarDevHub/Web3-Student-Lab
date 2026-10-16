//! # Flash-Loan Provider for Lending Pool (SC-031)
//!
//! Provides uncollateralized flash loans of pool assets to any borrower contract,
//! requiring full repayment plus a 0.09% (9 BPS) fee within the exact same
//! execution frame / transaction envelope.
//! Accrues fee revenue directly to the pool reserves.

use soroban_sdk::{
    panic_with_error, symbol_short, token, Address, Env, IntoVal, Symbol,
};
use crate::{LPError, BPS};

/// Protocol flash loan fee in basis points (0.09% = 9 bps)
pub const FLASH_LOAN_FEE_BPS: i128 = 9;

/// Storage key for tracking active flash loan reentrancy
const FLASH_LOAN_LOCK: Symbol = symbol_short!("fl_lock");

/// Interface expected for flash-loan receivers
pub trait FlashLoanReceiver {
    fn execute_operation(
        env: Env,
        caller: Address,
        token: Address,
        amount: i128,
        fee: i128,
        params: soroban_sdk::Bytes,
    );
}

pub struct FlashLoan;

impl FlashLoan {
    /// Executes an uncollateralized flash loan:
    /// 1. Verifies the amount is positive.
    /// 2. Sets a transaction-scoped flash-loan lock in temporary storage.
    /// 3. Records pre-loan pool balance of the token.
    /// 4. Transfers `amount` to `receiver`.
    /// 5. Invokes `receiver.execute_operation(...)`.
    /// 6. Verifies that the pool balance is now >= pre-balance + fee (0.09%).
    /// 7. Clears lock and records fee revenue.
    pub fn execute_flash_loan(
        env: &Env,
        receiver: Address,
        token: Address,
        amount: i128,
        params: soroban_sdk::Bytes,
    ) -> i128 {
        if amount <= 0 {
            panic_with_error!(env, LPError::ZeroAmount);
        }

        // Prevent nested flash loans in the same frame
        if env.storage().temporary().has(&FLASH_LOAN_LOCK) {
            panic_with_error!(env, LPError::ReentrancyGuardTriggered);
        }
        env.storage().temporary().set(&FLASH_LOAN_LOCK, &true);

        let token_client = token::Client::new(env, &token);
        let contract_addr = env.current_contract_address();

        let balance_before = token_client.balance(&contract_addr);
        if balance_before < amount {
            env.storage().temporary().remove(&FLASH_LOAN_LOCK);
            panic_with_error!(env, LPError::InsufficientBal);
        }

        // Fee = ceil(amount * 9 / 10,000)
        let fee = match amount
            .checked_mul(FLASH_LOAN_FEE_BPS)
            .and_then(|prod| prod.checked_add(BPS - 1))
            .and_then(|num| num.checked_div(BPS))
        {
            Some(f) => f.max(1),
            None => {
                env.storage().temporary().remove(&FLASH_LOAN_LOCK);
                panic_with_error!(env, LPError::Overflow);
            }
        };

        // Transfer funds to receiver
        token_client.transfer(&contract_addr, &receiver, &amount);

        // Call borrower's contract hook
        let receiver_args = (
            contract_addr.clone(),
            token.clone(),
            amount,
            fee,
            params,
        );
        env.invoke_contract::<()>(
            &receiver,
            &Symbol::new(env, "execute_operation"),
            receiver_args.into_val(env),
        );

        // Verification: ensure full repayment + fee
        let balance_after = token_client.balance(&contract_addr);
        let required_balance = match balance_before.checked_add(fee) {
            Some(req) => req,
            None => {
                env.storage().temporary().remove(&FLASH_LOAN_LOCK);
                panic_with_error!(env, LPError::Overflow);
            }
        };

        if balance_after < required_balance {
            env.storage().temporary().remove(&FLASH_LOAN_LOCK);
            panic_with_error!(env, LPError::InsufficientBal);
        }

        // Clear temporary lock
        env.storage().temporary().remove(&FLASH_LOAN_LOCK);

        // Emit flash-loan event
        env.events().publish(
            (symbol_short!("flash"), token, receiver),
            (amount, fee),
        );

        fee
    }
}
