#![no_std]

//! # Continuous Polynomial Bonding Curve
//!
//! A Bancor-style automated market maker that mints and burns a project's
//! token against a reserve asset along a **linear price curve**:
//!
//! `price(s) = base_price + slope * s`, where `s` is current token supply.
//! Buys and sells use the exact integral of this polynomial, with fixed-point
//! parameters scaled by `1e9`.
//! For a trade of `x` tokens from supply `s`, the reserve amount is
//! `base_price * x / FP + slope * x * (2 * s +/- x) / (2 * FP)`; buys round
//! up and sells round down to the reserve token's smallest unit.
//!
//! Features:
//! * Reserve collateral is checked against curve liabilities and accrued
//!   fees before trades and fee withdrawals.
//! * Slippage protection (`max_reserve_in` on buys, `min_reserve_out` on
//!   sells) and deadline checks.
//! * Emergency pause switches (admin-only).
//! * Protocol fee accounting (`fee_bps`) with admin fee withdrawal.
//! * Structured on-chain events (see [`contract_events`]).

#[cfg(test)]
extern crate std;

use contract_events::{publish_fee_withdraw, publish_pause, publish_trade};
use pricing::{apply_buy_fee, apply_sell_fee, curve_cost, curve_payout, solve_tokens_for_reserve};
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, token,
    Address, Env,
};

pub mod math;
mod pricing;
mod reserves;

/// Fixed-point scale: 1 unit == 10^9.
pub const FP: i128 = 1_000_000_000;
/// Maximum allowed protocol fee in basis points (10%).
pub const MAX_FEE_BPS: i128 = 1_000;

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    ReserveToken,
    CurveToken,
    BasePrice,
    Slope,
    FeeBps,
    Supply,
    Reserve,
    FeePool,
    Paused,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum CurveError {
    /// `200` — Contract has already been initialised.
    AlreadyInitialized = 200,
    /// `201` — Contract has not been initialised.
    NotInitialized = 201,
    /// `202` — Amount is invalid (zero or negative).
    InvalidAmount = 202,
    /// `203` — Trade would exceed slippage tolerance.
    SlippageExceeded = 203,
    /// `204` — Transaction deadline has passed.
    DeadlinePassed = 204,
    /// `205` — Caller is not the admin.
    Unauthorized = 205,
    /// `206` — Token supply is insufficient for the requested sell.
    InsufficientSupply = 206,
    /// `207` — Contract is paused.
    Paused = 207,
    /// `208` — Fixed-point arithmetic overflow.
    Overflow = 208,
    /// `209` — Fee is outside the allowed range.
    InvalidFee = 209,
    /// `210` — Fixed-point arithmetic underflow.
    Underflow = 210,
    /// `211` — Division by zero in fixed-point math.
    DivisionByZero = 211,
    /// `212` — Contract is paused by the circuit-breaker (SC-HARD-19).
    ContractPaused = 212,
    /// `213` — Pool assets do not cover reserve and fee liabilities.
    Insolvent = 213,
    /// `214` — Curve token is not controlled by this contract.
    InvalidCurveToken = 214,
}

// ── Fixed-point math helpers at 18-decimal precision (SC-HARD-18) ─────────────

/// 18-decimal fixed-point math helpers for the bonding curve.
pub mod fp18 {
    /// Scale factor: 10^18.
    pub const SCALE18: i128 = 1_000_000_000_000_000_000; // 1e18

    /// Checked multiply of two 18-decimal FP values.
    #[inline]
    pub fn mul(a: i128, b: i128) -> Option<i128> {
        a.checked_mul(b)?.checked_div(SCALE18)
    }

    /// Checked divide of two 18-decimal FP values.
    #[inline]
    pub fn div(a: i128, b: i128) -> Option<i128> {
        if b == 0 {
            return None;
        }
        a.checked_mul(SCALE18)?.checked_div(b)
    }
}

#[contract]
pub struct ContinuousBondingCurveContract;

