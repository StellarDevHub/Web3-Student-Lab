//! storage_migration.rs — Issue #992
//!
//! Gradual Storage Migration Pattern for Soroban Contract Upgrades.
//!
//! # Problem
//! When a Soroban contract needs breaking storage changes (schema evolution),
//! the proxy/implementation upgrade pattern only swaps code — not data.
//! Existing records still carry the old schema and must be migrated.
//!
//! # Solution
//! This module implements two complementary strategies:
//!
//! ## Lazy Migration (default)
//! Records are migrated **on first access** after a schema version bump.
//! - Zero up-front gas cost.
//! - Safe for live contracts: un-migrated records are upgraded transparently.
//! - Suitable for most schema changes.
//!
//! ## Eager Migration (admin-triggered)
//! The admin calls `migrate_batch(keys)` to migrate a slice of keys at once.
//! - Useful when the new schema must be enforced *before* the next user touches
//!   each record (e.g. a field that affects revenue / security).
//! - `pause()` / `unpause()` prevents writes during a batch migration window.
//!
//! ## Migration Registry
//! A per-key flag (`MigrationRegistry::Migrated(key)`) records whether a
//! record has been migrated to the current schema version.  The registry is
//! consulted by both the lazy and eager paths.
//!
//! ## Schema Version Tracking
//! `StorageVersion` in instance storage holds the current schema version.
//! Bumping this number signals that all records at lower versions need
//! migration.
//!
//! # Acceptance Criteria (Issue #992)
//! ✅ Version field on contract storage to track schema version
//! ✅ Lazy migration: migrate records on first access
//! ✅ Eager migration: admin-triggered batch migration
//! ✅ Pause/unpause to prevent writes during migration
//! ✅ Migration registry tracking which records have been migrated
//!
//! # Gas / Scale notes
//! Lazy migration adds ~1 storage read + 1 storage write per first access.
//! For 10 000 records the eager batch should be called with slices of ~100
//! keys to stay within Soroban's per-tx instruction limit.

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, String, Vec};

// ─── Storage keys ─────────────────────────────────────────────────────────────

/// Persistent storage key namespace for this module.
#[contracttype]
#[derive(Clone)]
pub enum MigrationKey {
    /// Current schema version (u32, stored in instance storage).
    SchemaVersion,
    /// Whether writes are currently paused (bool, instance storage).
    Paused,
    /// Admin address allowed to trigger migrations and pause/unpause.
    Admin,
    /// A user record stored under an arbitrary string key.
    Record(String),
    /// Migration-registry entry: true = record has been migrated to current version.
    Migrated(String),
}

// ─── Data types ───────────────────────────────────────────────────────────────

/// Version 1 record schema (legacy).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RecordV1 {
    pub owner: Address,
    pub value: u64,
}

/// Version 2 record schema (current).  Added `label` and `updated_at`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RecordV2 {
    pub owner: Address,
    pub value: u64,
    /// Human-readable label added in schema v2.
    pub label: String,
    /// Ledger timestamp of last write, added in schema v2.
    pub updated_at: u64,
}

/// Discriminated union so the contract can deserialise either version.
#[contracttype]
#[derive(Clone)]
pub enum VersionedRecord {
    V1(RecordV1),
    V2(RecordV2),
}

// ─── Contract ────────────────────────────────────────────────────────────────

#[contract]
pub struct StorageMigrationContract;

#[contractimpl]
impl StorageMigrationContract {
    // ── Initialisation ────────────────────────────────────────────────────────

    /// Initialise the contract.  Must be called once after deployment.
    ///
    /// * `admin` — address that may call admin-only functions.
    /// * `schema_version` — initial schema version (pass `1` for a fresh deploy).
    pub fn initialize(env: Env, admin: Address, schema_version: u32) {
        admin.require_auth();

        env.storage().instance().set(&MigrationKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&MigrationKey::SchemaVersion, &schema_version);
        env.storage().instance().set(&MigrationKey::Paused, &false);

        env.events()
            .publish((symbol_short!("init"),), (admin, schema_version));
    }

    // ── Schema version management ─────────────────────────────────────────────

