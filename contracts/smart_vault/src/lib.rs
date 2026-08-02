//! # Smart Vault Contract
//!
//! A yield-bearing vault that accepts user deposits, tracks share ownership,
//! simulates staking rewards, and supports harvest + compound operations.
//!
//! ## Security
//! - Reentrancy: Soroban's execution model is single-threaded; no cross-contract
//!   calls are made during state-mutating operations, preventing reentrancy.
//! - Integer overflow: All arithmetic uses checked operations via Rust's
//!   overflow-panicking debug mode and explicit checked_* calls.
//! - Front-running protection on harvest: a per-user `last_harvest` ledger
//!   timestamp enforces a minimum cooldown between harvests.
//! - Oracle manipulation: rewards are calculated from on-chain ledger sequence
//!   numbers only, with no external price feeds.

#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol};

// ── Storage keys ────────────────────────────────────────────────────────────
const TOTAL_SHARES: Symbol = symbol_short!("TSHARES");
const TOTAL_ASSETS: Symbol = symbol_short!("TASSETS");
const HARVEST_COOL: u32 = 10; // minimum ledgers between harvests (front-run guard)

// ── Data types ───────────────────────────────────────────────────────────────

/// Per-user vault position.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Position {
    /// Shares owned by this user (scaled by SHARE_SCALE).
    pub shares: i128,
    /// Ledger sequence of the user's last harvest (front-run guard).
    pub last_harvest: u32,
}

// ── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct SmartVault;

#[contractimpl]
impl SmartVault {
    // ── Deposit ──────────────────────────────────────────────────────────────

    /// Deposit `amount` tokens into the vault and receive proportional shares.
    ///
    /// # Panics
    /// - If `amount` is not positive.
    pub fn deposit(env: Env, user: Address, amount: i128) {
        user.require_auth();
        assert!(amount > 0, "amount must be positive");

        let total_assets: i128 = env.storage().instance().get(&TOTAL_ASSETS).unwrap_or(0i128);
        let total_shares: i128 = env.storage().instance().get(&TOTAL_SHARES).unwrap_or(0i128);

        // shares_to_mint = amount * total_shares / total_assets  (or 1:1 on first deposit)
        let new_shares: i128 = if total_shares == 0 || total_assets == 0 {
            amount
        } else {
            amount
                .checked_mul(total_shares)
                .expect("overflow")
                .checked_div(total_assets)
                .expect("div zero")
        };

        let mut pos = Self::get_position(&env, &user);
        pos.shares = pos.shares.checked_add(new_shares).expect("overflow");
        Self::set_position(&env, &user, &pos);

        env.storage().instance().set(
            &TOTAL_SHARES,
            &(total_shares.checked_add(new_shares).expect("overflow")),
        );
        env.storage().instance().set(
            &TOTAL_ASSETS,
            &(total_assets.checked_add(amount).expect("overflow")),
        );

        env.events()
            .publish((symbol_short!("deposit"), user), (amount, new_shares));
    }

    // ── Withdraw ─────────────────────────────────────────────────────────────

    /// Burn `shares` and return the proportional asset amount to `user`.
    ///
    /// Returns the asset amount redeemed.
    ///
    /// # Panics
    /// - If `shares` is not positive or exceeds the user's balance.
    pub fn withdraw(env: Env, user: Address, shares: i128) -> i128 {
        user.require_auth();
        assert!(shares > 0, "shares must be positive");

        let mut pos = Self::get_position(&env, &user);
        assert!(pos.shares >= shares, "insufficient shares");

        let total_assets: i128 = env.storage().instance().get(&TOTAL_ASSETS).unwrap_or(0i128);
        let total_shares: i128 = env.storage().instance().get(&TOTAL_SHARES).unwrap_or(0i128);

        // assets_out = shares * total_assets / total_shares
        let assets_out = shares
            .checked_mul(total_assets)
            .expect("overflow")
            .checked_div(total_shares)
            .expect("div zero");

        pos.shares = pos.shares.checked_sub(shares).expect("underflow");
        Self::set_position(&env, &user, &pos);

        env.storage().instance().set(
            &TOTAL_SHARES,
            &(total_shares.checked_sub(shares).expect("underflow")),
        );
        env.storage().instance().set(
            &TOTAL_ASSETS,
            &(total_assets.checked_sub(assets_out).expect("underflow")),
        );

        env.events()
            .publish((symbol_short!("withdraw"), user), (shares, assets_out));

        assets_out
    }

    // ── Stake (simulate external protocol) ───────────────────────────────────

