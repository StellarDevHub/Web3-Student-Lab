//! Certificate contract with 2-of-3 governance multisig, RBAC, pause, and WASM upgrade
//! through governance proposals (`PendingAdminAction::Upgrade`).
//!
//! **Upgrade risks:** Malicious WASM can replace authorization logic or corrupt storage
//! expectations; compromised governance keys imply full contract takeover. Audit bytecode,
//! test migrations, and prefer timelocks where applicable.

#![no_std]
#![allow(clippy::all)]
#![allow(warnings)]
#![allow(clippy::all)]
#![allow(warnings)]

pub mod activity_log;
pub mod admin;
pub mod crowdfunding;
pub mod dao_treasury;
pub mod dex_aggregator;
pub mod distribution_manager;
pub mod dynamic_staking;
pub mod enrollment;
pub mod events;
pub mod execution_engine;
pub mod gaming_asset_exchange;
pub mod membership_nft;
pub mod oracle_aggregator;
pub mod paymaster;
pub mod payment_gateway;
pub mod payment_scheduler;
pub mod quadratic_voting;
pub mod rarity_validator;
pub mod rbac;
pub mod reputation_system;
pub mod revocation;
pub mod route_optimizer;
pub mod royalty_splitter;
pub mod sai_wrapper;
pub mod scoring_algorithm;
pub mod session;
pub mod smart_wallet;
pub mod staking;
pub mod statistics;
pub mod sybil_resistance;
pub mod token_buyback;
pub mod token_gated_access;
pub mod verification;
// Fuzz module uses `std` and legacy Soroban test patterns; keep out of the default test build
// until it is refreshed for the current SDK (`sequence_number`, token `mint` arity, etc.).
// #[cfg(test)]
// pub mod fuzz;
pub mod airdrop_manager;
pub mod merkle_distributor;
pub mod milestone_release;
pub mod token;
pub mod upgrade;

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env};

const BASIS_POINTS: i128 = 10_000;
const MINIMUM_LIQUIDITY: i128 = 1_000;

use crate::activity_log::{ActivityLogManager, EventType as LogEventType};
use crate::admin::{AdminPolicy, AdminRole, Permission};
use crate::events::EventRecorder;
use crate::revocation::{CertificateState, CertificateStatus, RevocationReason, RevocationRecord};
use crate::statistics::StatisticsManager;
use crate::token::RsTokenContractClient;
use crate::upgrade::{ContractVersion, PendingUpgrade};
use crate::verification::{CertificateMetadata, VerificationResult};
use soroban_sdk::xdr::ToXdr;
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Bytes, BytesN,
    Env, String, Symbol, Vec,
};

/// Issued certificate record.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Pool {
    pub token_a: Address,
    pub token_b: Address,
    pub fee_bps: i128,
    pub reserve_a: i128,
    pub reserve_b: i128,
    pub total_lp: i128,
    pub price_cumulative_a: i128,
    pub price_cumulative_b: i128,
    pub last_updated: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Pool,
    Lp(Address),
}

#[contract]
pub struct AmmLiquidityPoolContract;

#[contractimpl]
impl AmmLiquidityPoolContract {
    /// Initialize a constant-product x*y=k liquidity pool.
    pub fn initialize(env: Env, token_a: Address, token_b: Address, fee_bps: i128) {
        if env.storage().instance().has(&DataKey::Pool) {
            panic!("already initialized");
        }
        if token_a == token_b {
            panic!("identical tokens");
        }
        if fee_bps < 0 || fee_bps >= BASIS_POINTS {
            panic!("invalid fee");
        }
        env.storage().instance().set(
            &DataKey::Pool,
            &Pool {
                token_a,
                token_b,
                fee_bps,
                reserve_a: 0,
                reserve_b: 0,
                total_lp: 0,
                price_cumulative_a: 0,
                price_cumulative_b: 0,
                last_updated: env.ledger().timestamp(),
            },
        );
    }

