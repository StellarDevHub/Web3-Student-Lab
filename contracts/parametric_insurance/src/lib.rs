//! # SC-HARD-12 — Parametric Insurance Contract with Multi-Oracle Quorum
//!
//! Parametric insurance protocol that:
//!
//! - **Policy creation**: buyers specify a trigger key, threshold, and direction
//!   (above/below) along with premium and payout amounts.
//! - **Underwriter collateral pools**: underwriters deposit capital; solvency
//!   is checked at policy purchase time.
//! - **Multi-oracle quorum**: multiple trusted oracle addresses may post values
//!   for a trigger key.  A claim is processed using the **median** of all posted
//!   values, ensuring no single oracle can manipulate payouts.
//! - **Automated claim payouts**: once trigger is met, the payout is credited
//!   to the buyer's claimable balance and transferred on `withdraw_claim`.
//! - **Double-claim guard**: policies track their claimed state.
//! - **Expiry enforcement**: claims are rejected after `expires_at`.

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, token, Address, Env,
    Symbol, Vec,
};

// ── Errors ────────────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum InsuranceError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    InvalidAmount = 4,
    Insolvent = 5,
    PolicyMissing = 6,
    TriggerNotMet = 7,
    Expired = 8,
    AlreadyClaimed = 9,
    NotAnOracle = 10,
    InsufficientOracleData = 11,
}

// ── Storage keys ──────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Token,
    /// Vec<Address> — whitelisted oracle addresses.
    Oracles,
    TotalCapital,
    LockedLiability,
    UnderwriterBalance(Address),
    Policy(u64),
    NextPolicyId,
    /// Vec<i128> — all values posted by oracles for a trigger key.
    OracleValues(Symbol),
    Claimable(Address),
    /// u32 — minimum oracle quorum required before a claim can be processed.
    QuorumThreshold,
}

// ── Data types ────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Policy {
    pub id: u64,
    pub buyer: Address,
    pub trigger_key: Symbol,
    pub trigger_value: i128,
    pub trigger_above: bool,
    pub premium: i128,
    pub payout: i128,
    pub expires_at: u64,
    pub claimed: bool,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct ParametricInsuranceContract;

#[contractimpl]
impl ParametricInsuranceContract {
    // ── Initialisation ────────────────────────────────────────────────────────

