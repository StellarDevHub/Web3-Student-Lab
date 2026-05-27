use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, Map, Symbol, Vec};

const KEY_RATE: Symbol = Symbol::new("rate");
const KEY_LIMITS: Symbol = Symbol::new("limits");
const KEY_HISTORY: Symbol = Symbol::new("conv_hist");

#[contracttype]
#[derive(Clone, Debug)]
pub struct ConversionRate {
    pub points_per_token: i128,
    pub min_conversion: i128,
    pub max_per_user: i128,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct ConversionRecord {
    pub user: Address,
    pub points: i128,
    pub tokens: i128,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct PointsConvertedEvent {
    pub user: Address,
    pub points_burned: i128,
    pub tokens_minted: i128,
    pub timestamp: u64,
}

#[contract]
pub struct PointsConversion;

#[contractimpl]
impl PointsConversion {
    pub fn initialize(env: Env, points_per_token: i128, min_conversion: i128, max_per_user: i128) {
        env.storage().instance().set(&KEY_RATE, &ConversionRate { points_per_token, min_conversion, max_per_user });
        env.storage().instance().set(&KEY_LIMITS, &Map::<Address, i128>::new(&env));
        env.storage().instance().set(&KEY_HISTORY, &Vec::<ConversionRecord>::new(&env));
    }

    /// Convert points to tokens
    pub fn convert_points(env: Env, user: Address, points: i128, token: Address) -> i128 {
        user.require_auth();
        let rate: ConversionRate = env.storage().instance().get(&KEY_RATE).unwrap();
        if points < rate.min_conversion { panic!("Below minimum conversion"); }

        let mut limits: Map<Address, i128> = env.storage().instance().get(&KEY_LIMITS).unwrap();
        let converted = limits.get(user.clone()).unwrap_or(0);
        if converted + points > rate.max_per_user { panic!("Exceeds max conversion limit"); }

        let tokens = points / rate.points_per_token;
        if tokens == 0 { panic!("Points too low for conversion"); }

        limits.set(user.clone(), converted + points);
        env.storage().instance().set(&KEY_LIMITS, &limits);

        let mut history: Vec<ConversionRecord> = env.storage().instance().get(&KEY_HISTORY).unwrap();
        history.push_back(ConversionRecord { user: user.clone(), points, tokens, timestamp: env.ledger().timestamp() });
        env.storage().instance().set(&KEY_HISTORY, &history);

        // Mint tokens to user
        let token_client = soroban_sdk::token::Client::new(&env, &token);
        token_client.transfer(&env.current_contract_address(), &user, &tokens);

        env.events().publish((Symbol::new(&env, "points_converted"),), PointsConvertedEvent { user, points_burned: points, tokens_minted: tokens, timestamp: env.ledger().timestamp() });
        tokens
    }

    /// Update conversion rate
    pub fn update_rate(env: Env, points_per_token: i128, min_conversion: i128, max_per_user: i128) {
        let old: ConversionRate = env.storage().instance().get(&KEY_RATE).unwrap();
        env.storage().instance().set(&KEY_RATE, &ConversionRate { points_per_token, min_conversion, max_per_user });
    }

    pub fn get_rate(env: Env) -> ConversionRate { env.storage().instance().get(&KEY_RATE).unwrap() }
    pub fn get_user_converted(env: Env, user: Address) -> i128 {
        let limits: Map<Address, i128> = env.storage().instance().get(&KEY_LIMITS).unwrap();
        limits.get(user).unwrap_or(0)
//! Points-to-token conversion with configurable rate, limits, and history.
#![allow(dead_code)]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, Vec};

/// Default: 100 points = 1 token (stored as micro-tokens, 7 decimals)
pub const DEFAULT_RATE_POINTS_PER_TOKEN: u64 = 100;
/// Max tokens a user can convert per call
pub const MAX_CONVERT_PER_CALL: u64 = 1_000;
/// Daily conversion cap in tokens (per user)
pub const DAILY_TOKEN_CAP: u64 = 5_000;
/// Ledgers per day (~5s/ledger)
pub const LEDGERS_PER_DAY: u64 = 17_280;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ConversionConfig {
    pub points_per_token: u64,
    pub max_per_call: u64,
    pub daily_cap: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ConversionRecord {
    pub user: Address,
    pub points_spent: u64,
    pub tokens_minted: u64,
    pub ledger: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DailyUsage {
    pub tokens_converted: u64,
    pub window_start: u64,
}

#[contracttype]
#[derive(Clone)]
pub enum ConversionKey {
    Admin,
    RewardContract,
    Config,
    History(Address),
    DailyUsage(Address),
}

#[contract]
pub struct PointsConversionContract;

#[contractimpl]
impl PointsConversionContract {
    /// Initialize with admin and the reward_points contract address.
    pub fn initialize(env: Env, admin: Address, reward_contract: Address) {
        if env.storage().instance().has(&ConversionKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&ConversionKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&ConversionKey::RewardContract, &reward_contract);
        env.storage().instance().set(
            &ConversionKey::Config,
            &ConversionConfig {
                points_per_token: DEFAULT_RATE_POINTS_PER_TOKEN,
                max_per_call: MAX_CONVERT_PER_CALL,
                daily_cap: DAILY_TOKEN_CAP,
            },
        );
    }

    /// Update conversion config. Only admin.
    pub fn set_config(env: Env, config: ConversionConfig) {
        Self::require_admin(&env);
        assert!(config.points_per_token > 0, "rate must be > 0");
        env.storage()
            .instance()
            .set(&ConversionKey::Config, &config);
    }

    /// Convert `token_amount` tokens worth of points into tokens.
    /// Caller must have sufficient points in the reward contract.
    pub fn convert(env: Env, user: Address, token_amount: u64) {
        user.require_auth();

        let config: ConversionConfig = env
            .storage()
            .instance()
            .get(&ConversionKey::Config)
            .expect("not initialized");

        assert!(token_amount > 0, "amount must be > 0");
        assert!(token_amount <= config.max_per_call, "exceeds per-call limit");

        // Enforce daily cap
        let current_ledger = env.ledger().sequence() as u64;
        let mut usage = Self::get_daily_usage(&env, &user, current_ledger);
        assert!(
            usage.tokens_converted + token_amount <= config.daily_cap,
            "daily cap exceeded"
        );
        usage.tokens_converted += token_amount;

        let points_needed = token_amount
            .checked_mul(config.points_per_token)
            .expect("overflow");

        // Deduct points via cross-contract call
        let reward_contract: Address = env
            .storage()
            .instance()
            .get(&ConversionKey::RewardContract)
            .expect("not initialized");

        // Call deduct_points on the reward contract (admin-gated there, so this contract is admin)
        let client = crate::reward_points::RewardPointsContractClient::new(&env, &reward_contract);
        client.deduct_points(&user, &points_needed);

        // Record conversion
        let record = ConversionRecord {
            user: user.clone(),
            points_spent: points_needed,
            tokens_minted: token_amount,
            ledger: current_ledger,
        };
        let mut hist: Vec<ConversionRecord> = env
            .storage()
            .persistent()
            .get(&ConversionKey::History(user.clone()))
            .unwrap_or(Vec::new(&env));
        hist.push_back(record);

        env.storage()
            .persistent()
            .set(&ConversionKey::History(user.clone()), &hist);
        env.storage()
            .persistent()
            .set(&ConversionKey::DailyUsage(user.clone()), &usage);

        env.events().publish(
            (soroban_sdk::symbol_short!("converted"), user),
            (points_needed, token_amount),
        );
    }

    // ── Views ──────────────────────────────────────────────────────────────

    pub fn config(env: Env) -> ConversionConfig {
        env.storage()
            .instance()
            .get(&ConversionKey::Config)
            .expect("not initialized")
    }

    pub fn history(env: Env, user: Address) -> Vec<ConversionRecord> {
        env.storage()
            .persistent()
            .get(&ConversionKey::History(user))
            .unwrap_or(Vec::new(&env))
    }

    pub fn daily_remaining(env: Env, user: Address) -> u64 {
        let config: ConversionConfig = env
            .storage()
            .instance()
            .get(&ConversionKey::Config)
            .expect("not initialized");
        let current_ledger = env.ledger().sequence() as u64;
        let usage = Self::get_daily_usage(&env, &user, current_ledger);
        config.daily_cap.saturating_sub(usage.tokens_converted)
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    fn require_admin(env: &Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&ConversionKey::Admin)
            .expect("not initialized");
        admin.require_auth();
    }

    fn get_daily_usage(env: &Env, user: &Address, current_ledger: u64) -> DailyUsage {
        let stored: Option<DailyUsage> = env
            .storage()
            .persistent()
            .get(&ConversionKey::DailyUsage(user.clone()));
        match stored {
            Some(u) if current_ledger < u.window_start + LEDGERS_PER_DAY => u,
            _ => DailyUsage {
                tokens_converted: 0,
                window_start: current_ledger,
            },
        }
    }
}