    /// Add liquidity and mint LP shares.
    ///
    /// The caller supplies minimum LP output for slippage protection. Token
    /// transfers are expected to be performed by an adapter around this core.
    pub fn add_liquidity(
        env: Env,
        provider: Address,
        amount_a: i128,
        amount_b: i128,
        min_lp: i128,
    ) -> i128 {
        provider.require_auth();
        validate_amount(amount_a);
        validate_amount(amount_b);
        let mut pool = pool(&env);
        update_twap(&env, &mut pool);

        let lp = if pool.total_lp == 0 {
            let minted = checked_sub(
                integer_sqrt(checked_mul(amount_a, amount_b)),
                MINIMUM_LIQUIDITY,
            );
            if minted <= 0 {
                panic!("insufficient initial liquidity");
            }
            pool.total_lp = checked_add(pool.total_lp, MINIMUM_LIQUIDITY);
            minted
        } else {
            let lp_a = checked_div(checked_mul(amount_a, pool.total_lp), pool.reserve_a);
            let lp_b = checked_div(checked_mul(amount_b, pool.total_lp), pool.reserve_b);
            min(lp_a, lp_b)
        };
        if lp < min_lp {
            panic!("slippage");
        }

        pool.reserve_a = checked_add(pool.reserve_a, amount_a);
        pool.reserve_b = checked_add(pool.reserve_b, amount_b);
        pool.total_lp = checked_add(pool.total_lp, lp);
        add_lp(&env, provider, lp);
        save_pool(&env, &pool);
        lp
    }

    /// Remove liquidity and return proportional token amounts.
    pub fn remove_liquidity(
        env: Env,
        provider: Address,
        lp_amount: i128,
        min_a: i128,
        min_b: i128,
    ) -> (i128, i128) {
        provider.require_auth();
        validate_amount(lp_amount);
        let mut pool = pool(&env);
        update_twap(&env, &mut pool);
        sub_lp(&env, provider, lp_amount);

        let amount_a = checked_div(checked_mul(lp_amount, pool.reserve_a), pool.total_lp);
        let amount_b = checked_div(checked_mul(lp_amount, pool.reserve_b), pool.total_lp);
        if amount_a < min_a || amount_b < min_b {
            panic!("slippage");
        }

        pool.reserve_a = checked_sub(pool.reserve_a, amount_a);
        pool.reserve_b = checked_sub(pool.reserve_b, amount_b);
        pool.total_lp = checked_sub(pool.total_lp, lp_amount);
        save_pool(&env, &pool);
        (amount_a, amount_b)
    }

    /// Swap an exact amount of token A for token B.
    pub fn swap_exact_a_for_b(env: Env, trader: Address, amount_in: i128, min_out: i128) -> i128 {
        trader.require_auth();
        swap(&env, amount_in, min_out, true)
    }

    /// Swap an exact amount of token B for token A.
    pub fn swap_exact_b_for_a(env: Env, trader: Address, amount_in: i128, min_out: i128) -> i128 {
        trader.require_auth();
        swap(&env, amount_in, min_out, false)
    }

    pub fn quote_a_for_b(env: Env, amount_in: i128) -> i128 {
        let pool = pool(&env);
        amount_out(amount_in, pool.reserve_a, pool.reserve_b, pool.fee_bps)
    }

    pub fn quote_b_for_a(env: Env, amount_in: i128) -> i128 {
        let pool = pool(&env);
        amount_out(amount_in, pool.reserve_b, pool.reserve_a, pool.fee_bps)
    }

    pub fn lp_balance(env: Env, account: Address) -> i128 {
        lp_balance(&env, account)
    }

    pub fn get_pool(env: Env) -> Pool {
        pool(&env)
    }
}

fn swap(env: &Env, amount_in: i128, min_out: i128, a_for_b: bool) -> i128 {
    validate_amount(amount_in);
    let mut pool = pool(env);
    update_twap(env, &mut pool);
    if pool.reserve_a <= 0 || pool.reserve_b <= 0 {
        panic!("empty pool");
    }

    let output = if a_for_b {
        amount_out(amount_in, pool.reserve_a, pool.reserve_b, pool.fee_bps)
    } else {
        amount_out(amount_in, pool.reserve_b, pool.reserve_a, pool.fee_bps)
    };
    if output < min_out || output <= 0 {
        panic!("slippage");
    }

    let before_k = checked_mul(pool.reserve_a, pool.reserve_b);
    if a_for_b {
        pool.reserve_a = checked_add(pool.reserve_a, amount_in);
        pool.reserve_b = checked_sub(pool.reserve_b, output);
    } else {
        pool.reserve_b = checked_add(pool.reserve_b, amount_in);
        pool.reserve_a = checked_sub(pool.reserve_a, output);
    }
    if checked_mul(pool.reserve_a, pool.reserve_b) < before_k {
        panic!("invariant");
    }
    save_pool(env, &pool);
    output
}

