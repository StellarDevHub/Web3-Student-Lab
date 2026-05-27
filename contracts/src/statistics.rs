//! Contract statistics and analytics tracking.
//!
//! Maintains aggregated statistics for the contract and per-course analytics.
//! All statistics are tracked on-chain and can be queried for analytics dashboards.

use soroban_sdk::{contracttype, Address, BytesN, Env};

use crate::activity_log::ActivityLogManager;

/// Overall contract statistics.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContractStatistics {
    pub total_minted: u64,
    pub total_transferred: u64,
    pub total_revoked: u64,
    pub total_verified: u64,
    pub total_renewed: u64,
    pub unique_holders: u64,
    pub active_certificates: u64,
    pub last_updated: u64,
}

/// Per-course statistics.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CourseStatistics {
    pub course_id: BytesN<32>,
    pub certificates_issued: u64,
    pub certificates_revoked: u64,
    pub unique_graduates: u64,
    pub last_certificate_at: u64,
}

/// Storage keys for statistics.
#[contracttype]
#[derive(Clone)]
enum StatsKey {
    TotalMinted,
    TotalTransferred,
    TotalRevoked,
    TotalVerified,
    TotalRenewed,
    UniqueHolders,
    HolderCount(Address),
    TokenHolder(u128),
    StudentCourse(Address, BytesN<32>),
    CourseStats(BytesN<32>),
}

/// Statistics manager for aggregated analytics.
pub struct StatisticsManager<'a> {
    env: &'a Env,
}

impl<'a> StatisticsManager<'a> {
    /// Create a new StatisticsManager.
    pub fn new(env: &'a Env) -> Self {
        Self { env }
    }

    /// Get current contract statistics.
    pub fn get_statistics(&self) -> ContractStatistics {
        let total_minted: u64 = self
            .env
            .storage()
            .instance()
            .get(&StatsKey::TotalMinted)
            .unwrap_or(0);
        let total_revoked: u64 = self
            .env
            .storage()
            .instance()
            .get(&StatsKey::TotalRevoked)
            .unwrap_or(0);
        let total_verified: u64 = self
            .env
            .storage()
            .instance()
            .get(&StatsKey::TotalVerified)
            .unwrap_or(0);
        let total_renewed: u64 = self
            .env
            .storage()
            .instance()
            .get(&StatsKey::TotalRenewed)
            .unwrap_or(0);
        let total_transferred: u64 = self
            .env
            .storage()
            .instance()
            .get(&StatsKey::TotalTransferred)
            .unwrap_or(0);

        let unique_holders: u64 = self
            .env
            .storage()
            .instance()
            .get(&StatsKey::UniqueHolders)
            .unwrap_or(0);

        // Active certificates = total minted - total revoked
        let active_certificates = total_minted.saturating_sub(total_revoked);

        let last_updated = self.env.ledger().timestamp();

        ContractStatistics {
            total_minted,
            total_transferred,
            total_revoked,
            total_verified,
            total_renewed,
            unique_holders,
            active_certificates,
            last_updated,
        }
    }

    /// Increment total minted counter and update holder tracking.
    pub fn increment_minted(&self, token_id: u128, recipient: &Address, course_id: &BytesN<32>) {
        // Increment total minted
        let current: u64 = self
            .env
            .storage()
            .instance()
            .get(&StatsKey::TotalMinted)
            .unwrap_or(0);
        self.env
            .storage()
            .instance()
            .set(&StatsKey::TotalMinted, &(current + 1));

        // Track holder count for unique_holders
        let holder_key = StatsKey::HolderCount(recipient.clone());
        let holder_count: u32 = self.env.storage().instance().get(&holder_key).unwrap_or(0);
        if holder_count == 0 {
            // First time this holder receives a certificate
            let unique: u64 = self
                .env
                .storage()
                .instance()
                .get(&StatsKey::UniqueHolders)
                .unwrap_or(0);
            self.env
                .storage()
                .instance()
                .set(&StatsKey::UniqueHolders, &(unique + 1));
        }
        self.env
            .storage()
            .instance()
            .set(&holder_key, &(holder_count + 1));

        // Maintain token -> holder mapping (optional)
        self.env
            .storage()
            .instance()
            .set(&StatsKey::TokenHolder(token_id), recipient);

        // Track student-course pair for unique graduate counting
        let student_course_key = StatsKey::StudentCourse(recipient.clone(), course_id.clone());
        self.env
            .storage()
            .instance()
            .set(&student_course_key, &true);

        // Update course statistics
        self.increment_course_issued(course_id);
    }

