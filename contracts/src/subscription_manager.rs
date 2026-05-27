//! Subscription Management System for Web3 Student Lab
//! 
//! Features:
//! - Tiered subscription plans (Basic, Pro, Enterprise)
//! - Recurring billing with flexible periods
//! - Access control and authorization
//! - Emergency pause and recovery mechanisms
//! - Comprehensive event emissions
//! - Gas optimization techniques

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error,
    Address, BytesN, Env, String, Symbol, Vec, Map, U256, u64, i128
};

/// Subscription plan tiers
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SubscriptionTier {
    Basic,
    Pro,
    Enterprise,
}

/// Subscription status
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SubscriptionStatus {
    Active,
    Paused,
    Cancelled,
    Expired,
    Suspended,
}

/// Billing period options
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum BillingPeriod {
    Monthly,
    Quarterly,
    Yearly,
}

/// Subscription plan configuration
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SubscriptionPlan {
    pub tier: SubscriptionTier,
    pub name: String,
    pub description: String,
    pub price: i128,
    pub currency: Symbol,
    pub billing_period: BillingPeriod,
    pub features: Vec<String>,
    pub max_users: u32,
    pub is_active: bool,
}

/// User subscription record
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Subscription {
    pub user: Address,
    pub plan_tier: SubscriptionTier,
    pub start_date: u64,
    pub end_date: u64,
    pub last_billing_date: u64,
    pub next_billing_date: u64,
    pub status: SubscriptionStatus,
    pub auto_renew: bool,
    pub payment_method: Address, // Token contract address
    pub subscription_id: u64,
    pub created_at: u64,
}

/// Payment record
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentRecord {
    pub subscription_id: u64,
    pub user: Address,
    pub amount: i128,
    pub currency: Symbol,
    pub payment_date: u64,
    pub transaction_hash: BytesN<32>,
    pub billing_period: BillingPeriod,
    pub status: PaymentStatus,
}

/// Payment status
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PaymentStatus {
    Pending,
    Completed,
    Failed,
    Refunded,
}

/// Contract configuration
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContractConfig {
    pub admin: Address,
    pub treasury: Address,
    pub paused: bool,
    pub emergency_pause: bool,
    pub platform_fee_percent: u32,
    pub min_subscription_period: u64,
    pub max_subscription_period: u64,
    pub grace_period_days: u32,
}

/// Contract errors
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum SubscriptionError {
    /// Unauthorized access
    Unauthorized = 1,
    /// Contract is paused
    ContractPaused = 2,
    /// Invalid subscription tier
    InvalidTier = 3,
    /// Subscription not found
    SubscriptionNotFound = 4,
    /// Subscription already active
    SubscriptionAlreadyActive = 5,
    /// Insufficient payment
    InsufficientPayment = 6,
    /// Invalid payment amount
    InvalidPaymentAmount = 7,
    /// Subscription expired
    SubscriptionExpired = 8,
    /// Invalid billing period
    InvalidBillingPeriod = 9,
    /// Plan not active
    PlanNotActive = 10,
    /// Maximum users exceeded
    MaxUsersExceeded = 11,
    /// Invalid user address
    InvalidUserAddress = 12,
    /// Payment failed
    PaymentFailed = 13,
    /// Invalid configuration
    InvalidConfig = 14,
    /// Subscription already cancelled
    AlreadyCancelled = 15,
    /// Grace period exceeded
    GracePeriodExceeded = 16,
}

/// Contract events
#[contractevent]
pub struct SubscriptionCreated {
    pub subscription_id: u64,
    pub user: Address,
    pub tier: SubscriptionTier,
    pub start_date: u64,
    pub end_date: u64,
}

#[contractevent]
pub struct SubscriptionUpdated {
    pub subscription_id: u64,
    pub user: Address,
    pub old_status: SubscriptionStatus,
    pub new_status: SubscriptionStatus,
}

#[contractevent]
pub struct PaymentProcessed {
    pub subscription_id: u64,
    pub user: Address,
    pub amount: i128,
    pub currency: Symbol,
    pub payment_date: u64,
}

