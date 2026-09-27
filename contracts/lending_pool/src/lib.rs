//! # Lending Pool with Collateral and Liquidation Logic
//!
//! Closes issue #715.
//!
//! A Soroban-native lending protocol where students can:
//!  - deposit collateral tokens,
//!  - borrow up to a configurable LTV threshold,
//!  - repay debt (principal + accrued per-second interest),
//!  - withdraw collateral while staying healthy, and
//!  - face liquidation with a bounty bonus when their health factor drops below 1.0.
//!
//! ## Ratio arithmetic
//! All ratios use basis-points (BPS = 10_000 → 100 %).
//!
//! ## Interest
//! Global borrow index per token accrues per-second using a first-order
//! Taylor approximation of compound interest (safe for low rates / short windows).
//!
//! ## Reentrancy (SC-HARD-17)
//! A zero-cost atomic mutex is stored in **temporary** storage so it is
//! automatically discarded at ledger close — preventing stale lock persistence.
//! A nested reentrant call in the same transaction envelope reverts with
//! `LPError::ReentrancyGuardTriggered`.
//!
//! ## Fixed-point math (SC-HARD-18)
//! All arithmetic uses `checked_add` / `checked_sub` / `checked_mul` /
//! `checked_div`. Overflow / underflow / division-by-zero produce typed
//! `LPError` variants instead of panicking.
//!
//! ## Pause (SC-HARD-19)
//! State-mutating entry points call `check_not_paused()` and revert with
//! `LPError::ContractPaused` when the circuit-breaker is active.
//! `emergency_withdraw` is exempt.

#![no_std]

#[cfg(test)]
extern crate std;

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, token,
    Address, Env, IntoVal, Symbol,
};

// ── Constants ─────────────────────────────────────────────────────────────────

const BPS: i128 = 10_000;
const SCALE: i128 = 1_000_000_000_000; // 1e12
const SECS_PER_YEAR: i128 = 31_536_000;
/// Temporary-storage key for the reentrancy guard mutex.
const RG_KEY: Symbol = symbol_short!("lp_rg");
/// Instance-storage key for the circuit-breaker pause flag.
const PAUSED_KEY: Symbol = symbol_short!("lp_pause");

// ── Storage keys ─────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub enum Key {
    Admin,
    Oracle,
    /// Minimum collateralisation ratio in BPS (e.g. 15 000 = 150 %).
    MinCollRatio,
    /// Liquidation bonus in BPS (e.g. 500 = 5 %).
    LiqBonus,
    /// Max LTV (collateral factor) in BPS per token.
    CollFactor(Address),
    /// Annual borrow rate in BPS per token.
    BorrowRate(Address),
    /// Global borrow index per token (SCALE-based, starts at SCALE).
    GlobalIdx(Address),
    /// Ledger timestamp of last global index update per token.
    LastUpdate(Address),
    /// Collateral balance: (user, token) → i128.
    Collateral(Address, Address),
    /// Borrow principal (accrued in-place): (user, token) → i128.
    Debt(Address, Address),
    /// User-level index snapshot: (user, token) → i128.
    UserIdx(Address, Address),
}

// ── Errors (SC-HARD-20: range 1–99) ──────────────────────────────────────────

/// Typed contract errors for the lending pool.
///
/// Discriminants are in the range `1–99` (lending-pool partition).
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum LPError {
    /// `1` — Contract has already been initialised.
    AlreadyInitialized = 1,
    /// `2` — Contract has not been initialised.
    NotInitialized = 2,
    /// `3` — Caller is not the admin.
    Unauthorized = 3,
    /// `4` — Amount must be strictly positive.
    ZeroAmount = 4,
    /// `5` — Token is not registered as an accepted asset.
    UnsupportedToken = 5,
    /// `6` — Position would fall below the minimum collateralisation ratio.
    BelowMinCollRatio = 6,
    /// `7` — Insufficient balance for the requested operation.
    InsufficientBal = 7,
    /// `8` — Cannot liquidate a healthy position.
    PositionHealthy = 8,
    /// `9` — Oracle returned a non-positive price.
    OracleBadPrice = 9,
    /// `10` — A reentrant call was detected and blocked.
    ReentrancyGuardTriggered = 10,
    /// `11` — Arithmetic overflow.
    Overflow = 11,
    /// `12` — Arithmetic underflow.
    Underflow = 12,
    /// `13` — Division by zero.
    DivisionByZero = 13,
    /// `14` — Contract is paused by the circuit breaker.
    ContractPaused = 14,
}

