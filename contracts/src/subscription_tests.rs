//! Comprehensive tests for Subscription Manager Contract

use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    Address, BytesN, Env, String, Symbol, Vec, u64,
};
use crate::subscription_manager::{
    SubscriptionManager, SubscriptionError, SubscriptionTier, SubscriptionStatus,
    BillingPeriod, SubscriptionPlan, ContractConfig, PaymentStatus
};

#[test]
fn test_contract_initialization() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);

    // Test successful initialization
    assert_eq!(
        SubscriptionManager::initialize(env.clone(), admin.clone(), treasury.clone()),
        Ok(())
    );

    // Verify admin is set
    let stored_admin: Address = env.storage().instance().get(&Symbol::new(&env, "ADMIN")).unwrap();
    assert_eq!(stored_admin, admin);

    // Verify config is set
    let config: ContractConfig = env.storage().instance().get(&Symbol::new(&env, "CONFIG")).unwrap();
    assert_eq!(config.admin, admin);
    assert_eq!(config.treasury, treasury);
    assert_eq!(config.paused, false);
    assert_eq!(config.emergency_pause, false);
    assert_eq!(config.platform_fee_percent, 5);

    // Test duplicate initialization fails
    assert_eq!(
        SubscriptionManager::initialize(env.clone(), admin.clone(), treasury.clone()),
        Err(SubscriptionError::InvalidConfig)
    );
}

#[test]
fn test_default_plans_initialization() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);

    SubscriptionManager::initialize(env.clone(), admin.clone(), treasury.clone()).unwrap();

    // Test all plans are available
    let plans = SubscriptionManager::get_all_plans(env.clone());
    assert_eq!(plans.len(), 3);

    // Test Basic plan
    let basic_plan = SubscriptionManager::get_plan(env.clone(), SubscriptionTier::Basic).unwrap();
    assert_eq!(basic_plan.tier, SubscriptionTier::Basic);
    assert_eq!(basic_plan.name, String::from_str(&env, "Basic"));
    assert_eq!(basic_plan.price, 10_000_000);
    assert_eq!(basic_plan.max_users, 1);
    assert_eq!(basic_plan.is_active, true);

    // Test Pro plan
    let pro_plan = SubscriptionManager::get_plan(env.clone(), SubscriptionTier::Pro).unwrap();
    assert_eq!(pro_plan.tier, SubscriptionTier::Pro);
    assert_eq!(pro_plan.name, String::from_str(&env, "Pro"));
    assert_eq!(pro_plan.price, 25_000_000);
    assert_eq!(pro_plan.max_users, 3);
    assert_eq!(pro_plan.is_active, true);

    // Test Enterprise plan
    let enterprise_plan = SubscriptionManager::get_plan(env.clone(), SubscriptionTier::Enterprise).unwrap();
    assert_eq!(enterprise_plan.tier, SubscriptionTier::Enterprise);
    assert_eq!(enterprise_plan.name, String::from_str(&env, "Enterprise"));
    assert_eq!(enterprise_plan.price, 100_000_000);
    assert_eq!(enterprise_plan.max_users, 10);
    assert_eq!(enterprise_plan.is_active, true);
}

#[test]
fn test_create_subscription() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let user = Address::generate(&env);
    let payment_method = Address::generate(&env);

    SubscriptionManager::initialize(env.clone(), admin.clone(), treasury.clone()).unwrap();

    // Test successful subscription creation
    let subscription_id = SubscriptionManager::create_subscription(
        env.clone(),
        user.clone(),
        SubscriptionTier::Basic,
        BillingPeriod::Monthly,
        payment_method.clone(),
        true,
    ).unwrap();

    assert_eq!(subscription_id, 1);

    // Verify subscription details
    let subscription = SubscriptionManager::get_subscription(env.clone(), subscription_id).unwrap();
    assert_eq!(subscription.user, user);
    assert_eq!(subscription.plan_tier, SubscriptionTier::Basic);
    assert_eq!(subscription.status, SubscriptionStatus::Active);
    assert_eq!(subscription.auto_renew, true);
    assert_eq!(subscription.payment_method, payment_method);

    // Verify user subscriptions mapping
    let user_subscriptions = SubscriptionManager::get_user_subscriptions(env.clone(), user.clone());
    assert_eq!(user_subscriptions.len(), 1);
    assert_eq!(user_subscriptions.get(0).unwrap(), subscription_id);
}