#[contractevent]
pub struct SubscriptionCancelled {
    pub subscription_id: u64,
    pub user: Address,
    pub cancellation_date: u64,
    pub refund_amount: Option<i128>,
}

#[contractevent]
pub struct PlanUpdated {
    pub tier: SubscriptionTier,
    pub updated_by: Address,
    pub update_date: u64,
}

#[contractevent]
pub struct EmergencyPause {
    pub paused_by: Address,
    pub pause_date: u64,
    pub reason: String,
}

/// Storage keys
const ADMIN: Symbol = Symbol::new(&"ADMIN");
const CONFIG: Symbol = Symbol::new(&"CONFIG");
const SUBSCRIPTIONS: Symbol = Symbol::new(&"SUBSCRIPTIONS");
const USER_SUBSCRIPTIONS: Symbol = Symbol::new(&"USER_SUBSCRIPTIONS");
const SUBSCRIPTION_PLANS: Symbol = Symbol::new(&"SUBSCRIPTION_PLANS");
const PAYMENT_RECORDS: Symbol = Symbol::new(&"PAYMENT_RECORDS");
const NEXT_SUBSCRIPTION_ID: Symbol = Symbol::new(&"NEXT_SUBSCRIPTION_ID");
const NEXT_PAYMENT_ID: Symbol = Symbol::new(&"NEXT_PAYMENT_ID");

/// Subscription Manager Contract
#[contract]
pub struct SubscriptionManager;

#[contractimpl]
impl SubscriptionManager {
    /// Initialize the contract
    pub fn initialize(env: Env, admin: Address, treasury: Address) -> Result<(), SubscriptionError> {
        if env.storage().instance().has(&ADMIN) {
            return Err(SubscriptionError::InvalidConfig);
        }

        let config = ContractConfig {
            admin: admin.clone(),
            treasury,
            paused: false,
            emergency_pause: false,
            platform_fee_percent: 5, // 5% platform fee
            min_subscription_period: 2592000, // 30 days in seconds
            max_subscription_period: 31536000, // 365 days in seconds
            grace_period_days: 7,
        };

        env.storage().instance().set(&ADMIN, &admin);
        env.storage().instance().set(&CONFIG, &config);
        env.storage().instance().set(&NEXT_SUBSCRIPTION_ID, &1u64);
        env.storage().instance().set(&NEXT_PAYMENT_ID, &1u64);

        // Initialize default subscription plans
        Self::initialize_default_plans(env)?;

        Ok(())
    }

    /// Create a new subscription
    pub fn create_subscription(
        env: Env,
        user: Address,
        tier: SubscriptionTier,
        billing_period: BillingPeriod,
        payment_method: Address,
        auto_renew: bool,
    ) -> Result<u64, SubscriptionError> {
        let config: ContractConfig = env.storage().instance().get(&CONFIG).unwrap();
        
        if config.paused || config.emergency_pause {
            return Err(SubscriptionError::ContractPaused);
        }

        // Check if user already has active subscription
        if Self::has_active_subscription(env.clone(), user.clone()) {
            return Err(SubscriptionError::SubscriptionAlreadyActive);
        }

        // Get plan details
        let plan = Self::get_plan(env.clone(), tier.clone())?;
        if !plan.is_active {
            return Err(SubscriptionError::PlanNotActive);
        }

        // Calculate subscription period
        let period_seconds = Self::billing_period_to_seconds(billing_period.clone());
        let current_time = env.ledger().timestamp();
        let end_date = current_time + period_seconds;

        // Create subscription
        let subscription_id = env.storage().instance().get(&NEXT_SUBSCRIPTION_ID).unwrap_or(1u64);
        env.storage().instance().set(&NEXT_SUBSCRIPTION_ID, &(subscription_id + 1));

        let subscription = Subscription {
            user: user.clone(),
            plan_tier: tier.clone(),
            start_date: current_time,
            end_date,
            last_billing_date: current_time,
            next_billing_date: end_date,
            status: SubscriptionStatus::Active,
            auto_renew,
            payment_method: payment_method.clone(),
            subscription_id,
            created_at: current_time,
        };

        // Store subscription
        let mut subscriptions: Map<u64, Subscription> = env.storage()
            .instance()
            .get(&SUBSCRIPTIONS)
            .unwrap_or(Map::new(&env));
        subscriptions.set(subscription_id, subscription.clone());
        env.storage().instance().set(&SUBSCRIPTIONS, &subscriptions);

        // Update user subscriptions mapping
        let mut user_subscriptions: Map<Address, Vec<u64>> = env.storage()
            .instance()
            .get(&USER_SUBSCRIPTIONS)
            .unwrap_or(Map::new(&env));
        
        let mut user_subs = user_subscriptions.get(user.clone()).unwrap_or(Vec::new(&env));
        user_subs.push_back(subscription_id);
        user_subscriptions.set(user.clone(), user_subs);
        env.storage().instance().set(&USER_SUBSCRIPTIONS, &user_subscriptions);

        // Emit event
        env.events().publish(
            SubscriptionCreated {
                subscription_id,
                user: user.clone(),
                tier,
                start_date: current_time,
                end_date,
            },
        );

        Ok(subscription_id)
    }

