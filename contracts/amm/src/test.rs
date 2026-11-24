use super::*;
use contract_events::topic;
use soroban_sdk::testutils::{Address as _, Events as _, Ledger as _};
use soroban_sdk::{
    contract, contractimpl, symbol_short, token, xdr, Address, Env, Symbol, TryFromVal, Val, Vec,
};

#[contract]
struct CallbackToken;

#[contractimpl]
impl CallbackToken {
    pub fn transfer(env: Env, from: Address, _to: Address, _amount: i128) {
        let pool: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("pool"))
            .unwrap();
        AMMContractClient::new(&env, &pool).swap_a_for_b(&from, &1, &0);
    }
}

fn setup(
    env: &Env,
) -> (
    Address,
    AMMContractClient<'static>,
    Address,
    Address,
    Address,
) {
    env.mock_all_auths();
    let admin = Address::generate(env);
    let contract_id = env.register(AMMContract, ());
    let client = AMMContractClient::new(env, &contract_id);

    // Register mock tokens and pool share token
    let token_a_contract = env.register_stellar_asset_contract_v2(admin.clone());
    let token_b_contract = env.register_stellar_asset_contract_v2(admin.clone());
    let pool_share_contract = env.register_stellar_asset_contract_v2(admin.clone());

    // Convert to Address
    let token_a_id = token_a_contract.address();
    let token_b_id = token_b_contract.address();
    let pool_share_id = pool_share_contract.address();

    // Mint initial tokens for testing
    let token_a_client = token::StellarAssetClient::new(env, &token_a_id);
    let token_b_client = token::StellarAssetClient::new(env, &token_b_id);
    token_a_client.mint(&admin, &1_000_000_000);
    token_b_client.mint(&admin, &1_000_000_000);

    let fee_collector = Address::generate(env);
    client.initialize(
        &admin,
        &token_a_id,
        &token_b_id,
        &pool_share_id,
        &fee_collector,
        &30, // 0.3 % base swap fee (spec: 0.3 % dynamic swap fee)
    );

    (admin, client, token_a_id, token_b_id, pool_share_id)
}

#[test]
fn test_add_liquidity_initializes_pool() {
    let env = Env::default();
    let (admin, client, _, _, _) = setup(&env);

    let shares = client.add_liquidity(&admin, &1_000_000, &1_000_000, &0);

    // After adding 1M + 1M liquidity, shares = sqrt(1M * 1M) = 1M
    // But 1000 dead shares were burned, so actual shares = 1M - 1000
    assert!(shares > 0);
    assert!(shares < 1_000_000); // Less than geometric mean due to dead shares

    let (bal_a, bal_b, total) = client.get_pool_state();
    assert_eq!(bal_a, 1_000_000);
    assert_eq!(bal_b, 1_000_000);
    assert_eq!(total, shares + DEAD_SHARES);
}

#[test]
fn test_liquidity_event_indexes_provider() {
    let env = Env::default();
    let (admin, client, _, _, _) = setup(&env);
    client.add_liquidity(&admin, &1_000_000, &1_000_000, &0);

    let mut found = false;
    for event in env.events().all().events() {
        if let xdr::ContractEventBody::V0(v0) = &event.body {
            let topics: Vec<Val> = Vec::try_from_val(&env, &v0.topics).unwrap();
            if Symbol::try_from_val(&env, &topics.get(0).unwrap()).unwrap()
                == topic::LIQUIDITY_ADDED
            {
                assert_eq!(topics.len(), 2);
                assert_eq!(
                    Address::try_from_val(&env, &topics.get(1).unwrap()).unwrap(),
                    admin
                );
                found = true;
            }
        }
    }
    assert!(found);
}