// ── Fixed-point math helpers (SC-HARD-18) ─────────────────────────────────────

/// Fixed-point math at 18-decimal precision (`1e18` scale).
pub mod fp18 {
    /// Scale factor for 18-decimal fixed-point arithmetic.
    pub const SCALE18: i128 = 1_000_000_000_000_000_000; // 1e18

    /// Multiply two 18-decimal fixed-point numbers, returning `None` on overflow.
    #[inline]
    pub fn mul(a: i128, b: i128) -> Option<i128> {
        a.checked_mul(b)?.checked_div(SCALE18)
    }

    /// Divide two 18-decimal fixed-point numbers, returning `None` on
    /// overflow or division-by-zero.
    #[inline]
    pub fn div(a: i128, b: i128) -> Option<i128> {
        if b == 0 {
            return None;
        }
        a.checked_mul(SCALE18)?.checked_div(b)
    }
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct LendingPool;

#[contractimpl]
impl LendingPool {
    // ── Initialisation ────────────────────────────────────────────────────────

    /// Initialise the pool once.
    ///
    /// * `min_coll_ratio` – e.g. `15_000` for 150 %.
    /// * `liq_bonus`      – e.g. `500` for 5 % liquidator bounty.
    pub fn initialize(
        env: Env,
        admin: Address,
        oracle: Address,
        min_coll_ratio: i128,
        liq_bonus: i128,
    ) {
        if env.storage().instance().has(&Key::Admin) {
            panic_with_error!(&env, LPError::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&Key::Admin, &admin);
        env.storage().instance().set(&Key::Oracle, &oracle);
        env.storage()
            .instance()
            .set(&Key::MinCollRatio, &min_coll_ratio);
        env.storage().instance().set(&Key::LiqBonus, &liq_bonus);
        env.storage().instance().set(&PAUSED_KEY, &false);
    }

    /// Register a token as an accepted collateral / borrow asset.
    ///
    /// * `coll_factor`  – Max LTV in BPS (e.g. `7_500` = 75 %).
    /// * `borrow_rate`  – Annual interest in BPS (e.g. `500` = 5 %).
    pub fn add_asset(env: Env, token: Address, coll_factor: i128, borrow_rate: i128) {
        Self::only_admin(&env);
        env.storage()
            .persistent()
            .set(&Key::CollFactor(token.clone()), &coll_factor);
        env.storage()
            .persistent()
            .set(&Key::BorrowRate(token.clone()), &borrow_rate);
        if !env
            .storage()
            .persistent()
            .has(&Key::GlobalIdx(token.clone()))
        {
            env.storage()
                .persistent()
                .set(&Key::GlobalIdx(token.clone()), &SCALE);
            env.storage()
                .persistent()
                .set(&Key::LastUpdate(token.clone()), &env.ledger().timestamp());
        }
    }

    // ── User actions ──────────────────────────────────────────────────────────

    /// Deposit `amount` of `token` as collateral.
    pub fn deposit_collateral(env: Env, user: Address, token: Address, amount: i128) {
        user.require_auth();
        Self::check_not_paused(&env);
        Self::check_nonzero(&env, amount);
        Self::check_supported(&env, &token);
        Self::lock(&env);

        token::Client::new(&env, &token).transfer(&user, &env.current_contract_address(), &amount);

        let key = Key::Collateral(user.clone(), token.clone());
        let prev: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        let new_bal = prev
            .checked_add(amount)
            .unwrap_or_else(|| panic_with_error!(&env, LPError::Overflow));
        env.storage().persistent().set(&key, &new_bal);

        Self::unlock(&env);
        env.events()
            .publish((symbol_short!("deposit"),), (user, token, amount));
    }

    /// Borrow `amount` of `debt_token` against `collateral_token` deposits.
    ///
    /// The position must satisfy `min_coll_ratio` after borrowing.
    pub fn borrow(
        env: Env,
        user: Address,
        collateral_token: Address,
        debt_token: Address,
        amount: i128,
    ) {
        user.require_auth();
        Self::check_not_paused(&env);
        Self::check_nonzero(&env, amount);
        Self::check_supported(&env, &debt_token);
        Self::lock(&env);

        Self::accrue(&env, &debt_token);
        Self::accrue_user(&env, &user, &debt_token);

        let debt_key = Key::Debt(user.clone(), debt_token.clone());
        let prev: i128 = env.storage().persistent().get(&debt_key).unwrap_or(0);
        let new_debt = prev
            .checked_add(amount)
            .unwrap_or_else(|| panic_with_error!(&env, LPError::Overflow));
        env.storage().persistent().set(&debt_key, &new_debt);

        // Snapshot user index.
        let gidx: i128 = env
            .storage()
            .persistent()
            .get(&Key::GlobalIdx(debt_token.clone()))
            .unwrap_or(SCALE);
        env.storage()
            .persistent()
            .set(&Key::UserIdx(user.clone(), debt_token.clone()), &gidx);

        // Health check: collateral value × coll_factor ≥ debt value × min_coll_ratio
        Self::assert_healthy(&env, &user, &collateral_token, &debt_token);

        token::Client::new(&env, &debt_token).transfer(
            &env.current_contract_address(),
            &user,
            &amount,
        );

        Self::unlock(&env);
        env.events()
            .publish((symbol_short!("borrow"),), (user, debt_token, amount));
    }

    /// Repay up to `amount` of `token` debt.
    pub fn repay(env: Env, user: Address, token: Address, amount: i128) {
        user.require_auth();
        Self::check_not_paused(&env);
        Self::check_nonzero(&env, amount);
        Self::check_supported(&env, &token);
        Self::lock(&env);

        Self::accrue(&env, &token);
        Self::accrue_user(&env, &user, &token);

        let debt_key = Key::Debt(user.clone(), token.clone());
        let debt: i128 = env.storage().persistent().get(&debt_key).unwrap_or(0);
        let actual = if amount > debt { debt } else { amount };

        token::Client::new(&env, &token).transfer(&user, &env.current_contract_address(), &actual);

        let new_debt = debt
            .checked_sub(actual)
            .unwrap_or_else(|| panic_with_error!(&env, LPError::Underflow));
        env.storage().persistent().set(&debt_key, &new_debt);

        Self::unlock(&env);
        env.events()
            .publish((symbol_short!("repay"),), (user, token, actual));
    }

    /// Withdraw collateral.  Position must remain healthy after withdrawal.
    pub fn withdraw_collateral(
        env: Env,
        user: Address,
        collateral_token: Address,
        debt_token: Address,
        amount: i128,
    ) {
        user.require_auth();
        Self::check_not_paused(&env);
        Self::check_nonzero(&env, amount);
        Self::lock(&env);

        let coll_key = Key::Collateral(user.clone(), collateral_token.clone());
        let bal: i128 = env.storage().persistent().get(&coll_key).unwrap_or(0);
        if amount > bal {
            Self::unlock(&env);
            panic_with_error!(&env, LPError::InsufficientBal);
        }
        let new_bal = bal
            .checked_sub(amount)
            .unwrap_or_else(|| panic_with_error!(&env, LPError::Underflow));
        env.storage().persistent().set(&coll_key, &new_bal);

        Self::assert_healthy(&env, &user, &collateral_token, &debt_token);

        token::Client::new(&env, &collateral_token).transfer(
            &env.current_contract_address(),
            &user,
            &amount,
        );

        Self::unlock(&env);
        env.events().publish(
            (symbol_short!("withdraw"),),
            (user, collateral_token, amount),
        );
    }

    /// Liquidate an undercollateralised position.
    ///
    /// The liquidator repays `repay_amount` of `debt_token` on behalf of `borrower`
    /// and receives an equivalent value of `collateral_token` plus the configured
    /// liquidation bonus (bounty award).
    pub fn liquidate(
        env: Env,
        liquidator: Address,
        borrower: Address,
        collateral_token: Address,
        debt_token: Address,
        repay_amount: i128,
    ) {
        liquidator.require_auth();
        Self::check_not_paused(&env);
        Self::check_nonzero(&env, repay_amount);
        Self::lock(&env);

        Self::accrue(&env, &debt_token);
        Self::accrue(&env, &collateral_token);
        Self::accrue_user(&env, &borrower, &debt_token);

        // Verify the position is actually unhealthy before seizing assets.
        if Self::is_healthy(&env, &borrower, &collateral_token, &debt_token) {
            Self::unlock(&env);
            panic_with_error!(&env, LPError::PositionHealthy);
        }

        let debt_price = Self::price(&env, &debt_token);
        let coll_price = Self::price(&env, &collateral_token);
        let liq_bonus: i128 = env.storage().instance().get(&Key::LiqBonus).unwrap_or(500);

        // seize = repay_amount × (debt_price / coll_price) × (1 + liq_bonus / BPS)
        let bps_plus_bonus = BPS
            .checked_add(liq_bonus)
            .unwrap_or_else(|| panic_with_error!(&env, LPError::Overflow));
        let numerator = repay_amount
            .checked_mul(debt_price)
            .unwrap_or_else(|| panic_with_error!(&env, LPError::Overflow))
            .checked_mul(bps_plus_bonus)
            .unwrap_or_else(|| panic_with_error!(&env, LPError::Overflow));
        let denominator = coll_price
            .checked_mul(BPS)
            .unwrap_or_else(|| panic_with_error!(&env, LPError::Overflow));
        if denominator == 0 {
            panic_with_error!(&env, LPError::DivisionByZero);
        }
        let seize = numerator
            .checked_div(denominator)
            .unwrap_or_else(|| panic_with_error!(&env, LPError::Overflow));

        let debt_key = Key::Debt(borrower.clone(), debt_token.clone());
        let debt: i128 = env.storage().persistent().get(&debt_key).unwrap_or(0);
        let actual_repay = if repay_amount > debt {
            debt
        } else {
            repay_amount
        };

        let coll_key = Key::Collateral(borrower.clone(), collateral_token.clone());
        let coll_bal: i128 = env.storage().persistent().get(&coll_key).unwrap_or(0);
        let actual_seize = if seize > coll_bal { coll_bal } else { seize };

        // Liquidator transfers debt repayment to the pool.
        token::Client::new(&env, &debt_token).transfer(
            &liquidator,
            &env.current_contract_address(),
            &actual_repay,
        );

        let new_debt = debt
            .checked_sub(actual_repay)
            .unwrap_or_else(|| panic_with_error!(&env, LPError::Underflow));
        env.storage().persistent().set(&debt_key, &new_debt);

        // Pool transfers seized collateral (+ bounty) to liquidator.
        let new_coll = coll_bal
            .checked_sub(actual_seize)
            .unwrap_or_else(|| panic_with_error!(&env, LPError::Underflow));
        env.storage().persistent().set(&coll_key, &new_coll);
        token::Client::new(&env, &collateral_token).transfer(
            &env.current_contract_address(),
            &liquidator,
            &actual_seize,
        );

        Self::unlock(&env);
        env.events().publish(
            (symbol_short!("liquidate"),),
            (liquidator, borrower, actual_repay, actual_seize),
        );
    }

    /// Emergency collateral withdrawal — available even when the circuit
    /// breaker is active, so admin can recover funds during a pause.
    pub fn emergency_withdraw(
        env: Env,
        user: Address,
        collateral_token: Address,
        amount: i128,
    ) {
        user.require_auth();
        // NOTE: intentionally does NOT call check_not_paused — this is the
        // exempted emergency path (SC-HARD-19).
        Self::only_admin(&env);
        Self::lock(&env);

        let coll_key = Key::Collateral(user.clone(), collateral_token.clone());
        let bal: i128 = env.storage().persistent().get(&coll_key).unwrap_or(0);
        if amount > bal {
            Self::unlock(&env);
            panic_with_error!(&env, LPError::InsufficientBal);
        }
        let new_bal = bal
            .checked_sub(amount)
            .unwrap_or_else(|| panic_with_error!(&env, LPError::Underflow));
        env.storage().persistent().set(&coll_key, &new_bal);

        token::Client::new(&env, &collateral_token).transfer(
            &env.current_contract_address(),
            &user,
            &amount,
        );

        Self::unlock(&env);
        env.events().publish(
            (symbol_short!("emg_wdraw"),),
            (user, collateral_token, amount),
        );
    }

    /// Pause the contract (admin only).
    pub fn set_paused(env: Env, admin: Address, paused: bool) {
        admin.require_auth();
        Self::only_admin(&env);
        env.storage().instance().set(&PAUSED_KEY, &paused);
        env.events().publish((symbol_short!("lp_pause"),), paused);
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    pub fn collateral_of(env: Env, user: Address, token: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&Key::Collateral(user, token))
            .unwrap_or(0)
    }

    pub fn debt_of(env: Env, user: Address, token: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&Key::Debt(user, token))
            .unwrap_or(0)
    }