    /// Mark vault assets as "staked". In a real deployment this would invoke
    /// an external protocol; here it records the staking ledger for reward
    /// accrual simulation.
    pub fn stake(env: Env, admin: Address) {
        admin.require_auth();
        let ledger = env.ledger().sequence();
        env.storage()
            .instance()
            .set(&symbol_short!("staked_at"), &ledger);
        env.events().publish((symbol_short!("staked"),), ledger);
    }

    // ── Harvest ──────────────────────────────────────────────────────────────

    /// Harvest accrued rewards for `user` and credit them to the vault's
    /// total assets (increasing share value for all holders).
    ///
    /// Enforces a `HARVEST_COOL` ledger cooldown to mitigate front-running.
    ///
    /// Returns the reward amount harvested.
    pub fn harvest(env: Env, user: Address) -> i128 {
        user.require_auth();

        let current_ledger = env.ledger().sequence();
        let mut pos = Self::get_position(&env, &user);

        // Front-run / sandwich protection: enforce minimum cooldown.
        assert!(
            current_ledger >= pos.last_harvest + HARVEST_COOL,
            "harvest cooldown active"
        );

        let staked_at: u32 = env
            .storage()
            .instance()
            .get(&symbol_short!("staked_at"))
            .unwrap_or(current_ledger);

        let total_assets: i128 = env.storage().instance().get(&TOTAL_ASSETS).unwrap_or(0i128);
        let total_shares: i128 = env.storage().instance().get(&TOTAL_SHARES).unwrap_or(0i128);

        if total_shares == 0 {
            return 0;
        }

        // Simulated reward: 1 basis-point (0.01%) per ledger elapsed, pro-rated
        // by the user's share of the vault.
        let ledgers_elapsed = (current_ledger.saturating_sub(staked_at)) as i128;
        let user_assets = pos
            .shares
            .checked_mul(total_assets)
            .expect("overflow")
            .checked_div(total_shares)
            .expect("div zero");
        // reward = user_assets * ledgers_elapsed / 10_000
        let reward = user_assets
            .checked_mul(ledgers_elapsed)
            .expect("overflow")
            .checked_div(10_000)
            .unwrap_or(0);

        if reward == 0 {
            return 0;
        }

        // Credit reward to total assets (raises share price for everyone).
        env.storage().instance().set(
            &TOTAL_ASSETS,
            &(total_assets.checked_add(reward).expect("overflow")),
        );

        pos.last_harvest = current_ledger;
        Self::set_position(&env, &user, &pos);

        env.events()
            .publish((symbol_short!("harvest"), user.clone()), reward);

        reward
    }

    // ── Compound ─────────────────────────────────────────────────────────────

    /// Harvest rewards and immediately re-deposit them as new shares,
    /// maximising APY through auto-compounding.
    ///
    /// Returns the number of new shares minted.
    pub fn compound(env: Env, user: Address) -> i128 {
        // harvest first (includes cooldown check)
        let reward = Self::harvest(env.clone(), user.clone());
        if reward == 0 {
            return 0;
        }

        // Re-deposit the reward (no auth needed; user already authed in harvest)
        let total_assets: i128 = env.storage().instance().get(&TOTAL_ASSETS).unwrap_or(0i128);
        let total_shares: i128 = env.storage().instance().get(&TOTAL_SHARES).unwrap_or(0i128);

        let new_shares = if total_shares == 0 || total_assets == 0 {
            reward
        } else {
            reward
                .checked_mul(total_shares)
                .expect("overflow")
                .checked_div(total_assets)
                .expect("div zero")
        };

        let mut pos = Self::get_position(&env, &user);
        pos.shares = pos.shares.checked_add(new_shares).expect("overflow");
        Self::set_position(&env, &user, &pos);

        env.storage().instance().set(
            &TOTAL_SHARES,
            &(total_shares.checked_add(new_shares).expect("overflow")),
        );
        // total_assets already includes the reward from harvest

        env.events()
            .publish((symbol_short!("compound"), user), new_shares);

        new_shares
    }

    // ── View helpers ─────────────────────────────────────────────────────────

    /// Returns the user's current share balance.
    pub fn shares_of(env: Env, user: Address) -> i128 {
        Self::get_position(&env, &user).shares
    }

    /// Returns the asset value of `shares` at the current exchange rate.
    pub fn assets_of(env: Env, user: Address) -> i128 {
        let pos = Self::get_position(&env, &user);
        let total_assets: i128 = env.storage().instance().get(&TOTAL_ASSETS).unwrap_or(0i128);
        let total_shares: i128 = env.storage().instance().get(&TOTAL_SHARES).unwrap_or(0i128);
        if total_shares == 0 {
            return 0;
        }
        pos.shares
            .checked_mul(total_assets)
            .expect("overflow")
            .checked_div(total_shares)
            .expect("div zero")
    }

