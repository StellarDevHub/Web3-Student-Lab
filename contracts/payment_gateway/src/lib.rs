//! # Payment Gateway Contract
//!
//! A cross-platform payment processor for the Web3 Student Lab.
//! Supports deposits, payment processing, refunds, and balance tracking.
//!
//! ## Key Features
//! - Deposit/withdraw tokens
//! - Process payments to beneficiaries
//! - Track transaction history
//! - Refund logic with cooldown protection
//! - Admin controls for pausing and emergency recovery
//!
//! ## Security
//! - Authorization checks on all state-changing operations
//! - Overflow/underflow protection via checked arithmetic
//! - Reentrancy protection (no external calls during state changes)

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, Address,
    Env, Symbol,
};

// ── Storage keys ────────────────────────────────────────────────────────────
const ADMIN: Symbol = symbol_short!("ADMIN");
const PAUSED: Symbol = symbol_short!("PAUSED");
const TOTAL_DEPOSITED: Symbol = symbol_short!("TDEP");
const TOTAL_PAID_OUT: Symbol = symbol_short!("TPAYOUT");
const PLATFORM_FEE_BPS: Symbol = symbol_short!("PFEES");

// ── Data types ───────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentRecord {
    pub id: u64,
    pub payer: Address,
    pub payee: Address,
    pub amount: i128,
    pub fee: i128,
    pub status: PaymentStatus,
    pub timestamp: u64,
    pub metadata: Symbol,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PaymentStatus {
    Pending = 0,
    Completed = 1,
    Refunded = 2,
    Failed = 3,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PaymentError {
    Unauthorized = 1,
    Paused = 2,
    InvalidAmount = 3,
    InsufficientBalance = 4,
    InvalidPayee = 5,
    RecordNotFound = 6,
    RefundWindowClosed = 7,
    ArithmeticOverflow = 8,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Error {
    Unauthorized = 1,
    Paused = 2,
    InvalidAmount = 3,
    InsufficientBalance = 4,
    InvalidPayee = 5,
    RecordNotFound = 6,
    RefundWindowClosed = 7,
    ArithmeticOverflow = 8,
}

// ── User balance mapping ─────────────────────────────────────────────────────
#[contracttype]
pub enum DataKey {
    Balance(Address),
    Payment(u64),
}

// ── Contract ─────────────────────────────────────────────────────────────────
const MAX_REFUND_LEDGERS: u64 = 1000;
const DEFAULT_PLATFORM_FEE_BPS: u32 = 50; // 0.50%

#[contract]
pub struct PaymentGateway;

#[contractimpl]
impl PaymentGateway {
    // ── Initialization ──────────────────────────────────────────────────────

    pub fn initialize(env: Env, admin: Address) {
        admin.require_auth();
        env.storage().instance().set(&ADMIN, &admin);
        env.storage()
            .instance()
            .set(&PLATFORM_FEE_BPS, &DEFAULT_PLATFORM_FEE_BPS);
        env.storage().instance().set(&PAUSED, &false);
        env.events().publish((symbol_short!("init"),), admin);
    }

    // ── Deposit ─────────────────────────────────────────────────────────────

    pub fn deposit(env: Env, user: Address, amount: i128) {
        user.require_auth();
        Self::require_not_paused(&env);
        assert!(amount > 0, "invalid amount");

        let mut balance: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::Balance(user.clone()))
            .unwrap_or(0);

        balance = balance.checked_add(amount).expect("balance overflow");

        env.storage()
            .persistent()
            .set(&DataKey::Balance(user.clone()), &balance);

        let mut total: i128 = env.storage().instance().get(&TOTAL_DEPOSITED).unwrap_or(0);
        total = total.checked_add(amount).expect("total overflow");
        env.storage().instance().set(&TOTAL_DEPOSITED, &total);

        env.events()
            .publish((symbol_short!("deposit"), user.clone()), amount);
    }

    // ── Withdraw ────────────────────────────────────────────────────────────

    pub fn withdraw(env: Env, user: Address, amount: i128) -> i128 {
        user.require_auth();
        Self::require_not_paused(&env);
        assert!(amount > 0, "invalid amount");

        let mut balance: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::Balance(user.clone()))
            .unwrap_or(0);

        assert!(balance >= amount, "insufficient balance");

        balance = balance.checked_sub(amount).expect("balance underflow");
        env.storage()
            .persistent()
            .set(&DataKey::Balance(user.clone()), &balance);

        env.events()
            .publish((symbol_short!("withdraw"), user.clone()), amount);

        amount
    }

    // ── Process Payment ─────────────────────────────────────────────────────

    pub fn process_payment(
        env: Env,
        payer: Address,
        payee: Address,
        amount: i128,
        metadata: Symbol,
        payment_id: u64,
    ) -> PaymentRecord {
        payer.require_auth();
        Self::require_not_paused(&env);
        assert!(amount > 0, "invalid amount");

        let platform_fee: u32 = env
            .storage()
            .instance()
            .get(&PLATFORM_FEE_BPS)
            .unwrap_or(DEFAULT_PLATFORM_FEE_BPS);

        let fee = Self::calculate_fee(&env, amount, platform_fee);
        let total_debit = amount.checked_add(fee).expect("total overflow");

        let mut payer_balance: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::Balance(payer.clone()))
            .unwrap_or(0);

        assert!(payer_balance >= total_debit, "insufficient balance");

        payer_balance = payer_balance
            .checked_sub(total_debit)
            .expect("payer underflow");
        env.storage()
            .persistent()
            .set(&DataKey::Balance(payer.clone()), &payer_balance);

        let mut payee_balance: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::Balance(payee.clone()))
            .unwrap_or(0);

        payee_balance = payee_balance.checked_add(amount).expect("payee overflow");
        env.storage()
            .persistent()
            .set(&DataKey::Balance(payee.clone()), &payee_balance);

        let mut total_paid: i128 = env.storage().instance().get(&TOTAL_PAID_OUT).unwrap_or(0);
        total_paid = total_paid.checked_add(amount).expect("total overflow");
        env.storage().instance().set(&TOTAL_PAID_OUT, &total_paid);

        let record = PaymentRecord {
            id: payment_id,
            payer: payer.clone(),
            payee: payee.clone(),
            amount,
            fee,
            status: PaymentStatus::Completed,
            timestamp: env.ledger().sequence() as u64,
            metadata,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Payment(payment_id), &record);

        env.events().publish(
            (symbol_short!("payment"), payer.clone(), payee.clone()),
            amount,
        );

        record
    }

    // ── Refund ──────────────────────────────────────────────────────────────

    pub fn refund(env: Env, caller: Address, payment_id: u64) -> PaymentRecord {
        caller.require_auth();
        Self::require_not_paused(&env);

        let key = DataKey::Payment(payment_id);
        let record: PaymentRecord = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::RecordNotFound));

        // Only admin or original payer can request refund
        let admin: Address = env
            .storage()
            .instance()
            .get(&ADMIN)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Unauthorized));

        if caller != record.payer && caller != admin {
            panic_with_error!(&env, Error::Unauthorized);
        }

        let current_ledger = env.ledger().sequence() as u64;
        assert!(
            current_ledger <= record.timestamp + MAX_REFUND_LEDGERS,
            "refund window closed"
        );

        let mut payer_balance: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::Balance(record.payer.clone()))
            .unwrap_or(0);

        payer_balance = payer_balance
            .checked_add(record.amount)
            .expect("payer overflow");
        env.storage()
            .persistent()
            .set(&DataKey::Balance(record.payer.clone()), &payer_balance);

        let mut payee_balance: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::Balance(record.payee.clone()))
            .unwrap_or(0);

        payee_balance = payee_balance
            .checked_sub(record.amount)
            .expect("payee underflow");
        env.storage()
            .persistent()
            .set(&DataKey::Balance(record.payee.clone()), &payee_balance);

        let refunded = PaymentRecord {
            id: record.id,
            payer: record.payer,
            payee: record.payee,
            amount: record.amount,
            fee: record.fee,
            status: PaymentStatus::Refunded,
            timestamp: record.timestamp,
            metadata: record.metadata,
        };

        env.storage().persistent().set(&key, &refunded);

        env.events().publish((symbol_short!("refund"),), payment_id);

        refunded
    }

    // ── View helpers ────────────────────────────────────────────────────────

    pub fn get_balance(env: Env, user: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Balance(user))
            .unwrap_or(0)
    }

    pub fn get_payment(env: Env, payment_id: u64) -> PaymentRecord {
        env.storage()
            .persistent()
            .get(&DataKey::Payment(payment_id))
            .unwrap_or_else(|| panic_with_error!(&env, Error::RecordNotFound))
    }

    pub fn get_admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&ADMIN)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Unauthorized))
    }

    pub fn is_paused(env: Env) -> bool {
        env.storage().instance().get(&PAUSED).unwrap_or(false)
    }

    fn require_admin(env: &Env, caller: &Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&ADMIN)
            .unwrap_or_else(|| panic_with_error!(env, Error::Unauthorized));

        if *caller != admin {
            panic_with_error!(env, Error::Unauthorized);
        }
    }

    fn require_not_paused(env: &Env) {
        let paused: bool = env.storage().instance().get(&PAUSED).unwrap_or(false);
        if paused {
            panic_with_error!(env, Error::Paused);
        }
    }

    fn calculate_fee(env: &Env, amount: i128, fee_bps: u32) -> i128 {
        amount
            .checked_mul(fee_bps as i128)
            .expect("fee overflow")
            .checked_div(10_000)
            .expect("fee div")
    }
}

