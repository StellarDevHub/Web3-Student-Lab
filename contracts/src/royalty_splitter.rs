//! Automatic royalty splitter (Issue: Implement Automatic Royalty Splitter).
//!
//! A splitter accepts payments in a Soroban-compatible token (any SAC) and
//! atomically forwards each payment to a configured set of recipients
//! pro-rata to their basis-point shares.
//!
//! Configuration changes (recipients and shares) go through a queued-update
//! mechanism with two layers of protection:
//!
//! 1. **Time delay** — `update_delay` ledgers must elapse between proposal
//!    and application, giving recipients a window to react.
//! 2. **Multi-party approval** — an optional set of approver addresses can
//!    be required to vote on a pending update before it is applied.
//!
//! Distribution and change history are recorded persistently via
//! [`crate::distribution_manager`] so frontends can reconstruct activity.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, token, Address, Env,
    Symbol, Vec,
};

use crate::distribution_manager::{
    self, ChangeRecord, DistributionRecord, Payout, Recipient, MAX_RECIPIENTS, TOTAL_BPS,
};

#[contracttype]
#[derive(Clone)]
pub enum SplitterKey {
    Owner,
    Asset,
    Recipients,
    UpdateDelay,
    Approvers,
    RequiredApprovals,
    PendingUpdate,
    PendingApprovalMask,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PendingUpdate {
    pub recipients: Vec<Recipient>,
    pub queued_at: u64,
    pub proposer: Address,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum SplitterError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    /// Shares do not sum to TOTAL_BPS, or a share is zero.
    InvalidShares = 4,
    NoRecipients = 5,
    TooManyRecipients = 6,
    DuplicateRecipient = 7,
    NoPendingUpdate = 8,
    UpdateDelayNotMet = 9,
    InsufficientApprovals = 10,
    AlreadyApproved = 11,
    NotApprover = 12,
    InvalidAmount = 13,
    /// `required_approvals` exceeds the size of the approver set, or the
    /// approver set exceeds the bitmask width.
    InvalidApproverConfig = 14,
    PendingUpdateExists = 15,
    NothingToRelease = 16,
}

#[contract]
pub struct RoyaltySplitterContract;

#[contractimpl]
impl RoyaltySplitterContract {
    /// One-time initialisation.
    ///
    /// * `owner` — controls update proposals and cancellation.
    /// * `asset` — SAC address of the token being split.
    /// * `recipients` — non-empty, ≤ [`MAX_RECIPIENTS`], shares sum to
    ///   [`TOTAL_BPS`].
    /// * `update_delay` — ledgers between [`Self::propose_update`] and
    ///   [`Self::apply_update`]. Zero disables the delay.
    /// * `approvers` — addresses (besides the owner) that may vote on
    ///   pending updates. Bounded to 32 to fit a `u32` approval mask.
    /// * `required_approvals` — how many approver votes are needed before
    ///   `apply_update` succeeds. Set to 0 to make voting advisory only.
    pub fn init(
        env: Env,
        owner: Address,
        asset: Address,
        recipients: Vec<Recipient>,
        update_delay: u64,
        approvers: Vec<Address>,
        required_approvals: u32,
    ) {
        if env.storage().instance().has(&SplitterKey::Owner) {
            panic_with_error!(&env, SplitterError::AlreadyInitialized);
        }
        Self::validate_recipients(&env, &recipients);
        if approvers.len() > 32 || required_approvals > approvers.len() {
            panic_with_error!(&env, SplitterError::InvalidApproverConfig);
        }
        env.storage().instance().set(&SplitterKey::Owner, &owner);
        env.storage().instance().set(&SplitterKey::Asset, &asset);
        env.storage()
            .instance()
            .set(&SplitterKey::Recipients, &recipients);
        env.storage()
            .instance()
            .set(&SplitterKey::UpdateDelay, &update_delay);
        env.storage()
            .instance()
            .set(&SplitterKey::Approvers, &approvers);
        env.storage()
            .instance()
            .set(&SplitterKey::RequiredApprovals, &required_approvals);

        env.events().publish(
            (Symbol::new(&env, "splitter_init"),),
            (owner, asset, recipients.len()),
        );
    }