    /// Increment total revoked counter.
    pub fn increment_revoked(&self) {
        let current: u64 = self
            .env
            .storage()
            .instance()
            .get(&StatsKey::TotalRevoked)
            .unwrap_or(0);
        self.env
            .storage()
            .instance()
            .set(&StatsKey::TotalRevoked, &(current + 1));
    }

    /// Increment total verified counter.
    pub fn increment_verified(&self) {
        let current: u64 = self
            .env
            .storage()
            .instance()
            .get(&StatsKey::TotalVerified)
            .unwrap_or(0);
        self.env
            .storage()
            .instance()
            .set(&StatsKey::TotalVerified, &(current + 1));
    }

    /// Increment total renewed counter.
    pub fn increment_renewed(&self) {
        let current: u64 = self
            .env
            .storage()
            .instance()
            .get(&StatsKey::TotalRenewed)
            .unwrap_or(0);
        self.env
            .storage()
            .instance()
            .set(&StatsKey::TotalRenewed, &(current + 1));
    }

    /// Increment total transferred counter.
    pub fn increment_transferred(&self) {
        let current: u64 = self
            .env
            .storage()
            .instance()
            .get(&StatsKey::TotalTransferred)
            .unwrap_or(0);
        self.env
            .storage()
            .instance()
            .set(&StatsKey::TotalTransferred, &(current + 1));
    }

    /// Increment course issued count.
    fn increment_course_issued(&self, course_id: &BytesN<32>) {
        let key = StatsKey::CourseStats(course_id.clone());
        let stats: Option<CourseStatistics> = self.env.storage().instance().get(&key);

        let current_issued = stats.as_ref().map(|s| s.certificates_issued).unwrap_or(0);
        let current_revoked = stats.as_ref().map(|s| s.certificates_revoked).unwrap_or(0);
        let current_unique = stats.as_ref().map(|s| s.unique_graduates).unwrap_or(0);
        let last_time = self.env.ledger().timestamp();

        let course_stats = CourseStatistics {
            course_id: course_id.clone(),
            certificates_issued: current_issued + 1,
            certificates_revoked: current_revoked,
            unique_graduates: current_unique,
            last_certificate_at: last_time,
        };

        self.env.storage().instance().set(&key, &course_stats);
    }

    /// Increment course revoked count.
    pub fn increment_course_revoked(&self, course_id: &BytesN<32>) {
        let key = StatsKey::CourseStats(course_id.clone());
        let stats: Option<CourseStatistics> = self.env.storage().instance().get(&key);

        let current_revoked = stats.as_ref().map(|s| s.certificates_revoked).unwrap_or(0);

        if let Some(mut stats) = stats {
            stats.certificates_revoked = current_revoked + 1;
            self.env.storage().instance().set(&key, &stats);
        }
    }

    /// Get statistics for a specific course.
    pub fn get_course_statistics(&self, course_id: &BytesN<32>) -> Option<CourseStatistics> {
        let key = StatsKey::CourseStats(course_id.clone());
        self.env.storage().instance().get(&key)
    }
}

