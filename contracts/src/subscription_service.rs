#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype,
    Address, Env, String, Symbol, Vec, Map, BytesN, IntoVal, Val,
    log, panic_with_error,
};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    SubscriptionPlans,
    Subscriptions,
    Admin,
    Nonce,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SubscriptionPlan {
    pub id: BytesN<32>,
    pub name: String,
    pub description: String,
    pub amount: i128,
    pub frequency: u64,
    pub token: Address,
    pub active: bool,
    pub created_at: u64,
    pub merchant: Address,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Subscription {
    pub id: BytesN<32>,
    pub plan_id: BytesN<32>,
    pub subscriber: Address,
    pub merchant: Address,
    pub amount: i128,
    pub frequency: u64,
    pub token: Address,
    pub status: SubscriptionStatus,
    pub created_at: u64,
    pub next_payment: u64,
    pub last_payment: u64,
    pub cancelled_at: u64,
    pub pause_start: u64,
    pub total_paid: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SubscriptionStatus {
    Active,
    Paused,
    Cancelled,
    Expired,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum SubscriptionError {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    Unauthorized = 3,
    PlanNotFound = 4,
    SubscriptionNotFound = 5,
    InvalidAmount = 6,
    InvalidFrequency = 7,
    PlanInactive = 8,
    AlreadySubscribed = 9,
    NotSubscriber = 10,
    AlreadyCancelled = 11,
    AlreadyPaused = 12,
    NotPaused = 13,
    InvalidRefund = 14,
    InsufficientBalance = 15,
    TransferFailed = 16,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PlanCreatedEvent {
    pub plan_id: BytesN<32>,
    pub merchant: Address,
    pub name: String,
    pub amount: i128,
    pub frequency: u64,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SubscriptionCreatedEvent {
    pub subscription_id: BytesN<32>,
    pub subscriber: Address,
    pub plan_id: BytesN<32>,
    pub next_payment: u64,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SubscriptionCancelledEvent {
    pub subscription_id: BytesN<32>,
    pub subscriber: Address,
    pub refund_amount: i128,
    pub effective_date: u64,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SubscriptionPausedEvent {
    pub subscription_id: BytesN<32>,
    pub subscriber: Address,
    pub paused_at: u64,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SubscriptionResumedEvent {
    pub subscription_id: BytesN<32>,
    pub subscriber: Address,
    pub next_payment: u64,
}

pub struct SubscriptionService;

#[contractimpl]
impl SubscriptionService {
    pub fn init(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, SubscriptionError::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Nonce, &0u64);
        env.storage().instance().set(&DataKey::SubscriptionPlans, &Vec::<SubscriptionPlan>::new(&env));
        env.storage().instance().set(&DataKey::Subscriptions, &Vec::<Subscription>::new(&env));
    }

    pub fn create_plan(
        env: Env,
        merchant: Address,
        name: String,
        description: String,
        amount: i128,
        frequency: u64,
        token: Address,
    ) -> BytesN<32> {
        merchant.require_auth();
        Self::require_admin(&env, &merchant);

        if amount <= 0 {
            panic_with_error!(&env, SubscriptionError::InvalidAmount);
        }
        if frequency == 0 {
            panic_with_error!(&env, SubscriptionError::InvalidFrequency);
        }

        let mut nonce: u64 = env.storage().instance().get(&DataKey::Nonce).unwrap();
        nonce += 1;
        env.storage().instance().set(&DataKey::Nonce, &nonce);

        let mut plan_id_bytes = [0u8; 32];
        let nonce_bytes = nonce.to_be_bytes();
        plan_id_bytes[..8].copy_from_slice(&nonce_bytes);
        let merchant_bytes = merchant.to_string().to_bytes();
        for (i, &byte) in merchant_bytes.iter().take(24).enumerate() {
            plan_id_bytes[8 + i] = byte;
        }
        let plan_id = BytesN::from_array(&env, &plan_id_bytes);

        let plan = SubscriptionPlan {
            id: plan_id.clone(),
            name,
            description,
            amount,
            frequency,
            token,
            active: true,
            created_at: env.ledger().timestamp(),
            merchant: merchant.clone(),
        };

        let mut plans: Vec<SubscriptionPlan> = env.storage().instance().get(&DataKey::SubscriptionPlans).unwrap();
        plans.push_back(plan.clone());
        env.storage().instance().set(&DataKey::SubscriptionPlans, &plans);

        env.events().publish(
            (Symbol::new(&env, "plan_created"), Symbol::new(&env, "v1")),
            PlanCreatedEvent {
                plan_id: plan_id.clone(),
                merchant,
                name: plan.name.clone(),
                amount: plan.amount,
                frequency: plan.frequency,
            },
        );

        plan_id
    }

    pub fn subscribe(env: Env, subscriber: Address, plan_id: BytesN<32>) -> BytesN<32> {
        subscriber.require_auth();

        let plans: Vec<SubscriptionPlan> = env.storage().instance().get(&DataKey::SubscriptionPlans).unwrap();
        let plan = plans.iter().find(|p| p.id == plan_id).ok_or_else(|| {
            panic_with_error!(&env, SubscriptionError::PlanNotFound);
        }).unwrap();

        if !plan.active {
            panic_with_error!(&env, SubscriptionError::PlanInactive);
        }

        let subscriptions: Vec<Subscription> = env.storage().instance().get(&DataKey::Subscriptions).unwrap();
        let already_subscribed = subscriptions.iter().any(|s| {
            s.plan_id == plan_id && s.subscriber == subscriber && s.status == SubscriptionStatus::Active
        });
        if already_subscribed {
            panic_with_error!(&env, SubscriptionError::AlreadySubscribed);
        }

        let mut nonce: u64 = env.storage().instance().get(&DataKey::Nonce).unwrap();
        nonce += 1;
        env.storage().instance().set(&DataKey::Nonce, &nonce);

        let mut sub_id_bytes = [0u8; 32];
        let nonce_bytes = nonce.to_be_bytes();
        sub_id_bytes[..8].copy_from_slice(&nonce_bytes);
        let sub_bytes = subscriber.to_string().to_bytes();
        for (i, &byte) in sub_bytes.iter().take(24).enumerate() {
            sub_id_bytes[8 + i] = byte;
        }
        let subscription_id = BytesN::from_array(&env, &sub_id_bytes);

        let now = env.ledger().timestamp();
        let subscription = Subscription {
            id: subscription_id.clone(),
            plan_id: plan.id.clone(),
            subscriber: subscriber.clone(),
            merchant: plan.merchant.clone(),
            amount: plan.amount,
            frequency: plan.frequency,
            token: plan.token.clone(),
            status: SubscriptionStatus::Active,
            created_at: now,
            next_payment: now + plan.frequency,
            last_payment: 0,
            cancelled_at: 0,
            pause_start: 0,
            total_paid: 0,
        };

        let mut subs = subscriptions;
        subs.push_back(subscription.clone());
        env.storage().instance().set(&DataKey::Subscriptions, &subs);

        env.events().publish(
            (Symbol::new(&env, "subscription_created"), Symbol::new(&env, "v1")),
            SubscriptionCreatedEvent {
                subscription_id: subscription_id.clone(),
                subscriber: subscriber.clone(),
                plan_id: plan.id.clone(),
                next_payment: subscription.next_payment,
            },
        );

        subscription_id
    }

    pub fn cancel_subscription(env: Env, subscriber: Address, subscription_id: BytesN<32>) -> i128 {
        subscriber.require_auth();

        let mut subscriptions: Vec<Subscription> = env.storage().instance().get(&DataKey::Subscriptions).unwrap();
        let idx = subscriptions.iter().position(|s| s.id == subscription_id).ok_or_else(|| {
            panic_with_error!(&env, SubscriptionError::SubscriptionNotFound);
        }).unwrap();

        let mut subscription = subscriptions.get(idx).unwrap();

        if subscription.subscriber != subscriber {
            panic_with_error!(&env, SubscriptionError::NotSubscriber);
        }
        if subscription.status == SubscriptionStatus::Cancelled {
            panic_with_error!(&env, SubscriptionError::AlreadyCancelled);
        }

        let now = env.ledger().timestamp();
        let refund = Self::calculate_prorated_refund(&env, &subscription, now);

        subscription.status = SubscriptionStatus::Cancelled;
        subscription.cancelled_at = now;
        subscriptions.set(idx, subscription.clone());
        env.storage().instance().set(&DataKey::Subscriptions, &subscriptions);

        if refund > 0 {
            Self::transfer_refund(&env, &subscription, refund);
        }

        env.events().publish(
            (Symbol::new(&env, "subscription_cancelled"), Symbol::new(&env, "v1")),
            SubscriptionCancelledEvent {
                subscription_id: subscription_id.clone(),
                subscriber: subscriber.clone(),
                refund_amount: refund,
                effective_date: now,
            },
        );

        refund
    }

    pub fn pause_subscription(env: Env, subscriber: Address, subscription_id: BytesN<32>) {
        subscriber.require_auth();

        let mut subscriptions: Vec<Subscription> = env.storage().instance().get(&DataKey::Subscriptions).unwrap();
        let idx = subscriptions.iter().position(|s| s.id == subscription_id).ok_or_else(|| {
            panic_with_error!(&env, SubscriptionError::SubscriptionNotFound);
        }).unwrap();

        let mut subscription = subscriptions.get(idx).unwrap();

        if subscription.subscriber != subscriber {
            panic_with_error!(&env, SubscriptionError::NotSubscriber);
        }
        if subscription.status == SubscriptionStatus::Paused {
            panic_with_error!(&env, SubscriptionStatus::AlreadyPaused);
        }
        if subscription.status == SubscriptionStatus::Cancelled {
            panic_with_error!(&env, SubscriptionError::AlreadyCancelled);
        }

        let now = env.ledger().timestamp();
        subscription.status = SubscriptionStatus::Paused;
        subscription.pause_start = now;
        subscriptions.set(idx, subscription.clone());
        env.storage().instance().set(&DataKey::Subscriptions, &subscriptions);

        env.events().publish(
            (Symbol::new(&env, "subscription_paused"), Symbol::new(&env, "v1")),
            SubscriptionPausedEvent {
                subscription_id: subscription_id.clone(),
                subscriber: subscriber.clone(),
                paused_at: now,
            },
        );
    }

    pub fn resume_subscription(env: Env, subscriber: Address, subscription_id: BytesN<32>) {
        subscriber.require_auth();

        let mut subscriptions: Vec<Subscription> = env.storage().instance().get(&DataKey::Subscriptions).unwrap();
        let idx = subscriptions.iter().position(|s| s.id == subscription_id).ok_or_else(|| {
            panic_with_error!(&env, SubscriptionError::SubscriptionNotFound);
        }).unwrap();

        let mut subscription = subscriptions.get(idx).unwrap();

        if subscription.subscriber != subscriber {
            panic_with_error!(&env, SubscriptionError::NotSubscriber);
        }
        if subscription.status != SubscriptionStatus::Paused {
            panic_with_error!(&env, SubscriptionError::NotPaused);
        }

        let now = env.ledger().timestamp();
        let pause_duration = now - subscription.pause_start;
        subscription.next_payment = (if subscription.last_payment > 0 { subscription.last_payment } else { subscription.created_at }) + subscription.frequency + pause_duration;
        subscription.status = SubscriptionStatus::Active;
        subscription.pause_start = 0;
        subscriptions.set(idx, subscription.clone());
        env.storage().instance().set(&DataKey::Subscriptions, &subscriptions);

        env.events().publish(
            (Symbol::new(&env, "subscription_resumed"), Symbol::new(&env, "v1")),
            SubscriptionResumedEvent {
                subscription_id: subscription_id.clone(),
                subscriber: subscriber.clone(),
                next_payment: subscription.next_payment,
            },
        );
    }

    pub fn get_plan(env: Env, plan_id: BytesN<32>) -> Option<SubscriptionPlan> {
        let plans: Vec<SubscriptionPlan> = env.storage().instance().get(&DataKey::SubscriptionPlans).unwrap();
        plans.iter().find(|p| p.id == plan_id).cloned()
    }

    pub fn get_subscription(env: Env, subscription_id: BytesN<32>) -> Option<Subscription> {
        let subscriptions: Vec<Subscription> = env.storage().instance().get(&DataKey::Subscriptions).unwrap();
        subscriptions.iter().find(|s| s.id == subscription_id).cloned()
    }

    pub fn get_subscriber_subscriptions(env: Env, subscriber: Address) -> Vec<Subscription> {
        let subscriptions: Vec<Subscription> = env.storage().instance().get(&DataKey::Subscriptions).unwrap();
        subscriptions.iter().filter(|s| s.subscriber == subscriber).collect()
    }

    pub fn get_merchant_subscriptions(env: Env, merchant: Address) -> Vec<Subscription> {
        let subscriptions: Vec<Subscription> = env.storage().instance().get(&DataKey::Subscriptions).unwrap();
        subscriptions.iter().filter(|s| s.merchant == merchant).collect()
    }

    fn calculate_prorated_refund(env: &Env, subscription: &Subscription, now: u64) -> i128 {
        if subscription.last_payment == 0 || subscription.status == SubscriptionStatus::Cancelled {
            return 0;
        }
        let elapsed = now - subscription.last_payment;
        if elapsed >= subscription.frequency {
            return 0;
        }
        let remaining = subscription.frequency - elapsed;
        (subscription.amount * remaining as i128) / subscription.frequency as i128
    }

    fn transfer_refund(env: &Env, subscription: &Subscription, amount: i128) {
        use soroban_sdk::token::Client as TokenClient;
        let token_client = TokenClient::new(env, &subscription.token);
        let contract_address = env.current_contract_address();
        token_client.transfer(&contract_address, &subscription.subscriber, &amount);
    }

    pub fn update_payment_info(
        env: Env,
        subscription_id: BytesN<32>,
        last_payment: u64,
        next_payment: u64,
        total_paid: i128,
    ) {
        let caller = env.current_contract_address();
        env.require_auth();

        let mut subscriptions: Vec<Subscription> = env.storage().instance().get(&DataKey::Subscriptions).unwrap();
        let idx = subscriptions.iter().position(|s| s.id == subscription_id).ok_or_else(|| {
            panic_with_error!(&env, SubscriptionError::SubscriptionNotFound);
        }).unwrap();

        let mut subscription = subscriptions.get(idx).unwrap();
        subscription.last_payment = last_payment;
        subscription.next_payment = next_payment;
        subscription.total_paid = total_paid;
        subscriptions.set(idx, subscription);
        env.storage().instance().set(&DataKey::Subscriptions, &subscriptions);
    }

    fn require_admin(env: &Env, address: &Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if *address != admin {
            panic_with_error!(env, SubscriptionError::Unauthorized);
        }
    }
}
