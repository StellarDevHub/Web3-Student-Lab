//! Comprehensive Lending Pool Solvency & Property-Based Fuzz Testing Suite (SC-062)
//!
//! Fuzz tests lending pool solvency (assets >= liabilities) across randomized sequences
//! of deposits, borrows, dynamic liquidations with bonding curve incentives,
//! and bad debt socialization across protocol reserves.

use crate::{LendingPool, LendingPoolClient};
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
    client.initialize(&admin, &oracle, &15_000, &500); // 150% min collateral ratio, 500 BPS base bonus
    (client, admin, oracle)
}

fn add_asset(env: &Env, client: &LendingPoolClient<'_>) -> Address {
    let token = env.register(MockToken, ());
    client.add_asset(&token, &10_000, &100); // 100% collateral factor, 1% base interest rate
    token
}

#[test]
fn test_fuzz_lending_bonding_curve_and_bad_debt_socialization() {
    let env = Env::default();
    let (client, admin, _) = setup_lending(&env);
    let token_coll = add_asset(&env, &client);
    let token_debt = add_asset(&env, &client);

    // Initial protocol reserves
    let protocol_reserves: i128 = 1_000_000;
    client.deposit_reserves(&admin, &token_debt, &protocol_reserves);

    let users: [Address; 5] = [
        Address::generate(&env),
        Address::generate(&env),
        Address::generate(&env),
        Address::generate(&env),
        Address::generate(&env),
    ];
    let liquidator = Address::generate(&env);

    let mut seed: u64 = 0xabcdef0123456789;
    let mut next_rand = || -> u64 {
        seed ^= seed << 13;
        seed ^= seed >> 7;
        seed ^= seed << 17;
        seed
    };

    let mut total_collateral_deposited: i128 = 0;
    let mut total_debt_issued: i128 = 0;

    for _ in 0..300 {
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
                    let headroom = max_borrowable - user_debt;
                    let borrow_amount = ((next_rand() % (headroom as u64)) + 1) as i128;
                    client.borrow(user, &token_coll, &token_debt, &borrow_amount);
                    total_debt_issued += borrow_amount;
                }
            }
            2 => {
                // Repay debt
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
                // Liquidate if underwater, with dynamic bonding curve
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
                }
            }
            _ => unreachable!(),
        }

        // Global solvency invariant:
        // Total Assets (Collateral + Available Reserves) >= Total Liabilities (Debt)
        let available_reserves = client.reserves_of(&token_debt);
        let total_assets = total_collateral_deposited + available_reserves;
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
    fn prop_fuzz_bonding_curve_liquidation_and_solvency(
        deposit_amt in 10_000i128..1_000_000i128,
        borrow_ratio_bps in 1_000i128..6_660i128,
        reserve_amt in 50_000i128..500_000i128,
    ) {
        let env = Env::default();
        let (client, admin, _) = setup_lending(&env);
        let token_coll = add_asset(&env, &client);
        let token_debt = add_asset(&env, &client);
        let borrower = Address::generate(&env);
        let liquidator = Address::generate(&env);

        // 1. Fund reserves
        client.deposit_reserves(&admin, &token_debt, &reserve_amt);
        prop_assert_eq!(client.reserves_of(&token_debt), reserve_amt);

        // 2. Deposit collateral and borrow
        client.deposit_collateral(&borrower, &token_coll, &deposit_amt);
        let borrow_amt = (deposit_amt * borrow_ratio_bps) / 10_000;
        if borrow_amt > 0 {
            client.borrow(&borrower, &token_coll, &token_debt, &borrow_amt);
            let debt = client.debt_of(&borrower, &token_debt);

            // 3. Solvency invariant
            let assets = deposit_amt + reserve_amt;
            prop_assert!(assets >= debt, "Assets ({}) < Liabilities ({})", assets, debt);

            // 4. Force underwater condition: reduce collateral to near zero
            env.as_contract(&client.address, || {
                env.storage()
                    .persistent()
                    .set(&crate::Key::Collateral(borrower.clone(), token_coll.clone()), &0i128);
            });

            // 5. Verify dynamic bonus hits maximum (15% = 1,500 BPS) at zero collateral
            let bonus = client.current_liquidation_bonus(&borrower, &token_coll, &token_debt);
            prop_assert_eq!(bonus, 1_500);

            // 6. Socialize bad debt across protocol reserves
            let covered = client.socialize_bad_debt(&liquidator, &borrower, &token_coll, &token_debt);
            let remaining_debt = client.debt_of(&borrower, &token_debt);
            let remaining_reserves = client.reserves_of(&token_debt);

            // Borrower debt reduced by covered amount, deducted strictly from protocol reserves
            prop_assert_eq!(debt - covered, remaining_debt);
            prop_assert_eq!(reserve_amt - covered, remaining_reserves);
            prop_assert_eq!(covered, debt.min(reserve_amt));

            // Solvency post-condition: bad debt is eliminated up to available reserves
            if reserve_amt >= debt {
                prop_assert_eq!(remaining_debt, 0);
            } else {
                prop_assert_eq!(remaining_reserves, 0);
            }
        }
    }
}