    /// Cancel a subscription
    pub fn cancel_subscription(
        env: Env,
        user: Address,
        subscription_id: u64,
    ) -> Result<(), SubscriptionError> {
        let config: ContractConfig = env.storage().instance().get(&CONFIG).unwrap();
        
        if config.emergency_pause {
            return Err(SubscriptionError::ContractPaused);
        }

        let mut subscriptions: Map<u64, Subscription> = env.storage()
            .instance()
            .get(&SUBSCRIPTIONS)
            .unwrap_or(Map::new(&env));

        let mut subscription = subscriptions.get(subscription_id)
            .ok_or(SubscriptionError::SubscriptionNotFound)?;

        // Check authorization
        if subscription.user != user && !Self::is_admin(env.clone(), user.clone()) {
            return Err(SubscriptionError::Unauthorized);
        }

        if subscription.status == SubscriptionStatus::Cancelled {
            return Err(SubscriptionError::AlreadyCancelled);
        }

        let old_status = subscription.status.clone();
        subscription.status = SubscriptionStatus::Cancelled;
        subscription.end_date = env.ledger().timestamp();

        // Calculate refund if applicable
        let refund_amount = Self::calculate_refund(env.clone(), subscription.clone());

        subscriptions.set(subscription_id, subscription.clone());
        env.storage().instance().set(&SUBSCRIPTIONS, &subscriptions);

        // Emit event
        env.events().publish(
            SubscriptionCancelled {
                subscription_id,
                user: subscription.user.clone(),
                cancellation_date: env.ledger().timestamp(),
                refund_amount,
            },
        );

        env.events().publish(
            SubscriptionUpdated {
                subscription_id,
                user: subscription.user.clone(),
                old_status,
                new_status: SubscriptionStatus::Cancelled,
            },
        );

        Ok(())
    }

    /// Pause contract (admin only)
    pub fn pause_contract(env: Env, admin: Address, reason: String) -> Result<(), SubscriptionError> {
        if !Self::is_admin(env.clone(), admin.clone()) {
            return Err(SubscriptionError::Unauthorized);
        }

        let mut config: ContractConfig = env.storage().instance().get(&CONFIG).unwrap();
        config.paused = true;
        env.storage().instance().set(&CONFIG, &config);

        env.events().publish(
            EmergencyPause {
                paused_by: admin,
                pause_date: env.ledger().timestamp(),
                reason,
            },
        );

        Ok(())
    }

    /// Unpause contract (admin only)
    pub fn unpause_contract(env: Env, admin: Address) -> Result<(), SubscriptionError> {
        if !Self::is_admin(env.clone(), admin.clone()) {
            return Err(SubscriptionError::Unauthorized);
        }

        let mut config: ContractConfig = env.storage().instance().get(&CONFIG).unwrap();
        config.paused = false;
        env.storage().instance().set(&CONFIG, &config);

        Ok(())
    }