#[test]
fn test_duplicate_subscription_prevention() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let user = Address::generate(&env);
    let payment_method = Address::generate(&env);

    SubscriptionManager::initialize(env.clone(), admin.clone(), treasury.clone()).unwrap();

    // Create first subscription
    SubscriptionManager::create_subscription(
        env.clone(),
        user.clone(),
        SubscriptionTier::Basic,
        BillingPeriod::Monthly,
        payment_method.clone(),
        true,
    ).unwrap();

    // Try to create second subscription (should fail)
    assert_eq!(
        SubscriptionManager::create_subscription(
            env.clone(),
            user.clone(),
            SubscriptionTier::Pro,
            BillingPeriod::Quarterly,
            payment_method.clone(),
            true,
        ),
        Err(SubscriptionError::SubscriptionAlreadyActive)
    );
}

#[test]
fn test_subscription_cancellation() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let user = Address::generate(&env);
    let payment_method = Address::generate(&env);

    SubscriptionManager::initialize(env.clone(), admin.clone(), treasury.clone()).unwrap();

    // Create subscription
    let subscription_id = SubscriptionManager::create_subscription(
        env.clone(),
        user.clone(),
        SubscriptionTier::Basic,
        BillingPeriod::Monthly,
        payment_method.clone(),
        true,
    ).unwrap();

    // Cancel subscription
    assert_eq!(
        SubscriptionManager::cancel_subscription(env.clone(), user.clone(), subscription_id),
        Ok(())
    );

    // Verify subscription is cancelled
    let subscription = SubscriptionManager::get_subscription(env.clone(), subscription_id).unwrap();
    assert_eq!(subscription.status, SubscriptionStatus::Cancelled);

    // Test duplicate cancellation
    assert_eq!(
        SubscriptionManager::cancel_subscription(env.clone(), user.clone(), subscription_id),
        Err(SubscriptionError::AlreadyCancelled)
    );
}

#[test]
fn test_unauthorized_cancellation() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let user = Address::generate(&env);
    let unauthorized_user = Address::generate(&env);
    let payment_method = Address::generate(&env);

    SubscriptionManager::initialize(env.clone(), admin.clone(), treasury.clone()).unwrap();

    // Create subscription
    let subscription_id = SubscriptionManager::create_subscription(
        env.clone(),
        user.clone(),
        SubscriptionTier::Basic,
        BillingPeriod::Monthly,
        payment_method.clone(),
        true,
    ).unwrap();

    // Try to cancel with unauthorized user
    assert_eq!(
        SubscriptionManager::cancel_subscription(env.clone(), unauthorized_user.clone(), subscription_id),
        Err(SubscriptionError::Unauthorized)
    );
}

#[test]
fn test_contract_pause_functionality() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let user = Address::generate(&env);
    let payment_method = Address::generate(&env);

    SubscriptionManager::initialize(env.clone(), admin.clone(), treasury.clone()).unwrap();

    // Test pause by admin
    let reason = String::from_str(&env, "Maintenance");
    assert_eq!(
        SubscriptionManager::pause_contract(env.clone(), admin.clone(), reason.clone()),
        Ok(())
    );

    // Verify contract is paused
    let config: ContractConfig = env.storage().instance().get(&Symbol::new(&env, "CONFIG")).unwrap();
    assert_eq!(config.paused, true);

    // Test subscription creation fails when paused
    assert_eq!(
        SubscriptionManager::create_subscription(
            env.clone(),
            user.clone(),
            SubscriptionTier::Basic,
            BillingPeriod::Monthly,
            payment_method.clone(),
            true,
        ),
        Err(SubscriptionError::ContractPaused)
    );

    // Test unpause
    assert_eq!(
        SubscriptionManager::unpause_contract(env.clone(), admin.clone()),
        Ok(())
    );

    // Verify contract is unpaused
    let config: ContractConfig = env.storage().instance().get(&Symbol::new(&env, "CONFIG")).unwrap();
    assert_eq!(config.paused, false);
}