#[cfg(test)]
mod tests {
    extern crate std;
    use super::*;
    use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, Symbol};

    #[test]
    fn test_initial_statistics_are_zero() {
        std::env::remove_var("SOROBAN_TEST_SNAPSHOT_FILE");
        let env = Env::default();
        let contract_id = env.register(crate::CertificateContract, ());
        env.as_contract(&contract_id, || {
            let stats_mgr = StatisticsManager::new(&env);
            let stats = stats_mgr.get_statistics();

            assert_eq!(stats.total_minted, 0);
            assert_eq!(stats.total_revoked, 0);
            assert_eq!(stats.active_certificates, 0);
            assert_eq!(stats.unique_holders, 0);
        });
    }

    #[test]
    fn test_increment_minted_updates_stats_and_holder_count() {
        std::env::remove_var("SOROBAN_TEST_SNAPSHOT_FILE");
        let env = Env::default();
        let contract_id = env.register(crate::CertificateContract, ());
        env.as_contract(&contract_id, || {
            let stats_mgr = StatisticsManager::new(&env);
            let recipient = Address::generate(&env);
            let course_id = BytesN::from_array(&env, &[1u8; 32]);

            stats_mgr.increment_minted(1, &recipient, &course_id);

            let stats = stats_mgr.get_statistics();
            assert_eq!(stats.total_minted, 1);
            assert_eq!(stats.unique_holders, 1);
            assert_eq!(stats.active_certificates, 1);

            // Mint another to same recipient - unique holders should not increase
            stats_mgr.increment_minted(2, &recipient, &course_id);
            let stats2 = stats_mgr.get_statistics();
            assert_eq!(stats2.total_minted, 2);
            assert_eq!(stats2.unique_holders, 1); // same holder
        });
    }

    #[test]
    fn test_multiple_holders_increase_unique_count() {
        std::env::remove_var("SOROBAN_TEST_SNAPSHOT_FILE");
        let env = Env::default();
        let contract_id = env.register(crate::CertificateContract, ());
        env.as_contract(&contract_id, || {
            let stats_mgr = StatisticsManager::new(&env);
            let course_id = BytesN::from_array(&env, &[1u8; 32]);

            let holder1 = Address::generate(&env);
            let holder2 = Address::generate(&env);

            stats_mgr.increment_minted(1, &holder1, &course_id);
            stats_mgr.increment_minted(2, &holder2, &course_id);

            let stats = stats_mgr.get_statistics();
            assert_eq!(stats.unique_holders, 2);
            assert_eq!(stats.total_minted, 2);
        });
    }

    #[test]
    fn test_increment_revoked_updates_stats() {
        std::env::remove_var("SOROBAN_TEST_SNAPSHOT_FILE");
        let env = Env::default();
        let contract_id = env.register(crate::CertificateContract, ());
        env.as_contract(&contract_id, || {
            let stats_mgr = StatisticsManager::new(&env);
            let course_id = BytesN::from_array(&env, &[1u8; 32]);

            stats_mgr.increment_minted(100, &Address::generate(&env), &course_id);
            stats_mgr.increment_revoked();

            let stats = stats_mgr.get_statistics();
            assert_eq!(stats.total_minted, 1);
            assert_eq!(stats.total_revoked, 1);
            assert_eq!(stats.active_certificates, 0);
        });
    }

    #[test]
    fn test_course_statistics_tracking() {
        std::env::remove_var("SOROBAN_TEST_SNAPSHOT_FILE");
        let env = Env::default();
        let contract_id = env.register(crate::CertificateContract, ());
        env.as_contract(&contract_id, || {
            let stats_mgr = StatisticsManager::new(&env);
            let course_id = BytesN::from_array(&env, &[1u8; 32]);

            stats_mgr.increment_minted(1, &Address::generate(&env), &course_id);
            stats_mgr.increment_minted(2, &Address::generate(&env), &course_id);
            stats_mgr.increment_course_revoked(&course_id);

            let course_stats = stats_mgr.get_course_statistics(&course_id).unwrap();
            assert_eq!(course_stats.certificates_issued, 2);
            assert_eq!(course_stats.certificates_revoked, 1);
        });
    }

    #[test]
    fn test_renewal_increments_renewed_counter() {
        std::env::remove_var("SOROBAN_TEST_SNAPSHOT_FILE");
        let env = Env::default();
        let contract_id = env.register(crate::CertificateContract, ());
        env.as_contract(&contract_id, || {
            let stats_mgr = StatisticsManager::new(&env);
            stats_mgr.increment_renewed();
            let stats = stats_mgr.get_statistics();
            assert_eq!(stats.total_renewed, 1);
        });
    }

    #[test]
    fn test_transfer_increments_counter() {
        std::env::remove_var("SOROBAN_TEST_SNAPSHOT_FILE");
        let env = Env::default();
        let contract_id = env.register(crate::CertificateContract, ());
        env.as_contract(&contract_id, || {
            let stats_mgr = StatisticsManager::new(&env);
            stats_mgr.increment_transferred();
            let stats = stats_mgr.get_statistics();
            assert_eq!(stats.total_transferred, 1);
        });
    }

    #[test]
    fn test_statistics_persist_across_instances() {
        std::env::remove_var("SOROBAN_TEST_SNAPSHOT_FILE");
        let env = Env::default();
        let contract_id = env.register(crate::CertificateContract, ());
        env.as_contract(&contract_id, || {
            let stats_mgr1 = StatisticsManager::new(&env);
            stats_mgr1.increment_minted(
                1,
                &Address::generate(&env),
                &BytesN::from_array(&env, &[1u8; 32]),
            );

            let stats_mgr2 = StatisticsManager::new(&env);
            let stats = stats_mgr2.get_statistics();
            assert_eq!(stats.total_minted, 1);
        });
    }
}