fn amount_out(amount_in: i128, reserve_in: i128, reserve_out: i128, fee_bps: i128) -> i128 {
    validate_amount(amount_in);
    if reserve_in <= 0 || reserve_out <= 0 {
        panic!("empty pool");
    }
    let amount_in_after_fee = checked_div(
        checked_mul(amount_in, checked_sub(BASIS_POINTS, fee_bps)),
        BASIS_POINTS,
    );
    checked_div(
        checked_mul(amount_in_after_fee, reserve_out),
        checked_add(reserve_in, amount_in_after_fee),
    )
}

fn update_twap(env: &Env, pool: &mut Pool) {
    let now = env.ledger().timestamp();
    if now <= pool.last_updated {
        return;
    }
    let elapsed = checked_sub(now as i128, pool.last_updated as i128);
    if pool.reserve_a > 0 && pool.reserve_b > 0 {
        pool.price_cumulative_a = checked_add(
            pool.price_cumulative_a,
            checked_mul(
                checked_div(checked_mul(pool.reserve_b, BASIS_POINTS), pool.reserve_a),
                elapsed,
            ),
        );
        pool.price_cumulative_b = checked_add(
            pool.price_cumulative_b,
            checked_mul(
                checked_div(checked_mul(pool.reserve_a, BASIS_POINTS), pool.reserve_b),
                elapsed,
            ),
        );
    }
    pool.last_updated = now;
}

fn pool(env: &Env) -> Pool {
    env.storage()
        .instance()
        .get(&DataKey::Pool)
        .unwrap_or_else(|| panic!("not initialized"))
}

fn save_pool(env: &Env, pool: &Pool) {
    env.storage().instance().set(&DataKey::Pool, pool);
}

fn add_lp(env: &Env, account: Address, amount: i128) {
    let current = lp_balance(env, account.clone());
    env.storage()
        .persistent()
        .set(&DataKey::Lp(account), &checked_add(current, amount));
}

fn sub_lp(env: &Env, account: Address, amount: i128) {
    let current = lp_balance(env, account.clone());
    if amount > current {
        panic!("insufficient lp");
    }
    env.storage()
        .persistent()
        .set(&DataKey::Lp(account), &checked_sub(current, amount));
}

fn lp_balance(env: &Env, account: Address) -> i128 {
    env.storage()
        .persistent()
        .get(&DataKey::Lp(account))
        .unwrap_or(0_i128)
}

fn validate_amount(amount: i128) {
    if amount <= 0 {
        panic!("invalid amount");
    }
}

fn min(left: i128, right: i128) -> i128 {
    if left < right {
        left
    } else {
        right
    }
}

fn integer_sqrt(value: i128) -> i128 {
    if value < 0 {
        panic!("negative sqrt");
    }
    if value < 2 {
        return value;
    }
    let mut low = 1_i128;
    let mut high = value;
    let mut answer = 1_i128;
    while low <= high {
        let mid = checked_div(checked_add(low, high), 2);
        let square = checked_mul(mid, mid);
        if square == value {
            return mid;
        }
        if square < value {
            answer = mid;
            low = checked_add(mid, 1);
        } else {
            high = checked_sub(mid, 1);
        }
    }
    answer
}

fn checked_add(left: i128, right: i128) -> i128 {
    match left.checked_add(right) {
        Some(value) => value,
        None => panic!("i128 overflow"),
    }
}

fn checked_sub(left: i128, right: i128) -> i128 {
    match left.checked_sub(right) {
        Some(value) => value,
        None => panic!("i128 underflow"),
    }
}

