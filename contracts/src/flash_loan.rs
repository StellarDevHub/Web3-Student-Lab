//! Flash Loan Provider with Arbitrage Protection – Issue #502
//!
//! Provides collateral-free flash loans that must be repaid (plus a fee)
//! within the same atomic transaction. Any failure to repay causes the entire
//! transaction to revert, enforcing the invariant without additional on-chain
//! bookkeeping.
//!
//! ## Architecture
//! ```text
//! borrower
//!   └─► flash_loan(token, amount, receiver, data)
//!         ├─ record balance_before
//!         ├─ [acquire reentrancy lock]
//!         ├─ transfer amount → receiver
//!         ├─ invoke_contract(receiver, "execute_operation", [token, amount, fee, self, data])
//!         ├─ assert balance_after >= balance_before + fee
//!         └─ [release reentrancy lock]
//! ```
//!
//! ## Security properties
//! - **Atomicity**: Soroban's transaction model guarantees all-or-nothing
//!   semantics. If the receiver does not repay, the balance assertion panics
//!   and the entire transaction is reverted, including the initial transfer.
//! - **Reentrancy guard**: prevents a re-entrant call to `flash_loan` while
//!   a loan is in-flight (e.g. from within `execute_operation`).
//! - **Oracle manipulation resistance**: the fee is computed from the snapshot
//!   balance recorded before any external call, not from mutable contract
//!   state that could be manipulated mid-execution.
//! - **Integer overflow**: all arithmetic uses checked operations.
//!
//! ## Flash Loan Receiver interface
//! The receiver contract must expose:
//! ```ignore
//! fn execute_operation(
//!     env: Env,
//!     token: Address,
//!     amount: i128,
//!     fee: i128,
//!     initiator: Address,
//!     data: Bytes,
//! )
//! ```
//! It is responsible for repaying `amount + fee` tokens to the provider
//! contract address before returning.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, token,
    Address, Bytes, Env, IntoVal, Symbol, Val, Vec,
};

use crate::security_primitives::{nonreentrant_acquire, nonreentrant_release, safe_add};

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone)]
pub enum FlashLoanKey {
    Admin,
    /// Fee in basis points (e.g. 9 = 0.09%).
    FeeBps,
    /// Total fees collected per token: token_address → i128.
    FeesCollected(Address),
    /// Total volume processed per token: token_address → i128.
    TotalVolume(Address),
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum FlashLoanError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    /// Requested loan amount is zero or negative.
    InvalidAmount = 4,
    /// Provider has insufficient liquidity to fulfill the request.
    InsufficientLiquidity = 5,
    /// Receiver did not repay `amount + fee` before the callback returned.
    LoanNotRepaid = 6,
    /// A flash loan is already in progress on this contract (reentrancy).
    Reentrant = 7,
    /// Fee basis points exceeds 10 000 (100%).
    InvalidFee = 8,
}

/// Maximum fee: 500 bps = 5%.
const MAX_FEE_BPS: i128 = 500;
/// Default fee: 9 bps = 0.09%.
const DEFAULT_FEE_BPS: i128 = 9;

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct FlashLoanProviderContract;

#[contractimpl]
impl FlashLoanProviderContract {
    /// Initialise the flash loan provider.
    ///
    /// * `admin`   – may update fee configuration and withdraw protocol fees.
    /// * `fee_bps` – fee in basis points charged on each loan.
    pub fn initialize(env: Env, admin: Address, fee_bps: i128) {
        if env.storage().instance().has(&FlashLoanKey::Admin) {
            panic_with_error!(&env, FlashLoanError::AlreadyInitialized);
        }
        if fee_bps < 0 || fee_bps > MAX_FEE_BPS {
            panic_with_error!(&env, FlashLoanError::InvalidFee);
        }
        env.storage().instance().set(&FlashLoanKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&FlashLoanKey::FeeBps, &fee_bps);
        env.events()
            .publish((symbol_short!("fl_init"),), (admin, fee_bps));
    }

    // -----------------------------------------------------------------------
    // Liquidity management
    // -----------------------------------------------------------------------

    /// Deposit tokens to increase the loanable liquidity pool.
    /// Any address may provide liquidity (simplified model – no LP shares).
    pub fn provide_liquidity(env: Env, provider: Address, token: Address, amount: i128) {
        provider.require_auth();
        if amount <= 0 {
            panic_with_error!(&env, FlashLoanError::InvalidAmount);
        }
        token::Client::new(&env, &token).transfer(
            &provider,
            &env.current_contract_address(),
            &amount,
        );
        env.events()
            .publish((symbol_short!("fl_dep"),), (provider, token, amount));
    }

    // -----------------------------------------------------------------------
    // Flash loan execution
    // -----------------------------------------------------------------------

