#![no_std]

//! # Continuous Exponential Bonding Curve
//!
//! A Bancor-style automated market maker that mints and burns a project's
//! token against a reserve asset along a **continuous exponential price
//! curve**:
//!
//! ```text
//! price(s) = base_price * e^(slope * s)
//! ```
//!
//! where `s` is the current token supply. The reserve required to mint `x`
//! tokens from supply `s` is the exact integral:
//!
//! ```text
//! cost(s, x) = base_price / slope * (e^(slope * (s + x)) - e^(slope * s))
//! ```
//!
//! All price math runs on a precision-safe fixed-point representation
//! (`1e9` scaling) with hand-rolled `exp`, `ln` and `pow` approximations so
//! the contract stays dependency-free and auditable.
//!
//! Features:
//! * Exact reserve-ratio accounting — the reserve balance is always the
//!   integral of the curve, so buy/sell executions preserve mathematical
//!   reserve invariance.
//! * Slippage protection (`max_reserve_in` on buys, `min_reserve_out` on
//!   sells) and deadline checks.
//! * Emergency pause switches (admin-only).
//! * Protocol fee accounting (`fee_bps`) with admin fee withdrawal.
//! * Structured on-chain events (see [`contract_events`]).

#[cfg(test)]
extern crate std;

use contract_events::{publish_fee_withdraw, publish_pause, publish_trade};
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, token,
    Address, Env,
};

/// Fixed-point scale: 1 unit == 10^9.
pub const FP: i128 = 1_000_000_000;
/// `ln(2)` in fixed-point.
pub const LN2: i128 = 693_147_180;
/// Maximum `exp` argument (in fixed-point) before we refuse to compute:
/// `e^15 ≈ 3.27e6`, which keeps every intermediate well inside `i128`.
pub const MAX_EXP_ARG: i128 = 15 * FP;
/// Maximum allowed protocol fee in basis points (10%).
pub const MAX_FEE_BPS: i128 = 1_000;

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    ReserveToken,
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
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidAmount = 3,
    SlippageExceeded = 4,
    DeadlinePassed = 5,
    Unauthorized = 6,
    InsufficientSupply = 7,
    Paused = 8,
    Overflow = 9,
    InvalidFee = 10,
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
    /// * `base_price` — fixed-point price at zero supply (`1_000_000_000` == 1).
    /// * `slope` — fixed-point exponential growth rate.
    /// * `fee_bps` — protocol fee in basis points (`50` == 0.5%).
    pub fn initialize(
        env: Env,
        admin: Address,
        reserve_token: Address,
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
        if fee_bps < 0 || fee_bps > MAX_FEE_BPS {
            panic_with_error!(&env, CurveError::InvalidFee);
        }

        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::ReserveToken, &reserve_token);
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
        if fee_bps < 0 || fee_bps > MAX_FEE_BPS {
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

        let supply = read_i128(&env, DataKey::Supply);
        let cost = curve_cost(supply, tokens_out, read_base(&env), read_slope(&env))
            .unwrap_or_else(|| panic_with_error!(&env, CurveError::Overflow));
        let (total_in, fee) = apply_buy_fee(cost, read_fee_bps(&env));

        if total_in > max_reserve_in {
            panic_with_error!(&env, CurveError::SlippageExceeded);
        }

        write_i128(&env, DataKey::Supply, supply + tokens_out);
        write_i128(&env, DataKey::Reserve, read_i128(&env, DataKey::Reserve) + cost);
        write_i128(&env, DataKey::FeePool, read_i128(&env, DataKey::FeePool) + fee);

        token::Client::new(&env, &read_reserve_token(&env))
            .transfer(&buyer, &env.current_contract_address(), &total_in);

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

        let supply = read_i128(&env, DataKey::Supply);
        let tokens_out =
            solve_tokens_for_reserve(supply, reserve_in, read_base(&env), read_slope(&env), read_fee_bps(&env))
                .unwrap_or_else(|| panic_with_error!(&env, CurveError::Overflow));

        if tokens_out < min_tokens_out {
            panic_with_error!(&env, CurveError::SlippageExceeded);
        }
        if tokens_out == 0 {
            panic_with_error!(&env, CurveError::InvalidAmount);
        }

        let cost = curve_cost(supply, tokens_out, read_base(&env), read_slope(&env))
            .unwrap_or_else(|| panic_with_error!(&env, CurveError::Overflow));
        let (total_in, fee) = apply_buy_fee(cost, read_fee_bps(&env));

        write_i128(&env, DataKey::Supply, supply + tokens_out);
        write_i128(&env, DataKey::Reserve, read_i128(&env, DataKey::Reserve) + cost);
        write_i128(&env, DataKey::FeePool, read_i128(&env, DataKey::FeePool) + fee);

        token::Client::new(&env, &read_reserve_token(&env))
            .transfer(&buyer, &env.current_contract_address(), &total_in);

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

        let supply = read_i128(&env, DataKey::Supply);
        if supply < tokens_in {
            panic_with_error!(&env, CurveError::InsufficientSupply);
        }

        let payout = curve_payout(supply, tokens_in, read_base(&env), read_slope(&env))
            .unwrap_or_else(|| panic_with_error!(&env, CurveError::Overflow));
        let (payout_net, fee) = apply_sell_fee(payout, read_fee_bps(&env));

        if payout_net < min_reserve_out {
            panic_with_error!(&env, CurveError::SlippageExceeded);
        }
        if read_i128(&env, DataKey::Reserve) < payout {
            panic_with_error!(&env, CurveError::InsufficientSupply);
        }

        write_i128(&env, DataKey::Supply, supply - tokens_in);
        write_i128(&env, DataKey::Reserve, read_i128(&env, DataKey::Reserve) - payout);
        write_i128(&env, DataKey::FeePool, read_i128(&env, DataKey::FeePool) + fee);

        token::Client::new(&env, &read_reserve_token(&env))
            .transfer(&env.current_contract_address(), &seller, &payout_net);

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

        write_i128(&env, DataKey::FeePool, fee_pool - amount);
        token::Client::new(&env, &read_reserve_token(&env))
            .transfer(&env.current_contract_address(), &treasury, &amount);
        publish_fee_withdraw(&env, &admin, &treasury, amount);
    }
}