    /// Pull `amount` from `payer` and forward each recipient's pro-rata slice
    /// in a single transaction. Records a distribution entry and emits an
    /// event. Returns the new distribution index.
    pub fn distribute(env: Env, payer: Address, amount: i128) -> u64 {
        Self::require_initialized(&env);
        if amount <= 0 {
            panic_with_error!(&env, SplitterError::InvalidAmount);
        }
        payer.require_auth();

        let recipients: Vec<Recipient> = env
            .storage()
            .instance()
            .get(&SplitterKey::Recipients)
            .unwrap();
        let asset: Address = env.storage().instance().get(&SplitterKey::Asset).unwrap();
        let token_client = token::Client::new(&env, &asset);
        let payouts = distribution_manager::compute_payouts(&env, &recipients, amount);

        for i in 0..recipients.len() {
            let r = recipients.get(i).unwrap();
            let p = payouts.get(i).unwrap();
            if p > 0 {
                token_client.transfer(&payer, &r.address, &p);
            }
        }

        let idx = distribution_manager::record_distribution(&env, amount, &payouts, &recipients);
        env.events().publish(
            (Symbol::new(&env, "distributed"),),
            (idx, payer, amount, recipients.len()),
        );
        idx
    }

    /// Flush the splitter contract's own token balance to recipients
    /// pro-rata. Useful when payers transfer to the splitter directly
    /// (without invoking [`Self::distribute`]) and the funds need to be
    /// pushed out.
    pub fn release(env: Env, caller: Address) -> u64 {
        Self::require_initialized(&env);
        caller.require_auth();

        let asset: Address = env.storage().instance().get(&SplitterKey::Asset).unwrap();
        let token_client = token::Client::new(&env, &asset);
        let amount = token_client.balance(&env.current_contract_address());
        if amount <= 0 {
            panic_with_error!(&env, SplitterError::NothingToRelease);
        }

        let recipients: Vec<Recipient> = env
            .storage()
            .instance()
            .get(&SplitterKey::Recipients)
            .unwrap();
        let payouts = distribution_manager::compute_payouts(&env, &recipients, amount);

        let contract = env.current_contract_address();
        for i in 0..recipients.len() {
            let r = recipients.get(i).unwrap();
            let p = payouts.get(i).unwrap();
            if p > 0 {
                token_client.transfer(&contract, &r.address, &p);
            }
        }

        let idx = distribution_manager::record_distribution(&env, amount, &payouts, &recipients);
        env.events().publish(
            (Symbol::new(&env, "released"),),
            (idx, caller, amount, recipients.len()),
        );
        idx
    }

    /// Queue a recipient-set change. Only the owner or a configured approver
    /// may propose. Replaces *all* recipients atomically once applied —
    /// callers should pass the desired final set, not a delta.
    pub fn propose_update(env: Env, proposer: Address, new_recipients: Vec<Recipient>) {
        Self::require_initialized(&env);
        proposer.require_auth();
        Self::require_owner_or_approver(&env, &proposer);

        if env.storage().instance().has(&SplitterKey::PendingUpdate) {
            panic_with_error!(&env, SplitterError::PendingUpdateExists);
        }
        Self::validate_recipients(&env, &new_recipients);

        let pending = PendingUpdate {
            recipients: new_recipients.clone(),
            queued_at: env.ledger().sequence() as u64,
            proposer: proposer.clone(),
        };
        env.storage()
            .instance()
            .set(&SplitterKey::PendingUpdate, &pending);

        // Auto-credit the proposer's vote if they are an approver.
        let mask = Self::approver_bit(&env, &proposer).unwrap_or(0);
        env.storage()
            .instance()
            .set(&SplitterKey::PendingApprovalMask, &mask);

        env.events().publish(
            (Symbol::new(&env, "update_proposed"),),
            (proposer, pending.queued_at, new_recipients.len()),
        );
    }