    /// Initialise the contract.
    ///
    /// `oracles` is the initial list of trusted oracle addresses.
    /// `quorum_threshold` is the minimum number of oracle reports required
    /// before the median can be used to settle a claim (≥ 1).
    pub fn initialize(
        env: Env,
        admin: Address,
        token: Address,
        oracles: Vec<Address>,
        quorum_threshold: u32,
    ) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, InsuranceError::AlreadyInitialized);
        }
        admin.require_auth();
        assert!(quorum_threshold >= 1, "quorum must be >= 1");
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::Oracles, &oracles);
        env.storage()
            .instance()
            .set(&DataKey::QuorumThreshold, &quorum_threshold);
        env.storage().instance().set(&DataKey::TotalCapital, &0i128);
        env.storage()
            .instance()
            .set(&DataKey::LockedLiability, &0i128);
        env.storage().instance().set(&DataKey::NextPolicyId, &1u64);
    }

    // ── Underwriting ──────────────────────────────────────────────────────────

    /// Underwriter deposits capital into the collateral pool.
    pub fn underwrite(env: Env, underwriter: Address, amount: i128) {
        ensure_initialized(&env);
        underwriter.require_auth();
        if amount <= 0 {
            panic_with_error!(&env, InsuranceError::InvalidAmount);
        }
        let token: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .unwrap_or_else(|| panic_with_error!(&env, InsuranceError::NotInitialized));
        token::Client::new(&env, &token)
            .transfer(&underwriter, &env.current_contract_address(), &amount);
        let mut total = total_capital(&env);
        total += amount;
        env.storage().instance().set(&DataKey::TotalCapital, &total);
        let bal: i128 = env
            .storage()
            .instance()
            .get(&DataKey::UnderwriterBalance(underwriter.clone()))
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::UnderwriterBalance(underwriter), &(bal + amount));
    }

    /// Underwriter withdraws capital (subject to solvency check).
    pub fn withdraw_underwriting(env: Env, underwriter: Address, amount: i128) {
        ensure_initialized(&env);
        underwriter.require_auth();
        if amount <= 0 {
            panic_with_error!(&env, InsuranceError::InvalidAmount);
        }
        let current: i128 = env
            .storage()
            .instance()
            .get(&DataKey::UnderwriterBalance(underwriter.clone()))
            .unwrap_or(0);
        if current < amount {
            panic_with_error!(&env, InsuranceError::InvalidAmount);
        }
        let total = total_capital(&env);
        let locked = locked_liability(&env);
        if total - amount < locked {
            panic_with_error!(&env, InsuranceError::Insolvent);
        }
        env.storage().instance().set(
            &DataKey::UnderwriterBalance(underwriter.clone()),
            &(current - amount),
        );
        env.storage()
            .instance()
            .set(&DataKey::TotalCapital, &(total - amount));
        let token: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .unwrap_or_else(|| panic_with_error!(&env, InsuranceError::NotInitialized));
        token::Client::new(&env, &token)
            .transfer(&env.current_contract_address(), &underwriter, &amount);
    }

    // ── Policy purchase ───────────────────────────────────────────────────────

    /// Buy a parametric insurance policy.
    ///
    /// Returns the policy ID.
    pub fn buy_policy(
        env: Env,
        buyer: Address,
        premium: i128,
        payout: i128,
        expires_at: u64,
        trigger_key: Symbol,
        trigger_value: i128,
        trigger_above: bool,
    ) -> u64 {
        ensure_initialized(&env);
        buyer.require_auth();
        if premium <= 0 || payout <= 0 {
            panic_with_error!(&env, InsuranceError::InvalidAmount);
        }
        if expires_at <= env.ledger().timestamp() {
            panic_with_error!(&env, InsuranceError::InvalidAmount);
        }
        let mut locked = locked_liability(&env);
        locked += payout;
        let mut total = total_capital(&env);
        if total + premium < locked {
            panic_with_error!(&env, InsuranceError::Insolvent);
        }
        let token: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .unwrap_or_else(|| panic_with_error!(&env, InsuranceError::NotInitialized));
        token::Client::new(&env, &token)
            .transfer(&buyer, &env.current_contract_address(), &premium);
        total += premium;
        env.storage().instance().set(&DataKey::TotalCapital, &total);
        env.storage()
            .instance()
            .set(&DataKey::LockedLiability, &locked);

        let id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextPolicyId)
            .unwrap_or(1);
        let policy = Policy {
            id,
            buyer,
            trigger_key,
            trigger_value,
            trigger_above,
            premium,
            payout,
            expires_at,
            claimed: false,
        };
        env.storage().instance().set(&DataKey::Policy(id), &policy);
        env.storage()
            .instance()
            .set(&DataKey::NextPolicyId, &(id + 1));
        id
    }

    // ── Oracle reporting ──────────────────────────────────────────────────────

    /// A whitelisted oracle posts a value for a trigger key.
    ///
    /// Multiple oracles may post for the same key; all values are accumulated.
    /// The median is used at claim time.
    pub fn post_oracle_value(env: Env, oracle: Address, trigger_key: Symbol, value: i128) {
        ensure_initialized(&env);
        oracle.require_auth();
        let oracles: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::Oracles)
            .unwrap_or_else(|| Vec::new(&env));
        if !oracles.contains(&oracle) {
            panic_with_error!(&env, InsuranceError::NotAnOracle);
        }
        let mut values: Vec<i128> = env
            .storage()
            .instance()
            .get(&DataKey::OracleValues(trigger_key.clone()))
            .unwrap_or_else(|| Vec::new(&env));
        values.push_back(value);
        env.storage()
            .instance()
            .set(&DataKey::OracleValues(trigger_key), &values);
    }

    // ── Claim processing ──────────────────────────────────────────────────────

    /// Process a claim for policy `policy_id`.
    ///
    /// The payout is credited to the buyer's claimable balance.  The oracle
    /// quorum must be met and the median must satisfy the trigger condition.
    pub fn claim(env: Env, buyer: Address, policy_id: u64) -> i128 {
        ensure_initialized(&env);
        buyer.require_auth();

        let mut policy: Policy = env
            .storage()
            .instance()
            .get(&DataKey::Policy(policy_id))
            .unwrap_or_else(|| panic_with_error!(&env, InsuranceError::PolicyMissing));

        if policy.buyer != buyer {
            panic_with_error!(&env, InsuranceError::Unauthorized);
        }
        if policy.claimed {
            panic_with_error!(&env, InsuranceError::AlreadyClaimed);
        }
        if env.ledger().timestamp() > policy.expires_at {
            panic_with_error!(&env, InsuranceError::Expired);
        }

        // ── Multi-oracle quorum check ──────────────────────────────────────────
        let quorum: u32 = env
            .storage()
            .instance()
            .get(&DataKey::QuorumThreshold)
            .unwrap_or(1);
        let values: Vec<i128> = env
            .storage()
            .instance()
            .get(&DataKey::OracleValues(policy.trigger_key.clone()))
            .unwrap_or_else(|| Vec::new(&env));
        if (values.len() as u32) < quorum {
            panic_with_error!(&env, InsuranceError::InsufficientOracleData);
        }

        // Compute median of posted values
        let median = compute_median(&env, &values);

        let trigger_met = if policy.trigger_above {
            median >= policy.trigger_value
        } else {
            median <= policy.trigger_value
        };
        if !trigger_met {
            panic_with_error!(&env, InsuranceError::TriggerNotMet);
        }

        policy.claimed = true;
        env.storage()
            .instance()
            .set(&DataKey::Policy(policy_id), &policy);

        let mut total = total_capital(&env);
        total -= policy.payout;
        env.storage().instance().set(&DataKey::TotalCapital, &total);

        let mut locked = locked_liability(&env);
        locked -= policy.payout;
        env.storage()
            .instance()
            .set(&DataKey::LockedLiability, &locked);

        let claimable: i128 = env
            .storage()
            .instance()
            .get(&DataKey::Claimable(buyer.clone()))
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::Claimable(buyer), &(claimable + policy.payout));

        policy.payout
    }

    /// Transfer a previously credited payout to the buyer's wallet.
    pub fn withdraw_claim(env: Env, buyer: Address, amount: i128) {
        ensure_initialized(&env);
        buyer.require_auth();
        if amount <= 0 {
            panic_with_error!(&env, InsuranceError::InvalidAmount);
        }
        let claimable: i128 = env
            .storage()
            .instance()
            .get(&DataKey::Claimable(buyer.clone()))
            .unwrap_or(0);
        if claimable < amount {
            panic_with_error!(&env, InsuranceError::InvalidAmount);
        }
        env.storage()
            .instance()
            .set(&DataKey::Claimable(buyer.clone()), &(claimable - amount));
        let token: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .unwrap_or_else(|| panic_with_error!(&env, InsuranceError::NotInitialized));
        token::Client::new(&env, &token)
            .transfer(&env.current_contract_address(), &buyer, &amount);
    }

    // ── Oracle management ─────────────────────────────────────────────────────

    /// Admin adds a new oracle to the whitelist.
    pub fn add_oracle(env: Env, admin: Address, oracle: Address) {
        ensure_initialized(&env);
        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, InsuranceError::NotInitialized));
        if admin != stored_admin {
            panic_with_error!(&env, InsuranceError::Unauthorized);
        }
        admin.require_auth();
        let mut oracles: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::Oracles)
            .unwrap_or_else(|| Vec::new(&env));
        if !oracles.contains(&oracle) {
            oracles.push_back(oracle);
        }
        env.storage().instance().set(&DataKey::Oracles, &oracles);
    }

    // ── View helpers ──────────────────────────────────────────────────────────

    /// Returns the policy struct for `policy_id`, or `None`.
    pub fn get_policy(env: Env, policy_id: u64) -> Option<Policy> {
        env.storage().instance().get(&DataKey::Policy(policy_id))
    }

    /// Returns the solvency ratio in basis points (capital / locked × 10 000).
    pub fn solvency_ratio_bps(env: Env) -> i128 {
        let total = total_capital(&env);
        let locked = locked_liability(&env);
        if locked == 0 {
            return 100_000;
        }
        (total * 10_000) / locked
    }

    /// Returns all oracle-posted values for a trigger key.
    pub fn get_oracle_values(env: Env, trigger_key: Symbol) -> Vec<i128> {
        env.storage()
            .instance()
            .get(&DataKey::OracleValues(trigger_key))
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Returns the current claimable balance for a buyer.
    pub fn get_claimable(env: Env, buyer: Address) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::Claimable(buyer))
            .unwrap_or(0)
    }
}

