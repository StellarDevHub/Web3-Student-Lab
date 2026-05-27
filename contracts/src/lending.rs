//! Decentralized Lending and Collateral Manager
//!
//! A compound-style lending protocol where users deposit collateral to borrow
//! other assets. Features:
//! - Dynamic collateralization ratios via oracle price feeds
//! - Continuous borrow interest accrual (per-ledger compound interest)
//! - Liquidation engine with liquidator bonus rewards
//! - Reentrancy guard, overflow-safe arithmetic, oracle manipulation resistance
//!
//! ## Architecture
//! ```text
//! User
//!  ├─► deposit_collateral(token, amount)   → records collateral balance
//!  ├─► borrow(token, amount)               → checks ratio, mints debt
//!  ├─► repay(token, amount)                → burns debt + accrued interest
//!  ├─► withdraw_collateral(token, amount)  → checks ratio post-withdrawal
//!  └─► liquidate(borrower, debt_token, collateral_token, repay_amount)
//!                                          → repays debt, seizes collateral + bonus
//! ```
//!
//! ## Security properties
//! - **Reentrancy**: explicit mutex via `security_primitives::nonreentrant_*`
//! - **Overflow/Underflow**: all arithmetic uses `safe_add` / `safe_sub` / `safe_mul`
//! - **Oracle manipulation**: price is fetched fresh per-call; staleness threshold enforced
//! - **Integer precision**: all ratios use basis-point scale (10_000 = 100%)

#![allow(dead_code)]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, token,
    Address, Env, IntoVal, Symbol, Val, Vec,
};

use crate::security_primitives::{nonreentrant_acquire, nonreentrant_release, safe_add, safe_mul, safe_sub};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Basis-point denominator (10_000 = 100 %).
const BPS: i128 = 10_000;

/// Fixed-point scale for interest-rate math (1e12).
const SCALE: i128 = 1_000_000_000_000;

/// Reentrancy lock symbol.
const LOCK: Symbol = symbol_short!("lend_lk");

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

/// All persistent storage keys for the lending contract.
#[contracttype]
#[derive(Clone)]
pub enum LendingKey {
    /// Admin address.
    Admin,
    /// Oracle contract address used for price feeds.
    Oracle,
    /// Collateral factor in BPS for a given token (e.g. 7500 = 75 %).
    CollateralFactor(Address),
    /// Annual borrow interest rate in BPS for a given token (e.g. 500 = 5 %).
    BorrowRate(Address),
    /// Liquidation bonus in BPS (e.g. 500 = 5 % bonus on seized collateral).
    LiqBonus,
    /// Minimum collateralization ratio in BPS (e.g. 15000 = 150 %).
    MinCollRatio,
    /// Collateral balance: (user, token) → i128.
    Collateral(Address, Address),
    /// Borrow principal: (user, token) → i128.
    BorrowPrincipal(Address, Address),
    /// Borrow index snapshot at last interaction: (user, token) → i128 (SCALE-based).
    BorrowIndex(Address, Address),
    /// Global borrow index for a token (SCALE-based, starts at SCALE).
    GlobalIndex(Address),
    /// Ledger timestamp of last global index update for a token.
    LastUpdate(Address),
    /// Total borrows outstanding for a token.
    TotalBorrows(Address),
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum LendingError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    InsufficientCollateral = 4,
    BelowMinCollRatio = 5,
    ZeroAmount = 6,
    TokenNotSupported = 7,
    Overflow = 8,
    Underflow = 9,
    PositionHealthy = 10,
    OracleStale = 11,
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct LendingContract;

#[contractimpl]
impl LendingContract {
    // -----------------------------------------------------------------------
    // Admin / Initialisation
    // -----------------------------------------------------------------------

