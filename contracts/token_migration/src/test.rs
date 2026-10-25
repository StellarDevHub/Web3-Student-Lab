use super::*;
use soroban_sdk::{
    contract, contractimpl,
    testutils::{Address as _, Ledger as _},
    token, Address, Env,
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
    pub fn burn_from(_env: Env, _spender: Address, _from: Address, _amount: i128) {}
    #[allow(dead_code)]
    pub fn burn(_env: Env, _from: Address, _amount: i128) {}
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
    #[allow(dead_code)]
    pub fn transfer(_env: Env, _from: Address, _to: Address, _amount: i128) {}
}

fn setup(
    env: &Env,
) -> (
    TokenMigrationContractClient<'static>,
    Address,
    Address,
    Address,
    Address,
) {
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
#[should_panic(expected = "Error(Contract, #482)")]
fn migrate_zero_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, user, _, _) = setup(&env);
    client.migrate(&user, &0);
}

#[test]
#[should_panic(expected = "Error(Contract, #480)")]
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

#[test]
fn migration_status_flag_tracks_lifecycle() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, user, _, _) = setup(&env);

    assert_eq!(client.migration_status(), MigrationStatus::NotStarted);
    client.migrate(&user, &100);
    assert_eq!(client.migration_status(), MigrationStatus::InProgress);
}

#[test]
fn storage_keys_are_iterable() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, user, _, _) = setup(&env);

    let user2 = Address::generate(&env);
    client.migrate(&user, &10);
    client.migrate(&user2, &20);

    assert_eq!(client.user_count(), 2);
    let page = client.list_users(&0, &10);
    assert_eq!(page.len(), 2);

    // Paginated cursor iteration should also work with a small page size.
    let first_page = client.list_users(&0, &1);
    assert_eq!(first_page.len(), 1);
}

#[test]
fn cursor_batch_migrates_storage_v1_to_v2_without_data_loss() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, user, _, _) = setup(&env);

    let user2 = Address::generate(&env);
    let user3 = Address::generate(&env);
    client.migrate(&user, &10);
    client.migrate(&user2, &20);
    client.migrate(&user3, &30);

    // New records start life in the legacy v1 schema.
    match client.get_user_record(&user).unwrap() {
        VersionedUserRecord::V1(r) => assert_eq!(r.amount, 10),
        VersionedUserRecord::V2(_) => panic!("expected v1 record before migration"),
    }

    // Migrate in small paginated batches to stay under per-tx CPU limits.
    let cursor1 = client.migrate_storage_batch(&admin, &2);
    assert_eq!(cursor1, 2);
    assert_eq!(client.migration_status(), MigrationStatus::InProgress);

    let cursor2 = client.migrate_storage_batch(&admin, &2);
    assert_eq!(cursor2, 3);
    assert_eq!(client.migration_status(), MigrationStatus::Completed);

    // All records now carry the v2 schema with no data loss.
    for (addr, amount) in [(user, 10i128), (user2, 20i128), (user3, 30i128)] {
        match client.get_user_record(&addr).unwrap() {
            VersionedUserRecord::V2(r) => {
                assert_eq!(r.amount, amount);
                assert!(r.migrated_at > 0 || env.ledger().timestamp() == 0);
            }
            VersionedUserRecord::V1(_) => panic!("record should have been migrated to v2"),
        }
    }
}

#[test]
#[should_panic(expected = "Error(Contract, #485)")]
fn cursor_batch_requires_admin() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, user, _, _) = setup(&env);
    client.migrate(&user, &10);
    client.migrate_storage_batch(&user, &10);
}