    pub fn health_ok(env: Env, user: Address, coll_token: Address, debt_token: Address) -> bool {
        Self::is_healthy(&env, &user, &coll_token, &debt_token)
    }

    pub fn paused(env: Env) -> bool {
        env.storage()
            .instance()
            .get::<Symbol, bool>(&PAUSED_KEY)
            .unwrap_or(false)
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    /// Accrue global borrow index for `token` (first-order compound interest).
    fn accrue(env: &Env, token: &Address) {
        let last: u64 = env
            .storage()
            .persistent()
            .get(&Key::LastUpdate(token.clone()))
            .unwrap_or_else(|| env.ledger().timestamp());
        let now = env.ledger().timestamp();
        if now <= last {
            return;
        }

        let rate: i128 = env
            .storage()
            .persistent()
            .get(&Key::BorrowRate(token.clone()))
            .unwrap_or(0);
        if rate == 0 {
            env.storage()
                .persistent()
                .set(&Key::LastUpdate(token.clone()), &now);
            return;
        }

        let elapsed = (now - last) as i128;
        let old_idx: i128 = env
            .storage()
            .persistent()
            .get(&Key::GlobalIdx(token.clone()))
            .unwrap_or(SCALE);

        // Δindex = old_idx × rate × elapsed / (BPS × SECS_PER_YEAR)
        let denom = BPS
            .checked_mul(SECS_PER_YEAR)
            .unwrap_or_else(|| panic_with_error!(env, LPError::Overflow));
        let delta = old_idx
            .checked_mul(rate)
            .unwrap_or_else(|| panic_with_error!(env, LPError::Overflow))
            .checked_mul(elapsed)
            .unwrap_or_else(|| panic_with_error!(env, LPError::Overflow))
            .checked_div(denom)
            .unwrap_or_else(|| panic_with_error!(env, LPError::DivisionByZero));
        let new_idx = old_idx
            .checked_add(delta)
            .unwrap_or_else(|| panic_with_error!(env, LPError::Overflow));

        env.storage()
            .persistent()
            .set(&Key::GlobalIdx(token.clone()), &new_idx);
        env.storage()
            .persistent()
            .set(&Key::LastUpdate(token.clone()), &now);
    }

    /// Apply accrued interest to a user's recorded principal.
    fn accrue_user(env: &Env, user: &Address, token: &Address) {
        let principal: i128 = env
            .storage()
            .persistent()
            .get(&Key::Debt(user.clone(), token.clone()))
            .unwrap_or(0);
        if principal == 0 {
            return;
        }
        let gidx: i128 = env
            .storage()
            .persistent()
            .get(&Key::GlobalIdx(token.clone()))
            .unwrap_or(SCALE);
        let uidx: i128 = env
            .storage()
            .persistent()
            .get(&Key::UserIdx(user.clone(), token.clone()))
            .unwrap_or(SCALE);
        if gidx > uidx && uidx > 0 {
            let new_principal = principal
                .checked_mul(gidx)
                .unwrap_or_else(|| panic_with_error!(env, LPError::Overflow))
                .checked_div(uidx)
                .unwrap_or_else(|| panic_with_error!(env, LPError::DivisionByZero));
            env.storage()
                .persistent()
                .set(&Key::Debt(user.clone(), token.clone()), &new_principal);
            env.storage()
                .persistent()
                .set(&Key::UserIdx(user.clone(), token.clone()), &gidx);
        }
    }

    /// Returns `true` when the (collateral, debt) pair is sufficiently collateralised.
    fn is_healthy(env: &Env, user: &Address, coll_token: &Address, debt_token: &Address) -> bool {
        let debt: i128 = env
            .storage()
            .persistent()
            .get(&Key::Debt(user.clone(), debt_token.clone()))
            .unwrap_or(0);
        if debt == 0 {
            return true;
        }

        let coll_bal: i128 = env
            .storage()
            .persistent()
            .get(&Key::Collateral(user.clone(), coll_token.clone()))
            .unwrap_or(0);

        let coll_price = Self::price(env, coll_token);
        let debt_price = Self::price(env, debt_token);
        let cf: i128 = env
            .storage()
            .persistent()
            .get(&Key::CollFactor(coll_token.clone()))
            .unwrap_or(7_500);
        let mcr: i128 = env
            .storage()
            .instance()
            .get(&Key::MinCollRatio)
            .unwrap_or(15_000);

        // adj_coll = coll_bal * coll_price * cf / BPS
        let adj_coll = coll_bal
            .checked_mul(coll_price)
            .and_then(|v| v.checked_mul(cf))
            .and_then(|v| v.checked_div(BPS))
            .unwrap_or(0);
        // req_coll = debt * debt_price * mcr / BPS
        let req_coll = debt
            .checked_mul(debt_price)
            .and_then(|v| v.checked_mul(mcr))
            .and_then(|v| v.checked_div(BPS))
            .unwrap_or(i128::MAX);
        adj_coll >= req_coll
    }

    fn assert_healthy(env: &Env, user: &Address, coll_token: &Address, debt_token: &Address) {
        if !Self::is_healthy(env, user, coll_token, debt_token) {
            panic_with_error!(env, LPError::BelowMinCollRatio);
        }
    }

    /// Fetch the oracle price for `token` (cross-contract call).
    fn price(env: &Env, token: &Address) -> i128 {
        let oracle: Address = env
            .storage()
            .instance()
            .get(&Key::Oracle)
            .unwrap_or_else(|| panic_with_error!(env, LPError::NotInitialized));
        let p: i128 = env.invoke_contract(
            &oracle,
            &symbol_short!("get_price"),
            soroban_sdk::vec![env, token.into_val(env)],
        );
        if p <= 0 {
            panic_with_error!(env, LPError::OracleBadPrice);
        }
        p
    }

    fn only_admin(env: &Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&Key::Admin)
            .unwrap_or_else(|| panic_with_error!(env, LPError::NotInitialized));
        admin.require_auth();
    }

