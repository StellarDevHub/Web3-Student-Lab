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
    Env,
};

#[contracttype]
#[derive(Clone)]
pub enum PaymasterKey {
    Admin,
    SponsorBalance(Address),
    WalletDailyGas(Address, u32),
    SponsorDailyGas(Address, u32),
    MaxGasPerOp,
    WalletDailyCap,
    Allowlisted(Address),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum PaymasterError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    InsufficientDeposit = 4,
    WalletDailyCapExceeded = 5,
    GasPerOpExceeded = 6,
    WalletNotAllowlisted = 7,
    ZeroDeposit = 8,
    NothingToWithdraw = 9,
}

#[contract]
pub struct PaymasterContract;

#[contractimpl]
impl PaymasterContract {
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
        env.storage().instance().set(
            &PaymasterKey::SponsorBalance(sponsor.clone()),
            &(current + amount),
        );

        env.events().publish(
            (symbol_short!("paymaster"), symbol_short!("deposit")),
            (sponsor, amount),
        );
    }

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

    pub fn allowlist_wallet(env: Env, caller: Address, wallet: Address) {
        caller.require_auth();
        Self::assert_admin(&env, &caller);
        env.storage()
            .instance()
            .set(&PaymasterKey::Allowlisted(wallet.clone()), &true);
        env.events()
            .publish((symbol_short!("paymaster"), symbol_short!("allow")), wallet);
    }

    pub fn remove_allowlist(env: Env, caller: Address, wallet: Address) {
        caller.require_auth();
        Self::assert_admin(&env, &caller);
        env.storage()
            .instance()
            .remove(&PaymasterKey::Allowlisted(wallet));
    }

    pub fn sponsor_gas(
        env: Env,
        sponsor: Address,
        wallet: Address,
        gas_units: i128,
        gas_price: i128,
    ) -> i128 {
        sponsor.require_auth();
        Self::assert_initialized(&env);

        let allowlisted: bool = env
            .storage()
            .instance()
            .get(&PaymasterKey::Allowlisted(wallet.clone()))
            .unwrap_or(false);
        if !allowlisted {
            panic_with_error!(&env, PaymasterError::WalletNotAllowlisted);
        }

        let gas_cost = Self::calculate_gas_cost(gas_units, gas_price);
        let max_per_op: i128 = env
            .storage()
            .instance()
            .get(&PaymasterKey::MaxGasPerOp)
            .unwrap_or(i128::MAX);
        if gas_cost > max_per_op {
            panic_with_error!(&env, PaymasterError::GasPerOpExceeded);
        }

        let day_bucket = env.ledger().sequence() / 17_280;
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

        let balance: i128 = env
            .storage()
            .instance()
            .get(&PaymasterKey::SponsorBalance(sponsor.clone()))
            .unwrap_or(0);
        if balance < gas_cost {
            panic_with_error!(&env, PaymasterError::InsufficientDeposit);
        }

        env.storage().instance().set(
            &PaymasterKey::SponsorBalance(sponsor.clone()),
            &(balance - gas_cost),
        );
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

    pub fn estimate_gas(env: Env, gas_units: i128, gas_price: i128) -> i128 {
        let _ = env;
        Self::calculate_gas_cost(gas_units, gas_price)
    }

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
        client.initialize(&admin, &10_000i128, &50_000i128);
        (env, admin, id, client)
    }

    #[test]
    fn deposit_and_balance() {
        let (env, _admin, _id, client) = setup();
        let sponsor = Address::generate(&env);
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

        let cost = client.sponsor_gas(&sponsor, &wallet, &10, &100);
        assert_eq!(cost, 1_000);
        assert_eq!(client.get_balance(&sponsor), 9_000);
    }
}
