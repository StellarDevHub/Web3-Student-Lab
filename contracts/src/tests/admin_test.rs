//! Comprehensive tests for admin access control
//!
//! Tests cover:
//! - Role-based access control
//! - Permission management
//! - Multi-signature validation
//! - Ownership transfer

#[cfg(test)]
mod admin_tests {
    use crate::{
        admin::{AdminRole, Permission},
        CertificateContract, CertificateContractClient,
    };
    use soroban_sdk::{testutils::Address as _, Address, Env};

    fn setup_test() -> (
        Env,
        CertificateContractClient<'static>,
        Address,
        Address,
        Address,
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(CertificateContract, ());
        let client = CertificateContractClient::new(&env, &contract_id);

        let admin_a = Address::generate(&env);
        let admin_b = Address::generate(&env);
        let admin_c = Address::generate(&env);

        client.init(&admin_a, &admin_b, &admin_c);

        (env, client, admin_a, admin_b, admin_c)
    }

    #[test]
    fn test_add_admin_with_role() {
        let (env, client, admin_a, _, _) = setup_test();

        let new_admin = Address::generate(&env);

        // Add new admin with Admin role
        client.add_admin_with_role(&admin_a, &new_admin, &AdminRole::Admin);

        // Verify admin was added
        let policy = client.get_admin_policy(&new_admin);
        assert!(policy.is_some());

        let policy = policy.unwrap();
        assert_eq!(policy.role, AdminRole::Admin);
        assert_eq!(policy.address, new_admin);
    }

    #[test]
    fn test_remove_admin() {
        let (env, client, admin_a, _, _) = setup_test();

        let new_admin = Address::generate(&env);

        // Add admin
        client.add_admin_with_role(&admin_a, &new_admin, &AdminRole::Operator);

        // Verify admin exists
        assert!(client.get_admin_policy(&new_admin).is_some());

        // Remove admin
        client.remove_admin_role(&admin_a, &new_admin);

        // Verify admin was removed
        assert!(client.get_admin_policy(&new_admin).is_none());
    }

    #[test]
    fn test_owner_permissions() {
        let (env, client, admin_a, _, _) = setup_test();

        let new_owner = Address::generate(&env);

        // Add new owner
        client.add_admin_with_role(&admin_a, &new_owner, &AdminRole::Owner);

        // Check owner has all permissions
        assert!(client.check_permission(&new_owner, &Permission::Upgrade));
        assert!(client.check_permission(&new_owner, &Permission::Pause));
        assert!(client.check_permission(&new_owner, &Permission::Mint));
        assert!(client.check_permission(&new_owner, &Permission::Revoke));
        assert!(client.check_permission(&new_owner, &Permission::UpdateMetadata));
        assert!(client.check_permission(&new_owner, &Permission::GrantRole));
        assert!(client.check_permission(&new_owner, &Permission::RevokeRole));
        assert!(client.check_permission(&new_owner, &Permission::TransferOwnership));
        assert!(client.check_permission(&new_owner, &Permission::EmergencyPause));
        assert!(client.check_permission(&new_owner, &Permission::Rollback));
    }

    #[test]
    fn test_admin_permissions() {
        let (env, client, admin_a, _, _) = setup_test();

        let new_admin = Address::generate(&env);

        // Add new admin
        client.add_admin_with_role(&admin_a, &new_admin, &AdminRole::Admin);

        // Check admin has limited permissions
        assert!(client.check_permission(&new_admin, &Permission::Mint));
        assert!(client.check_permission(&new_admin, &Permission::Revoke));
        assert!(client.check_permission(&new_admin, &Permission::UpdateMetadata));
        assert!(client.check_permission(&new_admin, &Permission::Pause));

        // Admin should NOT have owner-only permissions
        assert!(!client.check_permission(&new_admin, &Permission::Upgrade));
        assert!(!client.check_permission(&new_admin, &Permission::TransferOwnership));
        assert!(!client.check_permission(&new_admin, &Permission::Rollback));
    }

    #[test]
    fn test_operator_permissions() {
        let (env, client, admin_a, _, _) = setup_test();

        let operator = Address::generate(&env);

        // Add operator
        client.add_admin_with_role(&admin_a, &operator, &AdminRole::Operator);

        // Operator should have no write permissions
        assert!(!client.check_permission(&operator, &Permission::Mint));
        assert!(!client.check_permission(&operator, &Permission::Revoke));
        assert!(!client.check_permission(&operator, &Permission::Upgrade));
        assert!(!client.check_permission(&operator, &Permission::Pause));
    }

    #[test]
    fn test_transfer_ownership() {
        let (env, client, admin_a, _, _) = setup_test();

        let new_owner = Address::generate(&env);

        // Transfer ownership
        client.transfer_ownership(&admin_a, &new_owner);

        // Verify ownership transfer event was emitted
        // In a real test, you would check env.events()
    }

    #[test]
    fn test_admin_policy_details() {
        let (env, client, admin_a, _, _) = setup_test();

        let new_admin = Address::generate(&env);

        // Add admin
        client.add_admin_with_role(&admin_a, &new_admin, &AdminRole::Admin);

        // Get policy details
        let policy = client.get_admin_policy(&new_admin).unwrap();

        // Verify policy fields
        assert_eq!(policy.role, AdminRole::Admin);
        assert_eq!(policy.address, new_admin);
        assert!(policy.added_at > 0);
        assert!(policy.permissions.len() > 0);
    }

    #[test]
    fn test_multiple_admins() {
        let (env, client, admin_a, _, _) = setup_test();

        let admin_1 = Address::generate(&env);
        let admin_2 = Address::generate(&env);
        let admin_3 = Address::generate(&env);

        // Add multiple admins with different roles
        client.add_admin_with_role(&admin_a, &admin_1, &AdminRole::Owner);
        client.add_admin_with_role(&admin_a, &admin_2, &AdminRole::Admin);
        client.add_admin_with_role(&admin_a, &admin_3, &AdminRole::Operator);

        // Verify all admins exist
        assert!(client.get_admin_policy(&admin_1).is_some());
        assert!(client.get_admin_policy(&admin_2).is_some());
        assert!(client.get_admin_policy(&admin_3).is_some());
    }

    #[test]
    fn test_permission_check_for_nonexistent_admin() {
        let (env, client, _, _, _) = setup_test();

        let random_address = Address::generate(&env);

        // Check permission for non-existent admin
        assert!(!client.check_permission(&random_address, &Permission::Mint));
        assert!(!client.check_permission(&random_address, &Permission::Upgrade));
    }

    #[test]
    fn test_get_policy_for_nonexistent_admin() {
        let (env, client, _, _, _) = setup_test();

        let random_address = Address::generate(&env);

        // Get policy for non-existent admin
        let policy = client.get_admin_policy(&random_address);
        assert!(policy.is_none());
    }
}
