use super::*;
use soroban_sdk::{testutils::Address as _, token, Env};

fn setup() -> (Env, Address, Address, Address, Address, YieldFarmingPoolClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(YieldFarmingPool, ());
    let admin = Address::generate(&env);
    let staking_token = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();
    let reward_token = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();
    let client = YieldFarmingPoolClient::new(&env, &contract_id);
    client.initialize(&admin, &staking_token, &reward_token, &10);
    token::StellarAssetClient::new(&env, &reward_token).mint(&contract_id, &1_000_000);
    (
        env,
        contract_id,
        admin,
        staking_token,
        reward_token,
        client,
    )
}

#[test]
fn stake_transfers_tokens_and_tracks_user_principal() {
    let (env, contract_id, _admin, staking_token, _reward_token, client) = setup();
    let user = Address::generate(&env);
    token::StellarAssetClient::new(&env, &staking_token).mint(&user, &500);

    client.stake(&user, &200);

    assert_eq!(client.get_user_stake(&user), 200);
    assert_eq!(client.get_total_staked(), 200);
    assert_eq!(token::Client::new(&env, &staking_token).balance(&user), 300);
    assert_eq!(
        token::Client::new(&env, &staking_token).balance(&contract_id),
        200
    );
}

#[test]
fn unstake_returns_principal_and_reduces_accounting() {
    let (env, contract_id, _admin, staking_token, _reward_token, client) = setup();
    let user = Address::generate(&env);
    token::StellarAssetClient::new(&env, &staking_token).mint(&user, &500);
    client.stake(&user, &300);

    client.unstake(&user, &120);

    assert_eq!(client.get_user_stake(&user), 180);
    assert_eq!(client.get_total_staked(), 180);
    assert_eq!(token::Client::new(&env, &staking_token).balance(&user), 320);
    assert_eq!(
        token::Client::new(&env, &staking_token).balance(&contract_id),
        180
    );
}

#[test]
fn rewards_are_time_weighted_and_claimed_in_tokens() {
    let (env, contract_id, _admin, staking_token, reward_token, client) = setup();
    let user = Address::generate(&env);
    token::StellarAssetClient::new(&env, &staking_token).mint(&user, &100);
    client.stake(&user, &100);

    env.ledger().set_timestamp(env.ledger().timestamp() + 10);
    assert_eq!(client.earned(&user), 100);
    assert_eq!(client.claim_rewards(&user), 100);
    assert_eq!(token::Client::new(&env, &reward_token).balance(&user), 100);
    assert_eq!(
        token::Client::new(&env, &reward_token).balance(&contract_id),
        999_900
    );
    assert_eq!(client.earned(&user), 0);
}

#[test]
fn changing_reward_rate_preserves_already_accrued_rewards() {
    let (env, _contract_id, admin, staking_token, _reward_token, client) = setup();
    let user = Address::generate(&env);
    token::StellarAssetClient::new(&env, &staking_token).mint(&user, &100);
    client.stake(&user, &100);
    env.ledger().set_timestamp(env.ledger().timestamp() + 5);

    client.set_reward_rate(&admin, &20);
    env.ledger().set_timestamp(env.ledger().timestamp() + 5);

    assert_eq!(client.earned(&user), 150);
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn cannot_unstake_more_than_the_users_principal() {
    let (env, _contract_id, _admin, staking_token, _reward_token, client) = setup();
    let user = Address::generate(&env);
    token::StellarAssetClient::new(&env, &staking_token).mint(&user, &50);
    client.stake(&user, &50);
    client.unstake(&user, &51);
}