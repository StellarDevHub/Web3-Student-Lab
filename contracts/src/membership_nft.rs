//! Membership NFT contract for token-gated access control.
//!
//! Each NFT carries a [`Tier`] (Bronze, Silver, Gold) and an optional
//! `soulbound` flag that disables transfer. The admin configures per-tier
//! metadata (display name + a benefit-flag bitmask) and mints memberships to
//! students. Permissions are *implicit*: the current owner of a token holds
//! that token's tier, so transfers update access automatically without any
//! callback into the access-control contract.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Env, String,
    Symbol, Vec,
};

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Tier {
    Bronze,
    Silver,
    Gold,
}

impl Tier {
    /// Numeric ordering used by the access-control contract to compare tiers.
    /// Higher rank = more privileged.
    pub fn rank(self) -> u32 {
        match self {
            Tier::Bronze => 1,
            Tier::Silver => 2,
            Tier::Gold => 3,
        }
    }
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TierConfig {
    pub name: String,
    /// Free-form bitmask describing what perks this tier unlocks. Interpreted
    /// by frontends; the access-control contract only consumes [`Tier::rank`].
    pub benefit_flags: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TokenInfo {
    pub token_id: u128,
    pub owner: Address,
    pub tier: Tier,
    pub minted_at: u64,
    pub soulbound: bool,
}

#[contracttype]
#[derive(Clone)]
pub enum NftKey {
    Admin,
    NextTokenId,
    Token(u128),
    /// Tokens owned by an address. Stored persistently because the set is
    /// unbounded and useful for off-chain enumeration.
    Owned(Address),
    TierCfg(Tier),
    TierCount(Tier),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum NftError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    TokenNotFound = 4,
    NotOwner = 5,
    /// Attempted to transfer a token that was minted with `soulbound = true`.
    Soulbound = 6,
    /// Attempted to mint into a tier that has no [`TierConfig`] yet.
    TierNotConfigured = 7,
}

#[contract]
pub struct MembershipNftContract;

#[contractimpl]
impl MembershipNftContract {
    pub fn init(env: Env, admin: Address) {
        if env.storage().instance().has(&NftKey::Admin) {
            panic_with_error!(&env, NftError::AlreadyInitialized);
        }
        env.storage().instance().set(&NftKey::Admin, &admin);
        env.storage().instance().set(&NftKey::NextTokenId, &1u128);
        env.events()
            .publish((Symbol::new(&env, "membership_init"),), admin);
    }

    pub fn set_tier_config(env: Env, admin: Address, tier: Tier, config: TierConfig) {
        admin.require_auth();
        Self::require_admin(&env, &admin);
        env.storage()
            .instance()
            .set(&NftKey::TierCfg(tier), &config);
        env.events().publish(
            (Symbol::new(&env, "tier_config"),),
            (tier, config.name, config.benefit_flags),
        );
    }

    /// Mint a new membership to `to`. Returns the token id.
    pub fn mint(env: Env, admin: Address, to: Address, tier: Tier, soulbound: bool) -> u128 {
        admin.require_auth();
        Self::require_admin(&env, &admin);
        if !env.storage().instance().has(&NftKey::TierCfg(tier)) {
            panic_with_error!(&env, NftError::TierNotConfigured);
        }
        let token_id: u128 = env
            .storage()
            .instance()
            .get(&NftKey::NextTokenId)
            .unwrap_or(1);
        let info = TokenInfo {
            token_id,
            owner: to.clone(),
            tier,
            minted_at: env.ledger().timestamp(),
            soulbound,
        };
        env.storage()
            .persistent()
            .set(&NftKey::Token(token_id), &info);
        Self::add_owner_token(&env, &to, token_id);
        Self::adjust_tier_count(&env, tier, 1);
        env.storage()
            .instance()
            .set(&NftKey::NextTokenId, &(token_id + 1));
        env.events().publish(
            (Symbol::new(&env, "minted"),),
            (token_id, to, tier, soulbound),
        );
        token_id
    }

    pub fn transfer(env: Env, from: Address, to: Address, token_id: u128) {
        from.require_auth();
        let mut info: TokenInfo = env
            .storage()
            .persistent()
            .get(&NftKey::Token(token_id))
            .unwrap_or_else(|| panic_with_error!(&env, NftError::TokenNotFound));
        if info.owner != from {
            panic_with_error!(&env, NftError::NotOwner);
        }
        if info.soulbound {
            panic_with_error!(&env, NftError::Soulbound);
        }
        Self::remove_owner_token(&env, &from, token_id);
        Self::add_owner_token(&env, &to, token_id);
        info.owner = to.clone();
        env.storage()
            .persistent()
            .set(&NftKey::Token(token_id), &info);
        env.events()
            .publish((Symbol::new(&env, "transferred"),), (token_id, from, to));
    }

    pub fn burn(env: Env, admin: Address, token_id: u128) {
        admin.require_auth();
        Self::require_admin(&env, &admin);
        let info: TokenInfo = env
            .storage()
            .persistent()
            .get(&NftKey::Token(token_id))
            .unwrap_or_else(|| panic_with_error!(&env, NftError::TokenNotFound));
        Self::remove_owner_token(&env, &info.owner, token_id);
        Self::adjust_tier_count(&env, info.tier, -1);
        env.storage().persistent().remove(&NftKey::Token(token_id));
        env.events().publish(
            (Symbol::new(&env, "burned"),),
            (token_id, info.owner, info.tier),
        );
    }

    // -----------------------------------------------------------------------
    // Views
    // -----------------------------------------------------------------------

    pub fn token_info(env: Env, token_id: u128) -> Option<TokenInfo> {
        env.storage().persistent().get(&NftKey::Token(token_id))
    }

    pub fn owner_of(env: Env, token_id: u128) -> Address {
        let info: TokenInfo = env
            .storage()
            .persistent()
            .get(&NftKey::Token(token_id))
            .unwrap_or_else(|| panic_with_error!(&env, NftError::TokenNotFound));
        info.owner
    }

    pub fn tier_of(env: Env, token_id: u128) -> Tier {
        let info: TokenInfo = env
            .storage()
            .persistent()
            .get(&NftKey::Token(token_id))
            .unwrap_or_else(|| panic_with_error!(&env, NftError::TokenNotFound));
        info.tier
    }

    /// Returns the highest tier among all tokens currently owned by `owner`,
    /// or `None` if they hold no memberships.
    pub fn tier_of_owner(env: Env, owner: Address) -> Option<Tier> {
        let tokens: Vec<u128> = env
            .storage()
            .persistent()
            .get(&NftKey::Owned(owner))
            .unwrap_or_else(|| Vec::new(&env));
        let mut best: Option<Tier> = None;
        for i in 0..tokens.len() {
            let id = tokens.get(i).unwrap();
            if let Some(info) =
                env.storage().persistent().get::<_, TokenInfo>(&NftKey::Token(id))
            {
                best = Some(match best {
                    Some(t) if t.rank() >= info.tier.rank() => t,
                    _ => info.tier,
                });
            }
        }
        best
    }

    pub fn tokens_of(env: Env, owner: Address) -> Vec<u128> {
        env.storage()
            .persistent()
            .get(&NftKey::Owned(owner))
            .unwrap_or_else(|| Vec::new(&env))
    }

    pub fn tier_config(env: Env, tier: Tier) -> Option<TierConfig> {
        env.storage().instance().get(&NftKey::TierCfg(tier))
    }

    pub fn tier_count(env: Env, tier: Tier) -> u32 {
        env.storage()
            .instance()
            .get(&NftKey::TierCount(tier))
            .unwrap_or(0)
    }

    pub fn total_minted(env: Env) -> u128 {
        let next: u128 = env
            .storage()
            .instance()
            .get(&NftKey::NextTokenId)
            .unwrap_or(1);
        next - 1
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    fn require_admin(env: &Env, caller: &Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&NftKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, NftError::NotInitialized));
        if *caller != admin {
            panic_with_error!(env, NftError::Unauthorized);
        }
    }

    fn add_owner_token(env: &Env, owner: &Address, token_id: u128) {
        let mut tokens: Vec<u128> = env
            .storage()
            .persistent()
            .get(&NftKey::Owned(owner.clone()))
            .unwrap_or_else(|| Vec::new(env));
        tokens.push_back(token_id);
        env.storage()
            .persistent()
            .set(&NftKey::Owned(owner.clone()), &tokens);
    }

    fn remove_owner_token(env: &Env, owner: &Address, token_id: u128) {
        let mut tokens: Vec<u128> = env
            .storage()
            .persistent()
            .get(&NftKey::Owned(owner.clone()))
            .unwrap_or_else(|| Vec::new(env));
        for i in 0..tokens.len() {
            if tokens.get(i).unwrap() == token_id {
                tokens.remove(i);
                break;
            }
        }
        if tokens.is_empty() {
            env.storage()
                .persistent()
                .remove(&NftKey::Owned(owner.clone()));
        } else {
            env.storage()
                .persistent()
                .set(&NftKey::Owned(owner.clone()), &tokens);
        }
    }

    fn adjust_tier_count(env: &Env, tier: Tier, delta: i32) {
        let cur: u32 = env
            .storage()
            .instance()
            .get(&NftKey::TierCount(tier))
            .unwrap_or(0);
        let next = if delta < 0 {
            cur.saturating_sub((-delta) as u32)
        } else {
            cur.saturating_add(delta as u32)
        };
        env.storage().instance().set(&NftKey::TierCount(tier), &next);
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env, String as SorString};

    fn cfg(env: &Env, name: &str, flags: u32) -> TierConfig {
        TierConfig {
            name: SorString::from_str(env, name),
            benefit_flags: flags,
        }
    }

    fn setup() -> (Env, Address, MembershipNftContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let id = env.register(MembershipNftContract, ());
        let client = MembershipNftContractClient::new(&env, &id);
        client.init(&admin);
        client.set_tier_config(&admin, &Tier::Bronze, &cfg(&env, "Bronze", 0b001));
        client.set_tier_config(&admin, &Tier::Silver, &cfg(&env, "Silver", 0b011));
        client.set_tier_config(&admin, &Tier::Gold, &cfg(&env, "Gold", 0b111));
        (env, admin, client)
    }

    #[test]
    fn mint_assigns_owner_and_tier() {
        let (env, admin, client) = setup();
        let alice = Address::generate(&env);
        let id = client.mint(&admin, &alice, &Tier::Silver, &false);
        assert_eq!(client.owner_of(&id), alice);
        assert_eq!(client.tier_of(&id), Tier::Silver);
        assert_eq!(client.tier_of_owner(&alice), Some(Tier::Silver));
        assert_eq!(client.tier_count(&Tier::Silver), 1);
        assert_eq!(client.total_minted(), 1);
    }

    #[test]
    fn tier_of_owner_returns_highest_held_tier() {
        let (env, admin, client) = setup();
        let alice = Address::generate(&env);
        client.mint(&admin, &alice, &Tier::Bronze, &false);
        client.mint(&admin, &alice, &Tier::Gold, &false);
        client.mint(&admin, &alice, &Tier::Silver, &false);
        assert_eq!(client.tier_of_owner(&alice), Some(Tier::Gold));
    }

    #[test]
    fn transfer_moves_ownership_and_updates_tier_lookup() {
        let (env, admin, client) = setup();
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);
        let id = client.mint(&admin, &alice, &Tier::Gold, &false);

        client.transfer(&alice, &bob, &id);
        assert_eq!(client.owner_of(&id), bob);
        assert_eq!(client.tier_of_owner(&alice), None);
        assert_eq!(client.tier_of_owner(&bob), Some(Tier::Gold));
    }

    #[test]
    #[should_panic]
    fn soulbound_token_cannot_be_transferred() {
        let (env, admin, client) = setup();
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);
        let id = client.mint(&admin, &alice, &Tier::Bronze, &true);
        client.transfer(&alice, &bob, &id);
    }

    #[test]
    #[should_panic]
    fn mint_without_tier_config_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let alice = Address::generate(&env);
        let id = env.register(MembershipNftContract, ());
        let client = MembershipNftContractClient::new(&env, &id);
        client.init(&admin);
        // No tier config — mint should fail.
        client.mint(&admin, &alice, &Tier::Bronze, &false);
    }

    #[test]
    fn burn_removes_token_and_updates_counts() {
        let (env, admin, client) = setup();
        let alice = Address::generate(&env);
        let id = client.mint(&admin, &alice, &Tier::Silver, &false);
        client.burn(&admin, &id);
        assert_eq!(client.token_info(&id), None);
        assert_eq!(client.tier_of_owner(&alice), None);
        assert_eq!(client.tier_count(&Tier::Silver), 0);
    }
}