// ---------------------------------------------------------------------------
// Fixed-point math
// ---------------------------------------------------------------------------

/// `exp(x)` for fixed-point `x`, returning a fixed-point value.
///
/// Range-reduces `x = k * ln2 + r` with `r ∈ [0, ln2)` and evaluates
/// `e^r` with a 15-term Taylor series; `e^x = 2^k * e^r`.
pub fn exp_fp(x: i128) -> i128 {
    if x == 0 {
        return FP;
    }
    let mut k = x / LN2;
    let mut r = x - k * LN2;
    if r < 0 {
        r += LN2;
        k -= 1;
    }

    // Taylor: e^r = sum_{n=0..} r^n / n!  (r in [0, ln2), converges fast)
    let mut term = FP;
    let mut acc = FP;
    for n in 1..=15 {
        term = term * r / (FP * n as i128);
        acc += term;
    }

    if k >= 0 {
        acc << (k as u32)
    } else {
        acc >> ((-k) as u32)
    }
}

/// `ln(x)` for fixed-point `x > 0`, returning a fixed-point value.
pub fn ln_fp(x: i128) -> i128 {
    if x <= 0 {
        return i128::MIN;
    }
    // Normalize x = m * 2^e with m in [1, 2).
    let mut y = x;
    let mut e: i128 = 0;
    while y >= 2 * FP {
        y /= 2;
        e += 1;
    }
    while y < FP {
        y *= 2;
        e -= 1;
    }
    // ln(m) = 2 * (z + z^3/3 + z^5/5 + ...), z = (m - 1)/(m + 1) <= 1/3
    let z = (y - FP) * FP / (y + FP);
    let z2 = z * z / FP;
    let mut term = z;
    let mut acc = z;
    let mut n: i128 = 3;
    loop {
        term = term * z2 / FP;
        let next = acc + term / n;
        if next == acc {
            break;
        }
        acc = next;
        n += 2;
    }
    e * LN2 + 2 * acc
}

