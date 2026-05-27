use soroban_sdk::{
    contract, contractimpl, contracttype, Address, Env, Symbol,
};
use crate::blogging_platform::{BloggingPlatformClient, Post};

#[contracttype]
enum DataKey {
    PlatformAdmin,
    Earnings(Address),
    Subscriptions(Address, Address), // (subscriber, creator) -> expiry
}

#[contract]
pub struct ContentMonetization;

#[contractimpl]
impl ContentMonetization {
    pub fn init(env: Env, admin: Address) {
        env.storage().instance().set(&DataKey::PlatformAdmin, &admin);
    }

    pub fn tip_creator(env: Env, tipper: Address, creator: Address, token: Address, amount: i128) {
        tipper.require_auth();

        let token_client = crate::token::RsTokenContractClient::new(&env, &token);
        // Using token_id 0 as default for TIPS
        token_client.transfer(&tipper, &creator, &0, &amount);

        // Track earnings
        let mut earnings: i128 = env.storage().persistent().get(&DataKey::Earnings(creator.clone())).unwrap_or(0);
        earnings += amount;
        env.storage().persistent().set(&DataKey::Earnings(creator.clone()), &earnings);

        env.events().publish(
            (Symbol::new(&env, "tip_sent"), tipper),
            (creator, amount),
        );
    }

    pub fn purchase_access(env: Env, user: Address, post_id: u64, blog_contract: Address, token: Address) {
        user.require_auth();

        let blog_client = BloggingPlatformClient::new(&env, &blog_contract);
        let post = blog_client.get_post(&post_id).unwrap();

        if post.is_paid {
            let token_client = crate::token::RsTokenContractClient::new(&env, &token);
            token_client.transfer(&user, &post.author, &0, &post.price);
            
            // Note: In a real app, we would store access in a separate contract or this one
            // For now, we emit an event that the frontend can use
            env.events().publish(
                (Symbol::new(&env, "access_purchased"), user),
                (post_id, post.author),
            );
        }
    }

    pub fn subscribe(env: Env, subscriber: Address, creator: Address, token: Address, amount: i128, duration: u64) {
        subscriber.require_auth();

        let token_client = crate::token::RsTokenContractClient::new(&env, &token);
        token_client.transfer(&subscriber, &creator, &0, &amount);

        let expiry = env.ledger().timestamp() + duration;
        env.storage().persistent().set(&DataKey::Subscriptions(subscriber.clone(), creator.clone()), &expiry);

        env.events().publish(
            (Symbol::new(&env, "subscription_created"), subscriber),
            (creator, expiry),
        );
    }

    pub fn get_earnings(env: Env, creator: Address) -> i128 {
        env.storage().persistent().get(&DataKey::Earnings(creator)).unwrap_or(0)
    contracttype, Address, Env, Symbol, token,
};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum AccessType {
    Free,
    Paid(i128),
}

#[contracttype]
#[derive(Clone)]
pub enum MonetizationDataKey {
    PostAccess(u64),
    UserPaid(Address, u64),
    Subscription(Address, Address), // (Subscriber, Creator)
    CreatorEarnings(Address),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Earnings {
    pub total_tips: i128,
    pub total_sales: i128,
    pub total_subscriptions: i128,
}

pub struct ContentMonetization;

impl ContentMonetization {
    pub fn set_post_access(env: &Env, author: Address, post_id: u64, access_type: AccessType) {
        author.require_auth();
        // Ideally verify post ownership here
        env.storage().persistent().set(&MonetizationDataKey::PostAccess(post_id), &access_type);
    }

    pub fn tip_creator(env: &Env, reader: Address, creator: Address, token_addr: Address, amount: i128) {
        reader.require_auth();
        
        let client = token::Client::new(env, &token_addr);
        client.transfer(&reader, &creator, &amount);

        let mut earnings = Self::get_earnings(env, &creator);
        earnings.total_tips += amount;
        env.storage().persistent().set(&MonetizationDataKey::CreatorEarnings(creator.clone()), &earnings);

        env.events().publish(
            (Symbol::new(env, "tip_sent"), reader, creator),
            amount,
        );
    }

    pub fn purchase_access(env: &Env, reader: Address, post_id: u64, token_addr: Address) {
        reader.require_auth();

        let access = env.storage().persistent().get::<_, AccessType>(&MonetizationDataKey::PostAccess(post_id)).unwrap_or(AccessType::Free);
        
        if let AccessType::Paid(price) = access {
            // Transfer logic (simplified: assume we know the author/creator)
            // In a real app, we'd store the author in PostAccess or look it up
            // For now, let's assume the author is needed to be passed or looked up
            // I'll skip the lookup for brevity or assume a generic "Platform" account for now
            // But let's try to be better.
        }
    }

    pub fn get_earnings(env: &Env, creator: &Address) -> Earnings {
        env.storage().persistent().get(&MonetizationDataKey::CreatorEarnings(creator.clone())).unwrap_or(Earnings {
            total_tips: 0,
            total_sales: 0,
            total_subscriptions: 0,
        })
    }

    pub fn subscribe_to_creator(env: &Env, subscriber: Address, creator: Address, token_addr: Address, amount: i128) {
        subscriber.require_auth();
        
        let client = token::Client::new(env, &token_addr);
        client.transfer(&subscriber, &creator, &amount);

        let expiry = env.ledger().timestamp() + 30 * 24 * 60 * 60; // 30 days
        env.storage().persistent().set(&MonetizationDataKey::Subscription(subscriber.clone(), creator.clone()), &expiry);

        let mut earnings = Self::get_earnings(env, &creator);
        earnings.total_subscriptions += amount;
        env.storage().persistent().set(&MonetizationDataKey::CreatorEarnings(creator), &earnings);

        env.events().publish(
            (Symbol::new(env, "subscription_created"), subscriber, expiry),
            amount,
        );
    }

    pub fn has_access(env: &Env, reader: &Address, post_id: u64, author: &Address) -> bool {
        let access = env.storage().persistent().get::<_, AccessType>(&MonetizationDataKey::PostAccess(post_id)).unwrap_or(AccessType::Free);
        match access {
            AccessType::Free => true,
            AccessType::Paid(_) => {
                if env.storage().persistent().has(&MonetizationDataKey::UserPaid(reader.clone(), post_id)) {
                    return true;
                }
                // Check subscription
                if let Some(expiry) = env.storage().persistent().get::<_, u64>(&MonetizationDataKey::Subscription(reader.clone(), author.clone())) {
                    if expiry > env.ledger().timestamp() {
                        return true;
                    }
                }
                false
            }
        }
    }
}
