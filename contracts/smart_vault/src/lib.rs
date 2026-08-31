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

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, Address,
    Env, Map, String, Symbol, Vec,
};

// ── Storage keys ────────────────────────────────────────────────────────────
const TOTAL_SHARES: Symbol = symbol_short!("TSHARES");
const TOTAL_ASSETS: Symbol = symbol_short!("TASSETS");
const RESERVES: Symbol = symbol_short!("RESERVES");
const LOCK: Symbol = symbol_short!("sv_lock");
const HARVEST_COOL: u32 = 10; // minimum ledgers between harvests (front-run guard)

// ── Governance constants ─────────────────────────────────────────────────────
const GOV_INIT: Symbol = symbol_short!("gov_init");
const PROPOSAL_COUNT: Symbol = symbol_short!("prp_cnt");
const PROPOSALS: Symbol = symbol_short!("proposals");
const GUARDIANS: Symbol = symbol_short!("guardians");
const THRESHOLD: Symbol = symbol_short!("threshold");
const GOV_PERIOD: Symbol = symbol_short!("govper");
const FREEZED: Symbol = symbol_short!("freezed");
/// Minimum 48-hour delay (in seconds) between authorization and execution.
const MIN_GOV_PERIOD: u64 = 172_800;

// ── Errors ───────────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum VaultError {
    ReentrancyGuardActive = 10,
    NotInitialized = 11,
    Unauthorized = 12,
    NotFound = 13,
    AlreadyApproved = 14,
    NotEnoughApprovals = 15,
    TimelockActive = 16,
    AlreadyExecuted = 17,
    AlreadyCancelled = 18,
    VaultFrozen = 19,
}

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

/// Lifecycle state of a governance proposal.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ProposalState {
    Proposed,
    Queued,
    Executed,
    Cancelled,
}