#[test]
fn test_constant_product_invariant_swap() {
    let env = Env::default();
    let (admin, client, token_a_id, _, _) = setup(&env);

    // Add initial liquidity
    client.add_liquidity(&admin, &10_000_000, &10_000_000, &0);

    let (bal_a_before, bal_b_before, _) = client.get_pool_state();
    let k_before = bal_a_before * bal_b_before;

    // Perform swap
    let user = Address::generate(&env);
    let token_a_client = token::StellarAssetClient::new(&env, &token_a_id);
    token_a_client.mint(&user, &1_000_000);

    let amount_out = client.swap_a_for_b(&user, &1_000_000, &0);
    assert!(amount_out > 0);

    let (bal_a_after, bal_b_after, _) = client.get_pool_state();
    let k_after = bal_a_after * bal_b_after;

    // After swap, k should increase (fee collected is removed from B balance)
    // So k_after >= k_before (due to fee collection)
    assert!(k_after >= k_before);
}

#[test]
fn test_token_callback_cannot_reenter_pool() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let pool_id = env.register(AMMContract, ());
    let pool = AMMContractClient::new(&env, &pool_id);
    let callback_token = env.register(CallbackToken, ());
    let token_b = env.register_stellar_asset_contract_v2(admin.clone());
    let pool_share = env.register_stellar_asset_contract_v2(admin.clone());
    let token_b_id = token_b.address();
    let pool_share_id = pool_share.address();
    let fee_collector = Address::generate(&env);

    env.as_contract(&callback_token, || {
        env.storage()
            .instance()
            .set(&symbol_short!("pool"), &pool_id);
    });
    token::StellarAssetClient::new(&env, &token_b_id).mint(&admin, &1_000_000);
    pool.initialize(
        &admin,
        &callback_token,
        &token_b_id,
        &pool_share_id,
        &fee_collector,
        &50,
    );

    let result = pool.try_add_liquidity(&admin, &1_000_000, &1_000_000, &0);
    assert!(
        result.is_err(),
        "callback reentry must revert the outer call"
    );
    assert_eq!(pool.get_pool_state(), (0, 0, DEAD_SHARES));
}

#[test]
#[should_panic(expected = "Error(Contract, #412)")]
fn test_reserve_invariant_rejects_accounted_balance_above_reserve() {
    let env = Env::default();
    let pool_id = env.register(AMMContract, ());
    env.as_contract(&pool_id, || {
        env.storage().instance().set(&DataKey::BalanceA, &2i128);
        env.storage().instance().set(&DataKey::BalanceB, &0i128);
        env.storage().instance().set(&DataKey::ReserveA, &1i128);
        env.storage().instance().set(&DataKey::ReserveB, &0i128);
        invariants::assert_balance_reserve_invariant(&env);
    });
}

#[test]
fn test_slippage_protection_add_liquidity() {
    let env = Env::default();
    let (admin, client, token_a_id, token_b_id, _) = setup(&env);

    client.add_liquidity(&admin, &1_000_000, &1_000_000, &0);

    let user = Address::generate(&env);
    let token_a_client = token::StellarAssetClient::new(&env, &token_a_id);
    let token_b_client = token::StellarAssetClient::new(&env, &token_b_id);
    token_a_client.mint(&user, &1_000_000);
    token_b_client.mint(&user, &1_000_000);

    // Request high min_shares should panic if not enough liquidity
    let result = client.try_add_liquidity(&user, &1_000, &1_000, &1_000_000_000);
    assert!(
        result.is_err(),
        "Should panic on insufficient shares (slippage)"
    );
}

#[test]
fn test_slippage_protection_swap() {
    let env = Env::default();
    let (admin, client, token_a_id, _, _) = setup(&env);

    client.add_liquidity(&admin, &10_000_000, &10_000_000, &0);

    let user = Address::generate(&env);
    let token_a_client = token::StellarAssetClient::new(&env, &token_a_id);
    token_a_client.mint(&user, &1_000_000);

    // Request high min_amount_out should panic
    let result = client.try_swap_a_for_b(&user, &1_000_000, &100_000_000);
    assert!(
        result.is_err(),
        "Should panic on insufficient output (slippage)"
    );
}

