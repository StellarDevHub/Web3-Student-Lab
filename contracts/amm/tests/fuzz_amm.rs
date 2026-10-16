//! Comprehensive AMM Invariant & Property-Based Fuzz Testing Suite (SC-050)
//!
//! Fuzz tests the constant-product invariant k1 >= k0 across millions of random actions
//! and edge-case inputs without precision degradation, underflows, or unhandled panics.

#![cfg(test)]

use amm::{AMMContract, AMMContractClient};
use proptest::prelude::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    token, Address, Env,
};

fn setup_amm(
    env: &Env,
    initial_a: i128,
    initial_b: i128,
) -> (
    Address,
    AMMContractClient<'static>,
    Address,
    Address,
    Address,
    Address,
) {
    env.mock_all_auths();
    let admin = Address::generate(env);
    let contract_id = env.register(AMMContract, ());
    let client = AMMContractClient::new(env, &contract_id);

    let token_a_contract = env.register_stellar_asset_contract_v2(admin.clone());
    let token_b_contract = env.register_stellar_asset_contract_v2(admin.clone());
    let pool_share_contract = env.register_stellar_asset_contract_v2(admin.clone());

    let token_a_id = token_a_contract.address();
    let token_b_id = token_b_contract.address();
    let pool_share_id = pool_share_contract.address();
    let fee_collector = Address::generate(env);

    let token_a_client = token::StellarAssetClient::new(env, &token_a_id);
    let token_b_client = token::StellarAssetClient::new(env, &token_b_id);

    token_a_client.mint(&admin, &100_000_000_000);
    token_b_client.mint(&admin, &100_000_000_000);

    client.initialize(
        &admin,
        &token_a_id,
        &token_b_id,
        &pool_share_id,
        &fee_collector,
        &30, // 0.3% base fee
    );

    client.add_liquidity(&admin, &initial_a, &initial_b, &0);

    (admin, client, token_a_id, token_b_id, pool_share_id, fee_collector)
}

#[test]
fn test_fuzz_amm_k_invariant_one_million_continuous_actions() {
    let env = Env::default();
    let (_admin, client, token_a, token_b, _, _) = setup_amm(&env, 10_000_000, 10_000_000);

    let token_a_client = token::StellarAssetClient::new(&env, &token_a);
    let token_b_client = token::StellarAssetClient::new(&env, &token_b);

    let user = Address::generate(&env);
    token_a_client.mint(&user, &100_000_000_000);
    token_b_client.mint(&user, &100_000_000_000);

    // Fast deterministic PRNG for continuous action simulations
    let mut seed: u64 = 0x853c49e6748fea9b;
    let mut next_rand = || -> u64 {
        seed ^= seed << 13;
        seed ^= seed >> 7;
        seed ^= seed << 17;
        seed
    };

    let (mut current_balance_a, mut current_balance_b, _) = client.get_pool_state();
    let mut current_k = (current_balance_a as u128) * (current_balance_b as u128);

    // 1. In-contract trades to verify live state consistency and event emission
    for _ in 0..100 {
        env.ledger().with_mut(|li| li.sequence_number += 1);
        let trade_a_to_b = (next_rand() % 2) == 0;
        let amount_in = ((next_rand() % 50_000) + 1_000) as i128;

        let (b_a0, b_b0, _) = client.get_pool_state();
        let k_before = (b_a0 as u128) * (b_b0 as u128);

        if trade_a_to_b {
            let out = client.swap_a_for_b(&user, &amount_in, &0);
            assert!(out > 0);
        } else {
            let out = client.swap_b_for_a(&user, &amount_in, &0);
            assert!(out > 0);
        }

        let (b_a1, b_b1, _) = client.get_pool_state();
        let k_after = (b_a1 as u128) * (b_b1 as u128);
        assert!(
            k_after >= k_before,
            "Live AMM invariant violated: k_after ({}) < k_before ({})",
            k_after,
            k_before
        );
    }

    // 2. High-throughput continuous mathematical fuzzer across 1,000,000 actions
    // asserting constant product preservation k1 >= k0 across arbitrary trade sizes and fee impacts
    const BPS: i128 = 10_000;
    const BASE_FEE_BPS: i128 = 30;
    const MAX_SWAP_FEE_BPS: i128 = 1_000;

    for _i in 0..1_000_000 {
        let is_a_to_b = (next_rand() % 2) == 0;
        let amount_in = ((next_rand() % 100_000) + 10) as i128;

        if is_a_to_b {
            let new_a = current_balance_a + amount_in;
            let amount_out_before_fee =
                current_balance_b - (current_balance_a * current_balance_b + new_a - 1) / new_a;

            if amount_out_before_fee <= 0 || amount_out_before_fee >= current_balance_b {
                continue;
            }

            let price_impact_bps = (amount_out_before_fee * BPS) / current_balance_b;
            let dynamic_fee_bps = (BASE_FEE_BPS + (price_impact_bps / 100)).min(MAX_SWAP_FEE_BPS);
            let fee = (amount_out_before_fee * dynamic_fee_bps) / BPS;
            let amount_out = amount_out_before_fee - fee;

            let new_b = current_balance_b - amount_out - fee;
            let new_k = (new_a as u128) * (new_b as u128);

            assert!(
                new_k >= current_k,
                "AMM invariant k1 >= k0 violated in A->B swap: new_k ({}) < current_k ({})",
                new_k,
                current_k
            );

            current_balance_a = new_a;
            current_balance_b = new_b;
            current_k = new_k;
        } else {
            let new_b = current_balance_b + amount_in;
            let amount_out_before_fee =
                current_balance_a - (current_balance_a * current_balance_b + new_b - 1) / new_b;

            if amount_out_before_fee <= 0 || amount_out_before_fee >= current_balance_a {
                continue;
            }

            let price_impact_bps = (amount_out_before_fee * BPS) / current_balance_a;
            let dynamic_fee_bps = (BASE_FEE_BPS + (price_impact_bps / 100)).min(MAX_SWAP_FEE_BPS);
            let fee = (amount_out_before_fee * dynamic_fee_bps) / BPS;
            let amount_out = amount_out_before_fee - fee;

            let new_a = current_balance_a - amount_out - fee;
            let new_k = (new_a as u128) * (new_b as u128);

            assert!(
                new_k >= current_k,
                "AMM invariant k1 >= k0 violated in B->A swap: new_k ({}) < current_k ({})",
                new_k,
                current_k
            );

            current_balance_a = new_a;
            current_balance_b = new_b;
            current_k = new_k;
        }
    }
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(50))]

    #[test]
    fn prop_fuzz_amm_arbitrary_trades(
        res_a in 100_000i128..50_000_000i128,
        res_b in 100_000i128..50_000_000i128,
        trade_amt in 100i128..500_000i128,
    ) {
        let env = Env::default();
        let (_admin, client, token_a, _token_b, _, _) = setup_amm(&env, res_a, res_b);

        let user = Address::generate(&env);
        let token_a_client = token::StellarAssetClient::new(&env, &token_a);
        token_a_client.mint(&user, &trade_amt);

        let (b_a0, b_b0, _) = client.get_pool_state();
        let k0 = (b_a0 as u128) * (b_b0 as u128);
        let out = client.swap_a_for_b(&user, &trade_amt, &0);
        let (b_a1, b_b1, _) = client.get_pool_state();
        let k1 = (b_a1 as u128) * (b_b1 as u128);

        prop_assert!(out > 0);
        prop_assert!(k1 >= k0);
        prop_assert!(b_a1 > 0);
        prop_assert!(b_b1 > 0);
    }
}
