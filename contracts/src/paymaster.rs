//! Paymaster — Gas Sponsorship for Smart Wallets
//!
//! Features:
//! - Sponsor registration with a deposit balance
//! - Per-wallet and global sponsorship rules / limits
//! - Gas cost calculation and deduction
//! - Sponsor reimbursement / withdrawal

#![allow(unused)]

use soroban_sdk::{
    contract, contractimpl, contracttype, Address, Env, Symbol,
};

// ── Storage keys ─────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub enum PaymasterKey {
    Admin,
    SponsorBalance(Address),
    WalletSpent(Address),
    GlobalSpent,
    GlobalLimit,
    PerWalletLimit,
}

// ── Data types ────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SponsorshipResult {
    pub approved: bool,
    pub fee_charged: i128,
    pub sponsor: Address,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct PaymasterContract;

#[contractimpl]
impl PaymasterContract {
    // ── Initialisation ────────────────────────────────────────────────────────

    pub fn initialize(env: Env, admin: Address, global_limit: i128, per_wallet_limit: i128) {
        if env.storage().persistent().has(&PaymasterKey::Admin) {
            panic!("already_initialized");
        }
        env.storage().persistent().set(&PaymasterKey::Admin, &admin);
        env.storage().persistent().set(&PaymasterKey::GlobalLimit, &global_limit);
        env.storage().persistent().set(&PaymasterKey::PerWalletLimit, &per_wallet_limit);
        env.storage().persistent().set(&PaymasterKey::GlobalSpent, &0i128);

        env.events().publish(
            (Symbol::new(&env, "paymaster_initialized"), admin),
            (global_limit, per_wallet_limit),
        );
    }

    // ── Sponsor deposit / withdrawal ──────────────────────────────────────────

    /// Sponsor deposits funds to cover gas for wallets.
    pub fn deposit(env: Env, sponsor: Address, amount: i128) {
        sponsor.require_auth();
        if amount <= 0 {
            panic!("invalid_amount");
        }

        let current: i128 = env
            .storage()
            .persistent()
            .get(&PaymasterKey::SponsorBalance(sponsor.clone()))
            .unwrap_or(0);

        env.storage()
            .persistent()
            .set(&PaymasterKey::SponsorBalance(sponsor.clone()), &(current + amount));

        env.events().publish(
            (Symbol::new(&env, "sponsor_deposit"), sponsor),
            amount,
        );
    }

    /// Sponsor withdraws unused funds.
    pub fn withdraw(env: Env, sponsor: Address, amount: i128) {
        sponsor.require_auth();

        let balance: i128 = env
            .storage()
            .persistent()
            .get(&PaymasterKey::SponsorBalance(sponsor.clone()))
            .unwrap_or(0);

        if amount > balance {
            panic!("insufficient_balance");
        }

        env.storage()
            .persistent()
            .set(&PaymasterKey::SponsorBalance(sponsor.clone()), &(balance - amount));

        env.events().publish(
            (Symbol::new(&env, "sponsor_withdraw"), sponsor),
            amount,
        );
    }

