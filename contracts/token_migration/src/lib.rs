//! Legacy token migration contract.
//!
//! Users swap legacy `old_token` for a newly minted `new_token` at a fixed
//! ratio until a deadline, after which the admin can recover any remaining
//! legacy tokens.

#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, token,
    Address, Env, Vec,
};

// ── Errors (SC-HARD-20: range 400+) ──────────────────────────────────────────

/// Typed contract errors for the token migration contract.
///
/// Discriminants are in the `400+` range.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum MigError {
    /// `480` — Contract has already been initialised.
    AlreadyInitialized = 480,
    /// `481` — The migration period has ended.
    MigrationPeriodEnded = 481,
    /// `482` — Amount must be strictly positive.
    ZeroAmount = 482,
    /// `483` — Arithmetic overflow in amount computation.
    Overflow = 483,
    /// `484` — Cannot withdraw before the deadline has passed.
    DeadlineNotReached = 484,
    /// `485` — Caller is not the admin.
    Unauthorized = 485,
    /// `486` — Contract has not been initialised.
    NotInitialized = 486,
}

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
    /// Versioned per-user storage record (v1/v2 schema transmutation).
    UserRecord(Address),
    /// Append-only index of users who have migrated, enabling cursor-based
    /// iteration over storage keys without a full-table scan.
    UserIndex(u32),
    /// Number of entries in `UserIndex`.
    UserCount,
    /// Current position of the in-place v1 -> v2 storage migration cursor.
    MigrationCursor,
    /// Flag tracking the overall status of the storage schema migration.
    MigrationStatus,
}

/// Overall status of the versioned-storage migration engine.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum MigrationStatus {
    NotStarted,
    InProgress,
    Completed,
}

/// Legacy (v1) per-user storage schema: just the migrated amount.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UserRecordV1 {
    pub amount: i128,
}

/// Current (v2) per-user storage schema: adds a `migrated_at` timestamp.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UserRecordV2 {
    pub amount: i128,
    pub migrated_at: u64,
}

/// Discriminated union so the contract can deserialize either schema
/// version of a per-user storage record.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum VersionedUserRecord {
    V1(UserRecordV1),
    V2(UserRecordV2),
}

#[contract]
pub struct TokenMigrationContract;

#[contractimpl]
impl TokenMigrationContract {
    /// Initializes the migration contract.
    ///
    /// * `admin`             – The admin address, who can withdraw remaining legacy tokens after the deadline.
    /// * `old_token`         – The address of the legacy token contract.
    /// * `new_token`         – The address of the new token contract. Must have minting rights on it.
    /// * `ratio_new_per_old` – The number of new tokens minted for 1 old token.
    /// * `deadline`          – A Unix timestamp after which migrations are no longer possible.
    pub fn initialize(
        env: Env,
        admin: Address,
        old_token: Address,
        new_token: Address,
        ratio_new_per_old: u32,
        deadline: u64,
    ) {
        if env.storage().instance().has(&DataKey::Config) {
            panic_with_error!(&env, MigError::AlreadyInitialized);
        }

        let config = MigrationConfig {
            admin,
            old_token,
            new_token,
            ratio_new_per_old,
            deadline,
        };

        env.storage().instance().set(&DataKey::Config, &config);
        env.storage()
            .instance()
            .set(&DataKey::TotalMigrated, &0i128);
        env.storage().instance().set(&DataKey::UserCount, &0u32);
        env.storage()
            .instance()
            .set(&DataKey::MigrationCursor, &0u32);
        env.storage()
            .instance()
            .set(&DataKey::MigrationStatus, &MigrationStatus::NotStarted);

        env.storage().instance().extend_ttl(100_000, 100_000);
    }

    /// Migrates a user's legacy tokens to new tokens.
    /// The user must first approve this contract to spend their `old_token`.
    pub fn migrate(env: Env, caller: Address, amount: i128) {
        caller.require_auth();

        let config: MigrationConfig = env
            .storage()
            .instance()
            .get(&DataKey::Config)
            .unwrap_or_else(|| panic_with_error!(&env, MigError::NotInitialized));

        if env.ledger().timestamp() > config.deadline {
            panic_with_error!(&env, MigError::MigrationPeriodEnded);
        }

        if amount <= 0 {
            panic_with_error!(&env, MigError::ZeroAmount);
        }

        let new_amount = amount
            .checked_mul(config.ratio_new_per_old as i128)
            .unwrap_or_else(|| panic_with_error!(&env, MigError::Overflow));

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
        let new_total = user_migrated
            .checked_add(amount)
            .unwrap_or_else(|| panic_with_error!(&env, MigError::Overflow));
        env.storage().persistent().set(&user_key, &new_total);
        env.storage()
            .persistent()
            .extend_ttl(&user_key, 100_000, 100_000);

        // Record (or update) the versioned per-user storage record. New
        // records are written in the legacy v1 shape; the storage
        // migration engine below transmutes them to v2 in cursor batches.
        let record_key = DataKey::UserRecord(caller.clone());
        let already_indexed = env.storage().persistent().has(&record_key);
        env.storage().persistent().set(
            &record_key,
            &VersionedUserRecord::V1(UserRecordV1 { amount: new_total }),
        );
        env.storage()
            .persistent()
            .extend_ttl(&record_key, 100_000, 100_000);

        if !already_indexed {
            let count: u32 = env
                .storage()
                .instance()
                .get(&DataKey::UserCount)
                .unwrap_or(0);
            env.storage()
                .persistent()
                .set(&DataKey::UserIndex(count), &caller);
            env.storage()
                .instance()
                .set(&DataKey::UserCount, &(count + 1));
            env.storage()
                .instance()
                .set(&DataKey::MigrationStatus, &MigrationStatus::InProgress);
        }

        let total_migrated: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalMigrated)
            .unwrap_or(0);
        env.storage().instance().set(
            &DataKey::TotalMigrated,
            &total_migrated
                .checked_add(amount)
                .unwrap_or_else(|| panic_with_error!(&env, MigError::Overflow)),
        );