    /// Cast an approver's vote on the pending update. Each approver can vote
    /// at most once; the owner does not vote here (their authorisation flows
    /// through `propose_update` / `apply_update`).
    pub fn approve_update(env: Env, approver: Address) {
        Self::require_initialized(&env);
        approver.require_auth();

        let bit = Self::approver_bit(&env, &approver)
            .unwrap_or_else(|| panic_with_error!(&env, SplitterError::NotApprover));
        if !env.storage().instance().has(&SplitterKey::PendingUpdate) {
            panic_with_error!(&env, SplitterError::NoPendingUpdate);
        }
        let mask: u32 = env
            .storage()
            .instance()
            .get(&SplitterKey::PendingApprovalMask)
            .unwrap_or(0);
        if mask & bit != 0 {
            panic_with_error!(&env, SplitterError::AlreadyApproved);
        }
        let new_mask = mask | bit;
        env.storage()
            .instance()
            .set(&SplitterKey::PendingApprovalMask, &new_mask);

        env.events().publish(
            (Symbol::new(&env, "update_approved"),),
            (approver, new_mask),
        );
    }

    /// Apply the pending update once both the time delay has elapsed and the
    /// approval threshold has been reached. Records a [`ChangeRecord`].
    pub fn apply_update(env: Env, caller: Address) {
        Self::require_initialized(&env);
        caller.require_auth();
        Self::require_owner_or_approver(&env, &caller);

        let pending: PendingUpdate = env
            .storage()
            .instance()
            .get(&SplitterKey::PendingUpdate)
            .unwrap_or_else(|| panic_with_error!(&env, SplitterError::NoPendingUpdate));

        let now = env.ledger().sequence() as u64;
        let delay: u64 = env
            .storage()
            .instance()
            .get(&SplitterKey::UpdateDelay)
            .unwrap_or(0);
        if now < pending.queued_at + delay {
            panic_with_error!(&env, SplitterError::UpdateDelayNotMet);
        }

        let required: u32 = env
            .storage()
            .instance()
            .get(&SplitterKey::RequiredApprovals)
            .unwrap_or(0);
        let mask: u32 = env
            .storage()
            .instance()
            .get(&SplitterKey::PendingApprovalMask)
            .unwrap_or(0);
        if mask.count_ones() < required {
            panic_with_error!(&env, SplitterError::InsufficientApprovals);
        }

        let previous: Vec<Recipient> = env
            .storage()
            .instance()
            .get(&SplitterKey::Recipients)
            .unwrap();
        env.storage()
            .instance()
            .set(&SplitterKey::Recipients, &pending.recipients);
        env.storage().instance().remove(&SplitterKey::PendingUpdate);
        env.storage()
            .instance()
            .remove(&SplitterKey::PendingApprovalMask);

        let change_idx =
            distribution_manager::record_change(&env, &previous, &pending.recipients, &caller);
        env.events().publish(
            (Symbol::new(&env, "update_applied"),),
            (change_idx, caller, pending.recipients.len()),
        );
    }

    /// Owner-only: discard a pending update without applying it.
    pub fn cancel_update(env: Env, caller: Address) {
        Self::require_initialized(&env);
        caller.require_auth();
        Self::require_owner(&env, &caller);

        if !env.storage().instance().has(&SplitterKey::PendingUpdate) {
            panic_with_error!(&env, SplitterError::NoPendingUpdate);
        }
        env.storage().instance().remove(&SplitterKey::PendingUpdate);
        env.storage()
            .instance()
            .remove(&SplitterKey::PendingApprovalMask);

        env.events()
            .publish((Symbol::new(&env, "update_cancelled"),), caller);
    }

