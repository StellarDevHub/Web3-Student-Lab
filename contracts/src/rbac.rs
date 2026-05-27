use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, Map, Symbol, Vec,
};

use crate::events::{
    publish_permission_updated_event, publish_role_granted_event, publish_role_revoked_event,
};
use crate::storage_types::DataKey;

// Role hierarchy levels (higher number = more permissions)
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RoleLevel {
    Student = 0,
    Verifier = 1,
    Instructor = 2,
    Auditor = 3,
    Admin = 4,
    SuperAdmin = 5,
}

// Granular permissions
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Permission {
    // Certificate operations
    MintCertificate,
    RevokeCertificate,
    BatchMint,
    UpdateMetadata,

    // Verification operations
    VerifyCertificate,
    AccreditVerifier,
    UpdateVerifierRating,

    // Role management
    GrantRole,
    RevokeRole,
    DelegatePermission,

    // System operations
    PauseContract,
    UpgradeContract,
    EmergencyStop,

    // Governance
    ProposeAction,
    ApproveAction,
    ExecuteAction,

    // Audit and monitoring
    ViewAuditLogs,
    ExportData,
    SystemMetrics,
}

// Role definition with permissions and constraints
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Role {
    pub level: RoleLevel,
    pub permissions: Vec<Permission>,
    pub can_delegate: bool,
    pub max_delegation_depth: u32,
    pub description: Symbol,
}

// Permission delegation record
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Delegation {
    pub delegator: Address,
    pub delegatee: Address,
    pub permission: Permission,
    pub expires_at: u64, // ledger number
    pub depth: u32,
    pub active: bool,
}

// Time-based permission grant
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TemporaryPermission {
    pub user: Address,
    pub permission: Permission,
    pub granted_at: u64,
    pub expires_at: u64,
    pub granted_by: Address,
}

// Attribute-based access control condition
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum AccessCondition {
    RequireMultiSig(u32),            // minimum signatures required
    RequireTimeDelay(u64),           // minimum time delay in ledgers
    RequireVerifierRating(u32),      // minimum verifier rating
    RequireCourseCompletion(Symbol), // specific course completion
    RequireStakeAmount(i128),        // minimum stake amount
}

// User role assignment with conditions
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UserRole {
    pub user: Address,
    pub role: RoleLevel,
    pub granted_at: u64,
    pub granted_by: Address,
    pub expires_at: Option<u64>,
    pub conditions: Vec<AccessCondition>,
    pub active: bool,
}

// RBAC contract trait
#[contract]
pub struct RBACContract;

#[contractimpl]
impl RBACContract {
    /// Initialize RBAC system with default roles
    pub fn init_rbac(env: Env, super_admin: Address) {
        // Ensure not already initialized
        if env.storage().instance().has(&DataKey::RBACInitialized) {
            panic!("RBAC already initialized");
        }

        // Define default roles
        let roles = Self::get_default_roles();

        // Store role definitions
        for (role_level, role) in roles.iter() {
            env.storage()
                .persistent()
                .set(&DataKey::RoleDefinition(role_level.clone()), &role);
        }

        // Grant SuperAdmin role to initializer
        let super_admin_role = UserRole {
            user: super_admin.clone(),
            role: RoleLevel::SuperAdmin,
            granted_at: env.ledger().sequence(),
            granted_by: super_admin.clone(),
            expires_at: None,
            conditions: Vec::new(&env),
            active: true,
        };

        env.storage()
            .persistent()
            .set(&DataKey::UserRole(super_admin.clone()), &super_admin_role);

        // Mark as initialized
        env.storage()
            .instance()
            .set(&DataKey::RBACInitialized, &true);

        // Publish initialization event
        publish_role_granted_event(&env, &super_admin, &RoleLevel::SuperAdmin, &super_admin);
    }

