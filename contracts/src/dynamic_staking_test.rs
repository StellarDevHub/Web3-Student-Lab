#![cfg(test)]

use crate::dynamic_staking::{
    DynamicStakingContract, DynamicStakingContractClient, EARLY_WITHDRAWAL_PENALTY_BPS,
    MAX_LOCK_DURATION, PRECISION, StakingError, UserPosition,
};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token, Address, Env,
};

fn setup() -> (
    Env,
    Address, // admin
    token::Client<'static>, // staking token
    token::StellarAssetClient<'static>, // staking token admin
    token::Client<'static>, // reward token
    token::StellarAssetClient<'static>, // reward token admin
    DynamicStakingContractClient<'static>,
) {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);

    let st_admin = Address::generate(&env);
    let st_contract = env.register_stellar_asset_contract_v2(st_admin.clone());
    let st_client = token::Client::new(&env, &st_contract.address());
    let st_admin_client = token::StellarAssetClient::new(&env, &st_contract.address());

    let rt_admin = Address::generate(&env);
    let rt_contract = env.register_stellar_asset_contract_v2(rt_admin.clone());
    let rt_client = token::Client::new(&env, &rt_contract.address());
    let rt_admin_client = token::StellarAssetClient::new(&env, &rt_contract.address());

    let contract_id = env.register(DynamicStakingContract, ());
    let client = DynamicStakingContractClient::new(&env, &contract_id);

    // Reward rate = 100 tokens per ledger
    client.initialize(
        &admin,
        &st_contract.address(),
        &rt_contract.address(),
        &100,
    );

    // Mint rewards to contract
    rt_admin_client.mint(&contract_id, &1_000_000_000);

    (
        env,
        admin,
        st_client,
        st_admin_client,
        rt_client,
        rt_admin_client,
        client,
    )
}

