//! On-chain activity logging system.
//!
//! Provides immutable, queryable activity logs for all certificate operations.
//! Supports querying by address, token ID, and recent activities with pagination.
//! Activity logs are append-only and cannot be modified once stored.

use soroban_sdk::{contracttype, Address, BytesN, Env, Vec};

// Activity log entry stored on-chain.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ActivityLogEntry {
    pub id: u64,
    pub event_type: EventType,
    pub token_id: Option<u128>,
    pub address: Address,
    pub timestamp: u64,
    pub data_hash: BytesN<32>,
}

/// Event type enum for activity categorization.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EventType {
    Minted = 0,
    Transferred = 1,
    Revoked = 2,
    Verified = 3,
    Updated = 4,
    BatchMinted = 5,
    Renewed = 6,
    RoleGranted = 7,
    RoleRevoked = 8,
    PauseUpdated = 9,
    ActionProposed = 10,
    ActionApproved = 11,
    ActionExecuted = 12,
    MintCapUpdated = 13,
    DidUpdated = 14,
    DidRemoved = 15,
    UpgradeProposed = 16,
    UpgradeApproved = 17,
    UpgradeExecuted = 18,
    UpgradeCancelled = 19,
    EmergencyRollback = 20,
    AdminAdded = 21,
    AdminRemoved = 22,
    OwnershipTransferred = 23,
}

/// Storage keys for activity log.
#[contracttype]
#[derive(Clone)]
enum ActivityLogKey {
    Sequence,
    Entry(u64),
    AddressIndex(Address, u64),
    TokenIndex(u128, u64),
    /// Reverse mapping for pagination
    TimestampIndex(u64, u64),
}

/// Manages activity log storage and retrieval.
pub struct ActivityLogManager<'a> {
    env: &'a Env,
}

impl<'a> ActivityLogManager<'a> {
    /// Create a new ActivityLogManager.
    pub fn new(env: &'a Env) -> Self {
        Self { env }
    }

    /// Get the next sequence number for activity log entries.
    fn next_sequence(&self) -> u64 {
        let key = ActivityLogKey::Sequence;
        let seq: u64 = self.env.storage().instance().get(&key).unwrap_or(0);
        seq.wrapping_add(1)
    }

    /// Record an activity log entry.
    /// This is append-only - entries cannot be modified once stored.
    pub fn record(
        &self,
        event_type: EventType,
        token_id: Option<u128>,
        address: &Address,
        data_hash: BytesN<32>,
    ) -> u64 {
        let seq = self.next_sequence();
        let timestamp = self.env.ledger().timestamp();

        let entry = ActivityLogEntry {
            id: seq,
            event_type,
            token_id,
            address: address.clone(),
            timestamp,
            data_hash,
        };

        // Store the main entry
        let entry_key = ActivityLogKey::Entry(seq);
        self.env.storage().instance().set(&entry_key, &entry);

        // Store in address index for address-based queries
        let addr_idx_key = ActivityLogKey::AddressIndex(address.clone(), seq);
        self.env.storage().instance().set(&addr_idx_key, &true);

        // If token_id exists, index for token-based queries
        if let Some(token_id) = token_id {
            let token_idx_key = ActivityLogKey::TokenIndex(token_id, seq);
            self.env.storage().instance().set(&token_idx_key, &true);
        }

        // Store in timestamp index for time-based queries
        let ts_idx_key = ActivityLogKey::TimestampIndex(timestamp, seq);
        self.env.storage().instance().set(&ts_idx_key, &true);

        // Update sequence
        self.env
            .storage()
            .instance()
            .set(&ActivityLogKey::Sequence, &seq);

        seq
    }

    /// Get a single activity log entry by ID.
    pub fn get_entry(&self, id: u64) -> Option<ActivityLogEntry> {
        let key = ActivityLogKey::Entry(id);
        self.env.storage().instance().get(&key)
    }

    /// Get all entries for a specific address with pagination.
    /// Returns entries ordered by descending ID (most recent first).
    pub fn get_activities_by_address(
        &self,
        address: &Address,
        limit: u32,
        offset: u32,
    ) -> Vec<ActivityLogEntry> {
        let mut results = Vec::new(self.env);
        if limit == 0 {
            return results;
        }

        let max_seq = self.next_sequence().saturating_sub(1);
        let start_seq = max_seq.saturating_sub(offset as u64);
        let end_seq = start_seq.saturating_sub(limit as u64);

        let mut count = 0u32;
        for seq in (end_seq + 1..=start_seq).rev() {
            if count >= limit {
                break;
            }

            let idx_key = ActivityLogKey::AddressIndex(address.clone(), seq);
            if self.env.storage().instance().has(&idx_key) {
                if let Some(entry) = self.get_entry(seq) {
                    results.push_back(entry);
                    count += 1;
                }
            }
        }

        results
    }

    /// Get all activities for a specific token ID.
    pub fn get_activities_by_token(&self, token_id: u128) -> Vec<ActivityLogEntry> {
        let mut results = Vec::new(self.env);

        let max_seq = self.next_sequence().saturating_sub(1);

        for seq in (0..=max_seq).rev() {
            if let Some(entry) = self.get_entry(seq) {
                if entry.token_id == Some(token_id) {
                    results.push_back(entry);
                }
            }
        }

        results
    }