    fn check_nonzero(env: &Env, v: i128) {
        if v <= 0 {
            panic_with_error!(env, LPError::ZeroAmount);
        }
    }

    fn check_supported(env: &Env, token: &Address) {
        if !env
            .storage()
            .persistent()
            .has(&Key::CollFactor(token.clone()))
        {
            panic_with_error!(env, LPError::UnsupportedToken);
        }
    }

    /// Check circuit-breaker pause state.
    fn check_not_paused(env: &Env) {
        let paused: bool = env
            .storage()
            .instance()
            .get::<Symbol, bool>(&PAUSED_KEY)
            .unwrap_or(false);
        if paused {
            panic_with_error!(env, LPError::ContractPaused);
        }
    }

    /// Acquire the reentrancy guard using temporary storage (SC-HARD-17).
    ///
    /// Temporary storage entries are automatically removed at ledger close, so
    /// a crashed/stuck lock cannot survive across transactions. Within a single
    /// transaction envelope, the entry persists, blocking any reentrant call.
    fn lock(env: &Env) {
        if env.storage().temporary().has(&RG_KEY) {
            panic_with_error!(env, LPError::ReentrancyGuardTriggered);
        }
        // TTL of 1 ledger is sufficient — the value lives exactly until the
        // transaction completes and temporary storage is cleaned up.
        env.storage().temporary().set(&RG_KEY, &true);
    }