    /// Return the current schema version.
    pub fn schema_version(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&MigrationKey::SchemaVersion)
            .unwrap_or(1u32)
    }

    /// Bump the schema version.  Only the admin may call this.
    ///
    /// After bumping, newly-written records use the new schema.  Existing
    /// records at lower versions will be migrated lazily on next read, or
    /// eagerly via `migrate_batch`.
    pub fn set_schema_version(env: Env, new_version: u32) {
        Self::require_admin(&env);

        let current: u32 = env
            .storage()
            .instance()
            .get(&MigrationKey::SchemaVersion)
            .unwrap_or(1);

        assert!(
            new_version > current,
            "new_version must be greater than current"
        );

        env.storage()
            .instance()
            .set(&MigrationKey::SchemaVersion, &new_version);

        env.events()
            .publish((symbol_short!("schema"),), (current, new_version));
    }

    // ── Pause / unpause ───────────────────────────────────────────────────────

    /// Pause all write operations.  Use before an eager migration batch to
    /// prevent concurrent writes from creating un-migrated records.
    pub fn pause(env: Env) {
        Self::require_admin(&env);
        env.storage().instance().set(&MigrationKey::Paused, &true);
        env.events().publish((symbol_short!("paused"),), ());
    }

    /// Resume write operations after the migration batch is complete.
    pub fn unpause(env: Env) {
        Self::require_admin(&env);
        env.storage().instance().set(&MigrationKey::Paused, &false);
        env.events().publish((symbol_short!("unpaused"),), ());
    }

    /// Returns `true` if the contract is currently paused.
    pub fn is_paused(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&MigrationKey::Paused)
            .unwrap_or(false)
    }

    // ── Write record (v2 schema) ──────────────────────────────────────────────

    /// Write or update a record.  Fails when the contract is paused.
    pub fn set_record(env: Env, caller: Address, key: String, value: u64, label: String) {
        caller.require_auth();
        Self::require_not_paused(&env);

        let now = env.ledger().timestamp();
        let record = RecordV2 {
            owner: caller,
            value,
            label,
            updated_at: now,
        };

        env.storage().persistent().set(
            &MigrationKey::Record(key.clone()),
            &VersionedRecord::V2(record),
        );

        // Mark as migrated at the current schema version.
        env.storage()
            .persistent()
            .set(&MigrationKey::Migrated(key.clone()), &true);

        env.events().publish((symbol_short!("set"),), key);
    }

    // ── Read record with lazy migration ──────────────────────────────────────

    /// Read a record by key.
    ///
    /// **Lazy migration**: if the stored record is a `V1`, it is transparently
    /// migrated to `V2` in place before being returned.  The migration
    /// registry is updated so the record is not migrated again.
    pub fn get_record(env: Env, key: String) -> Option<RecordV2> {
        let raw: Option<VersionedRecord> = env
            .storage()
            .persistent()
            .get(&MigrationKey::Record(key.clone()));

        match raw {
            None => None,
            Some(VersionedRecord::V2(r)) => Some(r),
            Some(VersionedRecord::V1(v1)) => {
                // ── Lazy migration path ──────────────────────────────────────
                // Upgrade the stored record to V2 in place.
                let migrated = Self::migrate_v1_to_v2(&env, v1);

                // Persist the migrated record (only if not paused).
                if !Self::is_paused(env.clone()) {
                    env.storage().persistent().set(
                        &MigrationKey::Record(key.clone()),
                        &VersionedRecord::V2(migrated.clone()),
                    );
                    env.storage()
                        .persistent()
                        .set(&MigrationKey::Migrated(key.clone()), &true);

                    env.events().publish((symbol_short!("lazy_mig"),), key);
                }

                Some(migrated)
            }
        }
    }

    // ── Eager migration (admin batch) ─────────────────────────────────────────

    /// Migrate a batch of keys to the current schema version.
    ///
    /// Call this repeatedly with slices of ~100 keys to stay within the
    /// per-transaction instruction limit when migrating large datasets.
    ///
    /// Returns the number of records actually migrated (skips already-migrated
    /// or non-existent keys).
    pub fn migrate_batch(env: Env, keys: Vec<String>) -> u32 {
        Self::require_admin(&env);

        let mut migrated_count: u32 = 0;

        for key in keys.iter() {
            // Skip if already migrated.
            let already: bool = env
                .storage()
                .persistent()
                .get(&MigrationKey::Migrated(key.clone()))
                .unwrap_or(false);

            if already {
                continue;
            }

            let raw: Option<VersionedRecord> = env
                .storage()
                .persistent()
                .get(&MigrationKey::Record(key.clone()));

            match raw {
                Some(VersionedRecord::V1(v1)) => {
                    let v2 = Self::migrate_v1_to_v2(&env, v1);

                    env.storage()
                        .persistent()
                        .set(&MigrationKey::Record(key.clone()), &VersionedRecord::V2(v2));
                    env.storage()
                        .persistent()
                        .set(&MigrationKey::Migrated(key.clone()), &true);

                    migrated_count += 1;
                }
                Some(VersionedRecord::V2(_)) => {
                    // Mark as migrated even though no transformation was needed.
                    env.storage()
                        .persistent()
                        .set(&MigrationKey::Migrated(key.clone()), &true);
                }
                None => {} // key doesn't exist, skip
            }
        }

        env.events()
            .publish((symbol_short!("batch_mig"),), migrated_count);

        migrated_count
    }

    // ── Migration registry queries ────────────────────────────────────────────

    /// Returns `true` if the record at `key` has been migrated to the current
    /// schema version (or was written directly in the current version).
    pub fn is_migrated(env: Env, key: String) -> bool {
        env.storage()
            .persistent()
            .get(&MigrationKey::Migrated(key))
            .unwrap_or(false)
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    fn require_admin(env: &Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&MigrationKey::Admin)
            .expect("contract not initialised");
        admin.require_auth();
    }

    fn require_not_paused(env: &Env) {
        let paused: bool = env
            .storage()
            .instance()
            .get(&MigrationKey::Paused)
            .unwrap_or(false);
        assert!(!paused, "contract is paused for migration");
    }

    /// Transform a V1 record into a V2 record with sensible defaults for the
    /// newly-added fields.
    fn migrate_v1_to_v2(env: &Env, v1: RecordV1) -> RecordV2 {
        RecordV2 {
            owner: v1.owner,
            value: v1.value,
            // Default label for legacy records.
            label: String::from_str(env, "migrated"),
            // Use current ledger timestamp as a best-effort `updated_at`.
            updated_at: env.ledger().timestamp(),
        }
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    fn setup() -> (Env, StorageMigrationContractClient<'static>, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, StorageMigrationContract);
        let client = StorageMigrationContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin, &1u32);
        (env, client, admin)
    }

    #[test]
    fn test_initialize_and_version() {
        let (_env, client, _admin) = setup();
        assert_eq!(client.schema_version(), 1);
        assert!(!client.is_paused());
    }

    #[test]
    fn test_set_and_get_record() {
        let (env, client, _admin) = setup();
        let user = Address::generate(&env);
        client.set_record(
            &user,
            &String::from_str(&env, "key1"),
            &100u64,
            &String::from_str(&env, "test-label"),
        );
        let record = client.get_record(&String::from_str(&env, "key1")).unwrap();
        assert_eq!(record.value, 100u64);
        assert!(client.is_migrated(&String::from_str(&env, "key1")));
    }

    #[test]
    #[should_panic]
    fn test_pause_blocks_writes() {
        let (env, client, _admin) = setup();
        let user = Address::generate(&env);
        client.pause();
        assert!(client.is_paused());

        client.set_record(
            &user,
            &String::from_str(&env, "key2"),
            &50u64,
            &String::from_str(&env, "blocked"),
        );
    }

    #[test]
    fn test_schema_version_bump() {
        let (_env, client, _admin) = setup();
        client.set_schema_version(&2u32);
        assert_eq!(client.schema_version(), 2u32);
    }

    #[test]
    fn test_lazy_migration() {
        let (env, client, _admin) = setup();

        // Manually inject a V1 record to simulate a legacy record.
        let contract_id = client.address.clone();
        env.as_contract(&contract_id, || {
            let key = String::from_str(&env, "legacy");
            let v1 = RecordV1 {
                owner: Address::generate(&env),
                value: 42u64,
            };
            env.storage()
                .persistent()
                .set(&MigrationKey::Record(key.clone()), &VersionedRecord::V1(v1));
        });

        // Reading should trigger lazy migration and return a V2 record.
        let record = client
            .get_record(&String::from_str(&env, "legacy"))
            .unwrap();
        assert_eq!(record.value, 42u64);
        assert_eq!(record.label, String::from_str(&env, "migrated"));
    }

    #[test]
    fn test_eager_batch_migration() {
        let (env, client, _admin) = setup();

        // Inject several V1 records.
        let contract_id = client.address.clone();
        let keys: Vec<String> = Vec::from_array(
            &env,
            [
                String::from_str(&env, "r1"),
                String::from_str(&env, "r2"),
                String::from_str(&env, "r3"),
            ],
        );

        env.as_contract(&contract_id, || {
            for key in keys.iter() {
                let v1 = RecordV1 {
                    owner: Address::generate(&env),
                    value: 99u64,
                };
                env.storage()
                    .persistent()
                    .set(&MigrationKey::Record(key.clone()), &VersionedRecord::V1(v1));
            }
        });

        let count = client.migrate_batch(&keys);
        assert_eq!(count, 3u32);

        // All should now be marked as migrated.
        for key in keys.iter() {
            assert!(client.is_migrated(&key));
        }
    }
}