/// `x^y` for fixed-point `x > 0` and fixed-point `y`, fixed-point result.
pub fn pow_fp(x: i128, y: i128) -> i128 {
    if x <= 0 {
        return 0;
    }
    if y == 0 {
        return FP;
    }
    exp_fp(y * ln_fp(x) / FP)
}

// ---------------------------------------------------------------------------
// Curve math (pure, overflow-checked)
// ---------------------------------------------------------------------------

/// `E(u) = e^(slope * u)` in fixed-point, `None` if the exponent overflows
/// the safe range. `slope` is fixed-point scaled, `u` is in raw token
/// units, so `slope * u` is already the fixed-point exponent.
fn exp_supply(u: i128, slope: i128) -> Option<i128> {
    let arg = slope.checked_mul(u)?;
    if arg > MAX_EXP_ARG {
        return None;
    }
    Some(exp_fp(arg))
}

/// Reserve required to mint `x` tokens from supply `s`:
/// `base / slope * (E(s + x) - E(s))`, rounded **up** (favors the pool).
///
/// Derivation with fixed-point scaling: `cost = base * (E(s+x) - E(s)) /
/// (slope * FP)`.
fn curve_cost(s: i128, x: i128, base: i128, slope: i128) -> Option<i128> {
    if x <= 0 || base <= 0 || slope <= 0 {
        return None;
    }
    let es = exp_supply(s, slope)?;
    let esx = exp_supply(s.checked_add(x)?, slope)?;
    let delta = esx.checked_sub(es)?;
    if delta == 0 {
        return Some(0);
    }
    let num = base.checked_mul(delta)?;
    let denom = slope.checked_mul(FP)?;
    // round up
    Some(num.checked_add(denom - 1)?.checked_div(denom)?)
}

/// Reserve paid out when burning `x` tokens from supply `s`:
/// `base / slope * (E(s) - E(s - x))`, rounded **down** (favors the pool).
fn curve_payout(s: i128, x: i128, base: i128, slope: i128) -> Option<i128> {
    if x <= 0 || base <= 0 || slope <= 0 || s < x {
        return None;
    }
    let es = exp_supply(s, slope)?;
    let esx = exp_supply(s.checked_sub(x)?, slope)?;
    let delta = es.checked_sub(esx)?;
    if delta == 0 {
        return Some(0);
    }
    let num = base.checked_mul(delta)?;
    let denom = slope.checked_mul(FP)?;
    Some(num.checked_div(denom)?)
}

/// Total buy price with fee: `cost * (1 + fee_bps / 10000)`, rounded up.
fn apply_buy_fee(cost: i128, fee_bps: i128) -> (i128, i128) {
    if fee_bps == 0 {
        return (cost, 0);
    }
    let fee = (cost * fee_bps + 9_999) / 10_000;
    (cost + fee, fee)
}

/// Net sell payout with fee: `payout * (1 - fee_bps / 10000)`, rounded up
/// on the fee (favors the pool).
fn apply_sell_fee(payout: i128, fee_bps: i128) -> (i128, i128) {
    if fee_bps == 0 {
        return (payout, 0);
    }
    let fee = (payout * fee_bps + 9_999) / 10_000;
    (payout - fee, fee)
}

