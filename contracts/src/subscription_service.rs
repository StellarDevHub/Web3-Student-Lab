use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Env, Symbol,
    Vec,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum BillingFrequency {
    Daily = 0,
    Weekly = 1,
    Monthly = 2,
    Yearly = 3,
}

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum SubscriptionStatus {
    Active = 0,
    Paused = 1,
    Cancelled = 2,
}

/// A subscription plan template created by a merchant / service provider.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Plan {
    pub plan_id: u32,
    pub owner: Address,
    pub price: i128,          // amount per billing cycle (in stroops or smallest unit)
    pub frequency: BillingFrequency,
    pub trial_ledgers: u32,   // 0 = no trial
    pub active: bool,
}

/// A subscriber's active subscription to a plan.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Subscription {
    pub sub_id: u32,
    pub plan_id: u32,
    pub subscriber: Address,
    pub status: SubscriptionStatus,
    pub created_at: u64,       // ledger timestamp
    pub next_payment_at: u64,  // ledger timestamp
    pub paused_at: u64,        // 0 = not paused
}

// ---------------------------------------------------------------------------
// Storage Keys
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    PlanCounter,
    Plan(u32),
    SubCounter,
    Subscription(u32),
    /// Index: subscriber address -> Vec<u32> of sub_ids
    SubscriberSubs(Address),
    /// Index: plan_id -> Vec<u32> of sub_ids
    PlanSubs(u32),
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum SubError {
    NotAuthorized = 1,
    PlanNotFound = 2,
    PlanInactive = 3,
    SubscriptionNotFound = 4,
    AlreadyCancelled = 5,
    AlreadyPaused = 6,
    NotPaused = 7,
    InvalidPrice = 8,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Ledger-seconds per billing frequency (approximate).
fn frequency_seconds(f: BillingFrequency) -> u64 {
    match f {
        BillingFrequency::Daily => 86_400,
        BillingFrequency::Weekly => 604_800,
        BillingFrequency::Monthly => 2_592_000, // 30 days
        BillingFrequency::Yearly => 31_536_000, // 365 days
    }
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct SubscriptionServiceContract;

#[contractimpl]
impl SubscriptionServiceContract {
    // -----------------------------------------------------------------------
    // Admin
    // -----------------------------------------------------------------------

    pub fn init(env: Env, admin: Address) {
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::PlanCounter, &0u32);
        env.storage().instance().set(&DataKey::SubCounter, &0u32);
    }

    // -----------------------------------------------------------------------
    // Phase 1 – Plan Creation
    // -----------------------------------------------------------------------

    /// Create a new subscription plan. Returns the plan_id.
    pub fn create_plan(
        env: Env,
        owner: Address,
        price: i128,
        frequency: BillingFrequency,
        trial_ledgers: u32,
    ) -> u32 {
        owner.require_auth();

        if price <= 0 {
            panic_with_error!(&env, SubError::InvalidPrice);
        }

        let mut counter: u32 = env
            .storage()
            .instance()
            .get(&DataKey::PlanCounter)
            .unwrap_or(0);
        counter += 1;

        let plan = Plan {
            plan_id: counter,
            owner: owner.clone(),
            price,
            frequency,
            trial_ledgers,
            active: true,
        };

        env.storage().instance().set(&DataKey::Plan(counter), &plan);
        env.storage().instance().set(&DataKey::PlanCounter, &counter);

        env.events().publish(
            (Symbol::new(&env, "PlanCreated"),),
            (counter, owner, price, frequency as u32),
        );

        counter
    }

    /// Subscribe a user to a plan. Returns the sub_id.
    pub fn subscribe(env: Env, subscriber: Address, plan_id: u32) -> u32 {
        subscriber.require_auth();

        let plan: Plan = env
            .storage()
            .instance()
            .get(&DataKey::Plan(plan_id))
            .unwrap_or_else(|| panic_with_error!(&env, SubError::PlanNotFound));

        if !plan.active {
            panic_with_error!(&env, SubError::PlanInactive);
        }

        let now = env.ledger().timestamp();
        let trial_offset = if plan.trial_ledgers > 0 {
            plan.trial_ledgers as u64 * 5 // ~5 s per ledger → rough seconds
        } else {
            0
        };
        let next_payment = now + trial_offset + frequency_seconds(plan.frequency);

        let mut counter: u32 = env
            .storage()
            .instance()
            .get(&DataKey::SubCounter)
            .unwrap_or(0);
        counter += 1;

        let sub = Subscription {
            sub_id: counter,
            plan_id,
            subscriber: subscriber.clone(),
            status: SubscriptionStatus::Active,
            created_at: now,
            next_payment_at: next_payment,
            paused_at: 0,
        };

        env.storage()
            .instance()
            .set(&DataKey::Subscription(counter), &sub);
        env.storage().instance().set(&DataKey::SubCounter, &counter);

        // Index by subscriber
        let mut subs: Vec<u32> = env
            .storage()
            .instance()
            .get(&DataKey::SubscriberSubs(subscriber.clone()))
            .unwrap_or(Vec::new(&env));
        subs.push_back(counter);
        env.storage()
            .instance()
            .set(&DataKey::SubscriberSubs(subscriber.clone()), &subs);

        // Index by plan
        let mut plan_subs: Vec<u32> = env
            .storage()
            .instance()
            .get(&DataKey::PlanSubs(plan_id))
            .unwrap_or(Vec::new(&env));
        plan_subs.push_back(counter);
        env.storage()
            .instance()
            .set(&DataKey::PlanSubs(plan_id), &plan_subs);

        env.events().publish(
            (Symbol::new(&env, "Subscribed"),),
            (counter, subscriber, plan_id, next_payment),
        );

        counter
    }

    // -----------------------------------------------------------------------
    // Phase 3 – Cancellation Logic
    // -----------------------------------------------------------------------

    /// Cancel a subscription. Returns prorated refund amount (informational).
    pub fn cancel(env: Env, subscriber: Address, sub_id: u32) -> i128 {
        subscriber.require_auth();

        let mut sub: Subscription = env
            .storage()
            .instance()
            .get(&DataKey::Subscription(sub_id))
            .unwrap_or_else(|| panic_with_error!(&env, SubError::SubscriptionNotFound));

        if sub.subscriber != subscriber {
            panic_with_error!(&env, SubError::NotAuthorized);
        }
        if sub.status == SubscriptionStatus::Cancelled {
            panic_with_error!(&env, SubError::AlreadyCancelled);
        }

        let plan: Plan = env
            .storage()
            .instance()
            .get(&DataKey::Plan(sub.plan_id))
            .unwrap_or_else(|| panic_with_error!(&env, SubError::PlanNotFound));

        // Prorated refund: unused fraction of the current billing cycle
        let now = env.ledger().timestamp();
        let cycle_secs = frequency_seconds(plan.frequency);
        let elapsed = now.saturating_sub(sub.next_payment_at.saturating_sub(cycle_secs));
        let remaining = cycle_secs.saturating_sub(elapsed);
        let refund = if cycle_secs > 0 {
            (plan.price as u64)
                .saturating_mul(remaining)
                .saturating_div(cycle_secs) as i128
        } else {
            0
        };

        sub.status = SubscriptionStatus::Cancelled;
        env.storage()
            .instance()
            .set(&DataKey::Subscription(sub_id), &sub);

        env.events().publish(
            (Symbol::new(&env, "Cancelled"),),
            (sub_id, subscriber, refund),
        );

        refund
    }

    /// Pause a subscription (stops next payment until resumed).
    pub fn pause(env: Env, subscriber: Address, sub_id: u32) {
        subscriber.require_auth();

        let mut sub: Subscription = env
            .storage()
            .instance()
            .get(&DataKey::Subscription(sub_id))
            .unwrap_or_else(|| panic_with_error!(&env, SubError::SubscriptionNotFound));

        if sub.subscriber != subscriber {
            panic_with_error!(&env, SubError::NotAuthorized);
        }
        if sub.status == SubscriptionStatus::Paused {
            panic_with_error!(&env, SubError::AlreadyPaused);
        }
        if sub.status == SubscriptionStatus::Cancelled {
            panic_with_error!(&env, SubError::AlreadyCancelled);
        }

        sub.paused_at = env.ledger().timestamp();
        sub.status = SubscriptionStatus::Paused;
        env.storage()
            .instance()
            .set(&DataKey::Subscription(sub_id), &sub);

        env.events()
            .publish((Symbol::new(&env, "Paused"),), (sub_id, subscriber));
    }

    /// Resume a paused subscription, extending next_payment_at by the pause duration.
    pub fn resume(env: Env, subscriber: Address, sub_id: u32) {
        subscriber.require_auth();

        let mut sub: Subscription = env
            .storage()
            .instance()
            .get(&DataKey::Subscription(sub_id))
            .unwrap_or_else(|| panic_with_error!(&env, SubError::SubscriptionNotFound));

        if sub.subscriber != subscriber {
            panic_with_error!(&env, SubError::NotAuthorized);
        }
        if sub.status != SubscriptionStatus::Paused {
            panic_with_error!(&env, SubError::NotPaused);
        }

        let now = env.ledger().timestamp();
        let paused_duration = now.saturating_sub(sub.paused_at);

        // Shift next payment forward by however long subscription was paused
        sub.next_payment_at = sub.next_payment_at.saturating_add(paused_duration);
        sub.paused_at = 0;
        sub.status = SubscriptionStatus::Active;

        env.storage()
            .instance()
            .set(&DataKey::Subscription(sub_id), &sub);

        env.events()
            .publish((Symbol::new(&env, "Resumed"),), (sub_id, subscriber, sub.next_payment_at));
    }

    // -----------------------------------------------------------------------
    // Getters
    // -----------------------------------------------------------------------

    pub fn get_plan(env: Env, plan_id: u32) -> Plan {
        env.storage()
            .instance()
            .get(&DataKey::Plan(plan_id))
            .unwrap_or_else(|| panic_with_error!(&env, SubError::PlanNotFound))
    }

    pub fn get_subscription(env: Env, sub_id: u32) -> Subscription {
        env.storage()
            .instance()
            .get(&DataKey::Subscription(sub_id))
            .unwrap_or_else(|| panic_with_error!(&env, SubError::SubscriptionNotFound))
    }

    pub fn get_subscriber_subs(env: Env, subscriber: Address) -> Vec<u32> {
        env.storage()
            .instance()
            .get(&DataKey::SubscriberSubs(subscriber))
            .unwrap_or(Vec::new(&env))
    }
}
