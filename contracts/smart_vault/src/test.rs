//! SC-075 tests: automated harvest & compound with conservation invariant.

use super::*;
use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{contract, contractimpl, symbol_short, Env};

/// Minimal AMM used by the strategy: a 1% fee pool that respects the caller's
/// minimum-output bound and records the last swap for assertions.
#[contract]
struct MockRewardAmm;

#[contractimpl]
impl MockRewardAmm {
    pub fn swap_rewards(env: Env, _caller: Address, amount_in: i128, min_amount_out: i128) -> i128 {
        if amount_in <= 0 {
            panic_with_error!(&env, VaultError::ZeroAmount);
        }
        let amount_out = amount_in * 99 / 100;
        if amount_out < min_amount_out {
            panic_with_error!(&env, VaultError::SlippageExceeded);
        }
        env.storage()
            .instance()
            .set(&symbol_short!("lastswap"), &(amount_in, amount_out));
        amount_out
    }

    pub fn last_swap(env: Env) -> (i128, i128) {
        env.storage()
            .instance()
            .get(&symbol_short!("lastswap"))
            .unwrap_or((0, 0))
    }
}

fn setup(slippage_bps: u32) -> (Env, Address, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let vault = env.register(SmartVault, ());
    let amm = env.register(MockRewardAmm, ());
    let user = Address::generate(&env);
    let admin = Address::generate(&env);
    let client = SmartVaultClient::new(&env, &vault);
    client.configure_harvest_strategy(&admin, &Some(amm.clone()), &slippage_bps);
    (env, vault, amm, user, admin)
}

fn accrue(env: &Env) {
    env.ledger()
        .with_mut(|ledger| ledger.sequence_number += 100 + HARVEST_COOL);
}

fn total_assets(env: &Env, vault: &Address) -> i128 {
    env.as_contract(vault, || {
        env.storage().instance().get(&TOTAL_ASSETS).unwrap()
    })
}

fn reserves(env: &Env, vault: &Address) -> i128 {
    env.as_contract(vault, || env.storage().instance().get(&RESERVES).unwrap())
}

#[test]
fn compound_swaps_rewards_and_deposits_atomically() {
    let (env, vault, amm, user, _) = setup(200);
    let client = SmartVaultClient::new(&env, &vault);
    let amm_client = MockRewardAmmClient::new(&env, &amm);

    client.deposit(&user, &1_000_000);
    client.stake(&user);
    accrue(&env);

    let shares_before = client.shares_of(&user);
    let new_shares = client.compound(&user);

    // 110 ledgers of yield on 1_000_000 assets = 11_000 reward tokens;
    // the mock AMM converts them at 1% fee into 10_890 deposit tokens.
    assert_eq!(amm_client.last_swap(), (11_000, 10_890));
    assert_eq!(new_shares, 10_890);
    assert_eq!(client.shares_of(&user), shares_before + new_shares);
    assert_eq!(total_assets(&env, &vault), 1_010_890);
    assert_eq!(reserves(&env, &vault), 1_010_890);
    assert_eq!(client.total_principal(), 1_000_000);
    assert!(total_assets(&env, &vault) >= client.total_principal());
    assert!(total_assets(&env, &vault) >= client.shares_of(&user));
}

#[test]
#[should_panic(expected = "Error(Contract, #133)")]
fn compound_rejects_swap_worse_than_slippage_bound() {
    let (env, vault, _, user, _) = setup(50);
    let client = SmartVaultClient::new(&env, &vault);
    client.deposit(&user, &1_000_000);
    client.stake(&user);
    accrue(&env);
    client.compound(&user);
}

#[test]
#[should_panic(expected = "Error(Contract, #132)")]
fn zero_slippage_tolerance_is_rejected() {
    setup(0);
}

#[test]
#[should_panic(expected = "Error(Contract, #134)")]
fn strategy_configuration_is_admin_only() {
    let (env, vault, _, _, admin) = setup(200);
    let client = SmartVaultClient::new(&env, &vault);
    let intruder = Address::generate(&env);
    assert_ne!(intruder, admin);
    client.configure_harvest_strategy(&intruder, &None::<Address>, &200);
}

#[test]
#[should_panic(expected = "Error(Contract, #100)")]
fn harvest_is_protected_by_reentrancy_lock() {
    let (env, vault, _, user, _) = setup(200);
    let client = SmartVaultClient::new(&env, &vault);
    client.deposit(&user, &1_000_000);
    client.stake(&user);
    accrue(&env);
    env.as_contract(&vault, || reentrancy_guard::lock(&env));
    client.harvest(&user);
}

#[test]
fn compound_is_protected_by_reentrancy_lock() {
    let (env, vault, _, user, _) = setup(200);
    let client = SmartVaultClient::new(&env, &vault);
    client.deposit(&user, &1_000_000);
    client.stake(&user);
    accrue(&env);
    env.as_contract(&vault, || reentrancy_guard::lock(&env));
    assert!(client.try_compound(&user).is_err());
}

#[test]
#[should_panic(expected = "Error(Contract, #122)")]
fn conservation_invariant_rejects_assets_below_principal() {
    let (env, vault, _, user, _) = setup(200);
    let client = SmartVaultClient::new(&env, &vault);
    client.deposit(&user, &1_000);

    env.as_contract(&vault, || {
        env.storage()
            .instance()
            .set(&strategy::TOTAL_PRINCIPAL, &1_001i128);
    });
    client.deposit(&user, &10);
}

#[test]
fn principal_tracks_net_deposits_and_withdrawals() {
    let (env, vault, _, user, _) = setup(200);
    let client = SmartVaultClient::new(&env, &vault);
    client.deposit(&user, &1_000);
    client.deposit(&user, &500);
    assert_eq!(client.total_principal(), 1_500);

    assert_eq!(client.withdraw(&user, &100), 100);
    assert_eq!(client.total_principal(), 1_400);
    assert_eq!(total_assets(&env, &vault), 1_400);
}

#[test]
fn harvest_without_compound_still_credits_assets() {
    let (env, vault, _, user, _) = setup(200);
    let client = SmartVaultClient::new(&env, &vault);
    client.deposit(&user, &1_000_000);
    client.stake(&user);
    accrue(&env);

    let reward = client.harvest(&user);
    assert!(reward > 0);
    assert_eq!(total_assets(&env, &vault), 1_000_000 + reward);
    assert_eq!(client.total_principal(), 1_000_000);
}