    /// Grant role to user with optional conditions and expiry
    pub fn grant_role(
        env: Env,
        granter: Address,
        user: Address,
        role: RoleLevel,
        expires_at: Option<u64>,
        conditions: Vec<AccessCondition>,
    ) {
        granter.require_auth();

        // Check if granter has permission to grant roles
        Self::require_permission(&env, &granter, &Permission::GrantRole);

        // Check if granter can grant this specific role level
        let granter_role = Self::get_user_role(&env, &granter);
        if granter_role.role as u32 <= role as u32 {
            panic!("Cannot grant role equal or higher than your own");
        }

        // Create user role assignment
        let user_role = UserRole {
            user: user.clone(),
            role: role.clone(),
            granted_at: env.ledger().sequence(),
            granted_by: granter.clone(),
            expires_at,
            conditions,
            active: true,
        };

        // Store user role
        env.storage()
            .persistent()
            .set(&DataKey::UserRole(user.clone()), &user_role);

        // Publish event
        publish_role_granted_event(&env, &user, &role, &granter);
    }

    /// Revoke role from user
    pub fn revoke_role(env: Env, revoker: Address, user: Address) {
        revoker.require_auth();

        // Check if revoker has permission
        Self::require_permission(&env, &revoker, &Permission::RevokeRole);

        // Get current user role
        let mut user_role = Self::get_user_role(&env, &user);

        // Check if revoker can revoke this role
        let revoker_role = Self::get_user_role(&env, &revoker);
        if revoker_role.role as u32 <= user_role.role as u32 {
            panic!("Cannot revoke role equal or higher than your own");
        }

        // Deactivate role
        user_role.active = false;
        env.storage()
            .persistent()
            .set(&DataKey::UserRole(user.clone()), &user_role);

        // Revoke all delegations by this user
        Self::revoke_all_delegations_by_user(&env, &user);

        // Publish event
        publish_role_revoked_event(&env, &user, &user_role.role, &revoker);
    }

    /// Delegate permission to another user
    pub fn delegate_permission(
        env: Env,
        delegator: Address,
        delegatee: Address,
        permission: Permission,
        expires_at: u64,
    ) {
        delegator.require_auth();

        // Check if delegator has the permission to delegate
        Self::require_permission(&env, &delegator, &permission);
        Self::require_permission(&env, &delegator, &Permission::DelegatePermission);

        // Check if delegator's role allows delegation
        let delegator_role_def =
            Self::get_role_definition(&env, &Self::get_user_role(&env, &delegator).role);
        if !delegator_role_def.can_delegate {
            panic!("Role does not allow delegation");
        }

        // Calculate delegation depth
        let depth = Self::calculate_delegation_depth(&env, &delegator, &permission) + 1;
        if depth > delegator_role_def.max_delegation_depth {
            panic!("Maximum delegation depth exceeded");
        }

        // Create delegation record
        let delegation = Delegation {
            delegator: delegator.clone(),
            delegatee: delegatee.clone(),
            permission: permission.clone(),
            expires_at,
            depth,
            active: true,
        };

        // Store delegation
        let delegation_key = DataKey::Delegation(delegatee.clone(), permission.clone());
        env.storage().persistent().set(&delegation_key, &delegation);

        // Add to delegator's delegation list
        let mut delegations = Self::get_user_delegations(&env, &delegator);
        delegations.push_back(delegation_key.clone());
        env.storage()
            .persistent()
            .set(&DataKey::UserDelegations(delegator), &delegations);
    }

    /// Grant temporary permission
    pub fn grant_temporary_permission(
        env: Env,
        granter: Address,
        user: Address,
        permission: Permission,
        duration_ledgers: u64,
    ) {
        granter.require_auth();

        // Check if granter has permission to grant this specific permission
        Self::require_permission(&env, &granter, &permission);
        Self::require_permission(&env, &granter, &Permission::GrantRole);

        let current_ledger = env.ledger().sequence();
        let expires_at = current_ledger + duration_ledgers;

        let temp_permission = TemporaryPermission {
            user: user.clone(),
            permission: permission.clone(),
            granted_at: current_ledger,
            expires_at,
            granted_by: granter.clone(),
        };

        // Store temporary permission
        let temp_key = DataKey::TemporaryPermission(user.clone(), permission.clone());
        env.storage().persistent().set(&temp_key, &temp_permission);

        // Add to user's temporary permissions list
        let mut temp_perms = Self::get_user_temporary_permissions(&env, &user);
        temp_perms.push_back(temp_key);
        env.storage()
            .persistent()
            .set(&DataKey::UserTemporaryPermissions(user), &temp_perms);
    }

