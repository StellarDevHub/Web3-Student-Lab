use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Env, Vec,
};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ResaleListing {
    pub ticket_id: u32,
    pub seller: Address,
    pub price: i128,
}

#[contracttype]
#[derive(Clone)]
pub enum ScalpingDataKey {
    Admin,
    VerifiedIdentity(Address),
    PurchaseCount(Address, u32), // User -> EventID -> Count
    PurchaseLimit(u32),          // EventID -> Limit
    MaxMarkupPercentage,
    ResaleListing(u32),          // TicketID -> ResaleListing
    ResaleHistory(u32),          // TicketID -> Vec<i128> (Prices)
    OrganizerRoyaltyPercentage,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum ScalpingError {
    IdentityNotVerified = 1,
    PurchaseLimitExceeded = 2,
    PriceAboveCeiling = 3,
    NotAuthorized = 4,
    ListingNotFound = 5,
}

#[contract]
pub struct AntiScalpingContract;

#[contractimpl]
impl AntiScalpingContract {
    pub fn init(env: Env, admin: Address) {
        admin.require_auth();
        env.storage().instance().set(&ScalpingDataKey::Admin, &admin);
        env.storage().instance().set(&ScalpingDataKey::MaxMarkupPercentage, &15u32); // Max 15% markup
        env.storage().instance().set(&ScalpingDataKey::OrganizerRoyaltyPercentage, &5u32); // 5% royalty
    }

    pub fn verify_identity(env: Env, admin: Address, user: Address) {
        admin.require_auth();
        // check admin
        env.storage().instance().set(&ScalpingDataKey::VerifiedIdentity(user), &true);
    }

    pub fn set_purchase_limit(env: Env, admin: Address, event_id: u32, limit: u32) {
        admin.require_auth();
        env.storage().instance().set(&ScalpingDataKey::PurchaseLimit(event_id), &limit);
    }

    pub fn list_for_resale(
        env: Env,
        seller: Address,
        ticket_id: u32,
        face_value: i128,
        price: i128,
    ) {
        seller.require_auth();

        let max_markup: u32 = env.storage().instance().get(&ScalpingDataKey::MaxMarkupPercentage).unwrap_or(0);
        let max_allowed_price = face_value + (face_value * (max_markup as i128) / 100);

        if price > max_allowed_price {
            panic_with_error!(&env, ScalpingError::PriceAboveCeiling);
        }

        let listing = ResaleListing {
            ticket_id,
            seller: seller.clone(),
            price,
        };

        env.storage().instance().set(&ScalpingDataKey::ResaleListing(ticket_id), &listing);
        env.events().publish(("Listed", "ticket_id"), (ticket_id, seller, price));
    }

    pub fn buy_resale_ticket(
        env: Env,
        buyer: Address,
        ticket_id: u32,
        event_id: u32,
    ) {
        buyer.require_auth();

        // 1. Check Identity
        let is_verified: bool = env.storage().instance().get(&ScalpingDataKey::VerifiedIdentity(buyer.clone())).unwrap_or(false);
        if !is_verified {
            panic_with_error!(&env, ScalpingError::IdentityNotVerified);
        }

        // 2. Check Purchase Limits
        let limit: u32 = env.storage().instance().get(&ScalpingDataKey::PurchaseLimit(event_id)).unwrap_or(4); // Default 4
        let current_purchases: u32 = env.storage().instance().get(&ScalpingDataKey::PurchaseCount(buyer.clone(), event_id)).unwrap_or(0);
        if current_purchases >= limit {
            panic_with_error!(&env, ScalpingError::PurchaseLimitExceeded);
        }

        // 3. Process Listing
        let listing: ResaleListing = env
            .storage()
            .instance()
            .get(&ScalpingDataKey::ResaleListing(ticket_id))
            .unwrap_or_else(|| panic_with_error!(&env, ScalpingError::ListingNotFound));

        // Note: Actual token transfer logic for payment and royalty would go here.
        // e.g. buyer pays `listing.price`, royalty goes to organizer, rest to `listing.seller`.

        // 4. Update History & Limits
        env.storage().instance().set(&ScalpingDataKey::PurchaseCount(buyer.clone(), event_id), &(current_purchases + 1));
        
        let mut history: Vec<i128> = env.storage().instance().get(&ScalpingDataKey::ResaleHistory(ticket_id)).unwrap_or(Vec::new(&env));
        history.push_back(listing.price);
        env.storage().instance().set(&ScalpingDataKey::ResaleHistory(ticket_id), &history);

        // Remove listing
        env.storage().instance().remove(&ScalpingDataKey::ResaleListing(ticket_id));

        env.events().publish(("Resold", "ticket_id"), (ticket_id, listing.seller, buyer, listing.price));
    }
}