#[test]
fn test_token_migration_vesting_cliff_and_pro_rata() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _, _, _) = setup(&env);
    let beneficiary = Address::generate(&env);

    // 50,000 tokens, 100 ledgers cliff, 500 ledgers total duration
    let sched_id = client.create_vesting_schedule(&admin, &beneficiary, &50_000, &100, &500, &true);

    // Prior to cliff: 0 claimable
    env.ledger().with_mut(|li| li.sequence_number += 80);
    assert_eq!(client.get_claimable_vesting(&sched_id), 0);

    // At cliff: 20% (10,000 tokens) claimable
    env.ledger().with_mut(|li| li.sequence_number += 20);
    assert_eq!(client.get_claimable_vesting(&sched_id), 10_000);

    // Claim
    let claimed = client.claim_vesting(&beneficiary, &sched_id);
    assert_eq!(claimed, 10_000);

    // Midway: 60% total (30,000 tokens) - 10,000 claimed = 20,000 claimable
    env.ledger().with_mut(|li| li.sequence_number += 200);
    assert_eq!(client.get_claimable_vesting(&sched_id), 20_000);

    // Revocation returns remaining unvested tokens
    let (unvested, claimable) = client.revoke_vesting_schedule(&admin, &sched_id);
    assert_eq!(unvested, 20_000);
    assert_eq!(claimable, 20_000);
}

#[test]
fn fractional_ratio_requires_exact_whole_token_conversion_and_burns_legacy() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let old_token_admin = Address::generate(&env);
    let contract_id = env.register(TokenMigrationContract, ());
    let old_token_id = env
        .register_stellar_asset_contract_v2(old_token_admin.clone())
        .address();
    let new_token_id = env
        .register_stellar_asset_contract_v2(contract_id.clone())
        .address();
    let old_token = token::Client::new(&env, &old_token_id);
    let old_token_admin_client = token::StellarAssetClient::new(&env, &old_token_id);
    let new_token = token::Client::new(&env, &new_token_id);
    let client = TokenMigrationContractClient::new(&env, &contract_id);
    old_token_admin_client.mint(&user, &10);
    client.initialize_with_ratio(
        &admin,
        &old_token_id,
        &new_token_id,
        &3,
        &2,
        &(env.ledger().timestamp() + 1_000),
    );
    old_token.approve(&user, &contract_id, &10, &(env.ledger().sequence() + 100));

    assert!(client.try_migrate(&user, &1).is_err());
    assert_eq!(old_token.balance(&user), 10);
    assert_eq!(new_token.balance(&user), 0);

    client.migrate(&user, &2);
    assert_eq!(old_token.balance(&user), 8);
    assert_eq!(old_token.balance(&contract_id), 0);
    assert_eq!(new_token.balance(&user), 3);
    assert_eq!(client.ratio_denominator(), 2);
}

#[test]
fn vested_migration_holds_new_tokens_until_claim() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let old_token_admin = Address::generate(&env);
    let contract_id = env.register(TokenMigrationContract, ());
    let old_token_id = env
        .register_stellar_asset_contract_v2(old_token_admin.clone())
        .address();
    let new_token_id = env
        .register_stellar_asset_contract_v2(contract_id.clone())
        .address();
    let old_token = token::Client::new(&env, &old_token_id);
    let old_token_admin_client = token::StellarAssetClient::new(&env, &old_token_id);
    let new_token = token::Client::new(&env, &new_token_id);
    let client = TokenMigrationContractClient::new(&env, &contract_id);
    old_token_admin_client.mint(&user, &100);
    client.initialize(
        &admin,
        &old_token_id,
        &new_token_id,
        &2,
        &(env.ledger().timestamp() + 1_000),
    );
    old_token.approve(&user, &contract_id, &100, &(env.ledger().sequence() + 100));

    let schedule_id = client.migrate_vested(&user, &100, &0, &100);
    assert_eq!(old_token.balance(&user), 0);
    assert_eq!(new_token.balance(&user), 0);
    assert_eq!(new_token.balance(&contract_id), 200);

    env.ledger().with_mut(|ledger| ledger.sequence_number += 50);
    assert_eq!(client.claim_vesting(&user, &schedule_id), 100);
    assert_eq!(new_token.balance(&user), 100);
    assert_eq!(new_token.balance(&contract_id), 100);
}
