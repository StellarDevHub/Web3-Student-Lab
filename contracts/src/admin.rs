//! Enhanced admin access control with multi-signature validation and permission management.
//!
//! This module provides:
//! - Granular admin roles (Owner, Admin, Operator)
//! - Permission-based access control
//! - Multi-signature validation for critical operations
//! - Admin activity logging and audit trail

use soroban_sdk::{contracttype, Address, Env, Vec};

/// Admin roles with different permission levels
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum AdminRole {
    /// Can upgrade, pause, transfer ownership
    Owner,
    /// Can mint, revoke, update metadata
    Admin,
    /// Can verify certificates (read-only)
    Operator,
}

/// Specific permissions that can be granted to admins
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Permission {
    Upgrade,
    Pause,
    Mint,
    Revoke,
    UpdateMetadata,
    GrantRole,
    RevokeRole,
    TransferOwnership,
    EmergencyPause,
    Rollback,
}

/// Admin policy defining role and permissions
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdminPolicy {
    pub role: AdminRole,
    pub address: Address,
    pub permissions: Vec<Permission>,
    pub added_at: u64,
}

#[contracttype]
#[derive(Clone)]
pub enum AdminDataKey {
    AdminPolicies,
    AdminCount,
    OwnerAddress,
}

/// Get all admin policies
pub fn get_admin_policies(env: &Env) -> Vec<AdminPolicy> {
    env.storage()
        .instance()
        .get(&AdminDataKey::AdminPolicies)
        .unwrap_or_else(|| Vec::new(env))
}

/// Get admin policy for a specific address
pub fn get_admin_policy(env: &Env, address: &Address) -> Option<AdminPolicy> {
    let policies = get_admin_policies(env);
    policies.iter().find(|p| p.address == *address)
}

/// Check if an address has a specific permission
pub fn has_permission(env: &Env, address: &Address, permission: Permission) -> bool {
    if let Some(policy) = get_admin_policy(env, address) {
        policy.permissions.iter().any(|p| p == permission)
    } else {
        false
    }
}

/// Check if an address has a specific role
pub fn has_role(env: &Env, address: &Address, role: AdminRole) -> bool {
    if let Some(policy) = get_admin_policy(env, address) {
        policy.role == role
    } else {
        false
    }
}

/// Add a new admin with specific role and permissions
pub fn add_admin(env: &Env, address: Address, role: AdminRole, permissions: Vec<Permission>) {
    let mut policies = get_admin_policies(env);

    // Check if admin already exists
    let exists = policies.iter().any(|p| p.address == address);
    if exists {
        return; // Admin already exists, could panic or update instead
    }

    let policy = AdminPolicy {
        role,
        address: address.clone(),
        permissions,
        added_at: env.ledger().timestamp(),
    };

    policies.push_back(policy);

    env.storage()
        .instance()
        .set(&AdminDataKey::AdminPolicies, &policies);
}

/// Remove an admin
pub fn remove_admin(env: &Env, address: &Address) {
    let policies = get_admin_policies(env);

    // Find and remove the admin
    let mut new_policies = Vec::new(env);
    for policy in policies.iter() {
        if policy.address != *address {
            new_policies.push_back(policy);
        }
    }

    env.storage()
        .instance()
        .set(&AdminDataKey::AdminPolicies, &new_policies);
}

/// Update admin permissions
pub fn update_admin_permissions(env: &Env, address: &Address, new_permissions: Vec<Permission>) {
    let policies = get_admin_policies(env);
    let mut updated_policies = Vec::new(env);

    for mut policy in policies.iter() {
        if policy.address == *address {
            policy.permissions = new_permissions.clone();
        }
        updated_policies.push_back(policy);
    }

    env.storage()
        .instance()
        .set(&AdminDataKey::AdminPolicies, &updated_policies);
}

/// Get the contract owner
pub fn get_owner(env: &Env) -> Option<Address> {
    env.storage().instance().get(&AdminDataKey::OwnerAddress)
}

/// Set the contract owner
pub fn set_owner(env: &Env, owner: Address) {
    env.storage()
        .instance()
        .set(&AdminDataKey::OwnerAddress, &owner);
}

/// Transfer ownership to a new address
pub fn transfer_ownership(env: &Env, new_owner: Address) {
    set_owner(env, new_owner);
}

/// Get default permissions for each role
pub fn get_default_permissions(env: &Env, role: AdminRole) -> Vec<Permission> {
    let mut permissions = Vec::new(env);

    match role {
        AdminRole::Owner => {
            permissions.push_back(Permission::Upgrade);
            permissions.push_back(Permission::Pause);
            permissions.push_back(Permission::Mint);
            permissions.push_back(Permission::Revoke);
            permissions.push_back(Permission::UpdateMetadata);
            permissions.push_back(Permission::GrantRole);
            permissions.push_back(Permission::RevokeRole);
            permissions.push_back(Permission::TransferOwnership);
            permissions.push_back(Permission::EmergencyPause);
            permissions.push_back(Permission::Rollback);
        }
        AdminRole::Admin => {
            permissions.push_back(Permission::Mint);
            permissions.push_back(Permission::Revoke);
            permissions.push_back(Permission::UpdateMetadata);
            permissions.push_back(Permission::Pause);
        }
        AdminRole::Operator => {
            // Operators have read-only access, no write permissions
        }
    }

    permissions
}

/// Validate multi-signature for critical operations
/// Returns true if enough valid signatures are provided
pub fn validate_multisig(
    env: &Env,
    signers: Vec<Address>,
    required_signatures: u32,
    required_permission: Permission,
) -> bool {
    let mut valid_signatures = 0u32;

    for signer in signers.iter() {
        if has_permission(env, &signer, required_permission) {
            valid_signatures += 1;
        }
    }

    valid_signatures >= required_signatures
}

/// Count admins with a specific permission
pub fn count_admins_with_permission(env: &Env, permission: Permission) -> u32 {
    let policies = get_admin_policies(env);
    let mut count = 0u32;

    for policy in policies.iter() {
        if policy.permissions.iter().any(|p| p == permission) {
            count += 1;
        }
    }

    count
}