#[contractimpl]
impl ContinuousBondingCurveContract {
    /// Initialize the pool.
    ///
    /// * `admin` — owner; can pause the pool, change fees, withdraw fees.
    /// * `reserve_token` — the reserve asset deposited on buys and paid out
    ///   on sells.
    /// * `curve_token` — an unissued Stellar Asset Contract whose admin is
    ///   this contract.
    /// * `base_price` — fixed-point price at zero supply (`1_000_000_000` == 1).
    /// * `slope` — fixed-point linear price increase per token, both parameters
    ///   using `FP` scaling.
    /// * `fee_bps` — protocol fee in basis points (`50` == 0.5%).
    pub fn initialize(
        env: Env,
        admin: Address,
        reserve_token: Address,
        curve_token: Address,
        base_price: i128,
        slope: i128,
        fee_bps: i128,
    ) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, CurveError::AlreadyInitialized);
        }
        if base_price <= 0 || slope <= 0 {
            panic_with_error!(&env, CurveError::InvalidAmount);
        }
        if reserve_token == curve_token
            || token::StellarAssetClient::new(&env, &curve_token).admin()
                != env.current_contract_address()
        {
            panic_with_error!(&env, CurveError::InvalidCurveToken);
        }
        if !(0..=MAX_FEE_BPS).contains(&fee_bps) {
            panic_with_error!(&env, CurveError::InvalidFee);
        }

        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::ReserveToken, &reserve_token);
        env.storage()
            .instance()
            .set(&DataKey::CurveToken, &curve_token);
        env.storage()
            .instance()
            .set(&DataKey::BasePrice, &base_price);
        env.storage().instance().set(&DataKey::Slope, &slope);
        env.storage().instance().set(&DataKey::FeeBps, &fee_bps);
        env.storage().instance().set(&DataKey::Supply, &0i128);
        env.storage().instance().set(&DataKey::Reserve, &0i128);
        env.storage().instance().set(&DataKey::FeePool, &0i128);
        env.storage().instance().set(&DataKey::Paused, &false);
    }

    /// Toggle the emergency pause switch. Blocks all trades while paused.
    pub fn set_paused(env: Env, admin: Address, paused: bool) {
        ensure_initialized(&env);
        admin.require_auth();
        require_admin(&env, &admin);

        env.storage().instance().set(&DataKey::Paused, &paused);
        publish_pause(&env, &admin, paused);
    }

    /// Update the protocol fee (basis points). Fees accumulate in the fee
    /// pool and can be withdrawn by the admin.
    pub fn set_fee_bps(env: Env, admin: Address, fee_bps: i128) {
        ensure_initialized(&env);
        admin.require_auth();
        require_admin(&env, &admin);
        if !(0..=MAX_FEE_BPS).contains(&fee_bps) {
            panic_with_error!(&env, CurveError::InvalidFee);
        }
        env.storage().instance().set(&DataKey::FeeBps, &fee_bps);
    }

    /// Buy exactly `tokens_out` curve tokens.
    ///
    /// Returns the total reserve paid (curve cost + protocol fee). Reverts
    /// with `SlippageExceeded` if the cost exceeds `max_reserve_in`.
    pub fn buy_exact_tokens(
        env: Env,
        buyer: Address,
        tokens_out: i128,
        max_reserve_in: i128,
        deadline: u64,
    ) -> i128 {
        ensure_initialized(&env);
        ensure_not_paused(&env);
        buyer.require_auth();
        check_deadline(&env, deadline);

        if tokens_out <= 0 || max_reserve_in <= 0 {
            panic_with_error!(&env, CurveError::InvalidAmount);
        }
        ensure_solvent(&env);

        let supply = read_i128(&env, DataKey::Supply);
        let cost = curve_cost(supply, tokens_out, read_base(&env), read_slope(&env))
            .unwrap_or_else(|| panic_with_error!(&env, CurveError::Overflow));
        let (total_in, fee) = apply_buy_fee(cost, read_fee_bps(&env))
            .unwrap_or_else(|| panic_with_error!(&env, CurveError::Overflow));

        if total_in > max_reserve_in {
            panic_with_error!(&env, CurveError::SlippageExceeded);
        }

        write_i128(
            &env,
            DataKey::Supply,
            supply
                .checked_add(tokens_out)
                .unwrap_or_else(|| panic_with_error!(&env, CurveError::Overflow)),
        );
        write_i128(
            &env,
            DataKey::Reserve,
            read_i128(&env, DataKey::Reserve)
                .checked_add(cost)
                .unwrap_or_else(|| panic_with_error!(&env, CurveError::Overflow)),
        );
        write_i128(
            &env,
            DataKey::FeePool,
            read_i128(&env, DataKey::FeePool)
                .checked_add(fee)
                .unwrap_or_else(|| panic_with_error!(&env, CurveError::Overflow)),
        );

        token::Client::new(&env, &read_reserve_token(&env)).transfer(
            &buyer,
            env.current_contract_address(),
            &total_in,
        );
        token::StellarAssetClient::new(&env, &read_curve_token(&env)).mint(&buyer, &tokens_out);
        ensure_solvent(&env);

        publish_trade(
            &env,
            &buyer,
            symbol_short!("buy"),
            tokens_out,
            cost,
            read_i128(&env, DataKey::Supply),
            read_i128(&env, DataKey::Reserve),
            fee,
        );
        total_in
    }

    /// Buy curve tokens with up to `reserve_in` reserve.
    ///
    /// Solves the integral for the maximum token amount whose total cost
    /// (curve + fee) fits inside `reserve_in`. Returns the token amount.
    pub fn buy_exact_reserve(
        env: Env,
        buyer: Address,
        reserve_in: i128,
        min_tokens_out: i128,
        deadline: u64,
    ) -> i128 {
        ensure_initialized(&env);
        ensure_not_paused(&env);
        buyer.require_auth();
        check_deadline(&env, deadline);

        if reserve_in <= 0 || min_tokens_out < 0 {
            panic_with_error!(&env, CurveError::InvalidAmount);
        }
        ensure_solvent(&env);

        let supply = read_i128(&env, DataKey::Supply);
        let tokens_out = solve_tokens_for_reserve(
            supply,
            reserve_in,
            read_base(&env),
            read_slope(&env),
            read_fee_bps(&env),
        )
        .unwrap_or_else(|| panic_with_error!(&env, CurveError::Overflow));

        if tokens_out < min_tokens_out {
            panic_with_error!(&env, CurveError::SlippageExceeded);
        }
        if tokens_out == 0 {
            panic_with_error!(&env, CurveError::InvalidAmount);
        }

        let cost = curve_cost(supply, tokens_out, read_base(&env), read_slope(&env))
            .unwrap_or_else(|| panic_with_error!(&env, CurveError::Overflow));
        let (total_in, fee) = apply_buy_fee(cost, read_fee_bps(&env))
            .unwrap_or_else(|| panic_with_error!(&env, CurveError::Overflow));

        write_i128(
            &env,
            DataKey::Supply,
            supply
                .checked_add(tokens_out)
                .unwrap_or_else(|| panic_with_error!(&env, CurveError::Overflow)),
        );
        write_i128(
            &env,
            DataKey::Reserve,
            read_i128(&env, DataKey::Reserve)
                .checked_add(cost)
                .unwrap_or_else(|| panic_with_error!(&env, CurveError::Overflow)),
        );
        write_i128(
            &env,
            DataKey::FeePool,
            read_i128(&env, DataKey::FeePool)
                .checked_add(fee)
                .unwrap_or_else(|| panic_with_error!(&env, CurveError::Overflow)),
        );

        token::Client::new(&env, &read_reserve_token(&env)).transfer(
            &buyer,
            env.current_contract_address(),
            &total_in,
        );
        token::StellarAssetClient::new(&env, &read_curve_token(&env)).mint(&buyer, &tokens_out);
        ensure_solvent(&env);

        publish_trade(
            &env,
            &buyer,
            symbol_short!("buy"),
            tokens_out,
            cost,
            read_i128(&env, DataKey::Supply),
            read_i128(&env, DataKey::Reserve),
            fee,
        );
        tokens_out
    }

    /// Sell exactly `tokens_in` curve tokens.
    ///
    /// Returns the net reserve payout (curve payout minus protocol fee).
    /// Reverts with `SlippageExceeded` if the payout is below
    /// `min_reserve_out`.
    pub fn sell_exact_tokens(
        env: Env,
        seller: Address,
        tokens_in: i128,
        min_reserve_out: i128,
        deadline: u64,
    ) -> i128 {
        ensure_initialized(&env);
        ensure_not_paused(&env);
        seller.require_auth();
        check_deadline(&env, deadline);

        if tokens_in <= 0 || min_reserve_out < 0 {
            panic_with_error!(&env, CurveError::InvalidAmount);
        }
        ensure_solvent(&env);

        let supply = read_i128(&env, DataKey::Supply);
        if supply < tokens_in {
            panic_with_error!(&env, CurveError::InsufficientSupply);
        }

        let payout = curve_payout(supply, tokens_in, read_base(&env), read_slope(&env))
            .unwrap_or_else(|| panic_with_error!(&env, CurveError::Overflow));
        let (payout_net, fee) = apply_sell_fee(payout, read_fee_bps(&env))
            .unwrap_or_else(|| panic_with_error!(&env, CurveError::Overflow));

        if payout_net < min_reserve_out {
            panic_with_error!(&env, CurveError::SlippageExceeded);
        }
        if read_i128(&env, DataKey::Reserve) < payout {
            panic_with_error!(&env, CurveError::InsufficientSupply);
        }

        write_i128(&env, DataKey::Supply, supply - tokens_in);
        write_i128(
            &env,
            DataKey::Reserve,
            read_i128(&env, DataKey::Reserve) - payout,
        );
        write_i128(
            &env,
            DataKey::FeePool,
            read_i128(&env, DataKey::FeePool)
                .checked_add(fee)
                .unwrap_or_else(|| panic_with_error!(&env, CurveError::Overflow)),
        );

        token::StellarAssetClient::new(&env, &read_curve_token(&env)).burn(&seller, &tokens_in);
        token::Client::new(&env, &read_reserve_token(&env)).transfer(
            &env.current_contract_address(),
            &seller,
            &payout_net,
        );
        ensure_solvent(&env);

        publish_trade(
            &env,
            &seller,
            symbol_short!("sell"),
            tokens_in,
            payout,
            read_i128(&env, DataKey::Supply),
            read_i128(&env, DataKey::Reserve),
            fee,
        );
        payout_net
    }

    /// Quote the cost (curve + fee) of buying `tokens_out`.
    pub fn quote_buy(env: Env, tokens_out: i128) -> (i128, i128) {
        ensure_initialized(&env);
        if tokens_out <= 0 {
            panic_with_error!(&env, CurveError::InvalidAmount);
        }
        let supply = read_i128(&env, DataKey::Supply);
        let cost = curve_cost(supply, tokens_out, read_base(&env), read_slope(&env))
            .unwrap_or_else(|| panic_with_error!(&env, CurveError::Overflow));
        apply_buy_fee(cost, read_fee_bps(&env))
            .unwrap_or_else(|| panic_with_error!(&env, CurveError::Overflow))
    }

    /// Quote the net payout (curve minus fee) of selling `tokens_in`.
    pub fn quote_sell(env: Env, tokens_in: i128) -> (i128, i128) {
        ensure_initialized(&env);
        if tokens_in <= 0 {
            panic_with_error!(&env, CurveError::InvalidAmount);
        }
        let supply = read_i128(&env, DataKey::Supply);
        if supply < tokens_in {
            panic_with_error!(&env, CurveError::InsufficientSupply);
        }
        let payout = curve_payout(supply, tokens_in, read_base(&env), read_slope(&env))
            .unwrap_or_else(|| panic_with_error!(&env, CurveError::Overflow));
        apply_sell_fee(payout, read_fee_bps(&env))
            .unwrap_or_else(|| panic_with_error!(&env, CurveError::Overflow))
    }

    /// Current pool state: `(supply, reserve, fee_pool)`.
    pub fn state(env: Env) -> (i128, i128, i128) {
        (
            read_i128(&env, DataKey::Supply),
            read_i128(&env, DataKey::Reserve),
            read_i128(&env, DataKey::FeePool),
        )
    }

    /// Accumulated protocol fees.
    pub fn fee_pool(env: Env) -> i128 {
        read_i128(&env, DataKey::FeePool)
    }

    /// Whether the pool is paused.
    pub fn paused(env: Env) -> bool {
        read_bool(&env, DataKey::Paused)
    }

    /// Withdraw `amount` of accumulated fees to `treasury`.
    pub fn withdraw_fees(env: Env, admin: Address, treasury: Address, amount: i128) {
        ensure_initialized(&env);
        admin.require_auth();
        require_admin(&env, &admin);

        if amount <= 0 {
            panic_with_error!(&env, CurveError::InvalidAmount);
        }
        let fee_pool = read_i128(&env, DataKey::FeePool);
        if fee_pool < amount {
            panic_with_error!(&env, CurveError::InsufficientSupply);
        }
        ensure_solvent(&env);

        write_i128(&env, DataKey::FeePool, fee_pool - amount);
        token::Client::new(&env, &read_reserve_token(&env)).transfer(
            &env.current_contract_address(),
            &treasury,
            &amount,
        );
        ensure_solvent(&env);
        publish_fee_withdraw(&env, &admin, &treasury, amount);
    }
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

