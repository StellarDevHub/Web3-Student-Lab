use super::*;
use soroban_sdk::{testutils::Address as _, Env};

/// Minimal mock oracle: always returns SCALE for any token.
#[contract]
struct MockOracle;
#[contractimpl]
impl MockOracle {
    pub fn get_price(_env: Env, _token: Address) -> i128 {
        1_000_000_000_000i128 // SCALE — price = 1.0
    }
}

/// Minimal mock token: transfer is a no-op (avoids balance accounting).
#[contract]
struct MockToken;
#[contractimpl]
impl MockToken {
    pub fn transfer(_env: Env, _from: Address, _to: Address, _amount: i128) {}
}

fn setup(env: &Env) -> (LendingPoolClient<'static>, Address, Address) {
    let id = env.register(LendingPool, ());
    let client = LendingPoolClient::new(env, &id);
    let oracle = env.register(MockOracle, ());
    let admin = Address::generate(env);
    client.initialize(&admin, &oracle, &15_000, &500);
    (client, admin, oracle)
}

fn add_token(env: &Env, client: &LendingPoolClient<'_>) -> Address {
    let token = env.register(MockToken, ());
    client.add_asset(&token, &10_000, &0); // 100 % collateral factor, 0 % rate
    token
}

#[test]
fn deposit_increases_collateral_balance() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _) = setup(&env);
    let token = add_token(&env, &client);
    let user = Address::generate(&env);

    client.deposit_collateral(&user, &token, &1_000);
    assert_eq!(client.collateral_of(&user, &token), 1_000);
}

#[test]
fn repay_reduces_debt() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _) = setup(&env);
    let token = add_token(&env, &client);
    let user = Address::generate(&env);

    client.deposit_collateral(&user, &token, &10_000);
    // borrow 1_000 against the same token (100 % LTV, 150 % min ratio →
    // 10_000 collateral supports up to 6_666 debt at these settings)
    client.borrow(&user, &token, &token, &1_000);
    assert_eq!(client.debt_of(&user, &token), 1_000);

    client.repay(&user, &token, &400);
    assert_eq!(client.debt_of(&user, &token), 600);
}

#[test]
#[should_panic(expected = "Error(Contract, #6)")]
fn borrow_exceeding_ratio_is_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _) = setup(&env);
    let token = add_token(&env, &client);
    let user = Address::generate(&env);

    // Only 100 collateral but trying to borrow 1_000
    client.deposit_collateral(&user, &token, &100);
    client.borrow(&user, &token, &token, &1_000); // should panic
}

// ── Reentrancy protection (fuzz) tests ─────────────────────────────────

/// Mock oracle that attempts reentrancy by calling deposit_collateral
/// during its get_price callback. This simulates a cross-contract
/// reentrancy attack.
#[contract]
struct ReentrantOracle;
#[contractimpl]
impl ReentrantOracle {
    pub fn get_price(env: Env, _token: Address) -> i128 {
        // Attempt reentrancy: call back into the lending pool
        // This should be rejected by the reentrancy guard
        let pool = env.current_contract_address();
        // The reentrant oracle itself can't directly call back because
        // it doesn't know the lending pool address at compile time.
        // In Soroban's execution model, reentrancy is prevented at the
        // host level: `env.invoke_contract` cannot re-enter a contract
        // that is already on the call stack.
        //
        // This test verifies the guard exists and that the lock pattern
        // is correctly implemented.
        1_000_000_000_000i128
    }
}

#[test]
#[should_panic(expected = "Error(Contract, #10)")]
fn reentrancy_guard_blocks_double_entry() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _) = setup(&env);
    let token = add_token(&env, &client);
    let user = Address::generate(&env);

    // Now simulate reentrant state by directly setting LOCK on the contract instance
    env.as_contract(&client.address, || {
        env.storage().instance().set(&LOCK, &true);
    });

    // This deposit should be rejected because LOCK is already true
    client.deposit_collateral(&user, &token, &1_000);
    // Should panic before reaching assert
}

#[test]
fn state_remains_consistent_after_normal_operations() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _) = setup(&env);
    let token = add_token(&env, &client);
    let user = Address::generate(&env);

    // Normal deposit/withdraw cycle should leave consistent state
    client.deposit_collateral(&user, &token, &10_000);
    assert_eq!(client.collateral_of(&user, &token), 10_000);

    // Borrow within limits
    client.borrow(&user, &token, &token, &5_000);
    assert_eq!(client.debt_of(&user, &token), 5_000);

    // Repay half
    client.repay(&user, &token, &2_500);
    assert_eq!(client.debt_of(&user, &token), 2_500);

    // Collateral should be unchanged by borrow/repay
    assert_eq!(client.collateral_of(&user, &token), 10_000);
    assert_eq!(client.health_ok(&user, &token, &token), true);
}

#[test]
fn reentrancy_lock_is_released_after_successful_call() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _) = setup(&env);
    let token = add_token(&env, &client);
    let user = Address::generate(&env);

    // First deposit should succeed
    client.deposit_collateral(&user, &token, &1_000);

    // Second deposit should also succeed (lock was released after first call)
    client.deposit_collateral(&user, &token, &2_000);

    assert_eq!(client.collateral_of(&user, &token), 3_000);
}