    /// Check if user has specific permission
    pub fn has_permission(env: Env, user: Address, permission: Permission) -> bool {
        // Check role-based permission
        if Self::has_role_permission(&env, &user, &permission) {
            return true;
        }

        // Check delegated permission
        if Self::has_delegated_permission(&env, &user, &permission) {
            return true;
        }

        // Check temporary permission
        if Self::has_temporary_permission(&env, &user, &permission) {
            return true;
        }

        false
    }

    /// Require user to have specific permission (panics if not)
    pub fn require_permission(env: &Env, user: &Address, permission: &Permission) {
        if !Self::has_permission(env.clone(), user.clone(), permission.clone()) {
            panic!("Insufficient permissions");
        }
    }

    /// Get user's current role
    pub fn get_user_role(env: &Env, user: &Address) -> UserRole {
        match env
            .storage()
            .persistent()
            .get(&DataKey::UserRole(user.clone()))
        {
            Some(role) => {
                let user_role: UserRole = role;
                // Check if role is expired
                if let Some(expires_at) = user_role.expires_at {
                    if env.ledger().sequence() > expires_at {
                        panic!("User role has expired");
                    }
                }
                if !user_role.active {
                    panic!("User role is inactive");
                }
                user_role
            }
            None => UserRole {
                user: user.clone(),
                role: RoleLevel::Student,
                granted_at: 0,
                granted_by: user.clone(),
                expires_at: None,
                conditions: Vec::new(env),
                active: true,
            },
        }
    }

    /// Get role definition
    pub fn get_role_definition(env: &Env, role: &RoleLevel) -> Role {
        env.storage()
            .persistent()
            .get(&DataKey::RoleDefinition(role.clone()))
            .unwrap_or_else(|| panic!("Role definition not found"))
    }

    /// Update role permissions (SuperAdmin only)
    pub fn update_role_permissions(
        env: Env,
        admin: Address,
        role: RoleLevel,
        permissions: Vec<Permission>,
    ) {
        admin.require_auth();

        // Only SuperAdmin can update role definitions
        let admin_role = Self::get_user_role(&env, &admin);
        if admin_role.role != RoleLevel::SuperAdmin {
            panic!("Only SuperAdmin can update role permissions");
        }

        let mut role_def = Self::get_role_definition(&env, &role);
        role_def.permissions = permissions;

        env.storage()
            .persistent()
            .set(&DataKey::RoleDefinition(role.clone()), &role_def);

        publish_permission_updated_event(&env, &role, &admin);
    }

    /// Clean up expired permissions and delegations
    pub fn cleanup_expired(env: Env, user: Address) {
        let current_ledger = env.ledger().sequence();

        // Clean up expired delegations
        let delegations = Self::get_user_delegations(&env, &user);
        let mut active_delegations = Vec::new(&env);

        for delegation_key in delegations.iter() {
            if let Some(delegation) = env
                .storage()
                .persistent()
                .get::<DataKey, Delegation>(&delegation_key)
            {
                if delegation.expires_at > current_ledger && delegation.active {
                    active_delegations.push_back(delegation_key);
                } else {
                    env.storage().persistent().remove(&delegation_key);
                }
            }
        }

        env.storage()
            .persistent()
            .set(&DataKey::UserDelegations(user.clone()), &active_delegations);

        // Clean up expired temporary permissions
        let temp_perms = Self::get_user_temporary_permissions(&env, &user);
        let mut active_temp_perms = Vec::new(&env);

        for temp_key in temp_perms.iter() {
            if let Some(temp_perm) = env
                .storage()
                .persistent()
                .get::<DataKey, TemporaryPermission>(&temp_key)
            {
                if temp_perm.expires_at > current_ledger {
                    active_temp_perms.push_back(temp_key);
                } else {
                    env.storage().persistent().remove(&temp_key);
                }
            }
        }

        env.storage()
            .persistent()
            .set(&DataKey::UserTemporaryPermissions(user), &active_temp_perms);
    }