#[test]
fn test_remove_liquidity() {
    let env = Env::default();
    let (admin, client, _, _, _) = setup(&env);

    let shares_minted = client.add_liquidity(&admin, &1_000_000, &1_000_000, &0);

    // Keep the withdrawal within the 10% daily outflow limit.
    let (amount_a, amount_b) = client.remove_liquidity(&admin, &(shares_minted / 10), &0, &0);

    assert!(amount_a > 0);
    assert!(amount_b > 0);

    let (bal_a, bal_b, _) = client.get_pool_state();
    assert_eq!(bal_a, 1_000_000 - amount_a);
    assert_eq!(bal_b, 1_000_000 - amount_b);
}

#[test]
#[should_panic(expected = "Error(Contract, #402)")]
fn test_invalid_fee_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(AMMContract, ());
    let client = AMMContractClient::new(&env, &contract_id);

    let token_a_contract = env.register_stellar_asset_contract_v2(admin.clone());
    let token_b_contract = env.register_stellar_asset_contract_v2(admin.clone());
    let pool_share_contract = env.register_stellar_asset_contract_v2(admin.clone());

    let token_a_id = token_a_contract.address();
    let token_b_id = token_b_contract.address();
    let pool_share_id = pool_share_contract.address();

    let fee_collector = Address::generate(&env);

    // Try to initialize with fee > 1000 bps (should panic)
    client.initialize(
        &admin,
        &token_a_id,
        &token_b_id,
        &pool_share_id,
        &fee_collector,
        &2000,
    );
}

#[test]
fn test_dead_shares_burned() {
    let env = Env::default();
    let (admin, client, _, _, _) = setup(&env);

    let shares = client.add_liquidity(&admin, &1_000_000, &1_000_000, &0);
    let (_, _, total_shares) = client.get_pool_state();

    // Total shares should include dead shares (1000)
    assert_eq!(total_shares, shares + DEAD_SHARES);
}

#[test]
fn test_twap_cumulative_accumulation_and_consultation() {
    let env = Env::default();
    let (admin, client, token_a, _token_b, _) = setup(&env);

    // Initial pool ratio: 1 token A = 2 token B (500k A : 1M B)
    client.add_liquidity(&admin, &500_000, &1_000_000, &0);

    // Advance ledger by 1800 seconds (30 minutes)
    env.ledger().with_mut(|li| li.timestamp += 1800);

    // Small swap to trigger cumulative price accumulator update
    let user = Address::generate(&env);
    let token_a_client = token::StellarAssetClient::new(&env, &token_a);
    token_a_client.mint(&user, &10_000);
    client.swap_a_for_b(&user, &10_000, &0);

    let (price_a_cum, price_b_cum, last_time) = client.get_twap_cumulative();
    assert!(price_a_cum > 0);
    assert!(price_b_cum > 0);
    assert_eq!(last_time, 1800);

    // 30-minute TWAP consultation for 1000 Token A
    let twap_30m = client.twap_consult_30m(&token_a, &1_000);
    // Price should be around 2x (~2000 token B)
    assert!(twap_30m >= 1900 && twap_30m <= 2100);

    // Advance another 1800s to total 3600s (1 hour)
    env.ledger().with_mut(|li| li.timestamp += 1800);
    token_a_client.mint(&user, &10_000);
    client.swap_a_for_b(&user, &10_000, &0);

    let twap_1h = client.twap_consult_1h(&token_a, &1_000);
    assert!(twap_1h > 0);
}

#[test]
fn test_twap_resistant_to_single_block_flash_manipulation() {
    let env = Env::default();
    let (admin, client, token_a, _token_b, _) = setup(&env);

    // Initial 1:1 ratio
    client.add_liquidity(&admin, &1_000_000, &1_000_000, &0);

    // Advance 1800s in normal trading
    env.ledger().with_mut(|li| li.timestamp += 1800);
    let normal_user = Address::generate(&env);
    let token_a_client = token::StellarAssetClient::new(&env, &token_a);
    token_a_client.mint(&normal_user, &1000);
    client.swap_a_for_b(&normal_user, &1000, &0);

    let twap_before_flash = client.twap_consult_30m(&token_a, &1000);

    // The circuit breaker rejects an oversized flash-swap in the same window.
    let attacker = Address::generate(&env);
    token_a_client.mint(&attacker, &500_000);
    let result = client.try_swap_a_for_b(&attacker, &500_000, &0);
    assert!(result.is_err());

    // Instantaneous spot price is heavily manipulated, but TWAP accumulator in same block does NOT move:
    let twap_during_flash = client.twap_consult_30m(&token_a, &1000);

    // TWAP output remains stable and immune to single-block flash loan spike
    assert_eq!(twap_before_flash, twap_during_flash);
}