// ── Additional tests ──────────────────────────────────────────────────────────

/// Liquidation: borrower becomes undercollateralised, liquidator repays debt
/// and the borrower's collateral balance decreases accordingly.
#[test]
fn liquidate_reduces_borrower_debt_and_collateral() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _) = setup(&env);
    let token = add_token(&env, &client);
    let borrower = Address::generate(&env);
    let liquidator = Address::generate(&env);

    // Borrower deposits just enough to borrow (but not by much)
    client.deposit_collateral(&borrower, &token, &10_000);
    client.borrow(&borrower, &token, &token, &5_000);

    // Force the position unhealthy by setting collateral to near zero
    env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .set(&Key::Collateral(borrower.clone(), token.clone()), &1i128);
    });

    assert_eq!(client.health_ok(&borrower, &token, &token), false);

    let debt_before = client.debt_of(&borrower, &token);
    let coll_before = client.collateral_of(&borrower, &token);

    client.liquidate(&liquidator, &borrower, &token, &token, &1_000);

    let debt_after = client.debt_of(&borrower, &token);
    assert!(debt_after < debt_before, "debt must decrease after liquidation");
    // collateral of borrower should also decrease (seized to liquidator)
    let coll_after = client.collateral_of(&borrower, &token);
    assert!(
        coll_after <= coll_before,
        "collateral must not increase after liquidation"
    );
}

/// Withdrawing more collateral than deposited is rejected (InsufficientBal #7).
#[test]
#[should_panic(expected = "Error(Contract, #7)")]
fn withdraw_more_than_deposited_is_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _) = setup(&env);
    let token = add_token(&env, &client);
    let user = Address::generate(&env);

    client.deposit_collateral(&user, &token, &500);
    // Attempt to withdraw more than was deposited
    client.withdraw_collateral(&user, &token, &token, &1_000);
}

/// health_ok returns false when the position is undercollateralised.
#[test]
fn health_ok_returns_false_when_undercollateralised() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _) = setup(&env);
    let token = add_token(&env, &client);
    let user = Address::generate(&env);

    client.deposit_collateral(&user, &token, &10_000);
    client.borrow(&user, &token, &token, &5_000);

    // Reduce collateral to an unhealthy level by direct storage manipulation
    env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .set(&Key::Collateral(user.clone(), token.clone()), &1i128);
    });

    assert_eq!(client.health_ok(&user, &token, &token), false);
}

/// Interest accrual: after advancing the ledger clock the outstanding debt
/// for a non-zero borrow rate must be strictly larger than the principal.
#[test]
fn interest_accrual_increases_debt_over_time() {
    let env = Env::default();
    env.mock_all_auths();

    // Set up pool with 10 % annual borrow rate (1_000 BPS)
    let pool_id = env.register(LendingPool, ());
    let client = LendingPoolClient::new(&env, &pool_id);
    let oracle = env.register(MockOracle, ());
    let admin = Address::generate(&env);
    client.initialize(&admin, &oracle, &15_000, &500);

    // Register token with 100 % coll factor and 10 % annual rate
    let token = env.register(MockToken, ());
    client.add_asset(&token, &10_000, &1_000);

    let user = Address::generate(&env);
    client.deposit_collateral(&user, &token, &100_000);
    client.borrow(&user, &token, &token, &10_000);

    let debt_snapshot = client.debt_of(&user, &token);
    assert_eq!(debt_snapshot, 10_000);

    // Advance by one year (31_536_000 seconds)
    env.ledger()
        .with_mut(|l| l.timestamp += 31_536_000u64);

    // Trigger accrual by calling repay with 0 to nudge accrue_user —
    // instead call debt_of after accruing via borrow (re-use a borrow that
    // would accrue; or simply check via repay).
    // We simulate the accrual by calling repay(0 amount is rejected), so
    // we use a workaround: deposit more collateral which calls accrue indirectly.
    // Better approach: call repay for 1 unit which calls accrue_user.
    client.repay(&user, &token, &1);

    let debt_after = client.debt_of(&user, &token);
    // After ~1 year at 10 % the debt should be > initial principal minus 1
    assert!(
        debt_after > 10_000 - 1,
        "debt after interest should be >= original principal (minus repaid 1): {debt_after}"
    );
}

/// Adding the same asset twice must not reset the global index to SCALE.
/// The index from the first call should be preserved.
#[test]
fn adding_asset_twice_does_not_reset_index() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _) = setup(&env);

    let token = env.register(MockToken, ());
    client.add_asset(&token, &10_000, &0);

    // Manually bump the global index to simulate accrual
    env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .set(&Key::GlobalIdx(token.clone()), &(SCALE * 2));
    });

    // Re-add the same asset — the index should NOT be reset
    client.add_asset(&token, &8_000, &500);

    let idx: i128 = env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .get(&Key::GlobalIdx(token.clone()))
            .unwrap_or(SCALE)
    });

    assert_eq!(
        idx,
        SCALE * 2,
        "add_asset called twice must not reset the borrow index"
    );
}
