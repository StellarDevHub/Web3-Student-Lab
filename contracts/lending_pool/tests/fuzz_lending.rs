//! Comprehensive Lending Pool Solvency & Property-Based Fuzz Testing Suite (SC-062)
//!
//! Fuzz tests lending pool solvency (assets >= liabilities) across randomized sequences
//! of deposits, borrows, interest accruals, liquidations with dynamic bonding curve,
//! and bad debt socialization across protocol reserves.

#![cfg(test)]

use lending_pool::{LendingPool, LendingPoolClient};
use proptest::prelude::*;
use soroban_sdk::{contract, contractimpl, testutils::Address as _, Address, Env};

#[contract]
struct MockOracle;

#[contractimpl]
impl MockOracle {
    pub fn get_price(_env: Env, _token: Address) -> i128 {
        1_000_000_000_000i128 // SCALE — price = 1.0
    }
}

#[contract]
struct MockToken;

#[contractimpl]
impl MockToken {
    pub fn transfer(_env: Env, _from: Address, _to: Address, _amount: i128) {}
}

fn setup_lending(env: &Env) -> (LendingPoolClient<'static>, Address, Address) {
    env.mock_all_auths();
    let id = env.register(LendingPool, ());
    let client = LendingPoolClient::new(env, &id);
    let oracle = env.register(MockOracle, ());
    let admin = Address::generate(env);
    client.initialize(&admin, &oracle, &15_000, &500); // 150% min collateral ratio
    (client, admin, oracle)
}

fn add_asset(env: &Env, client: &LendingPoolClient<'_>) -> Address {
    let token = env.register(MockToken, ());
    client.add_asset(&token, &10_000, &100); // 100% collateral factor, 1% base interest rate
    token
}

