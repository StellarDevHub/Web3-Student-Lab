//! NFT Certificate Staking and Rewards System - Issue #203
#![allow(dead_code)]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, BytesN, Env,
    Vec,
};
pub const REWARD_RATE_PER_LEDGER: u128 = 100;
pub const PRECISION: u128 = 1_000_000;
pub const MIN_STAKE_DURATION: u64 = 120_960;
pub const UNSTAKE_COOLDOWN: u64 = 51_840;
pub const EMERGENCY_PENALTY_BPS: u128 = 2_000;

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CertificateTier {
    Basic,
    Intermediate,
    Advanced,
    Expert,
}

impl CertificateTier {
    pub fn multiplier_num(self) -> u128 {
        match self {
            CertificateTier::Basic => 100,
            CertificateTier::Intermediate => 150,
            CertificateTier::Advanced => 200,
            CertificateTier::Expert => 300,
        }
    }
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum StakerTier {
    Bronze,
    Silver,
    Gold,
    Platinum,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CertificateWeight {
    pub course_id: BytesN<32>,
    pub base_weight: u128,
    pub tier: CertificateTier,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StakePosition {
    pub staker: Address,
    pub token_ids: Vec<u128>,
    pub staked_at: u64,
    pub total_weight: u128,
    pub last_claim_at: u64,
    pub accumulated_rewards: u128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UnstakeRequest {
    pub staker: Address,
    pub token_ids: Vec<u128>,
    pub initiated_at: u64,
    pub release_at: u64,
}

#[contracttype]
#[derive(Clone)]
pub enum StakingKey {
    Admin,
    RewardRate,
    TotalStakedWeight,
    Position(Address),
    Unstake(Address),
    CertWeight(u128),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum StakingError {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    Unauthorized = 3,
    InvalidAmount = 4,
    NoPosition = 5,
    MinDurationNotMet = 6,
    CooldownActive = 7,
    NoPendingUnstake = 8,
    CooldownNotComplete = 9,
    TokenNotStaked = 10,
    WeightNotConfigured = 11,
    EmptyTokenList = 12,
}

#[contract]
pub struct NftStakingContract;

#[contractimpl]
impl NftStakingContract {
    pub fn init(env: Env, admin: Address) {
        if env.storage().instance().has(&StakingKey::Admin) {
            panic_with_error!(&env, StakingError::AlreadyInitialized);
        }
        env.storage().instance().set(&StakingKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&StakingKey::TotalStakedWeight, &0u128);
    }

    pub fn set_reward_rate(env: Env, admin: Address, rate: u128) {
        admin.require_auth();
        Self::require_admin(&env, &admin);
        if rate == 0 {
            panic_with_error!(&env, StakingError::InvalidAmount);
        }
        env.storage().instance().set(&StakingKey::RewardRate, &rate);
    }

    pub fn set_certificate_weight(
        env: Env,
        admin: Address,
        token_id: u128,
        weight: CertificateWeight,
    ) {
        admin.require_auth();
        Self::require_admin(&env, &admin);
        env.storage()
            .instance()
            .set(&StakingKey::CertWeight(token_id), &weight);
    }

    pub fn stake_certificates(env: Env, staker: Address, token_ids: Vec<u128>) -> StakePosition {
        staker.require_auth();
        Self::require_initialized(&env);
        if token_ids.is_empty() {
            panic_with_error!(&env, StakingError::EmptyTokenList);
        }
        let now = env.ledger().sequence() as u64;
        let added_weight = Self::compute_weight(&env, &token_ids);
        let position = if let Some(mut pos) = env
            .storage()
            .instance()
            .get::<_, StakePosition>(&StakingKey::Position(staker.clone()))
        {
            let pending = Self::calc_pending(&env, &pos, now);
            pos.accumulated_rewards += pending;
            pos.last_claim_at = now;
            for id in token_ids.iter() {
                pos.token_ids.push_back(id);
            }
            pos.total_weight += added_weight;
            pos
        } else {
            StakePosition {
                staker: staker.clone(),
                token_ids,
                staked_at: now,
                total_weight: added_weight,
                last_claim_at: now,
                accumulated_rewards: 0,
            }
        };
        let global: u128 = env
            .storage()
            .instance()
            .get(&StakingKey::TotalStakedWeight)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&StakingKey::TotalStakedWeight, &(global + added_weight));
        env.storage()
            .instance()
            .set(&StakingKey::Position(staker.clone()), &position);
        env.events().publish(
            (soroban_sdk::Symbol::new(&env, "certs_staked"), staker),
            added_weight,
        );
        position
    }

    pub fn unstake_certificates(env: Env, staker: Address, token_ids: Vec<u128>) {
        staker.require_auth();
        Self::require_initialized(&env);
        if token_ids.is_empty() {
            panic_with_error!(&env, StakingError::EmptyTokenList);
        }
        let now = env.ledger().sequence() as u64;
        let mut pos: StakePosition = env
            .storage()
            .instance()
            .get(&StakingKey::Position(staker.clone()))
            .unwrap_or_else(|| panic_with_error!(&env, StakingError::NoPosition));
        if now < pos.staked_at + MIN_STAKE_DURATION {
            panic_with_error!(&env, StakingError::MinDurationNotMet);
        }
        if env
            .storage()
            .instance()
            .has(&StakingKey::Unstake(staker.clone()))
        {
            panic_with_error!(&env, StakingError::CooldownActive);
        }
        let pending = Self::calc_pending(&env, &pos, now);
        pos.accumulated_rewards += pending;
        pos.last_claim_at = now;
        let removed_weight = Self::compute_weight(&env, &token_ids);
        for id in token_ids.iter() {
            let idx = Self::find_index(&pos.token_ids, id);
            if idx >= pos.token_ids.len() {
                panic_with_error!(&env, StakingError::TokenNotStaked);
            }
            pos.token_ids.remove(idx);
        }
        pos.total_weight = pos.total_weight.saturating_sub(removed_weight);
        let global: u128 = env
            .storage()
            .instance()
            .get(&StakingKey::TotalStakedWeight)
            .unwrap_or(0);
        env.storage().instance().set(
            &StakingKey::TotalStakedWeight,
            &global.saturating_sub(removed_weight),
        );
        if pos.token_ids.is_empty() {
            env.storage()
                .instance()
                .remove(&StakingKey::Position(staker.clone()));
        } else {
            env.storage()
                .instance()
                .set(&StakingKey::Position(staker.clone()), &pos);
        }
        let req = UnstakeRequest {
            staker: staker.clone(),
            token_ids,
            initiated_at: now,
            release_at: now + UNSTAKE_COOLDOWN,
        };
        env.storage()
            .instance()
            .set(&StakingKey::Unstake(staker.clone()), &req);
        env.events().publish(
            (soroban_sdk::Symbol::new(&env, "unstake_init"), staker),
            now + UNSTAKE_COOLDOWN,
        );
    }

    pub fn complete_unstake(env: Env, staker: Address) -> Vec<u128> {
        staker.require_auth();
        let req: UnstakeRequest = env
            .storage()
            .instance()
            .get(&StakingKey::Unstake(staker.clone()))
            .unwrap_or_else(|| panic_with_error!(&env, StakingError::NoPendingUnstake));
        let now = env.ledger().sequence() as u64;
        if now < req.release_at {
            panic_with_error!(&env, StakingError::CooldownNotComplete);
        }
        env.storage()
            .instance()
            .remove(&StakingKey::Unstake(staker.clone()));
        env.events().publish(
            (soroban_sdk::Symbol::new(&env, "unstake_done"), staker),
            req.token_ids.len(),
        );
        req.token_ids
    }

    pub fn emergency_unstake(env: Env, staker: Address) -> Vec<u128> {
        staker.require_auth();
        Self::require_initialized(&env);
        let now = env.ledger().sequence() as u64;
        let mut pos: StakePosition = env
            .storage()
            .instance()
            .get(&StakingKey::Position(staker.clone()))
            .unwrap_or_else(|| panic_with_error!(&env, StakingError::NoPosition));
        let pending = Self::calc_pending(&env, &pos, now);
        let penalty = pending * EMERGENCY_PENALTY_BPS / 10_000;
        pos.accumulated_rewards += pending.saturating_sub(penalty);
        let token_ids = pos.token_ids.clone();
        let removed_weight = pos.total_weight;
        let global: u128 = env
            .storage()
            .instance()
            .get(&StakingKey::TotalStakedWeight)
            .unwrap_or(0);
        env.storage().instance().set(
            &StakingKey::TotalStakedWeight,
            &global.saturating_sub(removed_weight),
        );
        pos.token_ids = Vec::new(&env);
        pos.total_weight = 0;
        pos.last_claim_at = now;
        env.storage()
            .instance()
            .set(&StakingKey::Position(staker.clone()), &pos);
        env.storage()
            .instance()
            .remove(&StakingKey::Unstake(staker.clone()));
        env.events().publish(
            (soroban_sdk::Symbol::new(&env, "emergency_unstake"), staker),
            penalty,
        );
        token_ids
    }

    pub fn claim_rewards(env: Env, staker: Address) -> u128 {
        staker.require_auth();
        Self::require_initialized(&env);
        let now = env.ledger().sequence() as u64;
        let mut pos: StakePosition = env
            .storage()
            .instance()
            .get(&StakingKey::Position(staker.clone()))
            .unwrap_or_else(|| panic_with_error!(&env, StakingError::NoPosition));
        let pending = Self::calc_pending(&env, &pos, now);
        let total = pos.accumulated_rewards + pending;
        pos.accumulated_rewards = 0;
        pos.last_claim_at = now;
        env.storage()
            .instance()
            .set(&StakingKey::Position(staker.clone()), &pos);
        env.events().publish(
            (soroban_sdk::Symbol::new(&env, "rewards_claimed"), staker),
            total,
        );
        total
    }

    pub fn calculate_pending_rewards(env: Env, staker: Address) -> u128 {
        let pos: StakePosition = env
            .storage()
            .instance()
            .get(&StakingKey::Position(staker))
            .unwrap_or_else(|| panic_with_error!(&env, StakingError::NoPosition));
        let now = env.ledger().sequence() as u64;
        pos.accumulated_rewards + Self::calc_pending(&env, &pos, now)
    }

    pub fn get_voting_power(env: Env, staker: Address) -> u128 {
        env.storage()
            .instance()
            .get::<_, StakePosition>(&StakingKey::Position(staker))
            .map(|p| p.total_weight)
            .unwrap_or(0)
    }

    pub fn get_stake_position(env: Env, staker: Address) -> Option<StakePosition> {
        env.storage().instance().get(&StakingKey::Position(staker))
    }

    pub fn get_unstake_request(env: Env, staker: Address) -> Option<UnstakeRequest> {
        env.storage().instance().get(&StakingKey::Unstake(staker))
    }

    pub fn get_staker_tier(env: Env, staker: Address) -> StakerTier {
        let w = env
            .storage()
            .instance()
            .get::<_, StakePosition>(&StakingKey::Position(staker))
            .map(|p| p.total_weight)
            .unwrap_or(0);
        Self::tier_from_weight(w)
    }

    pub fn get_total_staked_weight(env: Env) -> u128 {
        env.storage()
            .instance()
            .get(&StakingKey::TotalStakedWeight)
            .unwrap_or(0)
    }

    pub fn get_certificate_weight(env: Env, token_id: u128) -> Option<CertificateWeight> {
        env.storage()
            .instance()
            .get(&StakingKey::CertWeight(token_id))
    }

    fn require_initialized(env: &Env) {
        if !env.storage().instance().has(&StakingKey::Admin) {
            panic_with_error!(env, StakingError::NotInitialized);
        }
    }

    fn require_admin(env: &Env, caller: &Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&StakingKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, StakingError::NotInitialized));
        if *caller != admin {
            panic_with_error!(env, StakingError::Unauthorized);
        }
    }

    fn compute_weight(env: &Env, token_ids: &Vec<u128>) -> u128 {
        let mut total: u128 = 0;
        for id in token_ids.iter() {
            let cfg: CertificateWeight = env
                .storage()
                .instance()
                .get(&StakingKey::CertWeight(id))
                .unwrap_or_else(|| panic_with_error!(env, StakingError::WeightNotConfigured));
            total += cfg.base_weight * cfg.tier.multiplier_num() / 100;
        }
        total
    }

    fn calc_pending(env: &Env, pos: &StakePosition, now: u64) -> u128 {
        if now <= pos.last_claim_at || pos.total_weight == 0 {
            return 0;
        }
        let duration = (now - pos.last_claim_at) as u128;
        let rate: u128 = env
            .storage()
            .instance()
            .get(&StakingKey::RewardRate)
            .unwrap_or(REWARD_RATE_PER_LEDGER);
        pos.total_weight * duration * rate / PRECISION
    }

    fn tier_from_weight(weight: u128) -> StakerTier {
        match weight {
            0..=999 => StakerTier::Bronze,
            1_000..=4_999 => StakerTier::Silver,
            5_000..=9_999 => StakerTier::Gold,
            _ => StakerTier::Platinum,
        }
    }

    fn find_index(ids: &Vec<u128>, id: u128) -> u32 {
        for i in 0..ids.len() {
            if ids.get(i).unwrap() == id {
                return i;
            }
        }
        ids.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, testutils::Ledger, vec, Address, Env};

    fn course_id(env: &Env) -> BytesN<32> {
        BytesN::from_array(env, &[1u8; 32])
    }

    fn setup() -> (Env, Address, NftStakingContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let id = env.register(NftStakingContract, ());
        let client = NftStakingContractClient::new(&env, &id);
        let admin = Address::generate(&env);
        client.init(&admin);
        env.as_contract(&id, || {
            env.storage().instance().extend_ttl(1_000_000, 1_000_000);
        });
        (env, admin, client)
    }

    fn reg(
        env: &Env,
        client: &NftStakingContractClient,
        admin: &Address,
        token_id: u128,
        base: u128,
        tier: CertificateTier,
    ) {
        client.set_certificate_weight(
            admin,
            &token_id,
            &CertificateWeight {
                course_id: course_id(env),
                base_weight: base,
                tier,
            },
        );
    }

    #[test]
    fn init_sets_zero_global_weight() {
        let (_env, _admin, client) = setup();
        assert_eq!(client.get_total_staked_weight(), 0);
    }

    #[test]
    #[should_panic]
    fn double_init_panics() {
        let (_env, admin, client) = setup();
        client.init(&admin);
    }

    #[test]
    fn stake_computes_correct_weight() {
        let (env, admin, client) = setup();
        reg(&env, &client, &admin, 1, 100, CertificateTier::Basic); // 100*100/100 = 100
        reg(&env, &client, &admin, 2, 300, CertificateTier::Advanced); // 300*200/100 = 600
        let staker = Address::generate(&env);
        let pos = client.stake_certificates(&staker, &vec![&env, 1u128, 2u128]);
        assert_eq!(pos.total_weight, 700);
        assert_eq!(client.get_total_staked_weight(), 700);
    }

    #[test]
    #[should_panic]
    fn stake_empty_list_panics() {
        let (env, _admin, client) = setup();
        let staker = Address::generate(&env);
        client.stake_certificates(&staker, &vec![&env]);
    }

    #[test]
    #[should_panic]
    fn stake_unregistered_token_panics() {
        let (env, _admin, client) = setup();
        let staker = Address::generate(&env);
        client.stake_certificates(&staker, &vec![&env, 99u128]);
    }

    #[test]
    fn stake_additional_tokens_snapshots_rewards() {
        let (env, admin, client) = setup();
        reg(&env, &client, &admin, 1, 100, CertificateTier::Basic);
        reg(&env, &client, &admin, 2, 100, CertificateTier::Basic);
        let staker = Address::generate(&env);
        client.stake_certificates(&staker, &vec![&env, 1u128]);
        env.ledger().with_mut(|l| l.sequence_number += 1_000);
        let pos = client.stake_certificates(&staker, &vec![&env, 2u128]);
        assert!(pos.accumulated_rewards > 0);
        assert_eq!(pos.token_ids.len(), 2);
    }

    #[test]
    fn pending_rewards_formula_correct() {
        let (env, admin, client) = setup();
        reg(&env, &client, &admin, 1, 1_000, CertificateTier::Basic); // weight=1000
        let staker = Address::generate(&env);
        client.stake_certificates(&staker, &vec![&env, 1u128]);
        env.ledger().with_mut(|l| l.sequence_number += 10_000);
        // 1000 * 10000 * 100 / 1_000_000 = 1000
        assert_eq!(client.calculate_pending_rewards(&staker), 1_000);
    }

    #[test]
    fn claim_rewards_resets_accumulator() {
        let (env, admin, client) = setup();
        reg(&env, &client, &admin, 1, 1_000, CertificateTier::Basic);
        let staker = Address::generate(&env);
        client.stake_certificates(&staker, &vec![&env, 1u128]);
        env.ledger().with_mut(|l| l.sequence_number += 10_000);
        let claimed = client.claim_rewards(&staker);
        assert_eq!(claimed, 1_000);
        assert_eq!(client.calculate_pending_rewards(&staker), 0);
    }

    #[test]
    fn staker_tier_bronze_below_1000() {
        let (env, admin, client) = setup();
        reg(&env, &client, &admin, 1, 300, CertificateTier::Expert); // 300*300/100=900
        let staker = Address::generate(&env);
        client.stake_certificates(&staker, &vec![&env, 1u128]);
        assert_eq!(client.get_staker_tier(&staker), StakerTier::Bronze);
    }

    #[test]
    fn staker_tier_gold_at_7500() {
        let (env, admin, client) = setup();
        reg(&env, &client, &admin, 1, 2_500, CertificateTier::Expert); // 2500*300/100=7500
        let staker = Address::generate(&env);
        client.stake_certificates(&staker, &vec![&env, 1u128]);
        assert_eq!(client.get_staker_tier(&staker), StakerTier::Gold);
    }

    #[test]
    fn voting_power_equals_total_weight() {
        let (env, admin, client) = setup();
        reg(&env, &client, &admin, 1, 500, CertificateTier::Intermediate); // 500*150/100=750
        let staker = Address::generate(&env);
        client.stake_certificates(&staker, &vec![&env, 1u128]);
        assert_eq!(client.get_voting_power(&staker), 750);
    }

    #[test]
    fn voting_power_zero_for_non_staker() {
        let (env, _admin, client) = setup();
        assert_eq!(client.get_voting_power(&Address::generate(&env)), 0);
    }

    #[test]
    #[should_panic]
    fn unstake_before_min_duration_panics() {
        let (env, admin, client) = setup();
        reg(&env, &client, &admin, 1, 100, CertificateTier::Basic);
        let staker = Address::generate(&env);
        client.stake_certificates(&staker, &vec![&env, 1u128]);
        env.ledger()
            .with_mut(|l| l.sequence_number += (MIN_STAKE_DURATION / 2) as u32);
        client.unstake_certificates(&staker, &vec![&env, 1u128]);
    }

    #[test]
    fn unstake_after_min_duration_creates_request() {
        let (env, admin, client) = setup();
        reg(&env, &client, &admin, 1, 100, CertificateTier::Basic);
        let staker = Address::generate(&env);
        client.stake_certificates(&staker, &vec![&env, 1u128]);
        env.ledger()
            .with_mut(|l| l.sequence_number += MIN_STAKE_DURATION as u32);
        client.unstake_certificates(&staker, &vec![&env, 1u128]);
        let req = client.get_unstake_request(&staker).unwrap();
        assert_eq!(req.token_ids.len(), 1);
        assert!(req.release_at > req.initiated_at);
    }

    #[test]
    #[should_panic]
    fn complete_unstake_before_cooldown_panics() {
        let (env, admin, client) = setup();
        reg(&env, &client, &admin, 1, 100, CertificateTier::Basic);
        let staker = Address::generate(&env);
        client.stake_certificates(&staker, &vec![&env, 1u128]);
        env.ledger()
            .with_mut(|l| l.sequence_number += MIN_STAKE_DURATION as u32);
        client.unstake_certificates(&staker, &vec![&env, 1u128]);
        client.complete_unstake(&staker); // cooldown not done
    }

    #[test]
    fn complete_unstake_after_cooldown_returns_tokens() {
        let (env, admin, client) = setup();
        reg(&env, &client, &admin, 1, 100, CertificateTier::Basic);
        let staker = Address::generate(&env);
        client.stake_certificates(&staker, &vec![&env, 1u128]);
        env.ledger()
            .with_mut(|l| l.sequence_number += MIN_STAKE_DURATION as u32);
        client.unstake_certificates(&staker, &vec![&env, 1u128]);
        env.ledger()
            .with_mut(|l| l.sequence_number += UNSTAKE_COOLDOWN as u32);
        let returned = client.complete_unstake(&staker);
        assert_eq!(returned.len(), 1);
        assert_eq!(returned.get(0).unwrap(), 1u128);
        assert!(client.get_unstake_request(&staker).is_none());
    }

    #[test]
    fn emergency_unstake_applies_20pct_penalty() {
        let (env, admin, client) = setup();
        reg(&env, &client, &admin, 1, 1_000, CertificateTier::Basic); // weight=1000
        let staker = Address::generate(&env);
        client.stake_certificates(&staker, &vec![&env, 1u128]);
        env.ledger().with_mut(|l| l.sequence_number += 10_000);
        // pending = 1000; penalty = 200; kept = 800
        client.emergency_unstake(&staker);
        let pos = client.get_stake_position(&staker).unwrap();
        assert_eq!(pos.accumulated_rewards, 800);
        assert_eq!(pos.total_weight, 0);
    }

    #[test]
    fn global_weight_tracks_stake_and_unstake() {
        let (env, admin, client) = setup();
        reg(&env, &client, &admin, 1, 100, CertificateTier::Basic);
        reg(&env, &client, &admin, 2, 100, CertificateTier::Basic);
        let staker = Address::generate(&env);
        client.stake_certificates(&staker, &vec![&env, 1u128, 2u128]);
        assert_eq!(client.get_total_staked_weight(), 200);
        env.ledger()
            .with_mut(|l| l.sequence_number += MIN_STAKE_DURATION as u32);
        client.unstake_certificates(&staker, &vec![&env, 1u128]);
        assert_eq!(client.get_total_staked_weight(), 100);
    }
}