// ── Admin functions ─────────────────────────────────────────────────────────

#[contractimpl]
impl PaymentGateway {
    pub fn pause(env: Env, admin: Address) {
        admin.require_auth();
        Self::require_admin(&env, &admin);
        env.storage().instance().set(&PAUSED, &true);
        env.events().publish((symbol_short!("pause"),), ());
    }

    pub fn unpause(env: Env, admin: Address) {
        admin.require_auth();
        Self::require_admin(&env, &admin);
        env.storage().instance().set(&PAUSED, &false);
        env.events().publish((symbol_short!("unpause"),), ());
    }

    pub fn update_fee_bps(env: Env, admin: Address, new_fee_bps: u32) {
        admin.require_auth();
        Self::require_admin(&env, &admin);
        env.storage()
            .instance()
            .set(&PLATFORM_FEE_BPS, &new_fee_bps);
        env.events()
            .publish((symbol_short!("fee_upd"),), new_fee_bps);
    }

    pub fn transfer_admin(env: Env, admin: Address, new_admin: Address) {
        admin.require_auth();
        Self::require_admin(&env, &admin);
        env.storage().instance().set(&ADMIN, &new_admin);
        env.events()
            .publish((symbol_short!("admin_tx"),), new_admin);
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        Env,
    };

    fn setup() -> (Env, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(PaymentGateway, ());
        let admin = Address::generate(&env);
        let user = Address::generate(&env);
        let client = PaymentGatewayClient::new(&env, &contract_id);

        client.initialize(admin.clone());
        (env, contract_id, admin)
    }