fn checked_mul(left: i128, right: i128) -> i128 {
    match left.checked_mul(right) {
        Some(value) => value,
        None => panic!("i128 overflow"),
    }
}

fn checked_div(left: i128, right: i128) -> i128 {
    if right == 0 {
        panic!("division by zero");
    }
    left / right
}

#[cfg(test)]
mod test {
    extern crate std;

    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    fn setup(env: &Env) -> (AmmLiquidityPoolContractClient, Address, Address, Address) {
        env.mock_all_auths();
        let client = AmmLiquidityPoolContractClient::new(
            env,
            &env.register_contract(None, AmmLiquidityPoolContract),
        );
        let token_a = Address::generate(env);
        let token_b = Address::generate(env);
        let provider = Address::generate(env);
        client.initialize(&token_a, &token_b, &30);
        (client, token_a, token_b, provider)
    }

    #[test]
    fn adds_initial_liquidity_and_mints_lp() {
        let env = Env::default();
        let (client, _, _, provider) = setup(&env);

        let minted = client.add_liquidity(&provider, &1_000_000, &1_000_000, &999_000);

        assert_eq!(minted, 999_000);
        assert_eq!(client.lp_balance(&provider), 999_000);
        let pool = client.get_pool();
        assert_eq!(pool.reserve_a, 1_000_000);
        assert_eq!(pool.reserve_b, 1_000_000);
        assert_eq!(pool.total_lp, 1_000_000);
    }

    #[test]
    fn swaps_with_fee_and_preserves_invariant() {
        let env = Env::default();
        let (client, _, _, provider) = setup(&env);
        let trader = Address::generate(&env);
        client.add_liquidity(&provider, &1_000_000, &1_000_000, &999_000);

        let out = client.swap_exact_a_for_b(&trader, &10_000, &9_800);
        assert_eq!(out, 9_871);
        let pool = client.get_pool();
        assert_eq!(pool.reserve_a, 1_010_000);
        assert_eq!(pool.reserve_b, 990_129);
        assert!(pool.reserve_a * pool.reserve_b >= 1_000_000_i128 * 1_000_000_i128);
    }

    #[test]
    fn removes_liquidity_proportionately() {
        let env = Env::default();
        let (client, _, _, provider) = setup(&env);
        client.add_liquidity(&provider, &1_000_000, &2_000_000, &1_413_000);

        let removed = client.remove_liquidity(&provider, &707_000, &499_000, &999_000);

        assert_eq!(removed, (499_924, 999_848));
        assert_eq!(client.lp_balance(&provider), 706_213);
    }

    #[test]
    fn updates_cumulative_prices_for_twap_consumers() {
        let env = Env::default();
        env.ledger().with_mut(|ledger| ledger.timestamp = 10);
        let (client, _, _, provider) = setup(&env);
        let trader = Address::generate(&env);
        client.add_liquidity(&provider, &1_000_000, &2_000_000, &1_413_000);

        env.ledger().with_mut(|ledger| ledger.timestamp = 20);
        client.swap_exact_b_for_a(&trader, &10_000, &4_900);

        let pool = client.get_pool();
        assert_eq!(pool.price_cumulative_a, 200_000);
        assert_eq!(pool.price_cumulative_b, 50_000);
        assert_eq!(pool.last_updated, 20);
    }

    #[test]
    #[should_panic(expected = "slippage")]
    fn rejects_swap_when_minimum_output_is_not_met() {
        let env = Env::default();
        let (client, _, _, provider) = setup(&env);
        let trader = Address::generate(&env);
        client.add_liquidity(&provider, &1_000_000, &1_000_000, &999_000);

        client.swap_exact_a_for_b(&trader, &10_000, &10_000);
    }

    #[test]
    #[should_panic(expected = "insufficient lp")]
    fn rejects_removing_unowned_liquidity() {
        let env = Env::default();
        let (client, _, _, provider) = setup(&env);
        let other = Address::generate(&env);
        client.add_liquidity(&provider, &1_000_000, &1_000_000, &999_000);

        client.remove_liquidity(&other, &1, &0, &0);
    }
    env.crypto().sha256(&buffer).into()
}