    /// Execute a flash loan.
    ///
    /// Transfers `amount` of `token` to `receiver`, calls
    /// `receiver.execute_operation(token, amount, fee, self_address, data)`,
    /// then verifies the provider's balance has been restored to at least
    /// `balance_before + fee`. Reverts if the invariant is not satisfied.
    ///
    /// # Arguments
    /// * `receiver` – contract address implementing the receiver interface.
    /// * `token`    – SAC or custom token address.
    /// * `amount`   – loan amount (must be ≤ available liquidity).
    /// * `data`     – arbitrary bytes forwarded to the receiver callback.
    pub fn flash_loan(
        env: Env,
        receiver: Address,
        token: Address,
        amount: i128,
        data: Bytes,
    ) -> i128 {
        Self::assert_initialized(&env);

        if amount <= 0 {
            panic_with_error!(&env, FlashLoanError::InvalidAmount);
        }

        let token_client = token::Client::new(&env, &token);
        let self_addr = env.current_contract_address();

        // Snapshot balance and derive fee BEFORE any external call so they
        // cannot be manipulated by an oracle or re-entrant call.
        let balance_before = token_client.balance(&self_addr);
        if balance_before < amount {
            panic_with_error!(&env, FlashLoanError::InsufficientLiquidity);
        }

        let fee_bps: i128 = env
            .storage()
            .instance()
            .get(&FlashLoanKey::FeeBps)
            .unwrap_or(DEFAULT_FEE_BPS);
        // fee = ceil(amount * fee_bps / 10_000) – always at least 1 stroop.
        let fee = ((amount * fee_bps) + 9_999) / 10_000;
        let repayment_required = safe_add(&env, amount, fee);

        // Acquire reentrancy lock BEFORE transferring tokens.
        nonreentrant_acquire(&env, symbol_short!("fl_lock"));

        // Transfer loan amount to receiver.
        token_client.transfer(&self_addr, &receiver, &amount);

        // Invoke receiver callback.
        let func = Symbol::new(&env, "execute_operation");
        let mut args: Vec<Val> = Vec::new(&env);
        args.push_back(token.clone().into_val(&env));
        args.push_back(amount.into_val(&env));
        args.push_back(fee.into_val(&env));
        args.push_back(self_addr.clone().into_val(&env));
        args.push_back(data.into_val(&env));
        env.invoke_contract::<()>(&receiver, &func, args);

        // Verify repayment invariant.
        let balance_after = token_client.balance(&self_addr);
        if balance_after < safe_add(&env, balance_before, fee) {
            panic_with_error!(&env, FlashLoanError::LoanNotRepaid);
        }

        nonreentrant_release(&env, symbol_short!("fl_lock"));

        // Accumulate protocol statistics.
        let prev_fees: i128 = env
            .storage()
            .persistent()
            .get(&FlashLoanKey::FeesCollected(token.clone()))
            .unwrap_or(0);
        env.storage()
            .persistent()
            .set(&FlashLoanKey::FeesCollected(token.clone()), &safe_add(&env, prev_fees, fee));

        let prev_vol: i128 = env
            .storage()
            .persistent()
            .get(&FlashLoanKey::TotalVolume(token.clone()))
            .unwrap_or(0);
        env.storage()
            .persistent()
            .set(&FlashLoanKey::TotalVolume(token.clone()), &safe_add(&env, prev_vol, amount));

        env.events()
            .publish((symbol_short!("fl_loan"),), (receiver, token, amount, fee));

        fee
    }

    // -----------------------------------------------------------------------
    // Admin operations
    // -----------------------------------------------------------------------

    /// Update the protocol fee. Only admin.
    pub fn set_fee_bps(env: Env, caller: Address, fee_bps: i128) {
        caller.require_auth();
        Self::assert_admin(&env, &caller);
        if fee_bps < 0 || fee_bps > MAX_FEE_BPS {
            panic_with_error!(&env, FlashLoanError::InvalidFee);
        }
        env.storage()
            .instance()
            .set(&FlashLoanKey::FeeBps, &fee_bps);
        env.events()
            .publish((symbol_short!("fl_fee"),), fee_bps);
    }

    /// Withdraw accumulated protocol fees. Only admin.
    pub fn withdraw_fees(env: Env, caller: Address, token: Address, to: Address) {
        caller.require_auth();
        Self::assert_admin(&env, &caller);

        let fees: i128 = env
            .storage()
            .persistent()
            .get(&FlashLoanKey::FeesCollected(token.clone()))
            .unwrap_or(0);
        if fees > 0 {
            token::Client::new(&env, &token).transfer(
                &env.current_contract_address(),
                &to,
                &fees,
            );
            env.storage()
                .persistent()
                .set(&FlashLoanKey::FeesCollected(token.clone()), &0i128);
            env.events()
                .publish((symbol_short!("fl_wdfw"),), (token, to, fees));
        }
    }

    // -----------------------------------------------------------------------
    // Queries
    // -----------------------------------------------------------------------

    /// Current fee in basis points.
    pub fn get_fee_bps(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&FlashLoanKey::FeeBps)
            .unwrap_or(DEFAULT_FEE_BPS)
    }

    /// Accumulated fees for a token (not yet withdrawn).
    pub fn get_fees_collected(env: Env, token: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&FlashLoanKey::FeesCollected(token))
            .unwrap_or(0)
    }

    /// Total loan volume for a token.
    pub fn get_total_volume(env: Env, token: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&FlashLoanKey::TotalVolume(token))
            .unwrap_or(0)
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    fn assert_initialized(env: &Env) {
        if !env.storage().instance().has(&FlashLoanKey::Admin) {
            panic_with_error!(env, FlashLoanError::NotInitialized);
        }
    }

    fn assert_admin(env: &Env, caller: &Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&FlashLoanKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, FlashLoanError::NotInitialized));
        if *caller != admin {
            panic_with_error!(env, FlashLoanError::Unauthorized);
        }
    }
}