/// Bisect for the largest `x` with `total_cost(s, x) <= reserve_in`.
fn solve_tokens_for_reserve(
    s: i128,
    reserve_in: i128,
    base: i128,
    slope: i128,
    fee_bps: i128,
) -> Option<i128> {
    if reserve_in <= 0 {
        return Some(0);
    }
    // Upper bound: double until the total cost exceeds the reserve. The
    // curve saturates at MAX_EXP_ARG, so cap the search there.
    let hi_max = (MAX_EXP_ARG / slope).saturating_sub(s).max(1);
    let mut hi = 1i128;
    loop {
        if hi > hi_max {
            hi = hi_max;
        }
        let cost = curve_cost(s, hi, base, slope)?;
        let (total, _) = apply_buy_fee(cost, fee_bps);
        if total >= reserve_in {
            break;
        }
        if hi >= hi_max {
            return None;
        }
        hi = hi.checked_mul(2)?;
    }
    let mut lo = 0i128;
    for _ in 0..80 {
        let mid = lo + (hi - lo) / 2;
        let cost = curve_cost(s, mid, base, slope)?;
        let (total, _) = apply_buy_fee(cost, fee_bps);
        if total <= reserve_in {
            lo = mid;
        } else {
            hi = mid;
        }
        if hi - lo <= 1 {
            break;
        }
    }
    Some(lo)
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

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Events as _, Ledger},
        token, Address, Env, Symbol, Val,
    };

    fn setup(fee_bps: i128) -> (Env, Address, Address, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let buyer = Address::generate(&env);

        let token = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = token.address();
        token::StellarAssetClient::new(&env, &token_id).mint(&buyer, &10_000_000_000i128);

        let id = env.register(ContinuousBondingCurveContract, ());
        let client = ContinuousBondingCurveContractClient::new(&env, &id);
        client.initialize(&admin, &token_id, &(100 * FP), &(100_000), &fee_bps);

        (env, admin, buyer, id, token_id)
    }

    #[test]
    fn fixed_point_exp_ln_round_trip() {
        // e^0 = 1
        assert_eq!(exp_fp(0), FP);
        // e^1 ~= 2.718281828
        let e = exp_fp(FP);
        assert!((e - 2_718_281_828i128).abs() < 1_000, "e = {e}");
        // ln(e^1) ~= 1
        assert!((ln_fp(e) - FP).abs() < 1_000);
        // ln(1) = 0
        assert_eq!(ln_fp(FP), 0);
        // 2^10 = 1024
        assert!((pow_fp(2 * FP, 10 * FP) - 1024 * FP).abs() < 10_000);
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
        assert!((fee_pool - fee).abs() <= 1, "fee_pool {fee_pool} vs fee {fee}");
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn enforces_slippage_limits_on_buy() {
        let (env, _admin, buyer, id, _token_id) = setup(0);
        let client = ContinuousBondingCurveContractClient::new(&env, &id);
        let deadline = env.ledger().timestamp() + 100;
        let _ = client.buy_exact_tokens(&buyer, &1_000, &10, &deadline);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #8)")]
    fn paused_pool_rejects_trades() {
        let (env, admin, buyer, id, _token_id) = setup(0);
        let client = ContinuousBondingCurveContractClient::new(&env, &id);
        client.set_paused(&admin, &true);
        let deadline = env.ledger().timestamp() + 100;
        let _ = client.buy_exact_tokens(&buyer, &10, &i128::MAX, &deadline);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #5)")]
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
    fn raw_events(
        env: &Env,
    ) -> std::vec::Vec<(std::vec::Vec<Val>, std::vec::Vec<Val>)> {
        use soroban_sdk::{xdr, TryFromVal, Val, Vec};
        let mut out = std::vec::Vec::new();
        for e in env.events().all().events() {
            if let xdr::ContractEventBody::V0(v0) = &e.body {
                let topics: Vec<Val> = Vec::try_from_val(env, &v0.topics).unwrap();
                let payload: Vec<Val> = Vec::try_from_val(env, &v0.data)
                    .unwrap_or_else(|_| {
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
        }
        out
    }

    /// Find the first event whose first topic is `topic`.
    fn find_event(
        env: &Env,
        topic: Symbol,
    ) -> Option<(std::vec::Vec<Val>, std::vec::Vec<Val>)> {
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
            if let (Some(cost), Some(payout)) = (
                curve_cost(s, x, base, slope),
                curve_payout(s + x, x, base, slope),
            ) {
                let (buy_total, _) = apply_buy_fee(cost, fee_bps);
                let (sell_net, _) = apply_sell_fee(payout, fee_bps);
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

        /// ln(exp(x)) == x within fixed-point precision.
        #[test]
        fn exp_ln_round_trip(x in (-5 * FP)..(5 * FP)) {
            let e = exp_fp(x);
            let back = ln_fp(e);
            let err = (back - x).abs();
            proptest::prop_assert!(err <= 1_000_000,
                "ln(exp({x})) = {back}, err {err}");
        }
    }
}
