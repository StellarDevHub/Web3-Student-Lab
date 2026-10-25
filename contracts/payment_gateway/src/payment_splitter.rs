//! # Multi-Token Payment Splitter Contract — SC-039
//!
//! An immutable payment splitter contract supporting multiple arbitrary Soroban tokens.
//! Accepts deposits in any token and splits balances proportionally among beneficiary
//! addresses according to predetermined share weights.
//!
//! ## Key Invariants
//! - Supports deposits in multiple arbitrary Soroban token assets.
//! - Beneficiaries can pull their exact accrued share at any time.
//! - Accurately tracks accumulated total shares without integer truncation loss.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, token,
    Address, Env, Map, Vec,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum SplitterError {
    InvalidPayees = 1,
    MismatchedLengths = 2,
    ZeroShares = 3,
    DuplicatePayee = 4,
    AlreadyInitialized = 5,
    NotInitialized = 6,
    PayeeNotFound = 7,
    NoPaymentDue = 8,
    InvalidAmount = 9,
}

#[contracttype]
#[derive(Clone)]
pub enum SplitterDataKey {
    Payees,
    TotalShares,
    Shares(Address),
    TotalReleased(Address),
    Released(Address, Address), // (Token, Payee)
    Initialized,
}

#[contract]
pub struct PaymentSplitter;

#[contractimpl]
impl PaymentSplitter {
    /// Initialize the payment splitter with immutable beneficiaries and share weights.
    pub fn initialize(env: Env, payees: Vec<Address>, shares: Vec<u32>) {
        if env.storage().instance().has(&SplitterDataKey::Initialized) {
            panic_with_error!(&env, SplitterError::AlreadyInitialized);
        }

        let num_payees = payees.len();
        if num_payees == 0 {
            panic_with_error!(&env, SplitterError::InvalidPayees);
        }
        if num_payees != shares.len() {
            panic_with_error!(&env, SplitterError::MismatchedLengths);
        }

        let mut seen = Map::<Address, bool>::new(&env);
        let mut total_shares: u128 = 0;

        for i in 0..num_payees {
            let payee = payees.get(i).unwrap();
            let share = shares.get(i).unwrap();

            if share == 0 {
                panic_with_error!(&env, SplitterError::ZeroShares);
            }
            if seen.contains_key(payee.clone()) {
                panic_with_error!(&env, SplitterError::DuplicatePayee);
            }

            seen.set(payee.clone(), true);
            total_shares = total_shares
                .checked_add(share as u128)
                .unwrap_or_else(|| panic!("total shares overflow"));

            env.storage()
                .persistent()
                .set(&SplitterDataKey::Shares(payee.clone()), &share);
        }

        env.storage()
            .instance()
            .set(&SplitterDataKey::Payees, &payees);
        env.storage()
            .instance()
            .set(&SplitterDataKey::TotalShares, &total_shares);
        env.storage()
            .instance()
            .set(&SplitterDataKey::Initialized, &true);

        env.events().publish(
            (symbol_short!("init_ps"),),
            (num_payees as u32, total_shares),
        );
    }

    /// Deposit arbitrary Soroban token to the splitter contract.
    pub fn deposit(env: Env, sender: Address, token: Address, amount: i128) {
        sender.require_auth();
        Self::require_initialized(&env);

        if amount <= 0 {
            panic_with_error!(&env, SplitterError::InvalidAmount);
        }

        let client = token::Client::new(&env, &token);
        client.transfer(&sender, &env.current_contract_address(), &amount);

        env.events()
            .publish((symbol_short!("ps_dep"), token.clone(), sender), amount);
    }

    /// Release accrued tokens to a specific beneficiary. Pull-payment pattern.
    pub fn release(env: Env, token: Address, payee: Address) -> i128 {
        payee.require_auth();
        Self::require_initialized(&env);

        let payment = Self::pending_payment(env.clone(), token.clone(), payee.clone());
        if payment <= 0 {
            panic_with_error!(&env, SplitterError::NoPaymentDue);
        }

        let current_released = Self::released(env.clone(), token.clone(), payee.clone());
        let new_released = current_released
            .checked_add(payment)
            .expect("overflow updating released");
        env.storage().persistent().set(
            &SplitterDataKey::Released(token.clone(), payee.clone()),
            &new_released,
        );

        let current_total_released = Self::total_released(env.clone(), token.clone());
        let new_total_released = current_total_released
            .checked_add(payment)
            .expect("overflow updating total released");
        env.storage().persistent().set(
            &SplitterDataKey::TotalReleased(token.clone()),
            &new_total_released,
        );

        let client = token::Client::new(&env, &token);
        client.transfer(&env.current_contract_address(), &payee, &payment);

        env.events()
            .publish((symbol_short!("released"), token, payee), payment);

        payment
    }

    /// View pending withdrawable payment for a given token and beneficiary.
    pub fn pending_payment(env: Env, token: Address, payee: Address) -> i128 {
        Self::require_initialized(&env);

        let payee_share = Self::shares(env.clone(), payee.clone());
        if payee_share == 0 {
            panic_with_error!(&env, SplitterError::PayeeNotFound);
        }

        let total_shares = Self::total_shares(env.clone());
        let total_released = Self::total_released(env.clone(), token.clone());
        let token_client = token::Client::new(&env, &token);
        let current_balance = token_client.balance(&env.current_contract_address());

        let total_received = (current_balance as i128)
            .checked_add(total_released)
            .expect("overflow calculating total received");

        // Precise integer arithmetic: total_received * payee_share / total_shares
        let total_allocation = (total_received as i128)
            .checked_mul(payee_share as i128)
            .expect("overflow multiplying allocation")
            / (total_shares as i128);

        let already_released = Self::released(env, token, payee);
        total_allocation.saturating_sub(already_released)
    }

    /// Total shares configured across all beneficiaries.
    pub fn total_shares(env: Env) -> u128 {
        env.storage()
            .instance()
            .get(&SplitterDataKey::TotalShares)
            .unwrap_or(0)
    }

    /// Individual share weight for a beneficiary.
    pub fn shares(env: Env, payee: Address) -> u32 {
        env.storage()
            .persistent()
            .get(&SplitterDataKey::Shares(payee))
            .unwrap_or(0)
    }

    /// List of all beneficiaries.
    pub fn payees(env: Env) -> Vec<Address> {
        env.storage()
            .instance()
            .get(&SplitterDataKey::Payees)
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Total amount of a specific token released across all beneficiaries.
    pub fn total_released(env: Env, token: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&SplitterDataKey::TotalReleased(token))
            .unwrap_or(0)
    }

    /// Total amount of a specific token released to a specific beneficiary.
    pub fn released(env: Env, token: Address, payee: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&SplitterDataKey::Released(token, payee))
            .unwrap_or(0)
    }

    fn require_initialized(env: &Env) {
        if !env.storage().instance().has(&SplitterDataKey::Initialized) {
            panic_with_error!(env, SplitterError::NotInitialized);
        }
    }
}