    /// Release the reentrancy guard.
    fn unlock(env: &Env) {
        env.storage().temporary().remove(&RG_KEY);
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    /// Minimal mock oracle: always returns SCALE for any token.
    #[contract]
    struct MockOracle;
    #[contractimpl]
    impl MockOracle {
        pub fn get_price(_env: Env, _token: Address) -> i128 {
            1_000_000_000_000i128 // SCALE — price = 1.0
        }
    }

    /// Minimal mock token: transfer is a no-op (avoids balance accounting).
    #[contract]
    struct MockToken;
    #[contractimpl]
    impl MockToken {
        pub fn transfer(_env: Env, _from: Address, _to: Address, _amount: i128) {}
    }

    fn setup(env: &Env) -> (LendingPoolClient<'static>, Address, Address) {
        let id = env.register(LendingPool, ());
        let client = LendingPoolClient::new(env, &id);
        let oracle = env.register(MockOracle, ());
        let admin = Address::generate(env);
        client.initialize(&admin, &oracle, &15_000, &500);
        (client, admin, oracle)
    }

    fn add_token(env: &Env, client: &LendingPoolClient<'_>) -> Address {
        let token = env.register(MockToken, ());
        client.add_asset(&token, &10_000, &0); // 100 % collateral factor, 0 % rate
        token
    }

    #[test]
    fn deposit_increases_collateral_balance() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _, _) = setup(&env);
        let token = add_token(&env, &client);
        let user = Address::generate(&env);

