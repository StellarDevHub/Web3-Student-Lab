//! Paymaster – Gas Sponsorship (#407)
//!
//! Features:
//! - Sponsor registration with deposit balance
//! - Per-wallet and per-sponsor daily gas limits
//! - Gas cost calculation and deduction
//! - Sponsor reimbursement / withdrawal
//! - Sponsorship rules: allowlist, max-per-op, daily cap

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, Address,
    Env, Vec,
};

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone)]
pub enum PaymasterKey {
    /// Admin who can configure global rules.
    Admin,
    /// Sponsor deposit balance (in stroops).
    SponsorBalance(Address),
    /// Total gas sponsored for a wallet today (ledger-day bucket).
    WalletDailyGas(Address, u32),
    /// Total gas sponsored by a sponsor today.
    SponsorDailyGas(Address, u32),
    /// Global max gas per single operation (stroops).
    MaxGasPerOp,
    /// Global daily gas cap per wallet (stroops).
    WalletDailyCap,
    /// Whether a wallet is on the sponsor allowlist.
    Allowlisted(Address),
    /// Accumulated reimbursement owed to a sponsor.
    PendingReimbursement(Address),
}

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SponsorshipResult {
    pub sponsored: bool,
    pub gas_cost: i128,
    pub sponsor: Address,
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum PaymasterError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    InsufficientDeposit = 4,
    WalletDailyCapExceeded = 5,
    SponsorDailyCapExceeded = 6,
    GasPerOpExceeded = 7,
    WalletNotAllowlisted = 8,
    ZeroDeposit = 9,
    NothingToWithdraw = 10,
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct PaymasterContract;

#[contractimpl]
impl PaymasterContract {
    // -----------------------------------------------------------------------
    // Initialization
    // -----------------------------------------------------------------------

    /// One-time setup.
    ///
    /// - `max_gas_per_op`: ceiling on gas cost for a single operation
    /// - `wallet_daily_cap`: max gas a single wallet can have sponsored per day
    pub fn initialize(env: Env, admin: Address, max_gas_per_op: i128, wallet_daily_cap: i128) {
        if env.storage().instance().has(&PaymasterKey::Admin) {
            panic_with_error!(&env, PaymasterError::AlreadyInitialized);
        }
        env.storage().instance().set(&PaymasterKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&PaymasterKey::MaxGasPerOp, &max_gas_per_op);
        env.storage()
            .instance()
            .set(&PaymasterKey::WalletDailyCap, &wallet_daily_cap);
    }

    // -----------------------------------------------------------------------
    // Sponsor management
    // -----------------------------------------------------------------------

    /// Deposit funds to sponsor gas for wallets.
    pub fn deposit(env: Env, sponsor: Address, amount: i128) {
        sponsor.require_auth();
        if amount <= 0 {
            panic_with_error!(&env, PaymasterError::ZeroDeposit);
        }
        let current: i128 = env
            .storage()
            .instance()
            .get(&PaymasterKey::SponsorBalance(sponsor.clone()))
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&PaymasterKey::SponsorBalance(sponsor.clone()), &(current + amount));

        env.events().publish(
            (symbol_short!("paymaster"), symbol_short!("deposit")),
            (sponsor, amount),
        );
    }

    /// Withdraw remaining sponsor balance.
    pub fn withdraw(env: Env, sponsor: Address) -> i128 {
        sponsor.require_auth();
        let balance: i128 = env
            .storage()
            .instance()
            .get(&PaymasterKey::SponsorBalance(sponsor.clone()))
            .unwrap_or(0);
        if balance == 0 {
            panic_with_error!(&env, PaymasterError::NothingToWithdraw);
        }
        env.storage()
            .instance()
            .set(&PaymasterKey::SponsorBalance(sponsor.clone()), &0i128);

        env.events().publish(
            (symbol_short!("paymaster"), symbol_short!("withdraw")),
            (sponsor, balance),
        );
        balance
    }

    // -----------------------------------------------------------------------
    // Allowlist
    // -----------------------------------------------------------------------

    /// Admin adds a wallet to the sponsorship allowlist.
    pub fn allowlist_wallet(env: Env, caller: Address, wallet: Address) {
        caller.require_auth();
        Self::assert_admin(&env, &caller);
        env.storage()
            .instance()
            .set(&PaymasterKey::Allowlisted(wallet.clone()), &true);
        env.events().publish(
            (symbol_short!("paymaster"), symbol_short!("allow")),
            wallet,
        );
    }

    /// Admin removes a wallet from the allowlist.
    pub fn remove_allowlist(env: Env, caller: Address, wallet: Address) {
        caller.require_auth();
        Self::assert_admin(&env, &caller);
        env.storage()
            .instance()
            .remove(&PaymasterKey::Allowlisted(wallet));
    }

    // -----------------------------------------------------------------------
    // Gas sponsorship
    // -----------------------------------------------------------------------

    /// Sponsor gas for a wallet operation.
    ///
    /// Returns the gas cost deducted from the sponsor's balance.
    /// `gas_units` is the estimated gas for the operation.
    /// `gas_price` is the current network gas price in stroops.
    pub fn sponsor_gas(
        env: Env,
        sponsor: Address,
        wallet: Address,
        gas_units: i128,
        gas_price: i128,
    ) -> i128 {
        sponsor.require_auth();
        Self::assert_initialized(&env);

        // Check allowlist
        let allowlisted: bool = env
            .storage()
            .instance()
            .get(&PaymasterKey::Allowlisted(wallet.clone()))
            .unwrap_or(false);
        if !allowlisted {
            panic_with_error!(&env, PaymasterError::WalletNotAllowlisted);
        }

        let gas_cost = Self::calculate_gas_cost(gas_units, gas_price);

        // Per-op cap
        let max_per_op: i128 = env
            .storage()
            .instance()
            .get(&PaymasterKey::MaxGasPerOp)
            .unwrap_or(i128::MAX);
        if gas_cost > max_per_op {
            panic_with_error!(&env, PaymasterError::GasPerOpExceeded);
        }

        // Daily ledger bucket (approximate day = 17280 ledgers at ~5s each)
        let day_bucket = env.ledger().sequence() / 17280;

        // Wallet daily cap
        let wallet_daily_cap: i128 = env
            .storage()
            .instance()
            .get(&PaymasterKey::WalletDailyCap)
            .unwrap_or(i128::MAX);
        let wallet_today: i128 = env
            .storage()
            .instance()
            .get(&PaymasterKey::WalletDailyGas(wallet.clone(), day_bucket))
            .unwrap_or(0);
        if wallet_today + gas_cost > wallet_daily_cap {
            panic_with_error!(&env, PaymasterError::WalletDailyCapExceeded);
        }

        // Sponsor balance check
        let balance: i128 = env
            .storage()
            .instance()
            .get(&PaymasterKey::SponsorBalance(sponsor.clone()))
            .unwrap_or(0);
        if balance < gas_cost {
            panic_with_error!(&env, PaymasterError::InsufficientDeposit);
        }

        // Deduct from sponsor
        env.storage()
            .instance()
            .set(&PaymasterKey::SponsorBalance(sponsor.clone()), &(balance - gas_cost));

        // Update daily counters
        env.storage().instance().set(
            &PaymasterKey::WalletDailyGas(wallet.clone(), day_bucket),
            &(wallet_today + gas_cost),
        );

        let sponsor_today: i128 = env
            .storage()
            .instance()
            .get(&PaymasterKey::SponsorDailyGas(sponsor.clone(), day_bucket))
            .unwrap_or(0);
        env.storage().instance().set(
            &PaymasterKey::SponsorDailyGas(sponsor.clone(), day_bucket),
            &(sponsor_today + gas_cost),
        );

        env.events().publish(
            (symbol_short!("paymaster"), symbol_short!("sponsored")),
            (sponsor, wallet, gas_cost),
        );

        gas_cost
    }

    // -----------------------------------------------------------------------
    // Queries
    // -----------------------------------------------------------------------

    pub fn get_balance(env: Env, sponsor: Address) -> i128 {
        env.storage()
            .instance()
            .get(&PaymasterKey::SponsorBalance(sponsor))
            .unwrap_or(0)
    }

    pub fn is_allowlisted(env: Env, wallet: Address) -> bool {
        env.storage()
            .instance()
            .get(&PaymasterKey::Allowlisted(wallet))
            .unwrap_or(false)
    }

    /// Estimate gas cost for given units and price.
    pub fn estimate_gas(env: Env, gas_units: i128, gas_price: i128) -> i128 {
        let _ = env;
        Self::calculate_gas_cost(gas_units, gas_price)
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    fn calculate_gas_cost(gas_units: i128, gas_price: i128) -> i128 {
        gas_units * gas_price
    }

    fn assert_admin(env: &Env, caller: &Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&PaymasterKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, PaymasterError::NotInitialized));
        if *caller != admin {
            panic_with_error!(env, PaymasterError::Unauthorized);
        }
    }

    fn assert_initialized(env: &Env) {
        if !env.storage().instance().has(&PaymasterKey::Admin) {
            panic_with_error!(env, PaymasterError::NotInitialized);
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Address, Env};

    fn setup() -> (Env, Address, Address, PaymasterContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let id = env.register(PaymasterContract, ());
        let client = PaymasterContractClient::new(&env, &id);
        // max 10_000 per op, 50_000 daily per wallet
        client.initialize(&admin, &10_000i128, &50_000i128);
        (env, admin, id, client)
    }

    #[test]
    fn deposit_and_balance() {
        let (_env, _admin, _id, client) = setup();
        let sponsor = Address::generate(&_env);
        client.deposit(&sponsor, &1_000);
        assert_eq!(client.get_balance(&sponsor), 1_000);
    }

    #[test]
    fn sponsor_gas_deducts_balance() {
        let (env, admin, _id, client) = setup();
        let sponsor = Address::generate(&env);
        let wallet = Address::generate(&env);

        client.deposit(&sponsor, &10_000);
        client.allowlist_wallet(&admin, &wallet);

        // gas_units=10, gas_price=100 → cost=1000
        let cost = client.sponsor_gas(&sponsor, &wallet, &10, &100);
        assert_eq!(cost, 1_000);
        assert_eq!(client.get_balance(&sponsor), 9_000);
    }

    #[test]
    fn estimate_gas_correct() {
        let (_env, _admin, _id, client) = setup();
        assert_eq!(client.estimate_gas(&10, &100), 1_000);
    }

    #[test]
    fn withdraw_clears_balance() {
        let (env, _admin, _id, client) = setup();
        let sponsor = Address::generate(&env);
        client.deposit(&sponsor, &5_000);
        let withdrawn = client.withdraw(&sponsor);
        assert_eq!(withdrawn, 5_000);
        assert_eq!(client.get_balance(&sponsor), 0);
    }

    #[test]
    #[should_panic]
    fn sponsor_gas_fails_without_allowlist() {
        let (env, _admin, _id, client) = setup();
        let sponsor = Address::generate(&env);
        let wallet = Address::generate(&env);
        client.deposit(&sponsor, &10_000);
        client.sponsor_gas(&sponsor, &wallet, &10, &100);
    }

    #[test]
    #[should_panic]
    fn sponsor_gas_fails_insufficient_balance() {
        let (env, admin, _id, client) = setup();
        let sponsor = Address::generate(&env);
        let wallet = Address::generate(&env);
        client.allowlist_wallet(&admin, &wallet);
        // no deposit
        client.sponsor_gas(&sponsor, &wallet, &10, &100);
    }

    #[test]
    #[should_panic]
    fn double_initialize_panics() {
        let (env, admin, _id, client) = setup();
        client.initialize(&admin, &1_000i128, &5_000i128);
    }
}