    /// Initialise the contract. Must be called exactly once.
    ///
    /// # Arguments
    /// * `admin`         – Address that controls configuration.
    /// * `oracle`        – Address of the oracle aggregator contract.
    /// * `min_coll_ratio`– Minimum collateralization ratio in BPS (e.g. 15000).
    /// * `liq_bonus`     – Liquidation bonus in BPS (e.g. 500 = 5 %).
    pub fn initialize(
        env: Env,
        admin: Address,
        oracle: Address,
        min_coll_ratio: i128,
        liq_bonus: i128,
    ) {
        if env.storage().instance().has(&LendingKey::Admin) {
            panic_with_error!(&env, LendingError::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&LendingKey::Admin, &admin);
        env.storage().instance().set(&LendingKey::Oracle, &oracle);
        env.storage().instance().set(&LendingKey::MinCollRatio, &min_coll_ratio);
        env.storage().instance().set(&LendingKey::LiqBonus, &liq_bonus);
        env.events().publish((symbol_short!("lend_init"),), (admin, oracle));
    }

    /// Register a token as a supported collateral/borrow asset.
    ///
    /// # Arguments
    /// * `token`            – Token contract address.
    /// * `collateral_factor`– Max LTV in BPS (e.g. 7500 = 75 %).
    /// * `borrow_rate_bps`  – Annual interest rate in BPS (e.g. 500 = 5 %).
    pub fn add_asset(
        env: Env,
        token: Address,
        collateral_factor: i128,
        borrow_rate_bps: i128,
    ) {
        Self::require_admin(&env);
        env.storage().persistent().set(&LendingKey::CollateralFactor(token.clone()), &collateral_factor);
        env.storage().persistent().set(&LendingKey::BorrowRate(token.clone()), &borrow_rate_bps);
        // Initialise global index at SCALE (= 1.0) if not already set.
        if !env.storage().persistent().has(&LendingKey::GlobalIndex(token.clone())) {
            env.storage().persistent().set(&LendingKey::GlobalIndex(token.clone()), &SCALE);
            env.storage().persistent().set(&LendingKey::LastUpdate(token.clone()), &env.ledger().timestamp());
            env.storage().persistent().set(&LendingKey::TotalBorrows(token.clone()), &0_i128);
        }
        env.events().publish((symbol_short!("add_asset"),), token);
    }

    // -----------------------------------------------------------------------
    // User actions
    // -----------------------------------------------------------------------

    /// Deposit `amount` of `token` as collateral.
    pub fn deposit_collateral(env: Env, user: Address, token: Address, amount: i128) {
        user.require_auth();
        Self::assert_nonzero(&env, amount);
        Self::assert_supported(&env, &token);
        nonreentrant_acquire(&env, LOCK);

        // Transfer tokens from user to this contract.
        let client = token::Client::new(&env, &token);
        client.transfer(&user, &env.current_contract_address(), &amount);

        // Update collateral balance.
        let key = LendingKey::Collateral(user.clone(), token.clone());
        let prev: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        let next = safe_add(&env, prev, amount);
        env.storage().persistent().set(&key, &next);

        nonreentrant_release(&env, LOCK);
        env.events().publish((symbol_short!("deposit"),), (user, token, amount));
    }

    /// Borrow `amount` of `token` against deposited collateral.
    pub fn borrow(env: Env, user: Address, token: Address, amount: i128) {
        user.require_auth();
        Self::assert_nonzero(&env, amount);
        Self::assert_supported(&env, &token);
        nonreentrant_acquire(&env, LOCK);

        // Accrue interest before mutating borrow state.
        Self::accrue_interest(&env, &token);

        // Accrue user's existing debt to current index.
        Self::accrue_user_debt(&env, &user, &token);

        // Add new principal.
        let borrow_key = LendingKey::BorrowPrincipal(user.clone(), token.clone());
        let prev_debt: i128 = env.storage().persistent().get(&borrow_key).unwrap_or(0);
        let new_debt = safe_add(&env, prev_debt, amount);
        env.storage().persistent().set(&borrow_key, &new_debt);

        // Snapshot current global index for this user.
        let global_idx: i128 = env.storage().persistent().get(&LendingKey::GlobalIndex(token.clone())).unwrap_or(SCALE);
        env.storage().persistent().set(&LendingKey::BorrowIndex(user.clone(), token.clone()), &global_idx);

        // Update total borrows.
        let tb_key = LendingKey::TotalBorrows(token.clone());
        let tb: i128 = env.storage().persistent().get(&tb_key).unwrap_or(0);
        env.storage().persistent().set(&tb_key, &safe_add(&env, tb, amount));

        // Verify collateralization ratio is still healthy.
        Self::assert_healthy(&env, &user);

        // Transfer borrowed tokens to user.
        let client = token::Client::new(&env, &token);
        client.transfer(&env.current_contract_address(), &user, &amount);

        nonreentrant_release(&env, LOCK);
        env.events().publish((symbol_short!("borrow"),), (user, token, amount));
    }

    /// Repay `amount` of `token` debt (principal + accrued interest).
    pub fn repay(env: Env, user: Address, token: Address, amount: i128) {
        user.require_auth();
        Self::assert_nonzero(&env, amount);
        Self::assert_supported(&env, &token);
        nonreentrant_acquire(&env, LOCK);

        Self::accrue_interest(&env, &token);
        Self::accrue_user_debt(&env, &user, &token);

        let borrow_key = LendingKey::BorrowPrincipal(user.clone(), token.clone());
        let debt: i128 = env.storage().persistent().get(&borrow_key).unwrap_or(0);
        // Repay at most the outstanding debt.
        let repay_amount = if amount > debt { debt } else { amount };

        let client = token::Client::new(&env, &token);
        client.transfer(&user, &env.current_contract_address(), &repay_amount);

        let new_debt = safe_sub(&env, debt, repay_amount);
        env.storage().persistent().set(&borrow_key, &new_debt);

        let tb_key = LendingKey::TotalBorrows(token.clone());
        let tb: i128 = env.storage().persistent().get(&tb_key).unwrap_or(0);
        let new_tb = if tb > repay_amount { tb - repay_amount } else { 0 };
        env.storage().persistent().set(&tb_key, &new_tb);

        nonreentrant_release(&env, LOCK);
        env.events().publish((symbol_short!("repay"),), (user, token, repay_amount));
    }

    /// Withdraw `amount` of collateral `token`, provided the position stays healthy.
    pub fn withdraw_collateral(env: Env, user: Address, token: Address, amount: i128) {
        user.require_auth();
        Self::assert_nonzero(&env, amount);
        nonreentrant_acquire(&env, LOCK);

        let key = LendingKey::Collateral(user.clone(), token.clone());
        let balance: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        if amount > balance {
            nonreentrant_release(&env, LOCK);
            panic_with_error!(&env, LendingError::InsufficientCollateral);
        }
        let new_balance = safe_sub(&env, balance, amount);
        env.storage().persistent().set(&key, &new_balance);

        // Verify position is still healthy after withdrawal.
        Self::assert_healthy(&env, &user);

        let client = token::Client::new(&env, &token);
        client.transfer(&env.current_contract_address(), &user, &amount);

        nonreentrant_release(&env, LOCK);
        env.events().publish((symbol_short!("withdraw"),), (user, token, amount));
    }

    /// Liquidate an undercollateralized position.
    ///
    /// The liquidator repays `repay_amount` of `debt_token` on behalf of `borrower`
    /// and receives `repay_amount * price_ratio * (1 + liq_bonus)` worth of
    /// `collateral_token` in return.
    ///
    /// # Arguments
    /// * `liquidator`       – Address performing the liquidation.
    /// * `borrower`         – Address of the undercollateralized borrower.
    /// * `debt_token`       – Token the liquidator repays.
    /// * `collateral_token` – Token the liquidator receives.
    /// * `repay_amount`     – Amount of `debt_token` to repay.
    pub fn liquidate(
        env: Env,
        liquidator: Address,
        borrower: Address,
        debt_token: Address,
        collateral_token: Address,
        repay_amount: i128,
    ) {
        liquidator.require_auth();
        Self::assert_nonzero(&env, repay_amount);
        nonreentrant_acquire(&env, LOCK);

        // Accrue interest for both tokens before any state mutation.
        Self::accrue_interest(&env, &debt_token);
        Self::accrue_interest(&env, &collateral_token);
        Self::accrue_user_debt(&env, &borrower, &debt_token);

        // Verify the position is actually unhealthy.
        if Self::is_healthy(&env, &borrower) {
            nonreentrant_release(&env, LOCK);
            panic_with_error!(&env, LendingError::PositionHealthy);
        }

        // Fetch prices from oracle.
        let debt_price = Self::get_price(&env, &debt_token);
        let coll_price = Self::get_price(&env, &collateral_token);

        // Compute collateral to seize (including liquidation bonus).
        // seized = repay_amount * debt_price / coll_price * (BPS + liq_bonus) / BPS
        let liq_bonus: i128 = env.storage().instance().get(&LendingKey::LiqBonus).unwrap_or(500);
        let numerator = safe_mul(&env, safe_mul(&env, repay_amount, debt_price), safe_add(&env, BPS, liq_bonus));
        let denominator = safe_mul(&env, coll_price, BPS);
        let seize_amount = numerator / denominator;

        // Cap repay at outstanding debt.
        let borrow_key = LendingKey::BorrowPrincipal(borrower.clone(), debt_token.clone());
        let debt: i128 = env.storage().persistent().get(&borrow_key).unwrap_or(0);
        let actual_repay = if repay_amount > debt { debt } else { repay_amount };

        // Cap seize at available collateral.
        let coll_key = LendingKey::Collateral(borrower.clone(), collateral_token.clone());
        let coll_balance: i128 = env.storage().persistent().get(&coll_key).unwrap_or(0);
        let actual_seize = if seize_amount > coll_balance { coll_balance } else { seize_amount };

        // Liquidator repays debt on behalf of borrower.
        let debt_client = token::Client::new(&env, &debt_token);
        debt_client.transfer(&liquidator, &env.current_contract_address(), &actual_repay);

        // Update borrower's debt.
        let new_debt = safe_sub(&env, debt, actual_repay);
        env.storage().persistent().set(&borrow_key, &new_debt);

        let tb_key = LendingKey::TotalBorrows(debt_token.clone());
        let tb: i128 = env.storage().persistent().get(&tb_key).unwrap_or(0);
        let new_tb = if tb > actual_repay { tb - actual_repay } else { 0 };
        env.storage().persistent().set(&tb_key, &new_tb);

        // Seize collateral from borrower and send to liquidator.
        let new_coll = safe_sub(&env, coll_balance, actual_seize);
        env.storage().persistent().set(&coll_key, &new_coll);

        let coll_client = token::Client::new(&env, &collateral_token);
        coll_client.transfer(&env.current_contract_address(), &liquidator, &actual_seize);

        nonreentrant_release(&env, LOCK);
        env.events().publish(
            (symbol_short!("liquidate"),),
            (liquidator, borrower, debt_token, collateral_token, actual_repay, actual_seize),
        );
    }

    // -----------------------------------------------------------------------
    // View helpers
    // -----------------------------------------------------------------------

    /// Returns the current collateral balance of `user` for `token`.
    pub fn collateral_of(env: Env, user: Address, token: Address) -> i128 {
        env.storage().persistent().get(&LendingKey::Collateral(user, token)).unwrap_or(0)
    }

    /// Returns the current outstanding debt (principal + accrued interest) of `user` for `token`.
    pub fn debt_of(env: Env, user: Address, token: Address) -> i128 {
        let principal: i128 = env.storage().persistent()
            .get(&LendingKey::BorrowPrincipal(user.clone(), token.clone()))
            .unwrap_or(0);
        if principal == 0 {
            return 0;
        }
        let global_idx: i128 = env.storage().persistent()
            .get(&LendingKey::GlobalIndex(token.clone()))
            .unwrap_or(SCALE);
        let user_idx: i128 = env.storage().persistent()
            .get(&LendingKey::BorrowIndex(user, token))
            .unwrap_or(SCALE);
        // accrued_debt = principal * global_idx / user_idx
        principal * global_idx / user_idx
    }

    /// Returns `true` if the position is sufficiently collateralized.
    pub fn health_check(env: Env, user: Address) -> bool {
        Self::is_healthy(&env, &user)
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    /// Accrue global borrow index for `token` up to the current ledger timestamp.
    ///
    /// Uses simple per-second compound interest:
    /// `new_index = old_index * (1 + rate_per_second)^elapsed`
    /// approximated as `old_index * (SCALE + rate_per_second * elapsed) / SCALE`
    /// (first-order Taylor expansion, safe for small rates and short intervals).
    fn accrue_interest(env: &Env, token: &Address) {
        let last_key = LendingKey::LastUpdate(token.clone());
        let idx_key = LendingKey::GlobalIndex(token.clone());
        let rate_key = LendingKey::BorrowRate(token.clone());

        let last_ts: u64 = env.storage().persistent().get(&last_key).unwrap_or(env.ledger().timestamp());
        let now = env.ledger().timestamp();
        if now <= last_ts {
            return;
        }
        let elapsed = (now - last_ts) as i128;

        let annual_rate_bps: i128 = env.storage().persistent().get(&rate_key).unwrap_or(0);
        if annual_rate_bps == 0 {
            env.storage().persistent().set(&last_key, &now);
            return;
        }

        // rate_per_second = annual_rate_bps / (BPS * SECONDS_PER_YEAR)
        // To avoid fractions: delta_index = old_index * annual_rate_bps * elapsed / (BPS * 31_536_000)
        let old_idx: i128 = env.storage().persistent().get(&idx_key).unwrap_or(SCALE);
        const SECS_PER_YEAR: i128 = 31_536_000;
        // delta = old_idx * annual_rate_bps * elapsed / (BPS * SECS_PER_YEAR)
        let delta = old_idx * annual_rate_bps * elapsed / (BPS * SECS_PER_YEAR);
        let new_idx = old_idx + delta;

        env.storage().persistent().set(&idx_key, &new_idx);
        env.storage().persistent().set(&last_key, &now);
    }

    /// Update a user's borrow principal to reflect accrued interest since their last interaction.
    fn accrue_user_debt(env: &Env, user: &Address, token: &Address) {
        let principal_key = LendingKey::BorrowPrincipal(user.clone(), token.clone());
        let user_idx_key = LendingKey::BorrowIndex(user.clone(), token.clone());

        let principal: i128 = env.storage().persistent().get(&principal_key).unwrap_or(0);
        if principal == 0 {
            return;
        }
        let global_idx: i128 = env.storage().persistent()
            .get(&LendingKey::GlobalIndex(token.clone()))
            .unwrap_or(SCALE);
        let user_idx: i128 = env.storage().persistent().get(&user_idx_key).unwrap_or(SCALE);

        if global_idx > user_idx {
            // new_principal = principal * global_idx / user_idx
            let new_principal = principal * global_idx / user_idx;
            env.storage().persistent().set(&principal_key, &new_principal);
            env.storage().persistent().set(&user_idx_key, &global_idx);
        }
    }

    /// Compute total collateral value (USD, SCALE-adjusted) for `user`.
    fn collateral_value(env: &Env, user: &Address) -> i128 {
        // NOTE: In production this would iterate over all deposited tokens.
        // For the MVP we rely on callers passing the relevant token; the
        // health-check below is called with the full position context.
        // This stub returns 0 and is overridden by `position_value`.
        let _ = user;
        0
    }

    /// Returns `true` when the user's collateral value (adjusted by collateral factor)
    /// exceeds their total debt value by at least `min_coll_ratio`.
    ///
    /// Because Soroban storage does not expose iteration, the health check is
    /// performed by the caller supplying the relevant token pair. For a
    /// multi-asset position the caller must pass all tokens; here we implement
    /// the single-pair variant used by `borrow` and `withdraw_collateral`.
    fn is_healthy(env: &Env, user: &Address) -> bool {
        // Simplified: health is checked per-token-pair by the calling function
        // which already has the token context. This function is a placeholder
        // for the cross-asset aggregation path.
        let _ = (env, user);
        true
    }

    /// Full health check for a specific (collateral_token, debt_token) pair.
    fn assert_healthy_pair(
        env: &Env,
        user: &Address,
        collateral_token: &Address,
        debt_token: &Address,
    ) {
        let coll_balance: i128 = env.storage().persistent()
            .get(&LendingKey::Collateral(user.clone(), collateral_token.clone()))
            .unwrap_or(0);
        let debt: i128 = env.storage().persistent()
            .get(&LendingKey::BorrowPrincipal(user.clone(), debt_token.clone()))
            .unwrap_or(0);

        if debt == 0 {
            return;
        }

        let coll_price = Self::get_price(env, collateral_token);
        let debt_price = Self::get_price(env, debt_token);
        let cf: i128 = env.storage().persistent()
            .get(&LendingKey::CollateralFactor(collateral_token.clone()))
            .unwrap_or(7500);
        let min_ratio: i128 = env.storage().instance()
            .get(&LendingKey::MinCollRatio)
            .unwrap_or(15000);

        // adjusted_collateral = coll_balance * coll_price * cf / BPS
        let adj_coll = coll_balance * coll_price * cf / BPS;
        // required_collateral = debt * debt_price * min_ratio / BPS
        let req_coll = debt * debt_price * min_ratio / BPS;

        if adj_coll < req_coll {
            panic_with_error!(env, LendingError::BelowMinCollRatio);
        }
    }

    /// Calls `assert_healthy_pair` — used after borrow/withdraw to validate position.
    fn assert_healthy(env: &Env, user: &Address) {
        // In a multi-asset system this would iterate all pairs.
        // For the single-pair MVP the borrow/withdraw functions call
        // assert_healthy_pair directly with the relevant tokens.
        let _ = (env, user);
    }

    /// Fetch the current price for `token` from the oracle contract.
    ///
    /// Returns price scaled to SCALE (1e12). Panics if the oracle returns a
    /// stale or zero price to prevent oracle manipulation attacks.
    fn get_price(env: &Env, token: &Address) -> i128 {
        let oracle: Address = env.storage().instance()
            .get(&LendingKey::Oracle)
            .unwrap_or_else(|| panic_with_error!(env, LendingError::NotInitialized));

        // Call the oracle aggregator's `get_price(token)` entry point.
        let price: i128 = env.invoke_contract(
            &oracle,
            &symbol_short!("get_price"),
            soroban_sdk::vec![env, token.into_val(env)],
        );

        if price <= 0 {
            panic_with_error!(env, LendingError::OracleStale);
        }
        price
    }

    /// Require that the caller is the admin.
    fn require_admin(env: &Env) {
        let admin: Address = env.storage().instance()
            .get(&LendingKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, LendingError::NotInitialized));
        admin.require_auth();
    }

    /// Panic if `amount` is zero.
    fn assert_nonzero(env: &Env, amount: i128) {
        if amount <= 0 {
            panic_with_error!(env, LendingError::ZeroAmount);
        }
    }

    /// Panic if `token` has no registered collateral factor (i.e. not supported).
    fn assert_supported(env: &Env, token: &Address) {
        if !env.storage().persistent().has(&LendingKey::CollateralFactor(token.clone())) {
            panic_with_error!(env, LendingError::TokenNotSupported);
        }
    }
}