    /// Emergency pause (admin only)
    pub fn emergency_pause(env: Env, admin: Address, reason: String) -> Result<(), SubscriptionError> {
        if !Self::is_admin(env.clone(), admin.clone()) {
            return Err(SubscriptionError::Unauthorized);
        }

        let mut config: ContractConfig = env.storage().instance().get(&CONFIG).unwrap();
        config.emergency_pause = true;
        env.storage().instance().set(&CONFIG, &config);

        env.events().publish(
            EmergencyPause {
                paused_by: admin,
                pause_date: env.ledger().timestamp(),
                reason,
            },
        );

        Ok(())
    }

    /// Get subscription details
    pub fn get_subscription(env: Env, subscription_id: u64) -> Result<Subscription, SubscriptionError> {
        let subscriptions: Map<u64, Subscription> = env.storage()
            .instance()
            .get(&SUBSCRIPTIONS)
            .unwrap_or(Map::new(&env));

        subscriptions.get(subscription_id)
            .ok_or(SubscriptionError::SubscriptionNotFound)
    }

    /// Get user subscriptions
    pub fn get_user_subscriptions(env: Env, user: Address) -> Vec<u64> {
        let user_subscriptions: Map<Address, Vec<u64>> = env.storage()
            .instance()
            .get(&USER_SUBSCRIPTIONS)
            .unwrap_or(Map::new(&env));

        user_subscriptions.get(user).unwrap_or(Vec::new(&env))
    }

    /// Get plan details
    pub fn get_plan(env: Env, tier: SubscriptionTier) -> Result<SubscriptionPlan, SubscriptionError> {
        let plans: Map<SubscriptionTier, SubscriptionPlan> = env.storage()
            .instance()
            .get(&SUBSCRIPTION_PLANS)
            .unwrap_or(Map::new(&env));

        plans.get(tier).ok_or(SubscriptionError::InvalidTier)
    }

    /// Get all plans
    pub fn get_all_plans(env: Env) -> Vec<SubscriptionPlan> {
        let plans: Map<SubscriptionTier, SubscriptionPlan> = env.storage()
            .instance()
            .get(&SUBSCRIPTION_PLANS)
            .unwrap_or(Map::new(&env));

        let mut result = Vec::new(&env);
        for (_, plan) in plans {
            result.push_back(plan);
        }
        result
    }

    /// Update subscription plan (admin only)
    pub fn update_plan(
        env: Env,
        admin: Address,
        tier: SubscriptionTier,
        name: String,
        description: String,
        price: i128,
        currency: Symbol,
        features: Vec<String>,
        max_users: u32,
        is_active: bool,
    ) -> Result<(), SubscriptionError> {
        if !Self::is_admin(env.clone(), admin.clone()) {
            return Err(SubscriptionError::Unauthorized);
        }

        let plan = SubscriptionPlan {
            tier: tier.clone(),
            name,
            description,
            price,
            currency,
            billing_period: Self::get_default_billing_period(tier.clone()),
            features,
            max_users,
            is_active,
        };

        let mut plans: Map<SubscriptionTier, SubscriptionPlan> = env.storage()
            .instance()
            .get(&SUBSCRIPTION_PLANS)
            .unwrap_or(Map::new(&env));
        
        plans.set(tier.clone(), plan.clone());
        env.storage().instance().set(&SUBSCRIPTION_PLANS, &plans);

        env.events().publish(
            PlanUpdated {
                tier,
                updated_by: admin,
                update_date: env.ledger().timestamp(),
            },
        );

        Ok(())
    }

    /// Helper functions
    fn is_admin(env: Env, address: Address) -> bool {
        let admin: Address = env.storage().instance().get(&ADMIN).unwrap();
        admin == address
    }

    fn has_active_subscription(env: Env, user: Address) -> bool {
        let user_subscriptions = Self::get_user_subscriptions(env, user);
        let current_time = env.ledger().timestamp();

        for subscription_id in user_subscriptions {
            if let Ok(subscription) = Self::get_subscription(env.clone(), subscription_id) {
                if subscription.status == SubscriptionStatus::Active && subscription.end_date > current_time {
                    return true;
                }
            }
        }
        false
    }