        client.deposit_collateral(&user, &token, &1_000);
        assert_eq!(client.collateral_of(&user, &token), 1_000);
    }

    #[test]
    fn repay_reduces_debt() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _, _) = setup(&env);
        let token = add_token(&env, &client);
        let user = Address::generate(&env);

        client.deposit_collateral(&user, &token, &10_000);
        client.borrow(&user, &token, &token, &1_000);
        assert_eq!(client.debt_of(&user, &token), 1_000);

        client.repay(&user, &token, &400);
        assert_eq!(client.debt_of(&user, &token), 600);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn borrow_exceeding_ratio_is_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _, _) = setup(&env);
        let token = add_token(&env, &client);
        let user = Address::generate(&env);

        client.deposit_collateral(&user, &token, &100);
        client.borrow(&user, &token, &token, &1_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #10)")]
    fn reentrancy_guard_blocks_double_entry() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _, _) = setup(&env);
        let token = add_token(&env, &client);
        let user = Address::generate(&env);

        // Simulate a reentrant state by pre-setting the temporary guard key.
        env.as_contract(&client.address, || {
            env.storage().temporary().set(&RG_KEY, &true);
        });

        // This deposit should be rejected because the guard key exists.
        client.deposit_collateral(&user, &token, &1_000);
    }

    #[test]
    fn reentrancy_lock_is_released_after_successful_call() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _, _) = setup(&env);
        let token = add_token(&env, &client);
        let user = Address::generate(&env);

        client.deposit_collateral(&user, &token, &1_000);
        client.deposit_collateral(&user, &token, &2_000);
        assert_eq!(client.collateral_of(&user, &token), 3_000);
    }

    #[test]
    fn state_remains_consistent_after_normal_operations() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _, _) = setup(&env);
        let token = add_token(&env, &client);
        let user = Address::generate(&env);

        client.deposit_collateral(&user, &token, &10_000);
        client.borrow(&user, &token, &token, &5_000);
        client.repay(&user, &token, &2_500);
        assert_eq!(client.debt_of(&user, &token), 2_500);
        assert_eq!(client.collateral_of(&user, &token), 10_000);
        assert!(client.health_ok(&user, &token, &token));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #14)")]
    fn paused_contract_rejects_deposit() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin, _) = setup(&env);
        let token = add_token(&env, &client);
        let user = Address::generate(&env);

        client.set_paused(&admin, &true);
        client.deposit_collateral(&user, &token, &1_000);
    }

    use proptest::prelude::*;

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(1000))]
        #[test]
        fn prop_lending_pool_collateral_repay_invariants(
            deposit_amt in 1_000i128..1_000_000_000i128,
            repay_frac in 1i128..100i128,
        ) {
            let env = Env::default();
            env.mock_all_auths();
            let (client, _, _) = setup(&env);
            let token = add_token(&env, &client);
            let user = Address::generate(&env);

            client.deposit_collateral(&user, &token, &deposit_amt);
            let coll = client.collateral_of(&user, &token);
            prop_assert_eq!(coll, deposit_amt);

            let max_borrow = deposit_amt * 10_000 / 15_000;
            if max_borrow > 0 {
                client.borrow(&user, &token, &token, &max_borrow);
                let debt = client.debt_of(&user, &token);
                prop_assert_eq!(debt, max_borrow);

                let repay_amt = (debt * repay_frac) / 100;
                if repay_amt > 0 {
                    client.repay(&user, &token, &repay_amt);
                    let rem_debt = client.debt_of(&user, &token);
                    prop_assert_eq!(rem_debt, debt - repay_amt);
                }
            }
        }
    }
}
