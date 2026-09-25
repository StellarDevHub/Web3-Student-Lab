use super::*;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{token, Address, Env};

fn setup(env: &Env) -> (Address, AMMContractClient<'static>, Address, Address, Address) {
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
    client.initialize(&admin, &token_a_id, &token_b_id, &pool_share_id, &fee_collector, &50);

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
    assert!(result.is_err(), "Should panic on insufficient shares (slippage)");
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
    assert!(result.is_err(), "Should panic on insufficient output (slippage)");
}

#[test]
fn test_remove_liquidity() {
    let env = Env::default();
    let (admin, client, _, _, _) = setup(&env);

    let shares_minted = client.add_liquidity(&admin, &1_000_000, &1_000_000, &0);

    // Remove half of liquidity
    let (amount_a, amount_b) = client.remove_liquidity(&admin, &(shares_minted / 2), &0, &0);

    assert!(amount_a > 0);
    assert!(amount_b > 0);

    let (bal_a, bal_b, _) = client.get_pool_state();
    assert_eq!(bal_a, 1_000_000 - amount_a);
    assert_eq!(bal_b, 1_000_000 - amount_b);
}

#[test]
#[should_panic(expected = "Fee must be between 10 and 1000 bps")]
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
    client.initialize(&admin, &token_a_id, &token_b_id, &pool_share_id, &fee_collector, &2000);
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