#[test]
fn test_emergency_pause() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let user = Address::generate(&env);
    let payment_method = Address::generate(&env);

    SubscriptionManager::initialize(env.clone(), admin.clone(), treasury.clone()).unwrap();

    // Create subscription before emergency pause
    let subscription_id = SubscriptionManager::create_subscription(
        env.clone(),
        user.clone(),
        SubscriptionTier::Basic,
        BillingPeriod::Monthly,
        payment_method.clone(),
        true,
    ).unwrap();

    // Test emergency pause
    let reason = String::from_str(&env, "Security issue");
    assert_eq!(
        SubscriptionManager::emergency_pause(env.clone(), admin.clone(), reason.clone()),
        Ok(())
    );

    // Verify emergency pause
    let config: ContractConfig = env.storage().instance().get(&Symbol::new(&env, "CONFIG")).unwrap();
    assert_eq!(config.emergency_pause, true);

    // Test cancellation still works during emergency pause (for user safety)
    assert_eq!(
        SubscriptionManager::cancel_subscription(env.clone(), user.clone(), subscription_id),
        Ok(())
    );
}

#[test]
fn test_unauthorized_admin_operations() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let unauthorized_user = Address::generate(&env);

    SubscriptionManager::initialize(env.clone(), admin.clone(), treasury.clone()).unwrap();

    // Test unauthorized pause
    let reason = String::from_str(&env, "Malicious attempt");
    assert_eq!(
        SubscriptionManager::pause_contract(env.clone(), unauthorized_user.clone(), reason.clone()),
        Err(SubscriptionError::Unauthorized)
    );

    // Test unauthorized unpause
    assert_eq!(
        SubscriptionManager::unpause_contract(env.clone(), unauthorized_user.clone()),
        Err(SubscriptionError::Unauthorized)
    );

    // Test unauthorized emergency pause
    assert_eq!(
        SubscriptionManager::emergency_pause(env.clone(), unauthorized_user.clone(), reason.clone()),
        Err(SubscriptionError::Unauthorized)
    );
}

#[test]
fn test_plan_update() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);

    SubscriptionManager::initialize(env.clone(), admin.clone(), treasury.clone()).unwrap();

    // Update Basic plan
    let new_name = String::from_str(&env, "Basic Plus");
    let new_description = String::from_str(&env, "Enhanced basic plan");
    let new_features = Vec::from_array(&env, [
        String::from_str(&env, "All basic features"),
        String::from_str(&env, "Additional bonus content"),
    ]);

    assert_eq!(
        SubscriptionManager::update_plan(
            env.clone(),
            admin.clone(),
            SubscriptionTier::Basic,
            new_name.clone(),
            new_description.clone(),
            15_000_000,
            Symbol::new(&env, "XLM"),
            new_features.clone(),
            2,
            true,
        ),
        Ok(())
    );

    // Verify plan was updated
    let updated_plan = SubscriptionManager::get_plan(env.clone(), SubscriptionTier::Basic).unwrap();
    assert_eq!(updated_plan.name, new_name);
    assert_eq!(updated_plan.description, new_description);
    assert_eq!(updated_plan.price, 15_000_000);
    assert_eq!(updated_plan.max_users, 2);
}

#[test]
fn test_unauthorized_plan_update() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let unauthorized_user = Address::generate(&env);

    SubscriptionManager::initialize(env.clone(), admin.clone(), treasury.clone()).unwrap();

    // Try to update plan with unauthorized user
    let new_name = String::from_str(&env, "Hacked Plan");
    assert_eq!(
        SubscriptionManager::update_plan(
            env.clone(),
            unauthorized_user.clone(),
            SubscriptionTier::Basic,
            new_name.clone(),
            String::from_str(&env, "Malicious"),
            1_000_000,
            Symbol::new(&env, "XLM"),
            Vec::new(&env),
            1,
            true,
        ),
        Err(SubscriptionError::Unauthorized)
    );
}

#[test]
fn test_inactive_plan_subscription() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let user = Address::generate(&env);
    let payment_method = Address::generate(&env);

    SubscriptionManager::initialize(env.clone(), admin.clone(), treasury.clone()).unwrap();

    // Deactivate Basic plan
    assert_eq!(
        SubscriptionManager::update_plan(
            env.clone(),
            admin.clone(),
            SubscriptionTier::Basic,
            String::from_str(&env, "Basic"),
            String::from_str(&env, "Basic plan"),
            10_000_000,
            Symbol::new(&env, "XLM"),
            Vec::new(&env),
            1,
            false, // Deactivate
        ),
        Ok(())
    );

    // Try to subscribe to inactive plan
    assert_eq!(
        SubscriptionManager::create_subscription(
            env.clone(),
            user.clone(),
            SubscriptionTier::Basic,
            BillingPeriod::Monthly,
            payment_method.clone(),
            true,
        ),
        Err(SubscriptionError::PlanNotActive)
    );
}

