#![no_std]

pub mod badges;
pub mod rarity;

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, Address,
    Env, String, Symbol,
};
pub use badges::{AchievementBadge, ProvenanceRecord};
pub use rarity::RarityTier;

// ---- Errors (SC-HARD-20: range 400+) ----

/// Typed contract errors for the certificate NFT contract.
///
/// Discriminants are in the `400+` range (shared by non-primary contracts).
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum CertError {
    /// `400` - A certificate has already been minted for this student and course.
    AlreadyMinted = 400,
    /// `401` - Caller is not the admin.
    Unauthorized = 401,
    /// `402` - Badge is soulbound and cannot be transferred.
    SoulboundNonTransferable = 402,
    /// `403` - Requested tier upgrade is invalid or prerequisites unmet.
    InvalidTierUpgrade = 403,
    /// `404` - Requested badge ID was not found.
    BadgeNotFound = 404,
    /// `405` - Insufficient completed milestones for this tier.
    InsufficientMilestones = 405,
    /// `406` - Badge transfer attempted; badges are non-transferable.
    NonTransferable = 406,
}

#[contracttype]
pub struct CertificateMetadata {
    pub course_id: String,
    pub grade: String,
    pub uri: String,
}

pub mod royalties;
use royalties::{Royalties, RoyaltyInfo};
#[contracttype]
pub enum DataKey {
    BadgeCounter,
    Badge(u64),
}

#[contract]
pub struct CertificateNFTContract;

#[contractimpl]
impl CertificateNFTContract {
    /// Mints a new non-fungible achievement certificate to a student.
    pub fn mint_certificate(
        env: Env,
        admin: Address,
        student: Address,
        course_id: String,
        grade: String,
        metadata_uri: String,
    ) {
        admin.require_auth();

        let key = (student.clone(), course_id.clone());
        if env.storage().persistent().has(&key) {
            panic_with_error!(&env, CertError::AlreadyMinted);
        }

        let metadata = CertificateMetadata {
            course_id: course_id.clone(),
            grade: grade.clone(),
            uri: metadata_uri.clone(),
        };
        env.storage().persistent().set(&key, &metadata);

        let topics: (Symbol, Address, String) = (symbol_short!("mint"), student, course_id);
        env.events().publish(topics, metadata);
    }

    /// Sets royalty configuration for an NFT badge (admin or creator).
    pub fn set_token_royalty(
        env: Env,
        admin: Address,
        token_id: String,
        recipient: Address,
        royalty_bps: u32,
    ) {
        admin.require_auth();
        Royalties::set_royalty_config(&env, &token_id, &recipient, royalty_bps);
        env.events().publish(
            (symbol_short!("set_roy"),),
            (token_id, recipient, royalty_bps),
        );
    }

    /// EIP-2981 royalty info standard interface: computes royalty amount and recipient.
    pub fn royalty_info(env: Env, token_id: String, sale_price: u128) -> RoyaltyInfo {
        Royalties::royalty_info(&env, &token_id, sale_price)
    }

    /// Allows designers to update their designated royalty payout address.
    pub fn update_royalty_recipient(
        env: Env,
        token_id: String,
        current_recipient: Address,
        new_recipient: Address,
    ) {
        Royalties::update_payout_address(&env, &token_id, &current_recipient, &new_recipient);
        env.events().publish(
            (symbol_short!("upd_roy"),),
            (token_id, current_recipient, new_recipient),
        );
    }

    /// Mints a new tiered achievement badge to a student.
    pub fn mint_badge(
        env: Env,
        admin: Address,
        student: Address,
        course_id: String,
        tier: RarityTier,
        metadata_uri: String,
        initial_milestone: String,
    ) -> u64 {
        admin.require_auth();

        let badge_id: u64 = env.storage().persistent().get(&DataKey::BadgeCounter).unwrap_or(1);
        env.storage().persistent().set(&DataKey::BadgeCounter, &(badge_id + 1));

        let badge = match AchievementBadge::new(
            &env,
            badge_id,
            student.clone(),
            admin.clone(),
            course_id.clone(),
            tier,
            metadata_uri,
            initial_milestone,
        ) {
            Ok(b) => b,
            Err(e) => panic_with_error!(&env, e),
        };

        env.storage().persistent().set(&DataKey::Badge(badge_id), &badge);

        let topics: (Symbol, Address, u64) = (symbol_short!("badge_mnt"), student, badge_id);
        env.events().publish(topics, badge_id);

        badge_id
    }

    /// Returns the badge with provenance and milestones.
    pub fn get_badge(env: Env, badge_id: u64) -> AchievementBadge {
        env.storage()
            .persistent()
            .get(&DataKey::Badge(badge_id))
            .unwrap_or_else(|| panic_with_error!(&env, CertError::BadgeNotFound))
    }

    /// Adds a completed course milestone to an existing badge.
    pub fn add_badge_milestone(env: Env, admin: Address, badge_id: u64, milestone: String) {
        admin.require_auth();
        let mut badge: AchievementBadge = Self::get_badge(env.clone(), badge_id);
        badge.add_milestone(&env, milestone);
        env.storage().persistent().set(&DataKey::Badge(badge_id), &badge);
    }

    /// Upgrades badge rarity tier after verifying prerequisite milestones.
    pub fn upgrade_badge_tier(
        env: Env,
        admin: Address,
        badge_id: u64,
        target_tier: RarityTier,
        new_metadata_uri: String,
    ) {
        admin.require_auth();
        let mut badge: AchievementBadge = Self::get_badge(env.clone(), badge_id);
        if let Err(e) = badge.upgrade_tier(&env, target_tier, new_metadata_uri) {
            panic_with_error!(&env, e);
        }
        env.storage().persistent().set(&DataKey::Badge(badge_id), &badge);
    }

    /// Strictly enforces soulbound non-transferability.
    pub fn transfer(env: Env, _from: Address, _to: Address, _badge_id: u64) {
        AchievementBadge::assert_transfer_blocked(&env);
    }

    /// Strictly enforces soulbound non-transferability.
    pub fn transfer_from(env: Env, _spender: Address, _from: Address, _to: Address, _badge_id: u64) {
        AchievementBadge::assert_transfer_blocked(&env);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;

    #[test]
    fn test_e2e_mint_and_royalty_calculation() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(CertificateNFTContract, ());
        let client = CertificateNFTContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let student = Address::generate(&env);
        let designer = Address::generate(&env);
        let course_id = String::from_str(&env, "CS101");
        let token_id = String::from_str(&env, "badge-cs101");

        client.mint_certificate(
            &admin,
            &student,
            &course_id,
            &String::from_str(&env, "A"),
            &String::from_str(&env, "ipfs://badge101"),
        );

        // Configure 5% (500 bps) royalty to designer
        client.set_token_royalty(&admin, &token_id, &designer, &500u32);

        // Check royalty on secondary sale of 10,000 stroops/units
        // 5% of 10_000 = 500
        let royalty = client.royalty_info(&token_id, &10_000u128);
        assert_eq!(royalty.recipient, Some(designer.clone()));
        assert_eq!(royalty.royalty_amount, 500u128);

        // Test update payout address
        let new_designer = Address::generate(&env);
        client.update_royalty_recipient(&token_id, &designer, &new_designer);

        let updated_royalty = client.royalty_info(&token_id, &20_000u128);
        assert_eq!(updated_royalty.recipient, Some(new_designer));
        assert_eq!(updated_royalty.royalty_amount, 1_000u128);
    }
}

#[cfg(test)]
mod test;