fn ensure_initialized(env: &Env) {
    if !env.storage().instance().has(&DataKey::Admin) {
        panic_with_error!(env, CurveError::NotInitialized);
    }
}

fn ensure_not_paused(env: &Env) {
    if read_bool(env, DataKey::Paused) {
        panic_with_error!(env, CurveError::Paused);
    }
}

fn check_deadline(env: &Env, deadline: u64) {
    if deadline < env.ledger().timestamp() {
        panic_with_error!(env, CurveError::DeadlinePassed);
    }
}

fn require_admin(env: &Env, caller: &Address) {
    let admin: Address = env
        .storage()
        .instance()
        .get(&DataKey::Admin)
        .unwrap_or_else(|| panic_with_error!(env, CurveError::NotInitialized));
    if caller != &admin {
        panic_with_error!(env, CurveError::Unauthorized);
    }
}

fn read_i128(env: &Env, key: DataKey) -> i128 {
    env.storage().instance().get(&key).unwrap_or(0)
}

fn write_i128(env: &Env, key: DataKey, value: i128) {
    env.storage().instance().set(&key, &value);
}

fn read_bool(env: &Env, key: DataKey) -> bool {
    env.storage().instance().get(&key).unwrap_or(false)
}

fn read_base(env: &Env) -> i128 {
    env.storage()
        .instance()
        .get::<_, i128>(&DataKey::BasePrice)
        .unwrap_or_else(|| panic_with_error!(env, CurveError::NotInitialized))
}