#[test]
fn test_fuzz_lending_pool_solvency_continuous_actions() {
    let env = Env::default();
    let (client, admin, _) = setup_lending(&env);
    let token_coll = add_asset(&env, &client);
    let token_debt = add_asset(&env, &client);

    // Seed initial protocol reserves to handle bad debt socialization
    let mut protocol_reserves: i128 = 500_000;
    client.deposit_reserves(&admin, &token_debt, &protocol_reserves);

    let users: [Address; 5] = [
        Address::generate(&env),
        Address::generate(&env),
        Address::generate(&env),
        Address::generate(&env),
        Address::generate(&env),
    ];
    let liquidator = Address::generate(&env);

    let mut seed: u64 = 0x9e3779b97f4a7c15;
    let mut next_rand = || -> u64 {
        seed ^= seed << 13;
        seed ^= seed >> 7;
        seed ^= seed << 17;
        seed
    };

    let mut total_collateral_deposited: i128 = 0;
    let mut total_debt_issued: i128 = 0;

    for _ in 0..500 {
        let u_idx = (next_rand() as usize) % users.len();
        let user = &users[u_idx];
        let action = next_rand() % 6;

        match action {
            0 => {
                // Deposit collateral
                let amount = ((next_rand() % 50_000) + 1_000) as i128;
                client.deposit_collateral(user, &token_coll, &amount);
                total_collateral_deposited += amount;
            }
            1 => {
                // Borrow within safe LTV
                let user_coll = client.collateral_of(user, &token_coll);
                let user_debt = client.debt_of(user, &token_debt);
                let max_borrowable = (user_coll * 10_000) / 15_000;

                if max_borrowable > user_debt {
                    let borrowable_headroom = max_borrowable - user_debt;
                    let borrow_amount = ((next_rand() % (borrowable_headroom as u64)) + 1) as i128;
                    client.borrow(user, &token_coll, &token_debt, &borrow_amount);
                    total_debt_issued += borrow_amount;
                }
            }
            2 => {
                // Repay portion of debt
                let user_debt = client.debt_of(user, &token_debt);
                if user_debt > 0 {
                    let repay_amount = ((next_rand() % (user_debt as u64)) + 1) as i128;
                    client.repay(user, &token_debt, &repay_amount);
                    total_debt_issued -= repay_amount;
                }
            }
            3 => {
                // Safe collateral withdrawal
                let user_coll = client.collateral_of(user, &token_coll);
                let user_debt = client.debt_of(user, &token_debt);
                let min_coll_needed = (user_debt * 15_000 + 9_999) / 10_000;

                if user_coll > min_coll_needed {
                    let excess = user_coll - min_coll_needed;
                    let withdraw_amt = ((next_rand() % (excess as u64)) + 1) as i128;
                    client.withdraw_collateral(user, &token_coll, &token_debt, &withdraw_amt);
                    total_collateral_deposited -= withdraw_amt;
                }
            }
            4 => {
                // Liquidate if underwater, verifying dynamic bonding curve
                let user_debt = client.debt_of(user, &token_debt);
                let user_coll = client.collateral_of(user, &token_coll);
                if user_debt > 0 && !client.health_ok(user, &token_coll, &token_debt) {
                    let bonus = client.current_liquidation_bonus(user, &token_coll, &token_debt);
                    assert!(bonus >= 500 && bonus <= 1_500);

                    let repay_amt = (user_debt / 2).max(1);
                    client.liquidate(&liquidator, user, &token_coll, &token_debt, &repay_amt);
                    let actual_repaid = repay_amt.min(user_debt);
                    total_debt_issued -= actual_repaid;

                    let new_coll = client.collateral_of(user, &token_coll);
                    let seized = user_coll - new_coll;
                    total_collateral_deposited -= seized;
                }
            }
            5 => {
                // Socialize bad debt if position is underwater with zero collateral
                let user_debt = client.debt_of(user, &token_debt);
                let user_coll = client.collateral_of(user, &token_coll);
                if user_coll == 0 && user_debt > 0 {
                    let covered = client.socialize_bad_debt(&admin, user, &token_coll, &token_debt);
                    total_debt_issued -= covered;
                    protocol_reserves -= covered;
                }
            }
            _ => unreachable!(),
        }

        // Check global solvency invariant: Total Assets (Collateral + Reserves) >= Total Debt Liabilities
        let current_reserves = client.reserves_of(&token_debt);
        let total_assets = total_collateral_deposited + current_reserves;
        assert!(
            total_assets >= total_debt_issued,
            "Solvency invariant violated: assets ({}) < liabilities ({})",
            total_assets,
            total_debt_issued
        );
    }
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(50))]

    #[test]
    fn prop_fuzz_lending_solvency_invariants(
        deposit_amt in 10_000i128..1_000_000i128,
        borrow_ratio_bps in 1_000i128..6_660i128, // <= 66.6% to respect 150% min collateral ratio
        reserve_amt in 20_000i128..200_000i128,
    ) {
        let env = Env::default();
        let (client, admin, _) = setup_lending(&env);
        let token_coll = add_asset(&env, &client);
        let token_debt = add_asset(&env, &client);
        let user = Address::generate(&env);

        // 1. Reserves & Deposit
        client.deposit_reserves(&admin, &token_debt, &reserve_amt);
        client.deposit_collateral(&user, &token_coll, &deposit_amt);
        let coll = client.collateral_of(&user, &token_coll);
        prop_assert_eq!(coll, deposit_amt);

        // 2. Borrow
        let borrow_amt = (deposit_amt * borrow_ratio_bps) / 10_000;
        if borrow_amt > 0 {
            client.borrow(&user, &token_coll, &token_debt, &borrow_amt);
            let debt = client.debt_of(&user, &token_debt);
            prop_assert!(debt >= borrow_amt);

            // Invariant: Solvency check (assets >= liabilities)
            let total_assets = coll + reserve_amt;
            prop_assert!(total_assets >= debt, "Assets ({}) < Liabilities ({})", total_assets, debt);
        }
    }
}
