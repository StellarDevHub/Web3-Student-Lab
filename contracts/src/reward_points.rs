use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, Map, String, Symbol, Vec};

const KEY_BALANCES: Symbol = Symbol::new("balances");
const KEY_EXPIRY: Symbol = Symbol::new("expiry");
const KEY_HISTORY: Symbol = Symbol::new("history");
const DEFAULT_EXPIRY_DAYS: u64 = 365;

#[contracttype]
#[derive(Clone, Debug)]
pub struct PointsBalance {
    pub user: Address,
    pub balance: i128,
    pub lifetime_earned: i128,
    pub last_updated: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct PointsExpiry {
    pub amount: i128,
//! On-chain reward points system with earning, balance tracking, expiration, and history.
#![allow(dead_code)]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, Vec};

/// Default TTL: ~1 year in ledgers (assuming 5s/ledger)
pub const DEFAULT_EXPIRY_LEDGERS: u64 = 6_307_200;
/// Max points per single earn call (anti-abuse)
pub const MAX_EARN_AMOUNT: u64 = 10_000;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PointsBalance {
    pub owner: Address,
    pub available: u64,
    pub lifetime_earned: u64,
    pub lifetime_expired: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PointsBatch {
    pub amount: u64,
    pub earned_at: u64,
    pub expires_at: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct PointsRecord {
    pub action: Symbol,
    pub amount: i128,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct PointsEarnedEvent {
    pub user: Address,
    pub amount: i128,
    pub reason: Symbol,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct PointsExpiredEvent {
    pub user: Address,
    pub amount: i128,
    pub timestamp: u64,
}

#[contract]
pub struct RewardPoints;

#[contractimpl]
impl RewardPoints {
    pub fn initialize(env: Env) {
        env.storage().instance().set(&KEY_BALANCES, &Map::<Address, PointsBalance>::new(&env));
        env.storage().instance().set(&KEY_EXPIRY, &Map::<Address, Vec<PointsExpiry>>::new(&env));
        env.storage().instance().set(&KEY_HISTORY, &Map::<Address, Vec<PointsRecord>>::new(&env));
    }

    /// Earn points for a user
    pub fn earn_points(env: Env, user: Address, amount: i128, reason: Symbol, expiry_days: Option<u64>) {
        let mut balances: Map<Address, PointsBalance> = env.storage().instance().get(&KEY_BALANCES).unwrap();
        let mut b = balances.get(user.clone()).unwrap_or(PointsBalance { user: user.clone(), balance: 0, lifetime_earned: 0, last_updated: 0 });
        b.balance += amount;
        b.lifetime_earned += amount;
        b.last_updated = env.ledger().timestamp();
        balances.set(user.clone(), b);
        env.storage().instance().set(&KEY_BALANCES, &balances);

        let days = expiry_days.unwrap_or(DEFAULT_EXPIRY_DAYS);
        let mut expiry: Map<Address, Vec<PointsExpiry>> = env.storage().instance().get(&KEY_EXPIRY).unwrap();
        let mut exp = expiry.get(user.clone()).unwrap_or(Vec::new(&env));
        exp.push_back(PointsExpiry { amount, expires_at: env.ledger().timestamp() + days * 86400 });
        expiry.set(user.clone(), exp);
        env.storage().instance().set(&KEY_EXPIRY, &expiry);

        let mut history: Map<Address, Vec<PointsRecord>> = env.storage().instance().get(&KEY_HISTORY).unwrap();
        let mut h = history.get(user.clone()).unwrap_or(Vec::new(&env));
        h.push_back(PointsRecord { action: Symbol::new(&env, "earn"), amount, timestamp: env.ledger().timestamp() });
        history.set(user.clone(), h);
        env.storage().instance().set(&KEY_HISTORY, &history);

        env.events().publish((Symbol::new(&env, "points_earned"),), PointsEarnedEvent { user, amount, reason, timestamp: env.ledger().timestamp() });
    }

    /// Process expired points for a user
    pub fn process_expiry(env: Env, user: Address) -> i128 {
        let now = env.ledger().timestamp();
        let mut balances: Map<Address, PointsBalance> = env.storage().instance().get(&KEY_BALANCES).unwrap();
        let mut b = balances.get(user.clone()).unwrap_or(PointsBalance { user: user.clone(), balance: 0, lifetime_earned: 0, last_updated: 0 });

        let mut expiry: Map<Address, Vec<PointsExpiry>> = env.storage().instance().get(&KEY_EXPIRY).unwrap();
        let exp = expiry.get(user.clone()).unwrap_or(Vec::new(&env));
        let mut remaining = Vec::new(&env);
        let mut expired_total = 0i128;

        for e in exp.iter() {
            if e.expires_at <= now { expired_total += e.amount; }
            else { remaining.push_back(e); }
        }

        if expired_total > 0 {
            b.balance -= expired_total;
            if b.balance < 0 { b.balance = 0; }
            balances.set(user.clone(), b);
            env.storage().instance().set(&KEY_BALANCES, &balances);
            expiry.set(user.clone(), remaining);
            env.storage().instance().set(&KEY_EXPIRY, &expiry);

            env.events().publish((Symbol::new(&env, "points_expired"),), PointsExpiredEvent { user, amount: expired_total, timestamp: now });
        }
        expired_total
    }

    /// Spend points (deduct from balance)
    pub fn spend_points(env: Env, user: Address, amount: i128) -> bool {
        let mut balances: Map<Address, PointsBalance> = env.storage().instance().get(&KEY_BALANCES).unwrap();
        let mut b = balances.get(user.clone()).unwrap_or(PointsBalance { user: user.clone(), balance: 0, lifetime_earned: 0, last_updated: 0 });
        if b.balance < amount { return false; }
        b.balance -= amount;
        balances.set(user.clone(), b);
        env.storage().instance().set(&KEY_BALANCES, &balances);
        true
    }

    pub fn get_balance(env: Env, user: Address) -> PointsBalance {
        let balances: Map<Address, PointsBalance> = env.storage().instance().get(&KEY_BALANCES).unwrap();
        balances.get(user).unwrap_or(PointsBalance { user, balance: 0, lifetime_earned: 0, last_updated: 0 })
    }

    pub fn get_expiring_soon(env: Env, user: Address, within_days: u64) -> i128 {
        let now = env.ledger().timestamp();
        let expiry: Map<Address, Vec<PointsExpiry>> = env.storage().instance().get(&KEY_EXPIRY).unwrap();
        let exp = expiry.get(user).unwrap_or(Vec::new(&env));
        let threshold = now + within_days * 86400;
        let mut total = 0i128;
        for e in exp.iter() { if e.expires_at <= threshold && e.expires_at > now { total += e.amount; } }
        total
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PointsHistoryEntry {
    pub delta: i64,
    pub reason: soroban_sdk::Symbol,
    pub ledger: u64,
}

#[contracttype]
#[derive(Clone)]
pub enum RewardKey {
    Admin,
    Balance(Address),
    Batches(Address),
    History(Address),
}

#[contract]
pub struct RewardPointsContract;

#[contractimpl]
impl RewardPointsContract {
    /// Initialize with an admin address.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&RewardKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&RewardKey::Admin, &admin);
    }

    /// Award points to a user. Only callable by admin.
    pub fn earn_points(env: Env, user: Address, amount: u64, reason: soroban_sdk::Symbol) {
        Self::require_admin(&env);
        assert!(amount > 0 && amount <= MAX_EARN_AMOUNT, "invalid amount");

        let expires_at = env.ledger().sequence() as u64 + DEFAULT_EXPIRY_LEDGERS;
        let mut balance = Self::get_or_default_balance(&env, &user);
        balance.available += amount;
        balance.lifetime_earned += amount;

        // Append batch
        let mut batches: Vec<PointsBatch> = env
            .storage()
            .persistent()
            .get(&RewardKey::Batches(user.clone()))
            .unwrap_or(Vec::new(&env));
        batches.push_back(PointsBatch {
            amount,
            earned_at: env.ledger().sequence() as u64,
            expires_at,
        });

        Self::append_history(
            &env,
            &user,
            amount as i64,
            reason.clone(),
        );

        env.storage()
            .persistent()
            .set(&RewardKey::Balance(user.clone()), &balance);
        env.storage()
            .persistent()
            .set(&RewardKey::Batches(user.clone()), &batches);

        env.events().publish(
            (soroban_sdk::symbol_short!("pts_earn"), user),
            (amount, reason, expires_at),
        );
    }

    /// Expire points whose `expires_at` ledger has passed. Anyone can call.
    pub fn expire_points(env: Env, user: Address) {
        let current = env.ledger().sequence() as u64;
        let mut batches: Vec<PointsBatch> = env
            .storage()
            .persistent()
            .get(&RewardKey::Batches(user.clone()))
            .unwrap_or(Vec::new(&env));

        let mut expired_total: u64 = 0;
        let mut live: Vec<PointsBatch> = Vec::new(&env);
        for i in 0..batches.len() {
            let b = batches.get(i).unwrap();
            if b.expires_at <= current {
                expired_total += b.amount;
            } else {
                live.push_back(b);
            }
        }

        if expired_total == 0 {
            return;
        }

        let mut balance = Self::get_or_default_balance(&env, &user);
        let deduct = expired_total.min(balance.available);
        balance.available -= deduct;
        balance.lifetime_expired += deduct;

        Self::append_history(
            &env,
            &user,
            -(deduct as i64),
            soroban_sdk::symbol_short!("expired"),
        );

        env.storage()
            .persistent()
            .set(&RewardKey::Balance(user.clone()), &balance);
        env.storage()
            .persistent()
            .set(&RewardKey::Batches(user.clone()), &live);

        env.events().publish(
            (soroban_sdk::symbol_short!("pts_exp"), user),
            deduct,
        );
    }

    /// Extend expiry of all active batches by `extra_ledgers`. Only admin.
    pub fn extend_expiry(env: Env, user: Address, extra_ledgers: u64) {
        Self::require_admin(&env);
        let mut batches: Vec<PointsBatch> = env
            .storage()
            .persistent()
            .get(&RewardKey::Batches(user.clone()))
            .unwrap_or(Vec::new(&env));

        let mut updated: Vec<PointsBatch> = Vec::new(&env);
        for i in 0..batches.len() {
            let mut b = batches.get(i).unwrap();
            b.expires_at += extra_ledgers;
            updated.push_back(b);
        }
        env.storage()
            .persistent()
            .set(&RewardKey::Batches(user), &updated);
    }

    /// Deduct points (called internally by conversion contract).
    pub fn deduct_points(env: Env, user: Address, amount: u64) {
        Self::require_admin(&env);
        let mut balance = Self::get_or_default_balance(&env, &user);
        assert!(balance.available >= amount, "insufficient points");
        balance.available -= amount;

        Self::append_history(
            &env,
            &user,
            -(amount as i64),
            soroban_sdk::symbol_short!("convert"),
        );

        env.storage()
            .persistent()
            .set(&RewardKey::Balance(user.clone()), &balance);

        env.events().publish(
            (soroban_sdk::symbol_short!("pts_deduct"), user),
            amount,
        );
    }

    // ── Views ──────────────────────────────────────────────────────────────

    pub fn balance(env: Env, user: Address) -> PointsBalance {
        Self::get_or_default_balance(&env, &user)
    }

    pub fn batches(env: Env, user: Address) -> Vec<PointsBatch> {
        env.storage()
            .persistent()
            .get(&RewardKey::Batches(user))
            .unwrap_or(Vec::new(&env))
    }

    pub fn history(env: Env, user: Address) -> Vec<PointsHistoryEntry> {
        env.storage()
            .persistent()
            .get(&RewardKey::History(user))
            .unwrap_or(Vec::new(&env))
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    fn require_admin(env: &Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&RewardKey::Admin)
            .expect("not initialized");
        admin.require_auth();
    }

    fn get_or_default_balance(env: &Env, user: &Address) -> PointsBalance {
        env.storage()
            .persistent()
            .get(&RewardKey::Balance(user.clone()))
            .unwrap_or(PointsBalance {
                owner: user.clone(),
                available: 0,
                lifetime_earned: 0,
                lifetime_expired: 0,
            })
    }

    fn append_history(env: &Env, user: &Address, delta: i64, reason: soroban_sdk::Symbol) {
        let mut hist: Vec<PointsHistoryEntry> = env
            .storage()
            .persistent()
            .get(&RewardKey::History(user.clone()))
            .unwrap_or(Vec::new(env));
        hist.push_back(PointsHistoryEntry {
            delta,
            reason,
            ledger: env.ledger().sequence() as u64,
        });
        env.storage()
            .persistent()
            .set(&RewardKey::History(user.clone()), &hist);
    }
}