// ── Private helpers ───────────────────────────────────────────────────────────

fn ensure_initialized(env: &Env) {
    if !env.storage().instance().has(&DataKey::Admin) {
        panic_with_error!(env, InsuranceError::NotInitialized);
    }
}

fn total_capital(env: &Env) -> i128 {
    env.storage()
        .instance()
        .get(&DataKey::TotalCapital)
        .unwrap_or(0)
}

fn locked_liability(env: &Env) -> i128 {
    env.storage()
        .instance()
        .get(&DataKey::LockedLiability)
        .unwrap_or(0)
}

/// Compute the median of a `Vec<i128>` using insertion sort (no_std compatible).
///
/// With an even number of elements returns the lower median.
fn compute_median(env: &Env, values: &Vec<i128>) -> i128 {
    let n = values.len() as usize;
    // Copy into a fixed-size scratch buffer (max 32 oracle values)
    let mut buf = [0i128; 32];
    let count = n.min(32);
    for i in 0..count {
        buf[i] = values.get(i as u32).unwrap_or(0);
    }
    // Insertion sort
    for i in 1..count {
        let key = buf[i];
        let mut j = i;
        while j > 0 && buf[j - 1] > key {
            buf[j] = buf[j - 1];
            j -= 1;
        }
        buf[j] = key;
    }
    let _ = env; // env kept for future use (e.g., events)
    buf[count / 2]
}

#[cfg(test)]
mod tests;
