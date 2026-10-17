use crate::{ParametricInsuranceContract, ParametricInsuranceContractClient};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token, Address, Env, Symbol, Vec,
};

fn setup() -> (Env, Address, Address, Address, Vec<Address>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let buyer = Address::generate(&env);
    let underwriter = Address::generate(&env);
    let oracles = Vec::from_array(
        &env,
        [
            Address::generate(&env),
            Address::generate(&env),
            Address::generate(&env),
        ],
    );
    let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
    let token_id = token_contract.address();
    let sac = token::StellarAssetClient::new(&env, &token_id);
    sac.mint(&buyer, &10_000);
    sac.mint(&underwriter, &50_000);
    let contract_id = env.register(ParametricInsuranceContract, ());
    let client = ParametricInsuranceContractClient::new(&env, &contract_id);
    client.initialize(&admin, &token_id, &oracles, &3);
    (env, contract_id, token_id, admin, oracles, buyer)
}

#[test]
fn median_quorum_pays_policy_automatically() {
    let (env, contract_id, token_id, _admin, oracles, buyer) = setup();
    let client = ParametricInsuranceContractClient::new(&env, &contract_id);
    let underwriter = Address::generate(&env);
    let sac = token::StellarAssetClient::new(&env, &token_id);
    sac.mint(&underwriter, &20_000);
    client.underwrite(&underwriter, &20_000);

    let trigger = Symbol::new(&env, "temperature");
    let policy_id = client.buy_policy(
        &buyer,
        &500,
        &10_000,
        &(env.ledger().timestamp() + 100),
        &trigger,
        &100,
        &true,
    );
    client.post_oracle_value(&oracles.get(0).unwrap(), &trigger, &50);
    client.post_oracle_value(&oracles.get(1).unwrap(), &trigger, &150);
    assert_eq!(client.aggregate_oracle_value(&trigger), None);
    client.post_oracle_value(&oracles.get(2).unwrap(), &trigger, &200);

    let policy = client.get_policy(&policy_id).unwrap();
    assert!(policy.claimed);
    assert_eq!(token::Client::new(&env, &token_id).balance(&buyer), 19_500);
}

#[test]
fn stale_reports_do_not_satisfy_quorum() {
    let (env, contract_id, _token_id, _admin, oracles, _buyer) = setup();
    let client = ParametricInsuranceContractClient::new(&env, &contract_id);
    let trigger = Symbol::new(&env, "rainfall");
    client.post_oracle_value(&oracles.get(0).unwrap(), &trigger, &10);
    client.post_oracle_value(&oracles.get(1).unwrap(), &trigger, &20);

    env.ledger()
        .with_mut(|ledger| ledger.timestamp += crate::oracle_consensus::DEFAULT_STALENESS_SECS + 1);
    client.post_oracle_value(&oracles.get(2).unwrap(), &trigger, &30);
    assert_eq!(client.aggregate_oracle_value(&trigger), None);
}

#[test]
fn expiry_releases_liability_and_premium_to_insurer() {
    let (env, contract_id, token_id, admin, _oracles, buyer) = setup();
    let client = ParametricInsuranceContractClient::new(&env, &contract_id);
    let underwriter = Address::generate(&env);
    let sac = token::StellarAssetClient::new(&env, &token_id);
    sac.mint(&underwriter, &20_000);
    client.underwrite(&underwriter, &20_000);

    let expires_at = env.ledger().timestamp() + 50;
    let policy_id = client.buy_policy(
        &buyer,
        &500,
        &10_000,
        &expires_at,
        &Symbol::new(&env, "wind"),
        &100,
        &true,
    );
    env.ledger()
        .with_mut(|ledger| ledger.timestamp = expires_at);
    client.expire_policy(&policy_id);
    client.withdraw_underwriting(&admin, &500);

    let token_client = token::Client::new(&env, &token_id);
    assert_eq!(token_client.balance(&admin), 500);
    assert_eq!(client.get_policy(&policy_id).unwrap().expired, true);
    assert_eq!(client.solvency_ratio_bps(), 100_000);
}
