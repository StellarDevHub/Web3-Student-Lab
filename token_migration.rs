use soroban_sdk::{
    contract, contractimpl, contracttype, token, Address, Env, String,
};

use crate::legacy_deprecation::TokenClient as LegacyTokenClient;
use crate::token::Client as NewTokenClient;

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
enum DataKey {
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
    /// # Arguments
    /// * `admin` - The admin address, who can withdraw remaining legacy tokens after the deadline.
    /// * `old_token` - The address of the legacy token contract.
    /// * `new_token` - The address of the new token contract. This migration contract must have minting rights on it.
    /// * `ratio_new_per_old` - The number of new tokens minted for 1 old token (in its smallest unit).
    /// * `deadline` - A Unix timestamp after which migrations are no longer possible.
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

        // Set TTL for all data
        env.storage().instance().extend_ttl(100_000, 100_000);
    }

    /// Migrates a user's legacy tokens to new tokens.
    /// The user must first approve this contract to spend their `old_token`.
    ///
    /// # Arguments
    /// * `caller` - The user performing the migration.
    /// * `amount` - The amount of old tokens to migrate.
    pub fn migrate(env: Env, caller: Address, amount: i128) {
        caller.require_auth();

        let config: MigrationConfig = env.storage().instance().get(&DataKey::Config).unwrap();

        if env.ledger().timestamp() > config.deadline {
            panic!("Migration period has ended");
        }

        if amount <= 0 {
            panic!("Amount must be positive");
        }

        // Calculate the amount of new tokens to mint
        let new_amount = amount
            .checked_mul(config.ratio_new_per_old as i128)
            .expect("Amount overflow");

        // Transfer old tokens from the user to this contract
        let old_token_client = LegacyTokenClient::new(&env, &config.old_token);
        old_token_client.transfer_from(&env.current_contract_address(), &caller, &env.current_contract_address(), &amount);

        // Mint new tokens to the user
        let new_token_client = NewTokenClient::new(&env, &config.new_token);
        new_token_client.mint(&caller, &new_amount);

        // Update user's migrated amount
        let user_key = DataKey::UserMigrated(caller.clone());
        let user_migrated: i128 = env.storage().persistent().get(&user_key).unwrap_or(0);
        let new_user_migrated = user_migrated.checked_add(amount).expect("User amount overflow");
        env.storage().persistent().set(&user_key, &new_user_migrated);
        env.storage().persistent().extend_ttl(&user_key, 100_000, 100_000);

        // Update total migrated amount
        let total_migrated: i128 = env.storage().instance().get(&DataKey::TotalMigrated).unwrap();
        let new_total_migrated = total_migrated.checked_add(amount).expect("Total amount overflow");
        env.storage().instance().set(&DataKey::TotalMigrated, &new_total_migrated);

        // Emit event
        env.events().publish(
            (String::from_slice(&env, "migrated"), caller),
            (amount, new_amount),
        );
    }

    /// Allows the admin to withdraw any remaining legacy tokens after the deadline.
    /// This is for cleanup and to recover any tokens sent here by mistake.
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

    /// Returns the migration configuration.
    pub fn get_config(env: Env) -> MigrationConfig {
        env.storage().instance().get(&DataKey::Config).unwrap()
    }

    /// Returns the total amount of old tokens a specific user has migrated.
    pub fn get_user_migrated(env: Env, user: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::UserMigrated(user))
            .unwrap_or(0)
    }

    /// Returns the total amount of old tokens migrated across all users.
    pub fn get_total_migrated(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::TotalMigrated).unwrap()
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::{Address as _, Events}, BytesN, IntoVal};

    // Note: Full integration tests would require setting up three contracts:
    // 1. Legacy Token
    // 2. New Token
    // 3. This Migration Contract
    // The tests here are simplified to illustrate the logic.

    #[test]
    fn test_initialization_and_migration() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::random(&env);
        let user = Address::random(&env);
        let old_token_address = Address::random(&env);
        let new_token_address = Address::random(&env);
        let migration_contract_id = env.register_contract(None, TokenMigrationContract);
        let client = TokenMigrationContractClient::new(&env, &migration_contract_id);

        let deadline = env.ledger().timestamp() + 1000;
        let ratio = 1; // 1:1 ratio

        client.initialize(&admin, &old_token_address, &new_token_address, &ratio, &deadline);

        // --- Mock contract calls ---
        // This is a simplified mock. In a real test, you'd register token contracts.
        let expected_new_amount = 100 * ratio as i128;

        // Mock the call to `transfer_from` on the old token
        env.mock_contract_call(
            &old_token_address,
            "transfer_from",
            (&migration_contract_id, &user, &migration_contract_id, &100i128).into_val(&env),
            Ok(().into()),
        );
        // Mock the call to `mint` on the new token
        env.mock_contract_call(
            &new_token_address,
            "mint",
            (&user, &expected_new_amount).into_val(&env),
            Ok(().into()),
        );

        client.migrate(&user, &100);

        assert_eq!(client.get_user_migrated(&user), 100);
        assert_eq!(client.get_total_migrated(), 100);

        let event = env.events().all().last().unwrap();
        assert_eq!(
            event,
            (
                migration_contract_id.clone(),
                (String::from_slice(&env, "migrated"), user.clone()).into_val(&env),
                (100i128, expected_new_amount).into_val(&env)
            )
        );
    }
}
