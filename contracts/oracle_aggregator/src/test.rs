use super::*;
use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::Env;

fn setup(env: &Env) -> (Address, OracleAggregatorContractClient<'static>) {
    env.mock_all_auths();
    let admin = Address::generate(env);
    let contract_id = env.register(OracleAggregatorContract, ());
    let client = OracleAggregatorContractClient::new(env, &contract_id);
    client.initialize(&admin);
    (admin, client)
}

#[test]
fn test_median_of_fresh_reports() {
    let env = Env::default();
    let (_, client) = setup(&env);

    let r1 = Address::generate(&env);
    let r2 = Address::generate(&env);
    let r3 = Address::generate(&env);
    client.add_reporter(&r1, &1_000);
    client.add_reporter(&r2, &1_000);
    client.add_reporter(&r3, &1_000);

    client.submit_price(&r1, &100);
    client.submit_price(&r2, &102);
    client.submit_price(&r3, &101);

    let median = client.aggregate();
    assert_eq!(median, 101);
    assert_eq!(client.get_price(), 101);
}

#[test]
fn test_stale_reports_excluded() {
    let env = Env::default();
    let (_, client) = setup(&env);

    let r1 = Address::generate(&env);
    let r2 = Address::generate(&env);
    client.add_reporter(&r1, &1_000);
    client.add_reporter(&r2, &1_000);

    client.submit_price(&r1, &100);

    // advance ledger time beyond staleness window before r2 submits
    env.ledger().with_mut(|li| li.timestamp += MAX_STALENESS_SECONDS + 1);
    client.submit_price(&r2, &200);

    // r1's report is now stale and must be excluded; only r2 remains
    let median = client.aggregate();
    assert_eq!(median, 200);
}

#[test]
#[should_panic(expected = "No fresh price reports available")]
fn test_all_stale_panics() {
    let env = Env::default();
    let (_, client) = setup(&env);

    let r1 = Address::generate(&env);
    client.add_reporter(&r1, &1_000);
    client.submit_price(&r1, &100);

    env.ledger().with_mut(|li| li.timestamp += MAX_STALENESS_SECONDS + 1);
    client.aggregate();
}

#[test]
fn test_outlier_excluded_and_slashed() {
    let env = Env::default();
    let (_, client) = setup(&env);

    let r1 = Address::generate(&env);
    let r2 = Address::generate(&env);
    let r3 = Address::generate(&env);
    client.add_reporter(&r1, &1_000);
    client.add_reporter(&r2, &1_000);
    client.add_reporter(&r3, &1_000);

    // r1, r2 agree around 100; r3 reports a wild outlier (>15% deviation)
    client.submit_price(&r1, &100);
    client.submit_price(&r2, &100);
    client.submit_price(&r3, &200);

    let final_price = client.aggregate();
    // outlier excluded from final median calc
    assert_eq!(final_price, 100);

    // r3 must have been slashed 10% of its 1000 stake
    assert_eq!(client.get_stake(&r3), 900);
    // honest reporters keep full stake
    assert_eq!(client.get_stake(&r1), 1_000);
    assert_eq!(client.get_stake(&r2), 1_000);
}

#[test]
#[should_panic(expected = "Reporter not whitelisted")]
fn test_unauthorized_reporter_rejected() {
    let env = Env::default();
    let (_, client) = setup(&env);

    let stranger = Address::generate(&env);
    client.submit_price(&stranger, &100);
}

#[test]
fn test_remove_reporter() {
    let env = Env::default();
    let (_, client) = setup(&env);

    let r1 = Address::generate(&env);
    client.add_reporter(&r1, &1_000);
    assert!(client.is_reporter(&r1));

    client.remove_reporter(&r1);
    assert!(!client.is_reporter(&r1));
}
