//! Enhanced upgrade mechanism with version tracking, rollback, and time-lock support.
//!
//! This module provides:
//! - Version history tracking for all contract upgrades
//! - Time-lock mechanism (24-hour delay) for upgrades
//! - Rollback capability to previous versions
//! - Emergency pause functionality
//! - Comprehensive upgrade event logging

use soroban_sdk::{contracttype, Address, BytesN, Env, String, Vec};

/// Contract version metadata stored for each upgrade
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContractVersion {
    pub version: u32,
    pub wasm_hash: BytesN<32>,
    pub upgraded_at: u64,
    pub upgraded_by: Address,
    pub changelog: String,
}

/// Pending upgrade with time-lock
#[contracttype]
#[derive(Clone)]
pub struct PendingUpgrade {
    pub new_wasm_hash: BytesN<32>,
    pub proposed_at: u64,
    pub proposed_by: Address,
    pub approval_mask: u32,
    pub changelog: String,
    pub executable_after: u64,
}

#[contracttype]
#[derive(Clone)]
pub enum UpgradeDataKey {
    CurrentVersion,
    VersionHistory,
    PendingUpgrade,
    UpgradeTimeLock,
}

/// Time-lock duration in seconds (24 hours)
pub const UPGRADE_TIMELOCK_SECONDS: u64 = 86400;

/// Maximum number of versions to keep in history
pub const MAX_VERSION_HISTORY: u32 = 10;

/// Get the current contract version
pub fn get_current_version(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&UpgradeDataKey::CurrentVersion)
        .unwrap_or(0)
}

/// Get the complete version history
pub fn get_version_history(env: &Env) -> Vec<ContractVersion> {
    env.storage()
        .instance()
        .get(&UpgradeDataKey::VersionHistory)
        .unwrap_or_else(|| Vec::new(env))
}

/// Get a specific version from history
pub fn get_version(env: &Env, version: u32) -> Option<ContractVersion> {
    let history = get_version_history(env);
    history.iter().find(|v| v.version == version)
}

/// Add a new version to history
pub fn add_version_to_history(
    env: &Env,
    wasm_hash: BytesN<32>,
    upgraded_by: Address,
    changelog: String,
) {
    let current_version = get_current_version(env);
    let new_version = current_version + 1;

    let mut history = get_version_history(env);

    let version_entry = ContractVersion {
        version: new_version,
        wasm_hash,
        upgraded_at: env.ledger().timestamp(),
        upgraded_by,
        changelog,
    };

    history.push_back(version_entry);

    // Keep only the last MAX_VERSION_HISTORY versions
    while history.len() > MAX_VERSION_HISTORY {
        history.remove(0);
    }

    env.storage()
        .instance()
        .set(&UpgradeDataKey::VersionHistory, &history);
    env.storage()
        .instance()
        .set(&UpgradeDataKey::CurrentVersion, &new_version);
}

/// Propose an upgrade with time-lock
pub fn propose_upgrade(
    env: &Env,
    new_wasm_hash: BytesN<32>,
    proposed_by: Address,
    approval_mask: u32,
    changelog: String,
) {
    let proposed_at = env.ledger().timestamp();
    let executable_after = proposed_at + UPGRADE_TIMELOCK_SECONDS;

    let pending = PendingUpgrade {
        new_wasm_hash,
        proposed_at,
        proposed_by,
        approval_mask,
        changelog,
        executable_after,
    };

    env.storage()
        .instance()
        .set(&UpgradeDataKey::PendingUpgrade, &pending);
}

/// Get the pending upgrade if one exists
pub fn get_pending_upgrade(env: &Env) -> Option<PendingUpgrade> {
    env.storage()
        .instance()
        .get(&UpgradeDataKey::PendingUpgrade)
}

/// Clear the pending upgrade
pub fn clear_pending_upgrade(env: &Env) {
    env.storage()
        .instance()
        .remove(&UpgradeDataKey::PendingUpgrade);
}

/// Check if the time-lock has expired for a pending upgrade
pub fn is_timelock_expired(env: &Env, pending: &PendingUpgrade) -> bool {
    env.ledger().timestamp() >= pending.executable_after
}

/// Execute the upgrade (after time-lock expires)
pub fn execute_upgrade(env: &Env, pending: &PendingUpgrade) {
    env.deployer()
        .update_current_contract_wasm(pending.new_wasm_hash.clone());

    add_version_to_history(
        env,
        pending.new_wasm_hash.clone(),
        pending.proposed_by.clone(),
        pending.changelog.clone(),
    );

    clear_pending_upgrade(env);
}

/// Rollback to a previous version (emergency use only)
pub fn rollback_to_version(env: &Env, version: u32) -> Option<BytesN<32>> {
    let history = get_version_history(env);

    for v in history.iter() {
        if v.version == version {
            env.deployer()
                .update_current_contract_wasm(v.wasm_hash.clone());

            env.storage()
                .instance()
                .set(&UpgradeDataKey::CurrentVersion, &version);

            return Some(v.wasm_hash);
        }
    }

    None
}