    pub fn get_balance(env: Env, sponsor: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&PaymasterKey::SponsorBalance(sponsor))
            .unwrap_or(0)
    }

    // ── Sponsorship rules ─────────────────────────────────────────────────────

    /// Update the per-wallet spending limit (admin only).
    pub fn set_per_wallet_limit(env: Env, new_limit: i128) {
        let admin: Address = env.storage().persistent().get(&PaymasterKey::Admin).unwrap();
        admin.require_auth();
        env.storage().persistent().set(&PaymasterKey::PerWalletLimit, &new_limit);

        env.events().publish(
            (Symbol::new(&env, "per_wallet_limit_updated"), admin),
            new_limit,
        );
    }

    /// Update the global spending limit (admin only).
    pub fn set_global_limit(env: Env, new_limit: i128) {
        let admin: Address = env.storage().persistent().get(&PaymasterKey::Admin).unwrap();
        admin.require_auth();
        env.storage().persistent().set(&PaymasterKey::GlobalLimit, &new_limit);

        env.events().publish(
            (Symbol::new(&env, "global_limit_updated"), admin),
            new_limit,
        );
    }

    // ── Gas cost calculation ──────────────────────────────────────────────────

    /// Estimate the gas fee for an operation given its complexity units.
    /// Simple linear model: fee = base_fee + units * unit_price.
    pub fn estimate_fee(base_fee: i128, units: u32, unit_price: i128) -> i128 {
        base_fee + (units as i128) * unit_price
    }

    // ── Sponsorship execution ─────────────────────────────────────────────────

    /// Attempt to sponsor a wallet's gas fee from the given sponsor's balance.
    /// Enforces per-wallet and global limits.
    pub fn sponsor_gas(
        env: Env,
        sponsor: Address,
        wallet: Address,
        fee: i128,
    ) -> SponsorshipResult {
        // Check per-wallet limit.
        let per_wallet_limit: i128 = env
            .storage()
            .persistent()
            .get(&PaymasterKey::PerWalletLimit)
            .unwrap_or(i128::MAX);

        let wallet_spent: i128 = env
            .storage()
            .persistent()
            .get(&PaymasterKey::WalletSpent(wallet.clone()))
            .unwrap_or(0);

        if wallet_spent + fee > per_wallet_limit {
            return SponsorshipResult { approved: false, fee_charged: 0, sponsor };
        }

        // Check global limit.
        let global_limit: i128 = env
            .storage()
            .persistent()
            .get(&PaymasterKey::GlobalLimit)
            .unwrap_or(i128::MAX);

        let global_spent: i128 = env
            .storage()
            .persistent()
            .get(&PaymasterKey::GlobalSpent)
            .unwrap_or(0);

        if global_spent + fee > global_limit {
            return SponsorshipResult { approved: false, fee_charged: 0, sponsor };
        }

        // Check sponsor balance.
        let balance: i128 = env
            .storage()
            .persistent()
            .get(&PaymasterKey::SponsorBalance(sponsor.clone()))
            .unwrap_or(0);

        if balance < fee {
            return SponsorshipResult { approved: false, fee_charged: 0, sponsor };
        }

        // Deduct and record.
        env.storage()
            .persistent()
            .set(&PaymasterKey::SponsorBalance(sponsor.clone()), &(balance - fee));
        env.storage()
            .persistent()
            .set(&PaymasterKey::WalletSpent(wallet.clone()), &(wallet_spent + fee));
        env.storage()
            .persistent()
            .set(&PaymasterKey::GlobalSpent, &(global_spent + fee));

        env.events().publish(
            (Symbol::new(&env, "gas_sponsored"), wallet),
            (sponsor.clone(), fee),
        );

        SponsorshipResult { approved: true, fee_charged: fee, sponsor }
    }

    /// Query how much has been spent for a specific wallet.
    pub fn get_wallet_spent(env: Env, wallet: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&PaymasterKey::WalletSpent(wallet))
            .unwrap_or(0)
    }

    /// Query total global gas sponsored so far.
    pub fn get_global_spent(env: Env) -> i128 {
        env.storage()
            .persistent()
            .get(&PaymasterKey::GlobalSpent)
            .unwrap_or(0)
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    fn setup() -> (Env, Address, PaymasterContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, PaymasterContract);
        let client = PaymasterContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin, &1_000_000i128, &10_000i128);
        (env, admin, client)
    }

    #[test]
    fn test_deposit_and_balance() {
        let (env, _, client) = setup();
        let sponsor = Address::generate(&env);
        client.deposit(&sponsor, &50_000i128);
        assert_eq!(client.get_balance(&sponsor), 50_000i128);
    }

    #[test]
    fn test_withdraw() {
        let (env, _, client) = setup();
        let sponsor = Address::generate(&env);
        client.deposit(&sponsor, &50_000i128);
        client.withdraw(&sponsor, &20_000i128);
        assert_eq!(client.get_balance(&sponsor), 30_000i128);
    }

    #[test]
    #[should_panic(expected = "insufficient_balance")]
    fn test_withdraw_exceeds_balance() {
        let (env, _, client) = setup();
        let sponsor = Address::generate(&env);
        client.deposit(&sponsor, &100i128);
        client.withdraw(&sponsor, &200i128);
    }

    #[test]
    fn test_sponsor_gas_success() {
        let (env, _, client) = setup();
        let sponsor = Address::generate(&env);
        let wallet = Address::generate(&env);
        client.deposit(&sponsor, &50_000i128);

        let result = client.sponsor_gas(&sponsor, &wallet, &500i128);
        assert!(result.approved);
        assert_eq!(result.fee_charged, 500i128);
        assert_eq!(client.get_balance(&sponsor), 49_500i128);
        assert_eq!(client.get_wallet_spent(&wallet), 500i128);
    }

    #[test]
    fn test_sponsor_gas_rejected_per_wallet_limit() {
        let (env, _, client) = setup();
        let sponsor = Address::generate(&env);
        let wallet = Address::generate(&env);
        client.deposit(&sponsor, &500_000i128);

        // per_wallet_limit is 10_000; request 15_000 in one shot.
        let result = client.sponsor_gas(&sponsor, &wallet, &15_000i128);
        assert!(!result.approved);
    }

    #[test]
    fn test_sponsor_gas_rejected_insufficient_balance() {
        let (env, _, client) = setup();
        let sponsor = Address::generate(&env);
        let wallet = Address::generate(&env);
        client.deposit(&sponsor, &100i128);

        let result = client.sponsor_gas(&sponsor, &wallet, &500i128);
        assert!(!result.approved);
    }

    #[test]
    fn test_estimate_fee() {
        assert_eq!(PaymasterContract::estimate_fee(100, 10, 5), 150);
    }

    #[test]
    fn test_global_spent_accumulates() {
        let (env, _, client) = setup();
        let sponsor = Address::generate(&env);
        let w1 = Address::generate(&env);
        let w2 = Address::generate(&env);
        client.deposit(&sponsor, &500_000i128);

        client.sponsor_gas(&sponsor, &w1, &1_000i128);
        client.sponsor_gas(&sponsor, &w2, &2_000i128);
        assert_eq!(client.get_global_spent(), 3_000i128);
    }
}