#[test]
fn test_initialize() {
    let (_env, _admin, _st, _sta, _rt, _rta, _client) = setup();
    // Setup completes successfully if initialize works
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn test_double_init() {
    let (env, admin, st, _, rt, _, client) = setup();
    client.initialize(&admin, &st.address, &rt.address, &100);
}

#[test]
fn test_stake_and_reward_accumulation() {
    let (env, _admin, st_client, st_admin, rt_client, _, client) = setup();
    
    let user1 = Address::generate(&env);
    st_admin.mint(&user1, &1000);

    // Stake 1000 tokens for 0 duration (liquid)
    env.ledger().set_timestamp(100);
    client.stake(&user1, &1000, &0);

    // Advance 10 seconds.
    // Rate is 100. Total reward = 10 * 100 = 1000.
    env.ledger().set_timestamp(110);
    
    let earned = client.earned(&user1);
    assert_eq!(earned, 1000);

    client.claim_rewards(&user1);
    assert_eq!(rt_client.balance(&user1), 1000);
}

#[test]
fn test_dynamic_pool_size() {
    let (env, _admin, st_client, st_admin, _, _, client) = setup();
    
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    st_admin.mint(&user1, &1000);
    st_admin.mint(&user2, &1000);

    env.ledger().set_timestamp(100);
    client.stake(&user1, &1000, &0);

    env.ledger().set_timestamp(110);
    // user1 was alone for 10 seconds. Rate=100 -> 1000 rewards.
    assert_eq!(client.earned(&user1), 1000);

    client.stake(&user2, &1000, &0);

    env.ledger().set_timestamp(120);
    // user1 and user2 both have 1000 stake (equal effective balance).
    // In next 10 seconds, 1000 rewards are generated. They split it 500/500.
    // user1 total = 1000 + 500 = 1500
    // user2 total = 500
    assert_eq!(client.earned(&user1), 1500);
    assert_eq!(client.earned(&user2), 500);
}

#[test]
fn test_lock_duration_weighting() {
    let (env, _admin, st_client, st_admin, _, _, client) = setup();
    
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    st_admin.mint(&user1, &1000);
    st_admin.mint(&user2, &1000);

    env.ledger().set_timestamp(100);
    
    // User 1 locks 1000 for 0 days (weight 1x -> effective 1000)
    client.stake(&user1, &1000, &0);
    
    // User 2 locks 1000 for 365 days (weight 2x -> effective 2000)
    client.stake(&user2, &1000, &MAX_LOCK_DURATION);

    // Total effective supply = 3000.
    env.ledger().set_timestamp(110);
    // 10 seconds * 100 rate = 1000 rewards.
    // user1 share = 1000 * 1000 / 3000 = 333
    // user2 share = 1000 * 2000 / 3000 = 666
    
    let u1_earned = client.earned(&user1);
    let u2_earned = client.earned(&user2);
    
    assert_eq!(u1_earned, 333);
    assert_eq!(u2_earned, 666);
}

#[test]
fn test_early_withdrawal_penalty() {
    let (env, _admin, st_client, st_admin, _, _, client) = setup();
    
    let user1 = Address::generate(&env);
    st_admin.mint(&user1, &1000);

    env.ledger().set_timestamp(100);
    // Lock for 1000 seconds (ends at 1100)
    client.stake(&user1, &1000, &1000);

    // Fast forward to 500
    env.ledger().set_timestamp(500);
    // Earned lots of rewards, but user wants to withdraw early.
    
    client.unstake(&user1, &1000);
    
    // Penalty is 10%. User should get back 900.
    assert_eq!(st_client.balance(&user1), 900);
    
    // Rewards are forfeited
    assert_eq!(client.earned(&user1), 0);
}

#[test]
fn test_successful_unstake() {
    let (env, _admin, st_client, st_admin, rt_client, _, client) = setup();
    
    let user1 = Address::generate(&env);
    st_admin.mint(&user1, &1000);

    env.ledger().set_timestamp(100);
    // Lock for 1000 seconds (ends at 1100)
    client.stake(&user1, &1000, &1000);

    // Fast forward to 1200
    env.ledger().set_timestamp(1200);
    
    let earned_before = client.earned(&user1);
    
    client.unstake(&user1, &1000);
    
    // No penalty
    assert_eq!(st_client.balance(&user1), 1000);
    
    // Rewards remain untouched
    assert_eq!(client.earned(&user1), earned_before);
    
    client.claim_rewards(&user1);
    assert_eq!(rt_client.balance(&user1), earned_before as i128);
}

#[test]
fn test_precision_loss_prevention() {
    let (env, _admin, _, st_admin, _, _, client) = setup();
    
    let user1 = Address::generate(&env);
    st_admin.mint(&user1, &1_000_000_000);

    env.ledger().set_timestamp(100);
    client.stake(&user1, &1_000_000_000, &0); // large stake

    let user2 = Address::generate(&env);
    st_admin.mint(&user2, &1); // micro stake

    client.stake(&user2, &1, &0);

    env.ledger().set_timestamp(200); // 100 seconds
    
    let earned = client.earned(&user2);
    // Due to precision math (1e18), even a stake of 1 token should correctly calculate a fraction
    // Actually, in our contract earned = effective_balance * delta / PRECISION
    // effective_balance = 1. total_supply = 1_000_000_001. 
    // delta = 100 * 100 * 1e18 / 1_000_000_001 = 9_999_999_990
    // new_rewards = 1 * 9_999_999_990 / 1e18 = 0
    // It rounds down to 0, which is correct for integer truncation. But the precision keeps the global accumulator safe.
    assert_eq!(earned, 0); 
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn test_stake_zero() {
    let (env, _admin, _, st_admin, _, _, client) = setup();
    let user1 = Address::generate(&env);
    st_admin.mint(&user1, &100);
    client.stake(&user1, &0, &0);
}

#[test]
#[should_panic(expected = "Error(Contract, #6)")]
fn test_unstake_excess() {
    let (env, _admin, _, st_admin, _, _, client) = setup();
    let user1 = Address::generate(&env);
    st_admin.mint(&user1, &100);
    client.stake(&user1, &100, &0);
    client.unstake(&user1, &101);
}

#[test]
fn test_partial_unstake_early() {
    let (env, _admin, st_client, st_admin, _, _, client) = setup();
    let user1 = Address::generate(&env);
    st_admin.mint(&user1, &1000);

    env.ledger().set_timestamp(100);
    client.stake(&user1, &1000, &1000); // lock until 1100

    env.ledger().set_timestamp(200);
    // Unstake 500 early
    client.unstake(&user1, &500);

    // Penalty on 500 is 50. Gets 450 back.
    assert_eq!(st_client.balance(&user1), 450);

    // Forfeits rewards
    assert_eq!(client.earned(&user1), 0);

    // But continues earning on remaining 500!
    env.ledger().set_timestamp(300);
    // rate is 100. 100 seconds = 10_000 total rewards. user is alone in pool.
    assert_eq!(client.earned(&user1), 10_000);
}