#[test]
fn test_subscription_expiration() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let user = Address::generate(&env);
    let payment_method = Address::generate(&env);

    SubscriptionManager::initialize(env.clone(), admin.clone(), treasury.clone()).unwrap();

    // Create subscription
    let subscription_id = SubscriptionManager::create_subscription(
        env.clone(),
        user.clone(),
        SubscriptionTier::Basic,
        BillingPeriod::Monthly,
        payment_method.clone(),
        true,
    ).unwrap();

    // Simulate time passing beyond subscription end
    env.ledger().set_timestamp(2_000_000_000); // Far future

    // Check if subscription is still considered active (implementation dependent)
    let subscription = SubscriptionManager::get_subscription(env.clone(), subscription_id).unwrap();
    // The subscription should still be in Active status until explicitly processed
    assert_eq!(subscription.status, SubscriptionStatus::Active);
}

#[test]
fn test_edge_cases() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);

    SubscriptionManager::initialize(env.clone(), admin.clone(), treasury.clone()).unwrap();

    // Test getting non-existent subscription
    assert_eq!(
        SubscriptionManager::get_subscription(env.clone(), 999),
        Err(SubscriptionError::SubscriptionNotFound)
    );

    // Test getting non-existent plan
    assert_eq!(
        SubscriptionManager::get_plan(env.clone(), SubscriptionTier::Basic),
        Ok(()) // Should exist from initialization
    );

    // Test getting subscriptions for non-existent user
    let non_existent_user = Address::generate(&env);
    let user_subscriptions = SubscriptionManager::get_user_subscriptions(env.clone(), non_existent_user.clone());
    assert_eq!(user_subscriptions.len(), 0);
}

#[test]
fn test_multiple_users_subscriptions() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    let payment_method = Address::generate(&env);

    SubscriptionManager::initialize(env.clone(), admin.clone(), treasury.clone()).unwrap();

    // Create subscription for user1
    let subscription1 = SubscriptionManager::create_subscription(
        env.clone(),
        user1.clone(),
        SubscriptionTier::Basic,
        BillingPeriod::Monthly,
        payment_method.clone(),
        true,
    ).unwrap();

    // Create subscription for user2
    let subscription2 = SubscriptionManager::create_subscription(
        env.clone(),
        user2.clone(),
        SubscriptionTier::Pro,
        BillingPeriod::Quarterly,
        payment_method.clone(),
        false,
    ).unwrap();

    // Verify user1 subscriptions
    let user1_subs = SubscriptionManager::get_user_subscriptions(env.clone(), user1.clone());
    assert_eq!(user1_subs.len(), 1);
    assert_eq!(user1_subs.get(0).unwrap(), subscription1);

    // Verify user2 subscriptions
    let user2_subs = SubscriptionManager::get_user_subscriptions(env.clone(), user2.clone());
    assert_eq!(user2_subs.len(), 1);
    assert_eq!(user2_subs.get(0).unwrap(), subscription2);

    // Verify subscriptions are different
    assert_ne!(subscription1, subscription2);
}

#[test]
fn test_billing_periods() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let user = Address::generate(&env);
    let payment_method = Address::generate(&env);

    SubscriptionManager::initialize(env.clone(), admin.clone(), treasury.clone()).unwrap();

    // Test different billing periods
    let monthly_sub = SubscriptionManager::create_subscription(
        env.clone(),
        user.clone(),
        SubscriptionTier::Basic,
        BillingPeriod::Monthly,
        payment_method.clone(),
        true,
    ).unwrap();

    let monthly_details = SubscriptionManager::get_subscription(env.clone(), monthly_sub).unwrap();
    let expected_monthly_end = monthly_details.start_date + 2_592_000; // 30 days
    assert_eq!(monthly_details.end_date, expected_monthly_end);

    // Cancel first subscription to allow new one
    SubscriptionManager::cancel_subscription(env.clone(), user.clone(), monthly_sub).unwrap();

    let quarterly_sub = SubscriptionManager::create_subscription(
        env.clone(),
        user.clone(),
        SubscriptionTier::Pro,
        BillingPeriod::Quarterly,
        payment_method.clone(),
        true,
    ).unwrap();

    let quarterly_details = SubscriptionManager::get_subscription(env.clone(), quarterly_sub).unwrap();
    let expected_quarterly_end = quarterly_details.start_date + 7_776_000; // 90 days
    assert_eq!(quarterly_details.end_date, expected_quarterly_end);
}