    // -----------------------------------------------------------------------
    // Views
    // -----------------------------------------------------------------------

    pub fn get_owner(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&SplitterKey::Owner)
            .unwrap_or_else(|| panic_with_error!(&env, SplitterError::NotInitialized))
    }

    pub fn get_asset(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&SplitterKey::Asset)
            .unwrap_or_else(|| panic_with_error!(&env, SplitterError::NotInitialized))
    }

    pub fn get_recipients(env: Env) -> Vec<Recipient> {
        env.storage()
            .instance()
            .get(&SplitterKey::Recipients)
            .unwrap_or_else(|| Vec::new(&env))
    }

    pub fn get_update_delay(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&SplitterKey::UpdateDelay)
            .unwrap_or(0)
    }

    pub fn get_approvers(env: Env) -> Vec<Address> {
        env.storage()
            .instance()
            .get(&SplitterKey::Approvers)
            .unwrap_or_else(|| Vec::new(&env))
    }

    pub fn get_required_approvals(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&SplitterKey::RequiredApprovals)
            .unwrap_or(0)
    }

    pub fn get_pending_update(env: Env) -> Option<PendingUpdate> {
        env.storage().instance().get(&SplitterKey::PendingUpdate)
    }

    pub fn get_pending_approval_mask(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&SplitterKey::PendingApprovalMask)
            .unwrap_or(0)
    }

    pub fn get_distribution_count(env: Env) -> u64 {
        distribution_manager::get_distribution_count(&env)
    }

    pub fn get_distribution(env: Env, index: u64) -> Option<DistributionRecord> {
        distribution_manager::get_distribution(&env, index)
    }

    pub fn get_distribution_payouts(env: Env, index: u64) -> Vec<Payout> {
        distribution_manager::get_distribution_payouts(&env, index)
    }

    pub fn get_change_count(env: Env) -> u64 {
        distribution_manager::get_change_count(&env)
    }

    pub fn get_change(env: Env, index: u64) -> Option<ChangeRecord> {
        distribution_manager::get_change(&env, index)
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    fn validate_recipients(env: &Env, recipients: &Vec<Recipient>) {
        if recipients.is_empty() {
            panic_with_error!(env, SplitterError::NoRecipients);
        }
        if recipients.len() > MAX_RECIPIENTS {
            panic_with_error!(env, SplitterError::TooManyRecipients);
        }
        let mut total: u64 = 0;
        for i in 0..recipients.len() {
            let r_i = recipients.get(i).unwrap();
            if r_i.share_bps == 0 {
                panic_with_error!(env, SplitterError::InvalidShares);
            }
            total += r_i.share_bps as u64;
            for j in 0..i {
                let r_j = recipients.get(j).unwrap();
                if r_i.address == r_j.address {
                    panic_with_error!(env, SplitterError::DuplicateRecipient);
                }
            }
        }
        if total != TOTAL_BPS as u64 {
            panic_with_error!(env, SplitterError::InvalidShares);
        }
    }

    fn require_initialized(env: &Env) {
        if !env.storage().instance().has(&SplitterKey::Owner) {
            panic_with_error!(env, SplitterError::NotInitialized);
        }
    }

    fn require_owner(env: &Env, caller: &Address) {
        let owner: Address = env
            .storage()
            .instance()
            .get(&SplitterKey::Owner)
            .unwrap_or_else(|| panic_with_error!(env, SplitterError::NotInitialized));
        if *caller != owner {
            panic_with_error!(env, SplitterError::Unauthorized);
        }
    }

    fn require_owner_or_approver(env: &Env, caller: &Address) {
        let owner: Address = env
            .storage()
            .instance()
            .get(&SplitterKey::Owner)
            .unwrap_or_else(|| panic_with_error!(env, SplitterError::NotInitialized));
        if *caller == owner {
            return;
        }
        if Self::approver_bit(env, caller).is_some() {
            return;
        }
        panic_with_error!(env, SplitterError::Unauthorized);
    }

    fn approver_bit(env: &Env, addr: &Address) -> Option<u32> {
        let approvers: Vec<Address> = env
            .storage()
            .instance()
            .get(&SplitterKey::Approvers)
            .unwrap_or_else(|| Vec::new(env));
        for i in 0..approvers.len() {
            if approvers.get(i).unwrap() == *addr {
                return Some(1u32 << i);
            }
        }
        None
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        token::{Client as TokenClient, StellarAssetClient},
        vec, Address, Env,
    };

    struct Harness {
        env: Env,
        client: RoyaltySplitterContractClient<'static>,
        asset: Address,
        owner: Address,
        payer: Address,
        r1: Address,
        r2: Address,
        r3: Address,
    }

    fn setup(update_delay: u64) -> Harness {
        let env = Env::default();
        env.mock_all_auths();

        let asset_admin = Address::generate(&env);
        let asset_id = env.register_stellar_asset_contract_v2(asset_admin.clone());
        let asset = asset_id.address();

        let owner = Address::generate(&env);
        let payer = Address::generate(&env);
        let r1 = Address::generate(&env);
        let r2 = Address::generate(&env);
        let r3 = Address::generate(&env);

        StellarAssetClient::new(&env, &asset).mint(&payer, &10_000);

        let recipients = vec![
            &env,
            Recipient {
                address: r1.clone(),
                share_bps: 5_000,
            },
            Recipient {
                address: r2.clone(),
                share_bps: 3_000,
            },
            Recipient {
                address: r3.clone(),
                share_bps: 2_000,
            },
        ];

        let approvers: Vec<Address> = Vec::new(&env);
        let id = env.register(RoyaltySplitterContract, ());
        let client = RoyaltySplitterContractClient::new(&env, &id);
        client.init(&owner, &asset, &recipients, &update_delay, &approvers, &0);

        Harness {
            env,
            client,
            asset,
            owner,
            payer,
            r1,
            r2,
            r3,
        }
    }

    fn balances(h: &Harness) -> (i128, i128, i128) {
        let t = TokenClient::new(&h.env, &h.asset);
        (t.balance(&h.r1), t.balance(&h.r2), t.balance(&h.r3))
    }

    #[test]
    fn distribute_splits_payment_pro_rata() {
        let h = setup(0);
        h.client.distribute(&h.payer, &1_000);

        let (b1, b2, b3) = balances(&h);
        assert_eq!(b1, 500);
        assert_eq!(b2, 300);
        // Last recipient absorbs any rounding remainder; 1000 has none.
        assert_eq!(b3, 200);
        assert_eq!(h.client.get_distribution_count(), 1);
    }

    #[test]
    fn distribute_assigns_remainder_to_last_recipient() {
        let h = setup(0);
        // 1001 * 5000/10000 = 500.5 -> 500; 1001 * 3000/10000 = 300.3 -> 300;
        // last recipient takes the remainder: 1001 - 500 - 300 = 201.
        h.client.distribute(&h.payer, &1_001);
        let (b1, b2, b3) = balances(&h);
        assert_eq!(b1 + b2 + b3, 1_001);
        assert_eq!(b1, 500);
        assert_eq!(b2, 300);
        assert_eq!(b3, 201);
    }

    #[test]
    #[should_panic]
    fn init_rejects_shares_not_summing_to_100_percent() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let asset = env
            .register_stellar_asset_contract_v2(Address::generate(&env))
            .address();
        let r1 = Address::generate(&env);
        let r2 = Address::generate(&env);
        let recipients = vec![
            &env,
            Recipient {
                address: r1,
                share_bps: 4_000,
            },
            Recipient {
                address: r2,
                share_bps: 5_000,
            },
        ];
        let id = env.register(RoyaltySplitterContract, ());
        let client = RoyaltySplitterContractClient::new(&env, &id);
        let approvers: Vec<Address> = Vec::new(&env);
        client.init(&owner, &asset, &recipients, &0, &approvers, &0);
    }

    #[test]
    #[should_panic]
    fn init_rejects_duplicate_recipients() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let asset = env
            .register_stellar_asset_contract_v2(Address::generate(&env))
            .address();
        let r1 = Address::generate(&env);
        let recipients = vec![
            &env,
            Recipient {
                address: r1.clone(),
                share_bps: 5_000,
            },
            Recipient {
                address: r1,
                share_bps: 5_000,
            },
        ];
        let id = env.register(RoyaltySplitterContract, ());
        let client = RoyaltySplitterContractClient::new(&env, &id);
        let approvers: Vec<Address> = Vec::new(&env);
        client.init(&owner, &asset, &recipients, &0, &approvers, &0);
    }

    #[test]
    fn update_requires_delay_and_records_change_history() {
        let h = setup(10);
        let new_r = Address::generate(&h.env);
        let new_recipients = vec![
            &h.env,
            Recipient {
                address: new_r.clone(),
                share_bps: 10_000,
            },
        ];
        h.client.propose_update(&h.owner, &new_recipients);

        // Before the delay elapses, apply must fail.
        let result = h.client.try_apply_update(&h.owner);
        assert!(result.is_err());

        // Advance past the delay.
        h.env.ledger().with_mut(|l| l.sequence_number += 11);
        h.client.apply_update(&h.owner);

        assert_eq!(h.client.get_recipients().len(), 1);
        assert_eq!(h.client.get_change_count(), 1);
        let change = h.client.get_change(&0).unwrap();
        assert_eq!(change.previous.len(), 3);
        assert_eq!(change.applied.len(), 1);
    }

    #[test]
    fn update_enforces_required_approvals() {
        let env = Env::default();
        env.mock_all_auths();
        let asset = env
            .register_stellar_asset_contract_v2(Address::generate(&env))
            .address();
        let owner = Address::generate(&env);
        let approver_a = Address::generate(&env);
        let approver_b = Address::generate(&env);
        let r1 = Address::generate(&env);
        let r2 = Address::generate(&env);
        let recipients = vec![
            &env,
            Recipient {
                address: r1.clone(),
                share_bps: 5_000,
            },
            Recipient {
                address: r2,
                share_bps: 5_000,
            },
        ];
        let approvers = vec![&env, approver_a.clone(), approver_b.clone()];

        let id = env.register(RoyaltySplitterContract, ());
        let client = RoyaltySplitterContractClient::new(&env, &id);
        // Require both approvers to vote.
        client.init(&owner, &asset, &recipients, &0, &approvers, &2);

        let new_recipients = vec![
            &env,
            Recipient {
                address: r1,
                share_bps: 10_000,
            },
        ];
        client.propose_update(&owner, &new_recipients);

        // Owner is not in the approver set, so propose did not credit a vote.
        let res = client.try_apply_update(&owner);
        assert!(res.is_err());

        client.approve_update(&approver_a);
        let res = client.try_apply_update(&owner);
        assert!(res.is_err());

        client.approve_update(&approver_b);
        client.apply_update(&owner);

        assert_eq!(client.get_recipients().len(), 1);
    }

    #[test]
    #[should_panic]
    fn distribute_rejects_zero_amount() {
        let h = setup(0);
        h.client.distribute(&h.payer, &0);
    }

    #[test]
    #[should_panic]
    fn cancel_update_owner_only() {
        let h = setup(100);
        let new_r = Address::generate(&h.env);
        let new_recipients = vec![
            &h.env,
            Recipient {
                address: new_r,
                share_bps: 10_000,
            },
        ];
        h.client.propose_update(&h.owner, &new_recipients);
        let stranger = Address::generate(&h.env);
        h.client.cancel_update(&stranger);
    }
}