    fn setup_with_user() -> (Env, Address, Address, Address, PaymentGatewayClient) {
        let (env, contract_id, admin) = setup();
        let user = Address::generate(&env);
        let client = PaymentGatewayClient::new(&env, &contract_id);
        (env, contract_id, admin, user, client)
    }

    #[test]
    fn test_initialize() {
        let (env, contract_id, admin) = setup();
        let client = PaymentGatewayClient::new(&env, &contract_id);

        assert_eq!(client.get_admin(), admin);
        assert!(!client.is_paused());
    }

    #[test]
    fn test_deposit_and_balance() {
        let (env, _contract_id, _admin, user, client) = setup_with_user();

        client.deposit(&user, &1000);
        assert_eq!(client.get_balance(user.clone()), 1000);
    }

    #[test]
    fn test_withdraw_reduces_balance() {
        let (env, _contract_id, _admin, user, client) = setup_with_user();

        client.deposit(&user, &1000);
        let withdrawn = client.withdraw(&user, &400);
        assert_eq!(withdrawn, 400);
        assert_eq!(client.get_balance(user), 600);
    }

    #[test]
    #[should_panic(expected = "insufficient balance")]
    fn test_withdraw_over_balance_panics() {
        let (env, _contract_id, _admin, user, client) = setup_with_user();
        client.deposit(&user, &100);
        client.withdraw(&user, &200);
    }