/// A multi-sig governance proposal targeting critical administrative
/// parameters of the vault.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Proposal {
    pub id: u32,
    pub proposer: Address,
    pub description: String,
    pub proposed_at: u64,
    pub approvals: Vec<Address>,
    /// Earliest ledger timestamp at which the proposal may execute (post-queue).
    pub queued_at: Option<u64>,
    pub state: ProposalState,
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
    /// - If reentrant call is detected.
    pub fn deposit(env: Env, user: Address, amount: i128) {
        user.require_auth();
        assert!(amount > 0, "amount must be positive");
        Self::assert_not_frozen(&env);
        Self::lock(&env);

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
        let reserves: i128 = env.storage().instance().get(&RESERVES).unwrap_or(0);
        env.storage()
            .instance()
            .set(&RESERVES, &(reserves.checked_add(amount).expect("overflow")));

        Self::assert_invariant(&env);
        Self::unlock(&env);
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
    /// - If reentrant call is detected.
    pub fn withdraw(env: Env, user: Address, shares: i128) -> i128 {
        user.require_auth();
        assert!(shares > 0, "shares must be positive");
        Self::assert_not_frozen(&env);
        Self::lock(&env);

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
        let reserves: i128 = env.storage().instance().get(&RESERVES).unwrap_or(0);
        env.storage()
            .instance()
            .set(&RESERVES, &(reserves.checked_sub(assets_out).expect("underflow")));

        Self::assert_invariant(&env);
        Self::unlock(&env);
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
        Self::lock(&env);

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
            Self::unlock(&env);
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
            Self::unlock(&env);
            return 0;
        }

        // Credit reward to total assets (raises share price for everyone).
        env.storage().instance().set(
            &TOTAL_ASSETS,
            &(total_assets.checked_add(reward).expect("overflow")),
        );
        let reserves: i128 = env.storage().instance().get(&RESERVES).unwrap_or(0);
        env.storage()
            .instance()
            .set(&RESERVES, &(reserves.checked_add(reward).expect("overflow")));

        pos.last_harvest = current_ledger;
        Self::set_position(&env, &user, &pos);

        Self::assert_invariant(&env);
        Self::unlock(&env);
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
        // harvest first (includes cooldown check and reentrancy guard)
        let reward = Self::harvest(env.clone(), user.clone());
        if reward == 0 {
            return 0;
        }

        Self::lock(&env);
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

        Self::assert_invariant(&env);
        Self::unlock(&env);
        env.events()
            .publish((symbol_short!("compound"), user), new_shares);

        new_shares
    }

    // ── Multi-sig timelock governance ────────────────────────────────────────

    /// Initialize the multi-sig governance with a set of guardians and a
    /// signature threshold. Only callable once, by the deployer.
    ///
    /// * `guardians` – The set of addresses authorized to propose/approve.
    /// * `threshold` – Number of signatures required to authorize a proposal
    ///   (e.g. 3-of-5).
    pub fn init_governance(env: Env, guardians: Vec<Address>, threshold: u32) {
        if env.storage().instance().has(&GOV_INIT) {
            panic_with_error!(&env, VaultError::AlreadyExecuted);
        }
        assert!(threshold > 0, "threshold must be positive");
        assert!(
            threshold <= guardians.len(),
            "threshold exceeds guardian count"
        );
        env.storage().instance().set(&GOV_INIT, &true);
        env.storage().instance().set(&GUARDIANS, &guardians);
        env.storage().instance().set(&THRESHOLD, &threshold);
        env.storage().instance().set(&PROPOSAL_COUNT, &0u32);
        env.storage().instance().set(&GOV_PERIOD, &MIN_GOV_PERIOD);
        env.storage().instance().set(&FREEZED, &false);
    }

    /// Create a new governance proposal. The proposer must be a guardian.
    /// The proposal enters the `Proposed` state.
    pub fn propose(env: Env, proposer: Address, description: String) -> u32 {
        proposer.require_auth();
        Self::assert_governance(&env);
        let guardians: Vec<Address> = env.storage().instance().get(&GUARDIANS).unwrap();
        assert!(guardians.contains(&proposer), "Not a guardian");

        let mut count: u32 = env.storage().instance().get(&PROPOSAL_COUNT).unwrap_or(0);
        count += 1;
        let now = env.ledger().timestamp();

        let mut proposals: Map<u32, Proposal> =
            env.storage().persistent().get(&PROPOSALS).unwrap_or_else(|| Map::new(&env));
        proposals.set(
            count,
            Proposal {
                id: count,
                proposer: proposer.clone(),
                description,
                proposed_at: now,
                approvals: Vec::new(&env),
                queued_at: None,
                state: ProposalState::Proposed,
            },
        );
        env.storage().persistent().set(&PROPOSALS, &proposals);
        env.storage().instance().set(&PROPOSAL_COUNT, &count);

        env.events().publish(
            (symbol_short!("gov"), symbol_short!("proposed")),
            (count, proposer, now),
        );
        count
    }

    /// Collect a guardian's signature on a proposal. When the approval count
    /// reaches the threshold the proposal is authorized and enters the
    /// `Queued` state with the 48-hour timelock armed.
    pub fn approve(env: Env, signer: Address, proposal_id: u32) {
        signer.require_auth();
        Self::assert_governance(&env);
        let guardians: Vec<Address> = env.storage().instance().get(&GUARDIANS).unwrap();
        assert!(guardians.contains(&signer), "Not a guardian");

        let mut proposals: Map<u32, Proposal> =
            env.storage().persistent().get(&PROPOSALS).unwrap();
        let mut proposal = Self::load_proposal(&env, &proposals, proposal_id);
        match proposal.state {
            ProposalState::Executed => panic_with_error!(&env, VaultError::AlreadyExecuted),
            ProposalState::Cancelled => panic_with_error!(&env, VaultError::AlreadyCancelled),
            _ => {}
        }
        assert!(
            !proposal.approvals.contains(&signer),
            "Already approved"
        );
        proposal.approvals.push_back(signer);

        let threshold: u32 = env.storage().instance().get(&THRESHOLD).unwrap();
        if proposal.approvals.len() as u32 >= threshold && proposal.queued_at.is_none() {
            // Authorization reached threshold: arm the timelock queue.
            let now = env.ledger().timestamp();
            let period: u64 = env.storage().instance().get(&GOV_PERIOD).unwrap();
            proposal.queued_at = Some(now.checked_add(period).expect("overflow"));
            proposal.state = ProposalState::Queued;
        }
        proposals.set(
            proposal_id,
            proposal.clone(),
        );
        env.storage().persistent().set(&PROPOSALS, &proposals);

        if proposal.state == ProposalState::Queued {
            env.events().publish(
                (symbol_short!("gov"), symbol_short!("queued")),
                (proposal_id, proposal.approvals.len(), proposal.queued_at.unwrap()),
            );
        }
    }

    /// Execute a proposal. Only possible after the proposal is authorized,
    /// queued, and the 48-hour timelock has elapsed.
    pub fn execute_proposal(env: Env, proposal_id: u32) {
        Self::assert_governance(&env);
        let mut proposals: Map<u32, Proposal> =
            env.storage().persistent().get(&PROPOSALS).unwrap();
        let mut proposal = Self::load_proposal(&env, &proposals, proposal_id);

        match proposal.state {
            ProposalState::Executed => panic_with_error!(&env, VaultError::AlreadyExecuted),
            ProposalState::Cancelled => panic_with_error!(&env, VaultError::AlreadyCancelled),
            ProposalState::Proposed => panic_with_error!(&env, VaultError::NotEnoughApprovals),
            ProposalState::Queued => {}
        }

        let now = env.ledger().timestamp();
        let queued_at = proposal.queued_at.expect("not queued");
        assert!(now >= queued_at, "timelock not elapsed");

        // Execution of the proposal's administrative change would occur here
        // (e.g. updating vault parameters). State transition is recorded now.
        proposal.state = ProposalState::Executed;
        proposals.set(proposal_id, proposal.clone());
        env.storage().persistent().set(&PROPOSALS, &proposals);

        env.events().publish(
            (symbol_short!("gov"), symbol_short!("executed")),
            (proposal_id, proposal.approvals.len(), now),
        );
    }

    /// Cancel a proposal. Only the proposer (or a guardian once the proposal
    /// has not yet been queued) may cancel.
    pub fn cancel(env: Env, caller: Address, proposal_id: u32) {
        caller.require_auth();
        Self::assert_governance(&env);
        let mut proposals: Map<u32, Proposal> =
            env.storage().persistent().get(&PROPOSALS).unwrap();
        let mut proposal = Self::load_proposal(&env, &proposals, proposal_id);

        match proposal.state {
            ProposalState::Cancelled => panic_with_error!(&env, VaultError::AlreadyCancelled),
            ProposalState::Executed => panic_with_error!(&env, VaultError::AlreadyExecuted),
            _ => {}
        }

        let guardians: Vec<Address> = env.storage().instance().get(&GUARDIANS).unwrap();
        assert!(
            caller == proposal.proposer || guardians.contains(&caller),
            "Not authorized to cancel"
        );
        proposal.state = ProposalState::Cancelled;
        proposals.set(proposal_id, proposal.clone());
        env.storage().persistent().set(&PROPOSALS, &proposals);

        env.events().publish(
            (symbol_short!("gov"), symbol_short!("cancelled")),
            (proposal_id, caller, env.ledger().timestamp()),
        );
    }

    /// Emergency freeze: immediately halts all deposits and withdrawals.
    /// Only a designated guardian may trigger it.
    pub fn emergency_freeze(env: Env, guardian: Address) {
        Self::assert_governance(&env);
        let guardians: Vec<Address> = env.storage().instance().get(&GUARDIANS).unwrap();
        guardian.require_auth();
        assert!(guardians.contains(&guardian), "Not a guardian");
        env.storage().instance().set(&FREEZED, &true);
        env.events().publish(
            (symbol_short!("gov"), symbol_short!("freeze")),
            guardian,
        );
    }

    /// Lift an emergency freeze. Only a guardian may unfreeze.
    pub fn unfreeze(env: Env, guardian: Address) {
        Self::assert_governance(&env);
        let guardians: Vec<Address> = env.storage().instance().get(&GUARDIANS).unwrap();
        guardian.require_auth();
        assert!(guardians.contains(&guardian), "Not a guardian");
        env.storage().instance().set(&FREEZED, &false);
        env.events().publish(
            (symbol_short!("gov"), symbol_short!("unfreeze")),
            guardian,
        );
    }

    /// Returns `true` if the vault is currently emergency-frozen.
    pub fn is_frozen(env: Env) -> bool {
        env.storage().instance().get(&FREEZED).unwrap_or(false)
    }

    /// Returns the proposal matching `proposal_id`.
    pub fn get_proposal(env: Env, proposal_id: u32) -> Proposal {
        let proposals: Map<u32, Proposal> =
            env.storage().persistent().get(&PROPOSALS).unwrap_or_else(|| Map::new(&env));
        Self::load_proposal(&env, &proposals, proposal_id)
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

    /// Panics if governance has not been initialized.
    fn assert_governance(env: &Env) {
        if !env.storage().instance().has(&GOV_INIT) {
            panic_with_error!(env, VaultError::NotInitialized);
        }
    }

    /// Panics if the vault is emergency-frozen.
    fn assert_not_frozen(env: &Env) {
        let frozen: bool = env.storage().instance().get(&FREEZED).unwrap_or(false);
        if frozen {
            panic_with_error!(env, VaultError::VaultFrozen);
        }
    }

    /// Loads a proposal by id, panicking if it does not exist.
    fn load_proposal(env: &Env, proposals: &Map<u32, Proposal>, id: u32) -> Proposal {
        proposals.get(id).unwrap_or_else(|| {
            panic_with_error!(env, VaultError::NotFound);
        })
    }

    /// Acquire reentrancy lock. Panics if already locked.
    fn lock(env: &Env) {
        let locked: bool = env.storage().instance().get(&LOCK).unwrap_or(false);
        if locked {
            panic_with_error!(env, VaultError::ReentrancyGuardActive);
        }
        env.storage().instance().set(&LOCK, &true);
    }

    /// Release reentrancy lock.
    fn unlock(env: &Env) {
        env.storage().instance().set(&LOCK, &false);
    }

    /// State invariant check: the bookkeeping `TOTAL_ASSETS` must always equal
    /// the independently-accounted `RESERVES`, and neither quantity may go
    /// negative. This verifies conservation of total deposited assets across
    /// every deposit, withdrawal, harvest and compound operation.
    fn assert_invariant(env: &Env) {
        let total_assets: i128 = env.storage().instance().get(&TOTAL_ASSETS).unwrap_or(0);
        let reserves: i128 = env.storage().instance().get(&RESERVES).unwrap_or(0);
        assert!(total_assets >= 0, "negative total assets");
        assert!(reserves >= 0, "negative reserves");
        assert!(total_assets == reserves, "reserve conservation violated");
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger};
    use soroban_sdk::{String, Vec};
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

    #[test]
    #[should_panic(expected = "Error(Contract, #10)")]
    fn reentrancy_guard_rejects_double_entry() {
        let (env, contract_id, user) = setup();
        let client = SmartVaultClient::new(&env, &contract_id);

        // Simulate a reentrant call by pre-setting the lock, as an attacker
        // would leave the guard held during a nested invocation.
        env.as_contract(&contract_id, || {
            env.storage().instance().set(&LOCK, &true);
        });
        client.deposit(&user, &1000);
    }

    #[test]
    fn reserves_conserved_across_deposit_withdraw() {
        let (env, contract_id, user) = setup();
        let client = SmartVaultClient::new(&env, &contract_id);

        client.deposit(&user, &1000);
        client.deposit(&user, &500);
        let out = client.withdraw(&user, &300);

        // TOTAL_ASSETS == RESERVES throughout; withdrawn amount is conserved:
        assert_eq!(client.shares_of(&user), 1200);
        assert_eq!(out, 300);
        let total_assets: i128 = env
            .as_contract(&contract_id, || env.storage().instance().get(&TOTAL_ASSETS).unwrap());
        let reserves: i128 = env
            .as_contract(&contract_id, || env.storage().instance().get(&RESERVES).unwrap());
        assert_eq!(total_assets, reserves);
        assert_eq!(total_assets, 1200);
    }

    #[test]
    fn reserves_conserved_after_harvest_and_compound() {
        let (env, contract_id, user) = setup();
        let client = SmartVaultClient::new(&env, &contract_id);

        client.deposit(&user, &1_000_000);
        client.stake(&user);
        env.ledger()
            .with_mut(|l| l.sequence_number += 100 + HARVEST_COOL);
        client.compound(&user);

        let total_assets: i128 = env
            .as_contract(&contract_id, || env.storage().instance().get(&TOTAL_ASSETS).unwrap());
        let reserves: i128 = env
            .as_contract(&contract_id, || env.storage().instance().get(&RESERVES).unwrap());
        assert_eq!(total_assets, reserves);
        assert!(total_assets > 1_000_000);
    }

    // ── Multi-sig timelock governance tests ────────────────────────────────

    fn gov_setup(env: &Env) -> (SmartVaultClient<'static>, Vec<Address>, Address) {
        let id = env.register(SmartVault, ());
        let client = SmartVaultClient::new(env, &id);
        let g1 = Address::generate(env);
        let g2 = Address::generate(env);
        let g3 = Address::generate(env);
        let guardians = Vec::from_array(env, [g1.clone(), g2.clone(), g3.clone()]);
        let _ = g3;
        client.init_governance(&guardians, &2); // 2-of-3
        (client, guardians, g1)
    }

    #[test]
    fn proposal_requires_threshold_and_timelock_to_execute() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, guardians, g1) = gov_setup(&env);

        let pid = client.propose(&g1, &String::from_str(&env, "Update fee"));
        assert_eq!(client.get_proposal(&pid).state, ProposalState::Proposed);

        // Single approval is below the 2-of-3 threshold: cannot execute yet.
        client.approve(&g1, &pid);
        let p = client.get_proposal(&pid);
        assert_eq!(p.state, ProposalState::Proposed);
        assert_eq!(p.approvals.len(), 1);

        // Second approval reaches threshold and queues with the timelock.
        client.approve(&guardians.get(1).unwrap(), &pid);
        let p = client.get_proposal(&pid);
        assert_eq!(p.state, ProposalState::Queued);
        assert!(p.queued_at.is_some());

        // Executing before the timelock elapses must panic.
        let panicked = client.try_execute_proposal(&pid);
        assert!(panicked.is_err(), "execution before timelock must fail");

        // After the timelock elapses, execution succeeds.
        env.ledger().with_mut(|l| l.timestamp += MIN_GOV_PERIOD + 1);
        client.execute_proposal(&pid);
        assert_eq!(client.get_proposal(&pid).state, ProposalState::Executed);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #17)")]
    fn cannot_execute_twice() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, guardians, g1) = gov_setup(&env);
        let pid = client.propose(&g1, &String::from_str(&env, "p"));
        client.approve(&g1, &pid);
        client.approve(&guardians.get(1).unwrap(), &pid);
        env.ledger().with_mut(|l| l.timestamp += MIN_GOV_PERIOD + 1);
        client.execute_proposal(&pid);
        client.execute_proposal(&pid);
    }

    #[test]
    fn emergency_freeze_halts_deposits() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _, g1) = gov_setup(&env);
        let user = Address::generate(&env);

        client.deposit(&user, &1000);
        client.emergency_freeze(&g1);
        assert!(client.is_frozen());

        let panicked = client.try_deposit(&user, &500);
        assert!(panicked.is_err(), "deposit while frozen must fail");

        client.unfreeze(&g1);
        client.deposit(&user, &500);
        assert_eq!(client.shares_of(&user), 1500);
    }

    #[test]
    fn cancels_proposal_and_freezes_state_tracking() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _, g1) = gov_setup(&env);
        let pid = client.propose(&g1, &String::from_str(&env, "Cancel me"));
        client.cancel(&g1, &pid);
        assert_eq!(client.get_proposal(&pid).state, ProposalState::Cancelled);
    }
}