        env.events().publish(
            (symbol_short!("migrated"), caller),
            (amount, new_amount),
        );
    }

    /// Allows the admin to withdraw any remaining legacy tokens after the deadline.
    pub fn withdraw_legacy(env: Env) {
        let config: MigrationConfig = env
            .storage()
            .instance()
            .get(&DataKey::Config)
            .unwrap_or_else(|| panic_with_error!(&env, MigError::NotInitialized));
        config.admin.require_auth();

        if env.ledger().timestamp() <= config.deadline {
            panic_with_error!(&env, MigError::DeadlineNotReached);
        }

        let old_token_client = token::Client::new(&env, &config.old_token);
        let balance = old_token_client.balance(&env.current_contract_address());

        if balance > 0 {
            old_token_client.transfer(&env.current_contract_address(), &config.admin, &balance);
        }
    }

    // --- View Functions ---

    pub fn get_config(env: Env) -> MigrationConfig {
        env.storage()
            .instance()
            .get(&DataKey::Config)
            .unwrap_or_else(|| panic_with_error!(&env, MigError::NotInitialized))
    }

    pub fn get_user_migrated(env: Env, user: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::UserMigrated(user))
            .unwrap_or(0)
    }

    pub fn get_total_migrated(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::TotalMigrated)
            .unwrap_or(0)
    }

    /// Current status of the in-place v1 -> v2 storage schema migration.
    pub fn migration_status(env: Env) -> MigrationStatus {
        env.storage()
            .instance()
            .get(&DataKey::MigrationStatus)
            .unwrap_or(MigrationStatus::NotStarted)
    }

    /// Number of users indexed for storage-key iteration.
    pub fn user_count(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::UserCount)
            .unwrap_or(0)
    }

    /// Iterate storage keys: list up to `limit` migrated user addresses
    /// starting at `start`, without loading the entire user set at once.
    pub fn list_users(env: Env, start: u32, limit: u32) -> Vec<Address> {
        let count: u32 = env
            .storage()
            .instance()
            .get(&DataKey::UserCount)
            .unwrap_or(0);
        let mut users = Vec::new(&env);
        let mut i = start;
        let end = core::cmp::min(count, start.saturating_add(limit));
        while i < end {
            if let Some(addr) = env.storage().persistent().get(&DataKey::UserIndex(i)) {
                users.push_back(addr);
            }
            i += 1;
        }
        users
    }

    /// Read a user's versioned storage record as-is (v1 or v2), primarily
    /// for migration diagnostics/testing.
    pub fn get_user_record(env: Env, user: Address) -> Option<VersionedUserRecord> {
        env.storage().persistent().get(&DataKey::UserRecord(user))
    }

    /// Cursor-based batch migration of per-user storage records from the
    /// legacy v1 schema (`{ amount }`) to the v2 schema
    /// (`{ amount, migrated_at }`).
    ///
    /// Only the admin may call this. Processes at most `batch_size` users
    /// starting at the current cursor, so large user sets can be migrated
    /// across many transactions without exhausting the per-tx CPU
    /// instruction budget. Returns the new cursor position.
    pub fn migrate_storage_batch(env: Env, caller: Address, batch_size: u32) -> u32 {
        let config: MigrationConfig = env
            .storage()
            .instance()
            .get(&DataKey::Config)
            .unwrap_or_else(|| panic_with_error!(&env, MigError::NotInitialized));
        caller.require_auth();
        if caller != config.admin {
            panic_with_error!(&env, MigError::Unauthorized);
        }

        let count: u32 = env
            .storage()
            .instance()
            .get(&DataKey::UserCount)
            .unwrap_or(0);
        let mut cursor: u32 = env
            .storage()
            .instance()
            .get(&DataKey::MigrationCursor)
            .unwrap_or(0);

        let end = core::cmp::min(count, cursor.saturating_add(batch_size));
        while cursor < end {
            if let Some(addr) = env
                .storage()
                .persistent()
                .get::<_, Address>(&DataKey::UserIndex(cursor))
            {
                let record_key = DataKey::UserRecord(addr);
                let record: Option<VersionedUserRecord> =
                    env.storage().persistent().get(&record_key);
                if let Some(VersionedUserRecord::V1(v1)) = record {
                    let migrated = VersionedUserRecord::V2(UserRecordV2 {
                        amount: v1.amount,
                        migrated_at: env.ledger().timestamp(),
                    });
                    env.storage().persistent().set(&record_key, &migrated);
                }
            }
            cursor += 1;
        }

        env.storage()
            .instance()
            .set(&DataKey::MigrationCursor, &cursor);

        let status = if cursor >= count && count > 0 {
            MigrationStatus::Completed
        } else {
            MigrationStatus::InProgress
        };
        env.storage()
            .instance()
            .set(&DataKey::MigrationStatus, &status);

        env.events().publish(
            (symbol_short!("stor_mig"),),
            cursor,
        );

        cursor
    }
}

#[cfg(test)]
mod test;