    // ── Internal helpers ─────────────────────────────────────────────────────

    fn get_position(env: &Env, user: &Address) -> Position {
        env.storage().persistent().get(user).unwrap_or(Position {
            shares: 0,
            last_harvest: 0,
        })
    }

    fn set_position(env: &Env, user: &Address, pos: &Position) {
        env.storage().persistent().set(user, pos);
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger};
    use soroban_sdk::Env;

    fn setup() -> (Env, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(SmartVault, ());
        let user = Address::generate(&env);
        (env, contract_id, user)
    }

    #[test]
    fn test_deposit_and_shares() {
        let (env, contract_id, user) = setup();
        let client = SmartVaultClient::new(&env, &contract_id);

        client.deposit(&user, &1000);
        assert_eq!(client.shares_of(&user), 1000);
        assert_eq!(client.assets_of(&user), 1000);
    }

    #[test]
    fn test_second_deposit_proportional_shares() {
        let (env, contract_id, user) = setup();
        let client = SmartVaultClient::new(&env, &contract_id);
        let user2 = Address::generate(&env);

        client.deposit(&user, &1000);
        client.deposit(&user2, &500);

        // user2 should get 500 shares (1:1 ratio still, no rewards yet)
        assert_eq!(client.shares_of(&user2), 500);
    }

    #[test]
    fn test_withdraw_returns_assets() {
        let (env, contract_id, user) = setup();
        let client = SmartVaultClient::new(&env, &contract_id);

        client.deposit(&user, &1000);
        let returned = client.withdraw(&user, &500);
        assert_eq!(returned, 500);
        assert_eq!(client.shares_of(&user), 500);
    }

    #[test]
    #[should_panic(expected = "insufficient shares")]
    fn test_withdraw_too_many_shares_panics() {
        let (env, contract_id, user) = setup();
        let client = SmartVaultClient::new(&env, &contract_id);
        client.deposit(&user, &100);
        client.withdraw(&user, &200);
    }

    #[test]
    fn test_harvest_accrues_rewards() {
        let (env, contract_id, user) = setup();
        let client = SmartVaultClient::new(&env, &contract_id);

        client.deposit(&user, &1_000_000);
        client.stake(&user);

        // Advance ledger past cooldown + enough for non-zero reward
        env.ledger()
            .with_mut(|l| l.sequence_number += 100 + HARVEST_COOL);

        let reward = client.harvest(&user);
        assert!(reward > 0, "expected positive reward");
    }

    #[test]
    #[should_panic(expected = "harvest cooldown active")]
    fn test_harvest_cooldown_enforced() {
        let (env, contract_id, user) = setup();
        let client = SmartVaultClient::new(&env, &contract_id);

        client.deposit(&user, &1_000_000);
        client.stake(&user);
        env.ledger()
            .with_mut(|l| l.sequence_number += 100 + HARVEST_COOL);
        client.harvest(&user);

        // Immediate second harvest should fail cooldown
        client.harvest(&user);
    }

    #[test]
    fn test_compound_mints_new_shares() {
        let (env, contract_id, user) = setup();
        let client = SmartVaultClient::new(&env, &contract_id);

        client.deposit(&user, &1_000_000);
        client.stake(&user);
        env.ledger()
            .with_mut(|l| l.sequence_number += 100 + HARVEST_COOL);

        let shares_before = client.shares_of(&user);
        let new_shares = client.compound(&user);
        assert!(new_shares > 0);
        assert_eq!(client.shares_of(&user), shares_before + new_shares);
    }

    #[test]
    #[should_panic(expected = "amount must be positive")]
    fn test_deposit_zero_panics() {
        let (env, contract_id, user) = setup();
        let client = SmartVaultClient::new(&env, &contract_id);
        client.deposit(&user, &0);
    }

    #[test]
    fn test_share_price_increases_after_harvest() {
        let (env, contract_id, user) = setup();
        let client = SmartVaultClient::new(&env, &contract_id);
        let user2 = Address::generate(&env);

        client.deposit(&user, &1_000_000);
        client.stake(&user);
        env.ledger()
            .with_mut(|l| l.sequence_number += 100 + HARVEST_COOL);
        client.harvest(&user);

        // user2 deposits same amount but gets fewer shares (price went up)
        client.deposit(&user2, &1_000_000);
        assert!(client.shares_of(&user2) < 1_000_000);
    }
}
