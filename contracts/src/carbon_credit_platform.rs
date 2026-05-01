//! Decentralized Carbon Credit Platform with tokenization, verification, and trading
//!
//! This module implements a comprehensive carbon credit system that allows:
//! - Tokenization of carbon credits with metadata
//! - Verification by certified auditors
//! - Transparent trading marketplace
//! - Retirement tracking and certificate generation

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error,
    Address, Bytes, BytesN, Env, String, Symbol, Vec, Map, i128, u64
};

/// Carbon credit token representing 1 ton CO2e reduction
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CarbonCredit {
    /// Unique identifier for the credit
    pub token_id: u128,
    /// Project that generated this credit
    pub project_id: Symbol,
    /// Vintage year when the carbon was reduced
    pub vintage: u32,
    /// Standard used (Verra, Gold Standard, etc.)
    pub standard: Symbol,
    /// Amount of CO2e in tonnes (typically 1)
    pub amount: u64,
    /// Current owner of the credit
    pub owner: Address,
    /// Verification status
    pub verification_status: VerificationStatus,
    /// Whether the credit has been retired
    pub retired: bool,
    /// Retirement timestamp if retired
    pub retirement_timestamp: Option<u64>,
    /// Retirement reason
    pub retirement_reason: Option<String>,
    /// Metadata URI for additional info
    pub metadata_uri: String,
}

/// Verification status for carbon credits
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum VerificationStatus {
    Pending,
    Verified,
    Rejected,
    Expired,
}

/// Carbon project information
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CarbonProject {
    /// Unique project identifier
    pub project_id: Symbol,
    /// Project name
    pub name: String,
    /// Project developer
    pub developer: Address,
    /// Project type (forestry, renewable energy, etc.)
    pub project_type: Symbol,
    /// Location (country code)
    pub location: Symbol,
    /// Total project capacity in tonnes CO2e
    pub total_capacity: u64,
    /// Credits already issued
    pub credits_issued: u64,
    /// Project status
    pub status: ProjectStatus,
    /// Verification methodology
    pub methodology: Symbol,
    /// Project metadata URI
    pub metadata_uri: String,
}

/// Project status
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum ProjectStatus {
    Registered,
    InVerification,
    Verified,
    Active,
    Completed,
    Suspended,
}

/// Marketplace order for trading carbon credits
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MarketplaceOrder {
    /// Unique order identifier
    pub order_id: u128,
    /// Token being traded
    pub token_id: u128,
    /// Order creator
    pub seller: Address,
    /// Order type
    pub order_type: OrderType,
    /// Price per credit in base currency (smallest unit)
    pub price: i128,
    /// Amount of credits for sale
    pub amount: u64,
    /// Amount filled so far
    pub filled: u64,
    /// Order creation timestamp
    pub created_at: u64,
    /// Order expiry timestamp
    pub expires_at: u64,
    /// Whether order is active
    pub active: bool,
}

/// Order type
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum OrderType {
    Sell,
    Buy,
}

/// Retirement certificate
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RetirementCertificate {
    /// Unique certificate ID
    pub certificate_id: u128,
    /// Retired token IDs
    pub token_ids: Vec<u128>,
    /// Retirement beneficiary
    pub beneficiary: Address,
    /// Retirement reason
    pub reason: String,
    /// Total tonnes retired
    pub total_tonnes: u64,
    /// Retirement timestamp
    pub timestamp: u64,
    /// Certificate URI
    pub certificate_uri: String,
}

/// Storage keys
#[contracttype]
#[derive(Clone)]
enum DataKey {
    /// Next token ID
    NextTokenId,
    /// Next project ID
    NextProjectId,
    /// Next order ID
    NextOrderId,
    /// Next certificate ID
    NextCertificateId,
    /// Token storage (token_id -> CarbonCredit)
    Token(u128),
    /// Project storage (project_id -> CarbonProject)
    Project(Symbol),
    /// Order storage (order_id -> MarketplaceOrder)
    Order(u128),
    /// Certificate storage (certificate_id -> RetirementCertificate)
    Certificate(u128),
    /// User's carbon credits (address -> Vec<token_id>)
    UserCredits(Address),
    /// User's orders (address -> Vec<order_id>)
    UserOrders(Address),
    /// User's retirement certificates (address -> Vec<certificate_id>)
    UserCertificates(Address),
    /// Platform configuration
    Config,
    /// Trading fee percentage (basis points, 10000 = 100%)
    TradingFeeBps,
    /// Verifier registry (address -> bool)
    Verifier(Address),
}