    /// Get recent activities across all tokens with pagination.
    /// Results ordered by descending timestamp.
    pub fn get_recent_activities(&self, limit: u32) -> Vec<ActivityLogEntry> {
        let mut results = Vec::new(self.env);
        if limit == 0 {
            return results;
        }

        let max_seq = self.next_sequence().saturating_sub(1);
        let mut count = 0u32;

        for seq in (0..=max_seq).rev() {
            if count >= limit {
                break;
            }

            if let Some(entry) = self.get_entry(seq) {
                results.push_back(entry);
                count += 1;
            }
        }

        results
    }

    /// Get activities within a time range.
    pub fn get_activities_by_time_range(
        &self,
        start_time: u64,
        end_time: u64,
        limit: u32,
    ) -> Vec<ActivityLogEntry> {
        let mut results = Vec::new(self.env);
        if limit == 0 {
            return results;
        }

        let max_seq = self.next_sequence().saturating_sub(1);
        let mut count = 0u32;

        for seq in (0..=max_seq).rev() {
            if count >= limit {
                break;
            }

            if let Some(entry) = self.get_entry(seq) {
                if entry.timestamp >= start_time && entry.timestamp <= end_time {
                    results.push_back(entry);
                    count += 1;
                }
            }
        }

        results
    }

    /// Get count of activities by event type.
    pub fn get_event_type_counts(&self, event_type: EventType) -> u32 {
        let max_seq = self.next_sequence().saturating_sub(1);
        let mut count = 0u32;

        for seq in 0..=max_seq {
            if let Some(entry) = self.get_entry(seq) {
                if entry.event_type == event_type {
                    count += 1;
                }
            }
        }

        count
    }

    /// Check if an activity log entry exists.
    pub fn has_entry(&self, id: u64) -> bool {
        let key = ActivityLogKey::Entry(id);
        self.env.storage().instance().has(&key)
    }
}

#[cfg(test)]
mod tests {
    extern crate std;
    use super::*;
    use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, Symbol};

    #[test]
    fn test_activity_log_record_and_retrieve() {
        std::env::remove_var("SOROBAN_TEST_SNAPSHOT_FILE");
        let env = Env::default();
        let admin_a = Address::generate(&env);
        let contract_id = env.register(crate::CertificateContract, ());
        env.as_contract(&contract_id, || {
            let activity_mgr = ActivityLogManager::new(&env);

            let token_id: u128 = 12345;
            let data_hash = BytesN::<32>::from_array(&env, &[0u8; 32]);

            activity_mgr.record(EventType::Minted, Some(token_id), &admin_a, data_hash);

            let entries = activity_mgr.get_activities_by_address(&admin_a, 10, 0);
            assert_eq!(entries.len(), 1);
            assert_eq!(entries.get(0).unwrap().token_id, Some(token_id));
        });
    }

    #[test]
    fn test_activity_log_empty_query() {
        std::env::remove_var("SOROBAN_TEST_SNAPSHOT_FILE");
        let env = Env::default();
        let admin_a = Address::generate(&env);
        let contract_id = env.register(crate::CertificateContract, ());
        env.as_contract(&contract_id, || {
            let activity_mgr = ActivityLogManager::new(&env);

            let activities = activity_mgr.get_activities_by_address(&admin_a, 10, 0);
            assert_eq!(activities.len(), 0);
        });
    }

    #[test]
    fn test_recent_activities() {
        std::env::remove_var("SOROBAN_TEST_SNAPSHOT_FILE");
        let env = Env::default();
        let admin_a = Address::generate(&env);
        let contract_id = env.register(crate::CertificateContract, ());
        env.as_contract(&contract_id, || {
            let activity_mgr = ActivityLogManager::new(&env);

            let data_hash = BytesN::<32>::from_array(&env, &[0u8; 32]);

            for i in 0..5u128 {
                activity_mgr.record(EventType::Minted, Some(i), &admin_a, data_hash.clone());
            }

            let recent = activity_mgr.get_recent_activities(3);
            assert_eq!(recent.len(), 3);
        });
    }

    #[test]
    fn test_get_activities_by_token() {
        std::env::remove_var("SOROBAN_TEST_SNAPSHOT_FILE");
        let env = Env::default();
        let admin_a = Address::generate(&env);
        let contract_id = env.register(crate::CertificateContract, ());
        env.as_contract(&contract_id, || {
            let activity_mgr = ActivityLogManager::new(&env);

            let data_hash = BytesN::<32>::from_array(&env, &[0u8; 32]);

            activity_mgr.record(EventType::Minted, Some(100), &admin_a, data_hash.clone());
            activity_mgr.record(EventType::Revoked, Some(100), &admin_a, data_hash.clone());
            activity_mgr.record(EventType::Minted, Some(200), &admin_a, data_hash);

            let token100 = activity_mgr.get_activities_by_token(100);
            assert_eq!(token100.len(), 2);

            let token200 = activity_mgr.get_activities_by_token(200);
            assert_eq!(token200.len(), 1);
        });
    }

    #[test]
    fn test_event_type_enum_values() {
        use EventType::*;
        assert_eq!(Minted as u32, 0);
        assert_eq!(Transferred as u32, 1);
        assert_eq!(Revoked as u32, 2);
        assert_eq!(BatchMinted as u32, 5);
    }
}