    // Private helper methods

    fn get_default_roles() -> Map<RoleLevel, Role> {
        let env = Env::default();
        let mut roles = Map::new(&env);

        // Student role
        let student_permissions = Vec::from_array(&env, []);
        roles.set(
            RoleLevel::Student,
            Role {
                level: RoleLevel::Student,
                permissions: student_permissions,
                can_delegate: false,
                max_delegation_depth: 0,
                description: symbol_short!("STUDENT"),
            },
        );

        // Verifier role
        let verifier_permissions = Vec::from_array(
            &env,
            [Permission::VerifyCertificate, Permission::ViewAuditLogs],
        );
        roles.set(
            RoleLevel::Verifier,
            Role {
                level: RoleLevel::Verifier,
                permissions: verifier_permissions,
                can_delegate: false,
                max_delegation_depth: 0,
                description: symbol_short!("VERIFIER"),
            },
        );

        // Instructor role
        let instructor_permissions = Vec::from_array(
            &env,
            [
                Permission::MintCertificate,
                Permission::UpdateMetadata,
                Permission::VerifyCertificate,
                Permission::ViewAuditLogs,
            ],
        );
        roles.set(
            RoleLevel::Instructor,
            Role {
                level: RoleLevel::Instructor,
                permissions: instructor_permissions,
                can_delegate: true,
                max_delegation_depth: 1,
                description: symbol_short!("INSTRCTR"),
            },
        );

        // Auditor role
        let auditor_permissions = Vec::from_array(
            &env,
            [
                Permission::ViewAuditLogs,
                Permission::ExportData,
                Permission::SystemMetrics,
                Permission::VerifyCertificate,
            ],
        );
        roles.set(
            RoleLevel::Auditor,
            Role {
                level: RoleLevel::Auditor,
                permissions: auditor_permissions,
                can_delegate: false,
                max_delegation_depth: 0,
                description: symbol_short!("AUDITOR"),
            },
        );

        // Admin role
        let admin_permissions = Vec::from_array(
            &env,
            [
                Permission::MintCertificate,
                Permission::RevokeCertificate,
                Permission::BatchMint,
                Permission::UpdateMetadata,
                Permission::VerifyCertificate,
                Permission::AccreditVerifier,
                Permission::UpdateVerifierRating,
                Permission::GrantRole,
                Permission::RevokeRole,
                Permission::DelegatePermission,
                Permission::PauseContract,
                Permission::ProposeAction,
                Permission::ApproveAction,
                Permission::ViewAuditLogs,
                Permission::ExportData,
                Permission::SystemMetrics,
            ],
        );
        roles.set(
            RoleLevel::Admin,
            Role {
                level: RoleLevel::Admin,
                permissions: admin_permissions,
                can_delegate: true,
                max_delegation_depth: 2,
                description: symbol_short!("ADMIN"),
            },
        );

        // SuperAdmin role
        let super_admin_permissions = Vec::from_array(
            &env,
            [
                Permission::MintCertificate,
                Permission::RevokeCertificate,
                Permission::BatchMint,
                Permission::UpdateMetadata,
                Permission::VerifyCertificate,
                Permission::AccreditVerifier,
                Permission::UpdateVerifierRating,
                Permission::GrantRole,
                Permission::RevokeRole,
                Permission::DelegatePermission,
                Permission::PauseContract,
                Permission::UpgradeContract,
                Permission::EmergencyStop,
                Permission::ProposeAction,
                Permission::ApproveAction,
                Permission::ExecuteAction,
                Permission::ViewAuditLogs,
                Permission::ExportData,
                Permission::SystemMetrics,
            ],
        );
        roles.set(
            RoleLevel::SuperAdmin,
            Role {
                level: RoleLevel::SuperAdmin,
                permissions: super_admin_permissions,
                can_delegate: true,
                max_delegation_depth: 3,
                description: symbol_short!("SUPADMIN"),
            },
        );

        roles
    }