/// Contract errors
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum CarbonError {
    NotInitialized = 100,
    Unauthorized = 101,
    InvalidTokenId = 102,
    TokenNotFound = 103,
    TokenAlreadyRetired = 104,
    InvalidProjectId = 105,
    ProjectNotFound = 106,
    InvalidOrderId = 107,
    OrderNotFound = 108,
    OrderNotActive = 109,
    InsufficientBalance = 110,
    InvalidAmount = 111,
    InvalidPrice = 112,
    OrderExpired = 113,
    OrderFullyFilled = 114,
    InvalidVerifier = 115,
    VerificationFailed = 116,
    AlreadyVerified = 117,
    InvalidStandard = 118,
    InvalidVintage = 119,
    ProjectCapacityExceeded = 120,
    InvalidProjectStatus = 121,
    InsufficientAllowance = 122,
    TransferFailed = 123,
    InvalidCertificate = 124,
    CertificateNotFound = 125,
    StringTooLong = 126,
    InvalidAddress = 127,
}

/// Platform configuration
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PlatformConfig {
    /// Platform admin
    pub admin: Address,
    /// Default trading fee in basis points (100 = 1%)
    pub default_trading_fee_bps: u32,
    /// Maximum trading fee in basis points (500 = 5%)
    pub max_trading_fee_bps: u32,
    /// Minimum order duration in seconds
    pub min_order_duration: u64,
    /// Maximum order duration in seconds (30 days)
    pub max_order_duration: u64,
}

/// Constants
const DEFAULT_TRADING_FEE_BPS: u32 = 100; // 1%
const MAX_TRADING_FEE_BPS: u32 = 500; // 5%
const MIN_ORDER_DURATION: u64 = 3600; // 1 hour
const MAX_ORDER_DURATION: u64 = 2_592_000; // 30 days
const MAX_STRING_LENGTH: u32 = 256;
const CREDIT_TTL_LEDGERS: u32 = 6_307_200; // ~1 year

#[contract]
pub struct CarbonCreditPlatform;

#[contractimpl]
impl CarbonCreditPlatform {
    /// Initialize the carbon credit platform
    pub fn init(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Config) {
            panic_with_error!(&env, CarbonError::NotInitialized);
        }

        let config = PlatformConfig {
            admin: admin.clone(),
            default_trading_fee_bps: DEFAULT_TRADING_FEE_BPS,
            max_trading_fee_bps: MAX_TRADING_FEE_BPS,
            min_order_duration: MIN_ORDER_DURATION,
            max_order_duration: MAX_ORDER_DURATION,
        };

        env.storage().instance().set(&DataKey::Config, &config);
        env.storage().instance().set(&DataKey::TradingFeeBps, &DEFAULT_TRADING_FEE_BPS);
        env.storage().instance().set(&DataKey::NextTokenId, &1u128);
        env.storage().instance().set(&DataKey::NextProjectId, &1u128);
        env.storage().instance().set(&DataKey::NextOrderId, &1u128);
        env.storage().instance().set(&DataKey::NextCertificateId, &1u128);

