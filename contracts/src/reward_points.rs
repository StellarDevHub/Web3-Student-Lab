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