// ── Reentrancy guard (flash-swap defense) tests ──────────────────────────────

#[test]
#[should_panic(expected = "Error(Contract, #411)")]
fn test_reentrancy_guard_blocks_double_entry() {
    let env = Env::default();
    let (admin, client, _, _, _) = setup(&env);

    // Simulate a reentrant state by pre-setting the temporary guard key.
    env.as_contract(&client.address, || {
        env.storage().temporary().set(&RG_KEY, &true);
    });

    // This deposit must be rejected because the guard is already held.
    client.add_liquidity(&admin, &1_000_000, &1_000_000, &0);
}

#[test]
fn test_reentrancy_lock_released_after_successful_calls() {
    let env = Env::default();
    let (admin, client, token_a_id, _, _) = setup(&env);

    // Consecutive mutations succeed because each call releases its guard.
    client.add_liquidity(&admin, &10_000_000, &10_000_000, &0);

    let user = Address::generate(&env);
    let token_a_client = token::StellarAssetClient::new(&env, &token_a_id);
    token_a_client.mint(&user, &1_000_000);
    client.swap_a_for_b(&user, &1_000_000, &0);

    client.add_liquidity(&admin, &1_000_000, &1_000_000, &0);

    // The guard must be absent from storage between transactions.
    let lock_held = env.as_contract(&client.address, || env.storage().temporary().has(&RG_KEY));
    assert!(
        !lock_held,
        "reentrancy guard must be released after each call"
    );
}

// ── Fee accumulator test (0.3 % base fee + dynamic price-impact uplift) ─────

#[test]
fn test_swap_charges_0_3pct_base_fee_with_impact_uplift() {
    let env = Env::default();
    let (admin, client, token_a_id, _token_b_id, _) = setup(&env);

    client.add_liquidity(&admin, &10_000_000, &10_000_000, &0);

    let user = Address::generate(&env);
    let token_a_client = token::StellarAssetClient::new(&env, &token_a_id);
    let amount_in = 1_000_000i128;
    token_a_client.mint(&user, &amount_in);

    let (bal_a_before, bal_b_before, _) = client.get_pool_state();
    let new_a = bal_a_before + amount_in;
    let out_before = bal_b_before - (bal_a_before * bal_b_before + new_a - 1) / new_a;

    // Spec: 0.3 % base fee, uplifted by price impact (bps / 100).
    let impact_bps = (out_before * 10_000) / bal_b_before;
    let expected_fee = (out_before * (30 + impact_bps / 100)) / 10_000;

    let amount_out = client.swap_a_for_b(&user, &amount_in, &0);

    let (_, bal_b_after, _) = client.get_pool_state();
    let fee = (bal_b_before - bal_b_after) - amount_out;

    assert!(fee > 0, "swap must collect a fee");
    assert_eq!(fee, expected_fee, "fee must be 0.3 % base + impact uplift");
    assert_eq!(amount_out, out_before - fee);
}

#[test]
fn test_swap_with_deadline_succeeds_before_deadline() {
    let env = Env::default();
    let (admin, client, token_a, _, _) = setup(&env);
    client.add_liquidity(&admin, &100_000, &100_000, &0);

    let user = Address::generate(&env);
    let token_a_client = token::StellarAssetClient::new(&env, &token_a);
    token_a_client.mint(&user, &1000);

    env.ledger().with_mut(|li| li.timestamp = 100);
    let out = client.swap_a_for_b_with_deadline(&user, &1000, &0, &200);
    assert!(out > 0);
}