    fn has_role_permission(env: &Env, user: &Address, permission: &Permission) -> bool {
        let user_role = Self::get_user_role(env, user);
        let role_def = Self::get_role_definition(env, &user_role.role);

        // Check conditions
        for condition in user_role.conditions.iter() {
            if !Self::check_access_condition(env, user, &condition) {
                return false;
            }
        }

        role_def.permissions.contains(permission)
    }

    fn has_delegated_permission(env: &Env, user: &Address, permission: &Permission) -> bool {
        let delegation_key = DataKey::Delegation(user.clone(), permission.clone());
        if let Some(delegation) = env
            .storage()
            .persistent()
            .get::<DataKey, Delegation>(&delegation_key)
        {
            return delegation.active && env.ledger().sequence() <= delegation.expires_at;
        }
        false
    }

    fn has_temporary_permission(env: &Env, user: &Address, permission: &Permission) -> bool {
        let temp_key = DataKey::TemporaryPermission(user.clone(), permission.clone());
        if let Some(temp_perm) = env
            .storage()
            .persistent()
            .get::<DataKey, TemporaryPermission>(&temp_key)
        {
            return env.ledger().sequence() <= temp_perm.expires_at;
        }
        false
    }

    fn check_access_condition(env: &Env, user: &Address, condition: &AccessCondition) -> bool {
        match condition {
            AccessCondition::RequireMultiSig(_min_sigs) => {
                // Implementation would check if user has required multisig setup
                // For now, return true as placeholder
                true
            }
            AccessCondition::RequireTimeDelay(_delay) => {
                // Implementation would check if sufficient time has passed
                // For now, return true as placeholder
                true
            }
            AccessCondition::RequireVerifierRating(min_rating) => {
                // Check verifier rating from verification system
                // Placeholder implementation
                true
            }
            AccessCondition::RequireCourseCompletion(_course) => {
                // Check if user has completed required course
                // Placeholder implementation
                true
            }
            AccessCondition::RequireStakeAmount(_amount) => {
                // Check if user has staked required amount
                // Placeholder implementation
                true
            }
        }
    }

    fn calculate_delegation_depth(env: &Env, user: &Address, permission: &Permission) -> u32 {
        let delegation_key = DataKey::Delegation(user.clone(), permission.clone());
        if let Some(delegation) = env
            .storage()
            .persistent()
            .get::<DataKey, Delegation>(&delegation_key)
        {
            return delegation.depth;
        }
        0
    }

    fn get_user_delegations(env: &Env, user: &Address) -> Vec<DataKey> {
        env.storage()
            .persistent()
            .get(&DataKey::UserDelegations(user.clone()))
            .unwrap_or_else(|| Vec::new(env))
    }

    fn get_user_temporary_permissions(env: &Env, user: &Address) -> Vec<DataKey> {
        env.storage()
            .persistent()
            .get(&DataKey::UserTemporaryPermissions(user.clone()))
            .unwrap_or_else(|| Vec::new(env))
    }

    fn revoke_all_delegations_by_user(env: &Env, user: &Address) {
        let delegations = Self::get_user_delegations(env, user);
        for delegation_key in delegations.iter() {
            if let Some(mut delegation) = env
                .storage()
                .persistent()
                .get::<DataKey, Delegation>(&delegation_key)
            {
                delegation.active = false;
                env.storage().persistent().set(&delegation_key, &delegation);
            }
        }
    }
}