fn read_slope(env: &Env) -> i128 {
    env.storage()
        .instance()
        .get::<_, i128>(&DataKey::Slope)
        .unwrap_or_else(|| panic_with_error!(env, CurveError::NotInitialized))
}

fn read_fee_bps(env: &Env) -> i128 {
    env.storage().instance().get(&DataKey::FeeBps).unwrap_or(0)
}

fn read_reserve_token(env: &Env) -> Address {
    env.storage()
        .instance()
        .get::<_, Address>(&DataKey::ReserveToken)
        .unwrap_or_else(|| panic_with_error!(env, CurveError::NotInitialized))
}

fn read_curve_token(env: &Env) -> Address {
    env.storage()
        .instance()
        .get::<_, Address>(&DataKey::CurveToken)
        .unwrap_or_else(|| panic_with_error!(env, CurveError::NotInitialized))
}

fn ensure_solvent(env: &Env) {
    let liabilities = read_i128(env, DataKey::Reserve)
        .checked_add(read_i128(env, DataKey::FeePool))
        .unwrap_or_else(|| panic_with_error!(env, CurveError::Overflow));
    if !reserves::is_fully_collateralized(env, &read_reserve_token(env), liabilities) {
        panic_with_error!(env, CurveError::Insolvent);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Events as _, Ledger},
        token, Address, Env, Symbol, Val,
    };

    pub(super) fn setup(fee_bps: i128) -> (Env, Address, Address, Address, Address) {
        let (env, admin, buyer, id, reserve_token, _) = setup_with_tokens(fee_bps);
        (env, admin, buyer, id, reserve_token)
    }

    fn setup_with_tokens(fee_bps: i128) -> (Env, Address, Address, Address, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let buyer = Address::generate(&env);

        let reserve_asset = env.register_stellar_asset_contract_v2(admin.clone());
        let reserve_token = reserve_asset.address();
        token::StellarAssetClient::new(&env, &reserve_token).mint(&buyer, &10_000_000_000i128);

        let curve_asset = env.register_stellar_asset_contract_v2(admin.clone());
        let curve_token = curve_asset.address();

        let id = env.register(ContinuousBondingCurveContract, ());
        token::StellarAssetClient::new(&env, &curve_token).set_admin(&id);
        let client = ContinuousBondingCurveContractClient::new(&env, &id);
        client.initialize(
            &admin,
            &reserve_token,
            &curve_token,
            &(100 * FP),
            &(100_000),
            &fee_bps,
        );

        (env, admin, buyer, id, reserve_token, curve_token)
    }

    #[test]
    fn polynomial_integral_matches_buy_and_sell_costs() {
        assert_eq!(pricing::curve_cost(3, 2, 2 * FP, FP), Some(12));
        assert_eq!(pricing::curve_payout(5, 2, 2 * FP, FP), Some(12));
    }

    #[test]
    fn buys_mint_and_sells_burn_curve_tokens() {
        let (env, _admin, buyer, id, _reserve_token, curve_token) = setup_with_tokens(0);
        let client = ContinuousBondingCurveContractClient::new(&env, &id);
        let curve_asset = token::StellarAssetClient::new(&env, &curve_token);
        let deadline = env.ledger().timestamp() + 100;

        client.buy_exact_tokens(&buyer, &1_000, &i128::MAX, &deadline);
        assert_eq!(curve_asset.balance(&buyer), 1_000);

        client.sell_exact_tokens(&buyer, &400, &0, &deadline);
        assert_eq!(curve_asset.balance(&buyer), 600);
        assert_eq!(client.state().0, 600);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #213)")]
    fn rejects_trades_when_reserves_are_insolvent() {
        let (env, _admin, buyer, id, _reserve_token) = setup(0);
        env.as_contract(&id, || {
            env.storage().instance().set(&DataKey::Reserve, &1i128);
        });

        let client = ContinuousBondingCurveContractClient::new(&env, &id);
        client.buy_exact_tokens(&buyer, &1, &i128::MAX, &(env.ledger().timestamp() + 100));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #214)")]
    fn requires_curve_token_control() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let reserve_token = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        let curve_token = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        let id = env.register(ContinuousBondingCurveContract, ());
        let client = ContinuousBondingCurveContractClient::new(&env, &id);

        client.initialize(
            &admin,
            &reserve_token,
            &curve_token,
            &(100 * FP),
            &100_000,
            &0,
        );
    }

    #[test]
    fn buy_and_sell_preserve_reserve_invariance() {
        let (env, _admin, buyer, id, token_id) = setup(0);
        let client = ContinuousBondingCurveContractClient::new(&env, &id);
        let sac = token::StellarAssetClient::new(&env, &token_id);
        let deadline = env.ledger().timestamp() + 100;

        let total_in = client.buy_exact_tokens(&buyer, &1_000, &i128::MAX, &deadline);
        let (supply, reserve, fee_pool) = client.state();
        assert_eq!(supply, 1_000);
        assert_eq!(reserve, total_in);
        assert_eq!(fee_pool, 0);
        // Reserve token actually moved into the contract.
        assert_eq!(sac.balance(&id), total_in);

        let payout = client.sell_exact_tokens(&buyer, &400, &0, &deadline);
        let (supply2, reserve2, _) = client.state();
        assert_eq!(supply2, 600);
        assert_eq!(reserve2, total_in - payout);
        assert_eq!(sac.balance(&id), total_in - payout);
    }

    #[test]
    fn buy_then_sell_same_amount_loses_only_fee() {
        let (env, _admin, buyer, id, _token_id) = setup(50); // 0.5% fee
        let client = ContinuousBondingCurveContractClient::new(&env, &id);
        let deadline = env.ledger().timestamp() + 100;

        let total_in = client.buy_exact_tokens(&buyer, &1_000, &i128::MAX, &deadline);
        let payout = client.sell_exact_tokens(&buyer, &1_000, &0, &deadline);

        // With no price movement the round trip loses exactly the fee.
        assert!(payout < total_in);
        let fee = total_in - payout;
        let (_, _, fee_pool) = client.state();
        assert!(
            (fee_pool - fee).abs() <= 1,
            "fee_pool {fee_pool} vs fee {fee}"
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #203)")]
    fn enforces_slippage_limits_on_buy() {
        let (env, _admin, buyer, id, _token_id) = setup(0);
        let client = ContinuousBondingCurveContractClient::new(&env, &id);
        let deadline = env.ledger().timestamp() + 100;
        let _ = client.buy_exact_tokens(&buyer, &1_000, &10, &deadline);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #207)")]
    fn paused_pool_rejects_trades() {
        let (env, admin, buyer, id, _token_id) = setup(0);
        let client = ContinuousBondingCurveContractClient::new(&env, &id);
        client.set_paused(&admin, &true);
        let deadline = env.ledger().timestamp() + 100;
        let _ = client.buy_exact_tokens(&buyer, &10, &i128::MAX, &deadline);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #204)")]
    fn rejects_expired_deadline() {
        let (env, _admin, buyer, id, _token_id) = setup(0);
        let client = ContinuousBondingCurveContractClient::new(&env, &id);
        env.ledger().with_mut(|li| li.timestamp = 100);
        let _ = client.buy_exact_tokens(&buyer, &10, &i128::MAX, &99);
    }

    #[test]
    fn buy_exact_reserve_solves_integral() {
        let (env, _admin, buyer, id, _token_id) = setup(0);
        let client = ContinuousBondingCurveContractClient::new(&env, &id);
        let deadline = env.ledger().timestamp() + 100;

        let tokens = client.buy_exact_reserve(&buyer, &5_000_000, &1, &deadline);
        assert!(tokens > 0);

        // A fresh pool with the same configuration: the reserve needed for
        // exactly `tokens` must fit inside 5_000_000 ...
        let (env2, _admin2, _buyer2, id2, _token_id2) = setup(0);
        let client2 = ContinuousBondingCurveContractClient::new(&env2, &id2);
        let (cost, fee) = client2.quote_buy(&tokens);
        assert!(cost + fee <= 5_000_000, "cost {cost} + fee {fee}");

        // ... and one more token would exceed it.
        let (cost1, fee1) = client2.quote_buy(&(tokens + 1));
        assert!(cost1 + fee1 > 5_000_000, "cost1 {cost1} + fee1 {fee1}");
    }

    #[test]
    fn fees_accumulate_and_can_be_withdrawn() {
        let (env, admin, buyer, id, token_id) = setup(100); // 1%
        let client = ContinuousBondingCurveContractClient::new(&env, &id);
        let sac = token::StellarAssetClient::new(&env, &token_id);
        let deadline = env.ledger().timestamp() + 100;
        let treasury = Address::generate(&env);

        let _ = client.buy_exact_tokens(&buyer, &5_000, &i128::MAX, &deadline);
        let (_, _, fee_pool) = client.state();
        assert!(fee_pool > 0);

        client.withdraw_fees(&admin, &treasury, &fee_pool);
        assert_eq!(client.fee_pool(), 0);
        assert_eq!(sac.balance(&treasury), fee_pool);
    }

    /// Convert `env.events().all()` into `(topics, payload)` pairs with the
    /// payload unpacked into its component values.
    fn raw_events(env: &Env) -> std::vec::Vec<(std::vec::Vec<Val>, std::vec::Vec<Val>)> {
        use soroban_sdk::{xdr, TryFromVal, Val, Vec};
        let mut out = std::vec::Vec::new();
        for e in env.events().all().events() {
            let xdr::ContractEventBody::V0(v0) = &e.body;
            let topics: Vec<Val> = Vec::try_from_val(env, &v0.topics).unwrap();
            let payload: Vec<Val> = Vec::try_from_val(env, &v0.data).unwrap_or_else(|_| {
                let mut v = Vec::new(env);
                v.push_back(Val::try_from_val(env, &v0.data).unwrap());
                v
            });
            let mut t = std::vec::Vec::new();
            for i in 0..topics.len() {
                t.push(topics.get(i).unwrap());
            }
            let mut p = std::vec::Vec::new();
            for i in 0..payload.len() {
                p.push(payload.get(i).unwrap());
            }
            out.push((t, p));
        }
        out
    }

    /// Find the first event whose first topic is `topic`.
    fn find_event(env: &Env, topic: Symbol) -> Option<(std::vec::Vec<Val>, std::vec::Vec<Val>)> {
        use soroban_sdk::TryFromVal;
        for (t, d) in raw_events(env) {
            if Symbol::try_from_val(env, &t[0]).ok() == Some(topic.clone()) {
                return Some((t, d));
            }
        }
        None
    }

    #[test]
    fn emits_standardized_trade_and_pause_events() {
        use contract_events::{decode_pause, decode_trade, topic};
        let (env, admin, buyer, id, _token_id) = setup(0);
        let client = ContinuousBondingCurveContractClient::new(&env, &id);
        let deadline = env.ledger().timestamp() + 100;

        // Events are only visible for the most recent top-level invocation,
        // so capture them right after each call. The token contract also
        // emits transfer events, so search by topic.
        let _ = client.buy_exact_tokens(&buyer, &100, &i128::MAX, &deadline);
        let (topics, data) = find_event(&env, topic::TRADE).unwrap();
        let trade = decode_trade(&env, &topics, &data);
        assert_eq!(trade.trader, buyer);
        assert_eq!(trade.action, symbol_short!("buy"));
        assert_eq!(trade.tokens, 100);

        client.set_paused(&admin, &true);
        let (topics, data) = find_event(&env, topic::PAUSE).unwrap();
        let pause = decode_pause(&env, &topics, &data);
        assert!(pause.paused);
    }
}

#[cfg(test)]
mod proptests {
    use super::*;

    proptest::proptest! {
        #![proptest_config(proptest::prelude::ProptestConfig::with_cases(256))]

        /// Buying x tokens then immediately selling them back can never yield
        /// a profit (curve cost >= sell payout, plus fees only widen the gap).
        #[test]
        fn no_arbitrage_round_trip(
            base in 100_000_000i128..10_000_000_000i128,
            slope in 1_000i128..1_000_000i128,
            s in 0i128..200_000i128,
            x in 1i128..50_000i128,
            fee_bps in 0i128..1_000i128,
        ) {
            if let (Some((buy_total, _)), Some((sell_net, _))) = (
                curve_cost(s, x, base, slope)
                    .and_then(|cost| apply_buy_fee(cost, fee_bps)),
                curve_payout(s + x, x, base, slope)
                    .and_then(|payout| apply_sell_fee(payout, fee_bps)),
            ) {
                // Selling back what you bought can never be profitable: the
                // curve integral is identical, rounding favors the pool, and
                // fees only widen the gap.
                proptest::prop_assert!(sell_net <= buy_total,
                    "arbitrage: sell {sell_net} > buy {buy_total}");
                if fee_bps > 0 {
                    proptest::prop_assert!(sell_net < buy_total,
                        "fee should make round trip strictly lossy: {sell_net} >= {buy_total}");
                }
            }
        }

        /// Cost is monotonically non-decreasing in token amount.
        #[test]
        fn cost_monotonic_in_tokens(
            base in 100_000_000i128..10_000_000_000i128,
            slope in 1_000i128..1_000_000i128,
            s in 0i128..100_000i128,
            x in 1i128..50_000i128,
        ) {
            if let (Some(c1), Some(c2)) = (
                curve_cost(s, x, base, slope),
                curve_cost(s, x + 1, base, slope),
            ) {
                proptest::prop_assert!(c2 >= c1, "cost decreased: {c2} < {c1}");
            }
        }

        /// The reserve needed to mint x from s is monotonically non-decreasing
        /// with supply, and grows strictly once the step is large enough to
        /// cross a fixed-point rounding boundary.
        #[test]
        fn cost_increases_with_supply(
            base in 100_000_000i128..10_000_000_000i128,
            slope in 1_000i128..1_000_000i128,
            s in 0i128..100_000i128,
            x in 1i128..50_000i128,
        ) {
            if let (Some(c1), Some(c2)) = (
                curve_cost(s, x, base, slope),
                curve_cost(s + 1, x, base, slope),
            ) {
                proptest::prop_assert!(c2 >= c1, "cost decreased: {c2} < {c1}");
            }
            if let (Some(c1), Some(c3)) = (
                curve_cost(s, x, base, slope),
                curve_cost(s + 10, x, base, slope),
            ) {
                proptest::prop_assert!(c3 >= c1, "cost decreased: {c3} < {c1}");
            }
        }

        #[test]
        fn buy_integral_matches_reverse_sell(
            base in 100_000_000i128..10_000_000_000i128,
            slope in 1_000i128..1_000_000i128,
            supply in 0i128..200_000i128,
            amount in 1i128..50_000i128,
        ) {
            if let (Some(cost), Some(payout)) = (
                curve_cost(supply, amount, base, slope),
                curve_payout(supply + amount, amount, base, slope),
            ) {
                proptest::prop_assert!(cost >= payout);
                proptest::prop_assert!(cost - payout <= 1);
            }
        }

        /// Property test: Reserve invariants across randomized buy and sell operations.
        #[test]
        fn prop_bonding_curve_reserve_invariant(
            tokens_buy in 100i128..10_000i128,
            sell_pct in 1i128..100i128,
        ) {
            use crate::tests::setup;
            let (env, _admin, buyer, id, _token_id) = setup(0);
            let client = ContinuousBondingCurveContractClient::new(&env, &id);
            let deadline = env.ledger().timestamp() + 100;

            let total_in = client.buy_exact_tokens(&buyer, &tokens_buy, &i128::MAX, &deadline);
            let (supply, reserve, _) = client.state();
            proptest::prop_assert!(reserve >= 0);
            proptest::prop_assert_eq!(supply, tokens_buy);

            let tokens_sell = (tokens_buy * sell_pct) / 100;
            if tokens_sell > 0 {
                let payout = client.sell_exact_tokens(&buyer, &tokens_sell, &0, &deadline);
                let (supply2, reserve2, _) = client.state();
                proptest::prop_assert!(reserve2 >= 0);
                proptest::prop_assert_eq!(supply2, supply - tokens_sell);
                proptest::prop_assert_eq!(reserve2, total_in - payout);
            }
        }
    }
}