#[test]
#[should_panic(expected = "Error(Contract, #405)")]
fn test_swap_with_deadline_reverts_if_expired() {
    let env = Env::default();
    let (admin, client, token_a, _, _) = setup(&env);
    client.add_liquidity(&admin, &100_000, &100_000, &0);

    let user = Address::generate(&env);
    let token_a_client = token::StellarAssetClient::new(&env, &token_a);
    token_a_client.mint(&user, &1000);

    env.ledger().with_mut(|li| li.timestamp = 201);
    // User deadline is 200, current timestamp is 201 -> should panic with 405
    client.swap_a_for_b_with_deadline(&user, &1000, &0, &200);
}

#[test]
#[should_panic(expected = "Error(Contract, #406)")]
fn test_same_block_bidirectional_trade_rejected() {
    let env = Env::default();
    let (admin, client, token_a, token_b, _) = setup(&env);
    client.add_liquidity(&admin, &100_000, &100_000, &0);

    let attacker = Address::generate(&env);
    let token_a_client = token::StellarAssetClient::new(&env, &token_a);
    let token_b_client = token::StellarAssetClient::new(&env, &token_b);
    token_a_client.mint(&attacker, &5000);
    token_b_client.mint(&attacker, &5000);

    // Swap A -> B
    client.swap_a_for_b(&attacker, &1000, &0);

    // In the exact same block/sequence, attempt reverse swap B -> A (sandwich backrun) -> should panic with 406
    client.swap_b_for_a(&attacker, &500, &0);
}

#[test]
fn test_bidirectional_trade_allowed_in_different_blocks() {
    let env = Env::default();
    let (admin, client, token_a, token_b, _) = setup(&env);
    client.add_liquidity(&admin, &100_000, &100_000, &0);

    let user = Address::generate(&env);
    let token_a_client = token::StellarAssetClient::new(&env, &token_a);
    let token_b_client = token::StellarAssetClient::new(&env, &token_b);
    token_a_client.mint(&user, &5000);
    token_b_client.mint(&user, &5000);

    // Block 1: Swap A -> B
    env.ledger().with_mut(|li| li.sequence_number = 10);
    let out1 = client.swap_a_for_b(&user, &1000, &0);
    assert!(out1 > 0);

    // Block 2: Advance block sequence -> reverse swap B -> A is allowed
    env.ledger().with_mut(|li| li.sequence_number = 11);
    let out2 = client.swap_b_for_a(&user, &500, &0);
    assert!(out2 > 0);
}

fn test_guardian_pause_blocks_amm_operations() {
    let env = Env::default();
    let (admin, client, token_a, _, _) = setup(&env);
    let shares = client.add_liquidity(&admin, &1_000_000, &1_000_000, &0);

    let guardian = Address::generate(&env);
    client.set_guardian(&admin, &guardian);
    client.set_paused(&guardian, &true);
    assert!(client.is_paused());

    let user = Address::generate(&env);
    token::StellarAssetClient::new(&env, &token_a).mint(&user, &1_000);
    assert!(client.try_swap_a_for_b(&user, &1_000, &0).is_err());
    assert!(client
        .try_add_liquidity(&admin, &1_000, &1_000, &0)
        .is_err());
    assert!(client
        .try_remove_liquidity(&admin, &shares, &0, &0)
        .is_err());

    assert!(client.try_set_paused(&user, &true).is_err());
    client.set_paused(&admin, &false);
    assert!(!client.is_paused());
    assert!(client.swap_a_for_b(&user, &1_000, &0) > 0);
}

#[test]
fn test_swap_outflow_limit_accumulates_and_resets_after_24_hours() {
    let env = Env::default();
    let (admin, client, token_a, _, _) = setup(&env);
    client.add_liquidity(&admin, &1_000_000, &1_000_000, &0);

    let user = Address::generate(&env);
    let token_a_client = token::StellarAssetClient::new(&env, &token_a);
    token_a_client.mint(&user, &180_000);
    assert!(client.swap_a_for_b(&user, &60_000, &0) > 0);
    assert!(client.try_swap_a_for_b(&user, &60_000, &0).is_err());

    env.ledger()
        .with_mut(|ledger| ledger.timestamp += circuit_breaker::WITHDRAWAL_WINDOW_SECONDS);
    assert!(client.swap_a_for_b(&user, &60_000, &0) > 0);
}
