//! Token-gated access control with tier-based permissions.
//!
//! Sits in front of a [`crate::membership_nft`] contract and answers two
//! questions:
//!
//! 1. *May `addr` access `resource`?* — yes if `addr` holds a membership at
//!    or above the resource's required tier, **or** if an admin issued a
//!    temporary grant whose deadline has not passed. Resources can also be
//!    paused at the admin's discretion.
//! 2. *What benefits has `addr` accrued?* — tier-specific, per-epoch
//!    accrual that members claim into an internal balance. Settlement is
//!    pull-based: holders should `claim_benefits` before transferring their
//!    membership, otherwise pending accrual will be readable by the new
//!    owner. This is a deliberate simplification; a future revision can
//!    settle inside the membership contract's transfer hook.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Env, String,
    Symbol,
};

use crate::membership_nft::{MembershipNftContractClient, Tier};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ResourceConfig {
    pub name: String,
    /// Minimum tier rank required (1=Bronze, 2=Silver, 3=Gold).
    pub min_tier_rank: u32,
    pub paused: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TempGrant {
    pub addr: Address,
    pub resource: String,
    pub granted_until: u64,
    pub granter: Address,
}

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum AccessReason {
    Denied = 0,
    Tier = 1,
    TempGrant = 2,
    Paused = 3,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AccessDecision {
    pub allowed: bool,
    pub reason: AccessReason,
}

#[contracttype]
#[derive(Clone)]
pub enum AccessKey {
    Admin,
    Membership,
    EpochSeconds,
    Genesis,
    Resource(String),
    TempGrant(Address, String),
    BenefitRate(Tier),
    LastClaimEpoch(Address),
    Balance(Address),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum AccessError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    ResourceNotConfigured = 4,
    GrantNotFound = 5,
    GrantExpired = 6,
    NoMembership = 7,
    InvalidTier = 8,
    InvalidEpoch = 9,
    InvalidRate = 10,
}

#[contract]
pub struct TokenGatedAccessContract;

#[contractimpl]
impl TokenGatedAccessContract {
    /// One-time setup. `epoch_seconds` controls the cadence of benefit
    /// accrual; `genesis` is captured from `env.ledger().timestamp()` at
    /// init time so all subsequent epoch math is deterministic.
    pub fn init(env: Env, admin: Address, membership: Address, epoch_seconds: u64) {
        if env.storage().instance().has(&AccessKey::Admin) {
            panic_with_error!(&env, AccessError::AlreadyInitialized);
        }
        if epoch_seconds == 0 {
            panic_with_error!(&env, AccessError::InvalidEpoch);
        }
        env.storage().instance().set(&AccessKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&AccessKey::Membership, &membership);
        env.storage()
            .instance()
            .set(&AccessKey::EpochSeconds, &epoch_seconds);
        env.storage()
            .instance()
            .set(&AccessKey::Genesis, &env.ledger().timestamp());
        env.events().publish(
            (Symbol::new(&env, "access_init"),),
            (admin, membership, epoch_seconds),
        );
    }

    pub fn configure_resource(
        env: Env,
        admin: Address,
        name: String,
        min_tier_rank: u32,
        paused: bool,
    ) {
        admin.require_auth();
        Self::require_admin(&env, &admin);
        if !(1..=3).contains(&min_tier_rank) {
            panic_with_error!(&env, AccessError::InvalidTier);
        }
        let cfg = ResourceConfig {
            name: name.clone(),
            min_tier_rank,
            paused,
        };
        env.storage()
            .persistent()
            .set(&AccessKey::Resource(name.clone()), &cfg);
        env.events().publish(
            (Symbol::new(&env, "resource_cfg"),),
            (name, min_tier_rank, paused),
        );
    }

    pub fn set_benefit_rate(env: Env, admin: Address, tier: Tier, rate_per_epoch: i128) {
        admin.require_auth();
        Self::require_admin(&env, &admin);
        if rate_per_epoch < 0 {
            panic_with_error!(&env, AccessError::InvalidRate);
        }
        env.storage()
            .instance()
            .set(&AccessKey::BenefitRate(tier), &rate_per_epoch);
        env.events()
            .publish((Symbol::new(&env, "benefit_rate"),), (tier, rate_per_epoch));
    }

    pub fn grant_temp_access(
        env: Env,
        admin: Address,
        addr: Address,
        resource: String,
        until_ts: u64,
    ) {
        admin.require_auth();
        Self::require_admin(&env, &admin);
        if !env
            .storage()
            .persistent()
            .has(&AccessKey::Resource(resource.clone()))
        {
            panic_with_error!(&env, AccessError::ResourceNotConfigured);
        }
        if until_ts <= env.ledger().timestamp() {
            panic_with_error!(&env, AccessError::GrantExpired);
        }
        let grant = TempGrant {
            addr: addr.clone(),
            resource: resource.clone(),
            granted_until: until_ts,
            granter: admin.clone(),
        };
        env.storage().persistent().set(
            &AccessKey::TempGrant(addr.clone(), resource.clone()),
            &grant,
        );
        env.events().publish(
            (Symbol::new(&env, "temp_grant"),),
            (addr, resource, until_ts),
        );
    }

    pub fn revoke_temp_access(env: Env, admin: Address, addr: Address, resource: String) {
        admin.require_auth();
        Self::require_admin(&env, &admin);
        let key = AccessKey::TempGrant(addr.clone(), resource.clone());
        if !env.storage().persistent().has(&key) {
            panic_with_error!(&env, AccessError::GrantNotFound);
        }
        env.storage().persistent().remove(&key);
        env.events()
            .publish((Symbol::new(&env, "temp_revoke"),), (addr, resource));
    }

    /// Decide whether `addr` may access `resource`. View-only — no auth
    /// required, designed to be called by the frontend or by other contracts
    /// before exposing gated content.
    pub fn check_access(env: Env, addr: Address, resource: String) -> AccessDecision {
        let cfg: ResourceConfig = env
            .storage()
            .persistent()
            .get(&AccessKey::Resource(resource.clone()))
            .unwrap_or_else(|| panic_with_error!(&env, AccessError::ResourceNotConfigured));
        if cfg.paused {
            return AccessDecision {
                allowed: false,
                reason: AccessReason::Paused,
            };
        }
        let now = env.ledger().timestamp();
        let grant_key = AccessKey::TempGrant(addr.clone(), resource);
        if let Some(grant) = env.storage().persistent().get::<_, TempGrant>(&grant_key) {
            if grant.granted_until > now {
                return AccessDecision {
                    allowed: true,
                    reason: AccessReason::TempGrant,
                };
            }
        }
        let membership: Address = env
            .storage()
            .instance()
            .get(&AccessKey::Membership)
            .unwrap_or_else(|| panic_with_error!(&env, AccessError::NotInitialized));
        let client = MembershipNftContractClient::new(&env, &membership);
        if let Some(tier) = client.tier_of_owner(&addr) {
            if tier.rank() >= cfg.min_tier_rank {
                return AccessDecision {
                    allowed: true,
                    reason: AccessReason::Tier,
                };
            }
        }
        AccessDecision {
            allowed: false,
            reason: AccessReason::Denied,
        }
    }

    /// Settle pending benefit accrual into `addr`'s internal balance and
    /// return the new balance. Caller must hold a membership.
    ///
    /// The **first** call from a new holder is a no-op claim that registers
    /// the accrual start at the current epoch — late joiners do not retro-
    /// actively earn against the contract's full lifetime. Frontends should
    /// call this once when a user first acquires a membership and again to
    /// settle accrued benefits on demand.
    pub fn claim_benefits(env: Env, addr: Address) -> i128 {
        addr.require_auth();
        let membership: Address = env
            .storage()
            .instance()
            .get(&AccessKey::Membership)
            .unwrap_or_else(|| panic_with_error!(&env, AccessError::NotInitialized));
        let client = MembershipNftContractClient::new(&env, &membership);
        let tier = client
            .tier_of_owner(&addr)
            .unwrap_or_else(|| panic_with_error!(&env, AccessError::NoMembership));

        let now_epoch = Self::compute_epoch(&env);
        let last: u64 = env
            .storage()
            .persistent()
            .get(&AccessKey::LastClaimEpoch(addr.clone()))
            .unwrap_or(now_epoch);
        let elapsed = now_epoch.saturating_sub(last);
        let rate: i128 = env
            .storage()
            .instance()
            .get(&AccessKey::BenefitRate(tier))
            .unwrap_or(0);
        let earned = (elapsed as i128) * rate;
        let prev: i128 = env
            .storage()
            .persistent()
            .get(&AccessKey::Balance(addr.clone()))
            .unwrap_or(0);
        let new_balance = prev + earned;
        env.storage()
            .persistent()
            .set(&AccessKey::Balance(addr.clone()), &new_balance);
        env.storage()
            .persistent()
            .set(&AccessKey::LastClaimEpoch(addr.clone()), &now_epoch);
        env.events().publish(
            (Symbol::new(&env, "benefits_claimed"),),
            (addr, tier, earned, new_balance),
        );
        new_balance
    }

    // -----------------------------------------------------------------------
    // Views
    // -----------------------------------------------------------------------

    pub fn current_epoch(env: Env) -> u64 {
        Self::compute_epoch(&env)
    }

    pub fn balance_of(env: Env, addr: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&AccessKey::Balance(addr))
            .unwrap_or(0)
    }

    /// Pending (unclaimed) benefits for `addr`, computed against the current
    /// tier. Returns 0 if the address holds no membership.
    pub fn pending_benefits(env: Env, addr: Address) -> i128 {
        let membership: Address = env
            .storage()
            .instance()
            .get(&AccessKey::Membership)
            .unwrap_or_else(|| panic_with_error!(&env, AccessError::NotInitialized));
        let client = MembershipNftContractClient::new(&env, &membership);
        let tier = match client.tier_of_owner(&addr) {
            Some(t) => t,
            None => return 0,
        };
        let now_epoch = Self::compute_epoch(&env);
        let last: u64 = env
            .storage()
            .persistent()
            .get(&AccessKey::LastClaimEpoch(addr))
            .unwrap_or(now_epoch);
        let elapsed = now_epoch.saturating_sub(last);
        let rate: i128 = env
            .storage()
            .instance()
            .get(&AccessKey::BenefitRate(tier))
            .unwrap_or(0);
        (elapsed as i128) * rate
    }

    pub fn get_resource(env: Env, name: String) -> Option<ResourceConfig> {
        env.storage().persistent().get(&AccessKey::Resource(name))
    }

    pub fn get_temp_grant(env: Env, addr: Address, resource: String) -> Option<TempGrant> {
        env.storage()
            .persistent()
            .get(&AccessKey::TempGrant(addr, resource))
    }

    pub fn get_benefit_rate(env: Env, tier: Tier) -> i128 {
        env.storage()
            .instance()
            .get(&AccessKey::BenefitRate(tier))
            .unwrap_or(0)
    }

    pub fn membership_contract(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&AccessKey::Membership)
            .unwrap_or_else(|| panic_with_error!(&env, AccessError::NotInitialized))
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    fn require_admin(env: &Env, caller: &Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&AccessKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, AccessError::NotInitialized));
        if *caller != admin {
            panic_with_error!(env, AccessError::Unauthorized);
        }
    }

    fn compute_epoch(env: &Env) -> u64 {
        let genesis: u64 = env
            .storage()
            .instance()
            .get(&AccessKey::Genesis)
            .unwrap_or(0);
        let epoch_secs: u64 = env
            .storage()
            .instance()
            .get(&AccessKey::EpochSeconds)
            .unwrap_or(1);
        let now = env.ledger().timestamp();
        if now < genesis {
            return 0;
        }
        (now - genesis) / epoch_secs
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::membership_nft::{MembershipNftContract, MembershipNftContractClient, TierConfig};
    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        Env, String as SorString,
    };

    struct Harness {
        env: Env,
        admin: Address,
        access: TokenGatedAccessContractClient<'static>,
        nft: MembershipNftContractClient<'static>,
    }

    fn cfg(env: &Env, name: &str, flags: u32) -> TierConfig {
        TierConfig {
            name: SorString::from_str(env, name),
            benefit_flags: flags,
        }
    }

    fn setup() -> Harness {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);

        let nft_id = env.register(MembershipNftContract, ());
        let nft = MembershipNftContractClient::new(&env, &nft_id);
        nft.init(&admin);
        nft.set_tier_config(&admin, &Tier::Bronze, &cfg(&env, "Bronze", 0b001));
        nft.set_tier_config(&admin, &Tier::Silver, &cfg(&env, "Silver", 0b011));
        nft.set_tier_config(&admin, &Tier::Gold, &cfg(&env, "Gold", 0b111));

        let access_id = env.register(TokenGatedAccessContract, ());
        let access = TokenGatedAccessContractClient::new(&env, &access_id);
        access.init(&admin, &nft_id, &60); // 1-minute epochs

        Harness {
            env,
            admin,
            access,
            nft,
        }
    }

    fn name(env: &Env, s: &str) -> SorString {
        SorString::from_str(env, s)
    }

    #[test]
    fn check_access_allows_when_tier_meets_requirement() {
        let h = setup();
        let alice = Address::generate(&h.env);
        h.nft.mint(&h.admin, &alice, &Tier::Silver, &false);

        let resource = name(&h.env, "premium-course");
        h.access.configure_resource(&h.admin, &resource, &2, &false);

        let decision = h.access.check_access(&alice, &resource);
        assert!(decision.allowed);
        assert_eq!(decision.reason, AccessReason::Tier);
    }

    #[test]
    fn check_access_denies_when_tier_below_requirement() {
        let h = setup();
        let alice = Address::generate(&h.env);
        h.nft.mint(&h.admin, &alice, &Tier::Bronze, &false);

        let resource = name(&h.env, "gold-only");
        h.access.configure_resource(&h.admin, &resource, &3, &false);

        let decision = h.access.check_access(&alice, &resource);
        assert!(!decision.allowed);
        assert_eq!(decision.reason, AccessReason::Denied);
    }

    #[test]
    fn temp_grant_overrides_tier_check() {
        let h = setup();
        let alice = Address::generate(&h.env);
        // Alice has no membership but gets a temp grant.

        let resource = name(&h.env, "preview");
        h.access.configure_resource(&h.admin, &resource, &1, &false);

        let until = h.env.ledger().timestamp() + 3_600;
        h.access
            .grant_temp_access(&h.admin, &alice, &resource, &until);

        let decision = h.access.check_access(&alice, &resource);
        assert!(decision.allowed);
        assert_eq!(decision.reason, AccessReason::TempGrant);
    }

    #[test]
    fn temp_grant_expires_after_deadline() {
        let h = setup();
        let alice = Address::generate(&h.env);
        let resource = name(&h.env, "preview");
        h.access.configure_resource(&h.admin, &resource, &3, &false);

        let until = h.env.ledger().timestamp() + 60;
        h.access
            .grant_temp_access(&h.admin, &alice, &resource, &until);

        // Move past the deadline.
        h.env.ledger().with_mut(|l| l.timestamp = until + 1);
        let decision = h.access.check_access(&alice, &resource);
        assert!(!decision.allowed);
    }

    #[test]
    fn paused_resource_denies_all_access() {
        let h = setup();
        let alice = Address::generate(&h.env);
        h.nft.mint(&h.admin, &alice, &Tier::Gold, &false);
        let resource = name(&h.env, "frozen");
        h.access.configure_resource(&h.admin, &resource, &1, &true);

        let decision = h.access.check_access(&alice, &resource);
        assert!(!decision.allowed);
        assert_eq!(decision.reason, AccessReason::Paused);
    }

    #[test]
    fn benefits_accrue_per_epoch_and_claim_settles_balance() {
        let h = setup();
        let alice = Address::generate(&h.env);
        h.nft.mint(&h.admin, &alice, &Tier::Silver, &false);
        h.access.set_benefit_rate(&h.admin, &Tier::Silver, &10);

        // Initial claim registers the holder; balance starts at zero so
        // late joiners do not retroactively earn against contract genesis.
        assert_eq!(h.access.claim_benefits(&alice), 0);
        assert_eq!(h.access.pending_benefits(&alice), 0);

        // Advance 5 epochs (5 * 60 = 300 seconds).
        h.env.ledger().with_mut(|l| l.timestamp += 5 * 60);

        assert_eq!(h.access.pending_benefits(&alice), 50);
        let balance = h.access.claim_benefits(&alice);
        assert_eq!(balance, 50);
        assert_eq!(h.access.balance_of(&alice), 50);
        // Pending resets to zero immediately after claiming.
        assert_eq!(h.access.pending_benefits(&alice), 0);
    }

    #[test]
    fn transfer_updates_access_without_explicit_hook() {
        let h = setup();
        let alice = Address::generate(&h.env);
        let bob = Address::generate(&h.env);
        let id = h.nft.mint(&h.admin, &alice, &Tier::Gold, &false);

        let resource = name(&h.env, "gold-only");
        h.access.configure_resource(&h.admin, &resource, &3, &false);

        assert!(h.access.check_access(&alice, &resource).allowed);
        assert!(!h.access.check_access(&bob, &resource).allowed);

        h.nft.transfer(&alice, &bob, &id);

        assert!(!h.access.check_access(&alice, &resource).allowed);
        assert!(h.access.check_access(&bob, &resource).allowed);
    }

    #[test]
    #[should_panic]
    fn claim_without_membership_panics() {
        let h = setup();
        let alice = Address::generate(&h.env);
        h.access.claim_benefits(&alice);
    }

    #[test]
    #[should_panic]
    fn configure_resource_rejects_invalid_tier() {
        let h = setup();
        let resource = name(&h.env, "bad");
        h.access.configure_resource(&h.admin, &resource, &4, &false);
    }
}
