use super::*;
use soroban_sdk::{
    contract, contractimpl, testutils::Address as _, Env,
};

/// Minimal legacy token: tracks transfers but otherwise a no-op.
#[contract]
struct MockLegacyToken;

#[contractimpl]
impl MockLegacyToken {
    #[allow(dead_code)]
    pub fn transfer(_env: Env, _from: Address, _to: Address, _amount: i128) {}
    #[allow(dead_code)]
    pub fn transfer_from(
        _env: Env,
        _spender: Address,
        _from: Address,
        _to: Address,
        _amount: i128,
    ) {
    }
    #[allow(dead_code)]
    pub fn balance(_env: Env, _id: Address) -> i128 {
        0
    }
}

/// Minimal new token: mint is a no-op.
#[contract]
struct MockNewToken;

#[contractimpl]
impl MockNewToken {
    #[allow(dead_code)]
    pub fn mint(_env: Env, _to: Address, _amount: i128) {}
}

fn setup(env: &Env) -> (TokenMigrationContractClient<'static>, Address, Address, Address, Address) {
    let id = env.register(TokenMigrationContract, ());
    let client = TokenMigrationContractClient::new(env, &id);
    let admin = Address::generate(env);
    let user = Address::generate(env);
    let old_token = env.register(MockLegacyToken, ());
    let new_token = env.register(MockNewToken, ());
    let deadline = env.ledger().timestamp() + 1000;
    client.initialize(&admin, &old_token, &new_token, &1, &deadline);
    (client, admin, user, old_token, new_token)
}

#[test]
fn initialize_and_migrate() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, user, _, _) = setup(&env);

    client.migrate(&user, &100);
    assert_eq!(client.get_user_migrated(&user), 100);
    assert_eq!(client.get_total_migrated(), 100);
}

#[test]
#[should_panic(expected = "Amount must be positive")]
fn migrate_zero_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, user, _, _) = setup(&env);
    client.migrate(&user, &0);
}

#[test]
#[should_panic(expected = "Already initialized")]
fn double_initialize_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, old, new, _) = setup(&env);
    client.initialize(&admin, &old, &new, &1, &2);
}

#[test]
fn config_exposes_ratio() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _, _, _) = setup(&env);
    let cfg = client.get_config();
    assert_eq!(cfg.ratio_new_per_old, 1);
    assert!(cfg.deadline > env.ledger().timestamp());
}