        // Register admin as verifier
        env.storage().instance().set(&DataKey::Verifier(admin.clone()), &true);
    }

    /// Register a new carbon project
    pub fn register_project(
        env: Env,
        caller: Address,
        name: String,
        project_type: Symbol,
        location: Symbol,
        total_capacity: u64,
        methodology: Symbol,
        metadata_uri: String,
    ) -> Symbol {
        caller.require_auth();

        Self::validate_string_length(&env, &name)?;
        Self::validate_string_length(&env, &metadata_uri)?;

        if total_capacity == 0 {
            panic_with_error!(&env, CarbonError::InvalidAmount);
        }

        let config = Self::get_config(&env);
        if caller != config.admin {
            panic_with_error!(&env, CarbonError::Unauthorized);
        }

        let project_id = Self::generate_project_id(&env);

        let project = CarbonProject {
            project_id: project_id.clone(),
            name,
            developer: caller,
            project_type,
            location,
            total_capacity,
            credits_issued: 0,
            status: ProjectStatus::Registered,
            methodology,
            metadata_uri,
        };

        env.storage().instance().set(&DataKey::Project(project_id.clone()), &project);

        // Emit project registration event
        env.events().publish(
            (Symbol::new(&env, "carbon_project_registered"),),
            (project_id.clone(), caller),
        );

        project_id
    }

    /// Mint carbon credits for a verified project
    pub fn mint_credits(
        env: Env,
        caller: Address,
        project_id: Symbol,
        amount: u64,
        vintage: u32,
        standard: Symbol,
        metadata_uri: String,
    ) -> Vec<u128> {
        caller.require_auth();

        Self::validate_string_length(&env, &metadata_uri)?;

        if amount == 0 {
            panic_with_error!(&env, CarbonError::InvalidAmount);
        }

        if vintage == 0 || vintage > 2100 {
            panic_with_error!(&env, CarbonError::InvalidVintage);
        }

        let mut project: CarbonProject = env.storage().instance()
            .get(&DataKey::Project(project_id.clone()))
            .unwrap_or_else(|| panic_with_error!(&env, CarbonError::ProjectNotFound));

        if project.developer != caller {
            panic_with_error!(&env, CarbonError::Unauthorized);
        }

        if project.status != ProjectStatus::Verified && project.status != ProjectStatus::Active {
            panic_with_error!(&env, CarbonError::InvalidProjectStatus);
        }

        if project.credits_issued.saturating_add(amount) > project.total_capacity {
            panic_with_error!(&env, CarbonError::ProjectCapacityExceeded);
        }

        let mut token_ids = Vec::new(&env);

        for _ in 0..amount {
            let token_id = Self::generate_token_id(&env);

            let credit = CarbonCredit {
                token_id,
                project_id: project_id.clone(),
                vintage,
                standard,
                amount: 1, // Each token represents 1 tonne
                owner: caller.clone(),
                verification_status: VerificationStatus::Verified,
                retired: false,
                retirement_timestamp: None,
                retirement_reason: None,
                metadata_uri: metadata_uri.clone(),
            };

            env.storage().persistent().set(&DataKey::Token(token_id), &credit);
            env.storage().persistent().extend_ttl(&DataKey::Token(token_id), CREDIT_TTL_LEDGERS, CREDIT_TTL_LEDGERS);

            Self::add_user_credit(&env, &caller, token_id);
            token_ids.push_back(token_id);
        }

        // Update project issued credits
        project.credits_issued = project.credits_issued.saturating_add(amount);
        env.storage().instance().set(&DataKey::Project(project_id.clone()), &project);

        // Emit minting event
        env.events().publish(
            (Symbol::new(&env, "carbon_credits_minted"),),
            (project_id.clone(), caller, amount, token_ids.len()),
        );

        token_ids
    }

    /// Create a sell order on the marketplace
    pub fn create_sell_order(
        env: Env,
        caller: Address,
        token_id: u128,
        price: I128,
        duration: u64,
    ) -> u128 {
        caller.require_auth();

        if price <= 0 {
            panic_with_error!(&env, CarbonError::InvalidPrice);
        }

        let config = Self::get_config(&env);
        if duration < config.min_order_duration || duration > config.max_order_duration {
            panic_with_error!(&env, CarbonError::InvalidAmount);
        }

        let mut credit: CarbonCredit = env.storage().persistent()
            .get(&DataKey::Token(token_id))
            .unwrap_or_else(|| panic_with_error!(&env, CarbonError::TokenNotFound));

        if credit.owner != caller {
            panic_with_error!(&env, CarbonError::Unauthorized);
        }

        if credit.retired {
            panic_with_error!(&env, CarbonError::TokenAlreadyRetired);
        }

        let order_id = Self::generate_order_id(&env);
        let current_time = env.ledger().timestamp();

        let order = MarketplaceOrder {
            order_id,
            token_id,
            seller: caller.clone(),
            order_type: OrderType::Sell,
            price,
            amount: 1, // One credit per order for simplicity
            filled: 0,
            created_at: current_time,
            expires_at: current_time.saturating_add(duration),
            active: true,
        };

        env.storage().instance().set(&DataKey::Order(order_id), &order);
        Self::add_user_order(&env, &caller, order_id);

        // Emit order creation event
        env.events().publish(
            (Symbol::new(&env, "sell_order_created"),),
            (order_id, caller, token_id, price),
        );

        order_id
    }

    /// Execute a trade by filling a sell order
    pub fn execute_trade(
        env: Env,
        caller: Address,
        order_id: u128,
    ) {
        caller.require_auth();

        let mut order: MarketplaceOrder = env.storage().instance()
            .get(&DataKey::Order(order_id))
            .unwrap_or_else(|| panic_with_error!(&env, CarbonError::OrderNotFound));

        if !order.active {
            panic_with_error!(&env, CarbonError::OrderNotActive);
        }

        if env.ledger().timestamp() > order.expires_at {
            panic_with_error!(&env, CarbonError::OrderExpired);
        }

        if order.filled >= order.amount {
            panic_with_error!(&env, CarbonError::OrderFullyFilled);
        }

        let mut credit: CarbonCredit = env.storage().persistent()
            .get(&DataKey::Token(order.token_id))
            .unwrap_or_else(|| panic_with_error!(&env, CarbonError::TokenNotFound));

        if credit.owner != order.seller {
            panic_with_error!(&env, CarbonError::Unauthorized);
        }

        if credit.retired {
            panic_with_error!(&env, CarbonError::TokenAlreadyRetired);
        }

        // Calculate trading fee
        let trading_fee_bps: u32 = env.storage().instance()
            .get(&DataKey::TradingFeeBps)
            .unwrap_or(DEFAULT_TRADING_FEE_BPS);

        let trading_fee = order.price * trading_fee_bps / 10000;
        let net_price = order.price - trading_fee;

        // For simplicity, we'll assume payment is handled externally
        // In a real implementation, you'd integrate with a token contract

        // Transfer ownership
        let previous_owner = credit.owner.clone();
        credit.owner = caller.clone();

        // Update order
        order.filled = order.amount; // Order fully filled
        order.active = false;

        // Update storage
        env.storage().persistent().set(&DataKey::Token(order.token_id), &credit);
        env.storage().instance().set(&DataKey::Order(order_id), &order);

        // Update user credit lists
        Self::remove_user_credit(&env, &previous_owner, order.token_id);
        Self::add_user_credit(&env, &caller, order.token_id);

        // Emit trade execution event
        env.events().publish(
            (Symbol::new(&env, "trade_executed"),),
            (order_id, previous_owner, caller, order.token_id, order.price, trading_fee),
        );
    }

    /// Retire carbon credits (permanent removal from circulation)
    pub fn retire_credits(
        env: Env,
        caller: Address,
        token_ids: Vec<u128>,
        reason: String,
    ) -> u128 {
        caller.require_auth();

        Self::validate_string_length(&env, &reason)?;

        if token_ids.is_empty() {
            panic_with_error!(&env, CarbonError::InvalidAmount);
        }

        let current_time = env.ledger().timestamp();
        let mut total_tonnes = 0u64;
        let mut retired_tokens = Vec::new(&env);

        // Verify and retire each token
        for token_id in token_ids.iter() {
            let mut credit: CarbonCredit = env.storage().persistent()
                .get(&DataKey::Token(*token_id))
                .unwrap_or_else(|| panic_with_error!(&env, CarbonError::TokenNotFound));

            if credit.owner != caller {
                panic_with_error!(&env, CarbonError::Unauthorized);
            }

            if credit.retired {
                panic_with_error!(&env, CarbonError::TokenAlreadyRetired);
            }

            // Mark as retired
            credit.retired = true;
            credit.retirement_timestamp = Some(current_time);
            credit.retirement_reason = Some(reason.clone());

            env.storage().persistent().set(&DataKey::Token(*token_id), &credit);

            total_tonnes = total_tonnes.saturating_add(credit.amount);
            retired_tokens.push_back(*token_id);

            // Remove from user's active credits
            Self::remove_user_credit(&env, &caller, *token_id);
        }

        // Generate retirement certificate
        let certificate_id = Self::generate_certificate_id(&env);
        let certificate = RetirementCertificate {
            certificate_id,
            token_ids: retired_tokens.clone(),
            beneficiary: caller.clone(),
            reason: reason.clone(),
            total_tonnes,
            timestamp: current_time,
            certificate_uri: String::from_str_slice(&env, &format!("https://api.carbon-credits.io/certificates/{}", certificate_id)),
        };

        env.storage().instance().set(&DataKey::Certificate(certificate_id), &certificate);
        Self::add_user_certificate(&env, &caller, certificate_id);

        // Emit retirement event
        env.events().publish(
            (Symbol::new(&env, "credits_retired"),),
            (caller, retired_tokens.len(), total_tonnes, certificate_id),
        );

        certificate_id
    }

    /// Get carbon credit details
    pub fn get_credit(env: Env, token_id: u128) -> CarbonCredit {
        env.storage().persistent()
            .get(&DataKey::Token(token_id))
            .unwrap_or_else(|| panic_with_error!(&env, CarbonError::TokenNotFound))
    }

    /// Get project details
    pub fn get_project(env: Env, project_id: Symbol) -> CarbonProject {
        env.storage().instance()
            .get(&DataKey::Project(project_id))
            .unwrap_or_else(|| panic_with_error!(&env, CarbonError::ProjectNotFound))
    }

    /// Get order details
    pub fn get_order(env: Env, order_id: u128) -> MarketplaceOrder {
        env.storage().instance()
            .get(&DataKey::Order(order_id))
            .unwrap_or_else(|| panic_with_error!(&env, CarbonError::OrderNotFound))
    }

    /// Get retirement certificate
    pub fn get_certificate(env: Env, certificate_id: u128) -> RetirementCertificate {
        env.storage().instance()
            .get(&DataKey::Certificate(certificate_id))
            .unwrap_or_else(|| panic_with_error!(&env, CarbonError::CertificateNotFound))
    }

    /// Get all credits owned by a user
    pub fn get_user_credits(env: Env, user: Address) -> Vec<u128> {
        env.storage().instance()
            .get(&DataKey::UserCredits(user))
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Get all orders created by a user
    pub fn get_user_orders(env: Env, user: Address) -> Vec<u128> {
        env.storage().instance()
            .get(&DataKey::UserOrders(user))
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Get all retirement certificates for a user
    pub fn get_user_certificates(env: Env, user: Address) -> Vec<u128> {
        env.storage().instance()
            .get(&DataKey::UserCertificates(user))
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Get platform configuration
    pub fn get_config(env: &Env) -> PlatformConfig {
        env.storage().instance()
            .get(&DataKey::Config)
            .unwrap_or_else(|| panic_with_error!(env, CarbonError::NotInitialized))
    }

    /// Helper function to generate next token ID
    fn generate_token_id(env: &Env) -> u128 {
        let id: u128 = env.storage().instance()
            .get(&DataKey::NextTokenId)
            .unwrap_or(1);
        env.storage().instance().set(&DataKey::NextTokenId, &(id + 1));
        id
    }

    /// Helper function to generate next project ID
    fn generate_project_id(env: &Env) -> Symbol {
        let id: u128 = env.storage().instance()
            .get(&DataKey::NextProjectId)
            .unwrap_or(1);
        env.storage().instance().set(&DataKey::NextProjectId, &(id + 1));
        let id_str = format!("PROJ_{}", id);
        Symbol::new(env, &id_str)
    }

    /// Helper function to generate next order ID
    fn generate_order_id(env: &Env) -> u128 {
        let id: u128 = env.storage().instance()
            .get(&DataKey::NextOrderId)
            .unwrap_or(1);
        env.storage().instance().set(&DataKey::NextOrderId, &(id + 1));
        id
    }

    /// Helper function to generate next certificate ID
    fn generate_certificate_id(env: &Env) -> u128 {
        let id: u128 = env.storage().instance()
            .get(&DataKey::NextCertificateId)
            .unwrap_or(1);
        env.storage().instance().set(&DataKey::NextCertificateId, &(id + 1));
        id
    }

    /// Helper function to add credit to user's list
    fn add_user_credit(env: &Env, user: &Address, token_id: u128) {
        let mut credits: Vec<u128> = env.storage().instance()
            .get(&DataKey::UserCredits(user.clone()))
            .unwrap_or_else(|| Vec::new(env));

        credits.push_back(token_id);
        env.storage().instance().set(&DataKey::UserCredits(user.clone()), &credits);
    }

    /// Helper function to remove credit from user's list
    fn remove_user_credit(env: &Env, user: &Address, token_id: u128) {
        let mut credits: Vec<u128> = env.storage().instance()
            .get(&DataKey::UserCredits(user.clone()))
            .unwrap_or_else(|| Vec::new(env));

        let mut found = false;
        for i in 0..credits.len() {
            if credits.get(i).unwrap() == token_id {
                credits.remove(i);
                found = true;
                break;
            }
        }

        if found {
            env.storage().instance().set(&DataKey::UserCredits(user.clone()), &credits);
        }
    }

    /// Helper function to add order to user's list
    fn add_user_order(env: &Env, user: &Address, order_id: u128) {
        let mut orders: Vec<u128> = env.storage().instance()
            .get(&DataKey::UserOrders(user.clone()))
            .unwrap_or_else(|| Vec::new(env));

        orders.push_back(order_id);
        env.storage().instance().set(&DataKey::UserOrders(user.clone()), &orders);
    }

    /// Helper function to add certificate to user's list
    fn add_user_certificate(env: &Env, user: &Address, certificate_id: u128) {
        let mut certificates: Vec<u128> = env.storage().instance()
            .get(&DataKey::UserCertificates(user.clone()))
            .unwrap_or_else(|| Vec::new(env));

        certificates.push_back(certificate_id);
        env.storage().instance().set(&DataKey::UserCertificates(user.clone()), &certificates);
    }

    /// Helper function to validate string length
    fn validate_string_length(env: &Env, string: &String) -> Result<(), CarbonError> {
        if string.len() > MAX_STRING_LENGTH as usize {
            panic_with_error!(env, CarbonError::StringTooLong);
        }
        Ok(())
    }
}