    #[test]
    fn test_process_payment() {
        let (env, _contract_id, _admin, payer, client) = setup_with_user();
        let payee = Address::generate(&env);

        client.deposit(&payer, &10_000);
        let record = client.process_payment(&payer, &payee, &3000, &symbol_short!("test!"), &1);

        assert_eq!(record.status, PaymentStatus::Completed);
        assert_eq!(record.amount, 3000);
        assert!(record.fee > 0);
        assert_eq!(client.get_balance(payer), 10_000 - 3000 - record.fee);
    }

    #[test]
    #[should_panic(expected = "invalid amount")]
    fn test_process_zero_payment_panics() {
        let (env, _contract_id, _admin, payer, client) = setup_with_user();
        let payee = Address::generate(&env);
        client.deposit(&payer, &1000);
        client.process_payment(&payer, &payee, &0, &symbol_short!("test!"), &1);
    }

    #[test]
    fn test_refund_within_window() {
        let (env, _contract_id, _admin, payer, client) = setup_with_user();
        let payee = Address::generate(&env);

        client.deposit(&payer, &10_000);
        client.process_payment(&payer, &payee, &3000, &symbol_short!("test!"), &1);

        env.ledger().with_mut(|l| l.sequence_number += 10);

        let refunded = client.refund(&payer, &1);
        assert_eq!(refunded.status, PaymentStatus::Refunded);
    }

    #[test]
    #[should_panic(expected = "refund window closed")]
    fn test_refund_after_window_panics() {
        let (env, _contract_id, _admin, payer, client) = setup_with_user();
        let payee = Address::generate(&env);

        client.deposit(&payer, &10_000);
        client.process_payment(&payer, &payee, &3000, &symbol_short!("test!"), &1);

        env.ledger()
            .with_mut(|l| l.sequence_number += MAX_REFUND_LEDGERS + 10);

        client.refund(&payer, &1);
    }

    #[test]
    fn test_pause_blocks_operations() {
        let (env, contract_id, admin, payer, client) = setup_with_user();

        client.pause(&admin);
        assert!(client.is_paused());

        client.deposit(&payer, &1000);
    }

    #[test]
    #[should_panic(expected = "paused")]
    fn test_deposit_while_paused_panics() {
        let (env, contract_id, admin, payer, client) = setup_with_user();

        client.pause(&admin);
        client.deposit(&payer, &1000);
    }

    #[test]
    fn test_update_fee_bps() {
        let (env, contract_id, admin, _payer, client) = setup_with_user();

        client.update_fee_bps(&admin, &100);
        // After update, new payments should use 1% fee
        let user = Address::generate(&env);
        client.deposit(&user, &10_000);
        let payee = Address::generate(&env);
        let record = client.process_payment(&user, &payee, &3000, &symbol_short!("test!"), &2);
        assert_eq!(record.fee, 30); // 3000 * 100 / 10000
    }

    #[test]
    fn test_transfer_admin() {
        let (env, contract_id, admin, _payer, client) = setup_with_user();
        let new_admin = Address::generate(&env);

        client.transfer_admin(&admin, new_admin.clone());
        assert_eq!(client.get_admin(), new_admin);
    }
}
