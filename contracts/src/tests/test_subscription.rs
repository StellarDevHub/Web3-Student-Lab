#![cfg(test)]

use super::subscription_service::{
    SubscriptionService, SubscriptionServiceClient, SubscriptionError,
    DataKey, SubscriptionStatus, SubscriptionPlan,
};
use soroban_sdk::{
    testutils::Address as _, Address, Env, BytesN, String, Vec,
};

fn setup() -> (Env, Address, Address, Address, SubscriptionServiceClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    
    let admin = Address::generate(&env);
    let merchant = Address::generate(&env);
    let subscriber = Address::generate(&env);
    
    let contract_id = env.register(SubscriptionService, ());
    let client = SubscriptionServiceClient::new(&env, &contract_id);
    
    client.init(&admin);
    
    (env, merchant, subscriber, admin, client)
}

fn create_test_plan(
    env: &Env,
    client: &SubscriptionServiceClient,
    merchant: &Address,
) -> BytesN<32> {
    client.create_plan(
        merchant,
        &String::from_str(env, "Test Plan"),
        &String::from_str(env, "A test subscription plan"),
        &10000000,
        &2592000,
        &Address::generate(env),
    )
}

#[test]
fn test_init() {
    let (env, _, _, _, client) = setup();
    let plans: Vec<SubscriptionPlan> = env.storage().instance().get(&DataKey::SubscriptionPlans).unwrap();
    assert_eq!(plans.len(), 0);
}

#[test]
fn test_create_plan() {
    let (env, merchant, _, _, client) = setup();
    
    let plan_id = create_test_plan(&env, &client, &merchant);
    
    let plan = client.get_plan(&plan_id).unwrap();
    assert_eq!(plan.name, String::from_str(&env, "Test Plan"));
    assert_eq!(plan.amount, 10000000);
    assert!(plan.active);
}

#[test]
fn test_subscribe() {
    let (env, merchant, subscriber, _, client) = setup();
    
    let plan_id = create_test_plan(&env, &client, &merchant);
    let subscription_id = client.subscribe(&subscriber, &plan_id);
    
    let subscription = client.get_subscription(&subscription_id).unwrap();
    assert_eq!(subscription.subscriber, subscriber);
    assert_eq!(subscription.status, SubscriptionStatus::Active);
}

#[test]
fn test_cancel_subscription() {
    let (env, merchant, subscriber, _, client) = setup();
    
    let plan_id = create_test_plan(&env, &client, &merchant);
    let subscription_id = client.subscribe(&subscriber, &plan_id);
    
    let refund = client.cancel_subscription(&subscriber, &subscription_id);
    
    let subscription = client.get_subscription(&subscription_id).unwrap();
    assert_eq!(subscription.status, SubscriptionStatus::Cancelled);
}

#[test]
fn test_pause_and_resume() {
    let (env, merchant, subscriber, _, client) = setup();
    
    let plan_id = create_test_plan(&env, &client, &merchant);
    let subscription_id = client.subscribe(&subscriber, &plan_id);
    
    client.pause_subscription(&subscriber, &subscription_id);
    let subscription = client.get_subscription(&subscription_id).unwrap();
    assert_eq!(subscription.status, SubscriptionStatus::Paused);
    
    client.resume_subscription(&subscriber, &subscription_id);
    let subscription = client.get_subscription(&subscription_id).unwrap();
    assert_eq!(subscription.status, SubscriptionStatus::Active);
}

#[test]
fn test_get_subscriber_subscriptions() {
    let (env, merchant, subscriber, _, client) = setup();
    
    let plan_id = create_test_plan(&env, &client, &merchant);
    client.subscribe(&subscriber, &plan_id);
    
    let subscriptions = client.get_subscriber_subscriptions(&subscriber);
    assert_eq!(subscriptions.len(), 1);
}

#[test]
fn test_unauthorized_cancel() {
    let (env, merchant, subscriber, _, client) = setup();
    
    let plan_id = create_test_plan(&env, &client, &merchant);
    let subscription_id = client.subscribe(&subscriber, &plan_id);
    
    let unauthorized = Address::generate(&env);
    
    let result = std::panic::catch_unwind(|| {
        client.cancel_subscription(&unauthorized, &subscription_id);
    });
    
    assert!(result.is_err());
}