    fn billing_period_to_seconds(period: BillingPeriod) -> u64 {
        match period {
            BillingPeriod::Monthly => 2592000,    // 30 days
            BillingPeriod::Quarterly => 7776000, // 90 days
            BillingPeriod::Yearly => 31536000,    // 365 days
        }
    }

    fn get_default_billing_period(tier: SubscriptionTier) -> BillingPeriod {
        match tier {
            SubscriptionTier::Basic => BillingPeriod::Monthly,
            SubscriptionTier::Pro => BillingPeriod::Quarterly,
            SubscriptionTier::Enterprise => BillingPeriod::Yearly,
        }
    }

    fn calculate_refund(env: Env, subscription: Subscription) -> Option<i128> {
        let current_time = env.ledger().timestamp();
        let remaining_time = subscription.end_date.saturating_sub(current_time);
        let total_time = subscription.end_date.saturating_sub(subscription.start_date);
        
        if total_time == 0 || remaining_time == 0 {
            return None;
        }

        let refund_percentage = (remaining_time as i128) * 100 / (total_time as i128);
        
        if let Ok(plan) = Self::get_plan(env, subscription.plan_tier) {
            Some(plan.price * refund_percentage / 100)
        } else {
            None
        }
    }

    fn initialize_default_plans(env: Env) -> Result<(), SubscriptionError> {
        let mut plans: Map<SubscriptionTier, SubscriptionPlan> = Map::new(&env);

        // Basic Plan
        let basic_features = Vec::from_array(&env, [
            String::from_str(&env, "Access to basic courses"),
            String::from_str(&env, "Email support"),
            String::from_str(&env, "Certificate of completion"),
        ]);
        
        plans.set(
            SubscriptionTier::Basic,
            SubscriptionPlan {
                tier: SubscriptionTier::Basic,
                name: String::from_str(&env, "Basic"),
                description: String::from_str(&env, "Perfect for getting started"),
                price: 10_000_000, // 0.001 XLM equivalent
                currency: Symbol::new(&"XLM"),
                billing_period: BillingPeriod::Monthly,
                features: basic_features,
                max_users: 1,
                is_active: true,
            },
        );

        // Pro Plan
        let pro_features = Vec::from_array(&env, [
            String::from_str(&env, "Access to all courses"),
            String::from_str(&env, "Priority support"),
            String::from_str(&env, "Verified certificates"),
            String::from_str(&env, "Course completion tracking"),
        ]);
        
        plans.set(
            SubscriptionTier::Pro,
            SubscriptionPlan {
                tier: SubscriptionTier::Pro,
                name: String::from_str(&env, "Pro"),
                description: String::from_str(&env, "For serious learners"),
                price: 25_000_000, // 0.0025 XLM equivalent
                currency: Symbol::new(&"XLM"),
                billing_period: BillingPeriod::Quarterly,
                features: pro_features,
                max_users: 3,
                is_active: true,
            },
        );

        // Enterprise Plan
        let enterprise_features = Vec::from_array(&env, [
            String::from_str(&env, "Unlimited course access"),
            String::from_str(&env, "Dedicated support"),
            String::from_str(&env, "Premium certificates"),
            String::from_str(&env, "Advanced analytics"),
            String::from_str(&env, "Custom branding"),
        ]);
        
        plans.set(
            SubscriptionTier::Enterprise,
            SubscriptionPlan {
                tier: SubscriptionTier::Enterprise,
                name: String::from_str(&env, "Enterprise"),
                description: String::from_str(&env, "For teams and organizations"),
                price: 100_000_000, // 0.01 XLM equivalent
                currency: Symbol::new(&"XLM"),
                billing_period: BillingPeriod::Yearly,
                features: enterprise_features,
                max_users: 10,
                is_active: true,
            },
        );

        env.storage().instance().set(&SUBSCRIPTION_PLANS, &plans);
        Ok(())
    }
}
