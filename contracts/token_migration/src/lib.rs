//! Legacy token migration contract.
//!
//! Users swap legacy `old_token` for a newly minted `new_token` at a fixed
//! ratio until a deadline, after which the admin can recover any remaining
//! legacy tokens.

#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Env, String};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MigrationConfig {
    pub admin: Address,
    pub old_token: Address,
    pub new_token: Address,
    pub ratio_new_per_old: u32, // e.g., 10 means 1 old -> 10 new
    pub deadline: u64,
}

#[contracttype]
pub enum DataKey {
    Config,
    UserMigrated(Address),
    TotalMigrated,
}

#[contract]
pub struct TokenMigrationContract;

#[contractimpl]
impl TokenMigrationContract {
    /// Initializes the migration contract.
    ///
    /// * `admin`           – The admin address, who can withdraw remaining legacy tokens after the deadline.
    /// * `old_token`       – The address of the legacy token contract.
    /// * `new_token`       – The address of the new token contract. Must have minting rights on it.
    /// * `ratio_new_per_old` – The number of new tokens minted for 1 old token.
    /// * `deadline`        – A Unix timestamp after which migrations are no longer possible.
    pub fn initialize(
        env: Env,
        admin: Address,
        old_token: Address,
        new_token: Address,
        ratio_new_per_old: u32,
        deadline: u64,
    ) {
        if env.storage().instance().has(&DataKey::Config) {
            panic!("Already initialized");
        }

        let config = MigrationConfig {
            admin,
            old_token,
            new_token,
            ratio_new_per_old,
            deadline,
        };

        env.storage().instance().set(&DataKey::Config, &config);
        env.storage().instance().set(&DataKey::TotalMigrated, &0i128);

        env.storage().instance().extend_ttl(100_000, 100_000);
    }

    /// Migrates a user's legacy tokens to new tokens.
    /// The user must first approve this contract to spend their `old_token`.
    pub fn migrate(env: Env, caller: Address, amount: i128) {
        caller.require_auth();

        let config: MigrationConfig = env.storage().instance().get(&DataKey::Config).unwrap();

        if env.ledger().timestamp() > config.deadline {
            panic!("Migration period has ended");
        }

        if amount <= 0 {
            panic!("Amount must be positive");
        }

        let new_amount = amount
            .checked_mul(config.ratio_new_per_old as i128)
            .expect("Amount overflow");

        let old_token_client = token::Client::new(&env, &config.old_token);
        old_token_client.transfer_from(
            &env.current_contract_address(),
            &caller,
            &env.current_contract_address(),
            &amount,
        );

        let new_token_client = token::StellarAssetClient::new(&env, &config.new_token);
        new_token_client.mint(&caller, &new_amount);

        let user_key = DataKey::UserMigrated(caller.clone());
        let user_migrated: i128 = env.storage().persistent().get(&user_key).unwrap_or(0);
        env.storage()
            .persistent()
            .set(&user_key, &user_migrated.checked_add(amount).expect("User amount overflow"));
        env.storage().persistent().extend_ttl(&user_key, 100_000, 100_000);

        let total_migrated: i128 = env.storage().instance().get(&DataKey::TotalMigrated).unwrap();
        env.storage()
            .instance()
            .set(&DataKey::TotalMigrated, &total_migrated.checked_add(amount).expect("Total amount overflow"));

        env.events().publish(
            (String::from_slice(&env, "migrated"), caller),
            (amount, new_amount),
        );
    }

    /// Allows the admin to withdraw any remaining legacy tokens after the deadline.
    pub fn withdraw_legacy(env: Env) {
        let config: MigrationConfig = env.storage().instance().get(&DataKey::Config).unwrap();
        config.admin.require_auth();

        if env.ledger().timestamp() <= config.deadline {
            panic!("Cannot withdraw before deadline");
        }

        let old_token_client = token::Client::new(&env, &config.old_token);
        let balance = old_token_client.balance(&env.current_contract_address());

        if balance > 0 {
            old_token_client.transfer(&env.current_contract_address(), &config.admin, &balance);
        }
    }

    // --- View Functions ---

    pub fn get_config(env: Env) -> MigrationConfig {
        env.storage().instance().get(&DataKey::Config).unwrap()
    }

    pub fn get_user_migrated(env: Env, user: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::UserMigrated(user))
            .unwrap_or(0)
    }

    pub fn get_total_migrated(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::TotalMigrated).unwrap()
    }
}

#[cfg(test)]
mod test;
