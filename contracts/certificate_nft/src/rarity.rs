//! # Achievement Badge Rarity Tiers & Progression
//!
//! Provides strict milestone thresholds for Bronze, Silver, Gold, and Platinum tiers.

use soroban_sdk::contracttype;

/// Rarity tier for academic and hackathon achievement badges.
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum RarityTier {
    Bronze = 1,
    Silver = 2,
    Gold = 3,
    Platinum = 4,
}

impl RarityTier {
    /// Minimum required completed milestones to hold this tier.
    pub fn min_milestones(&self) -> u32 {
        match self {
            RarityTier::Bronze => 1,
            RarityTier::Silver => 3,
            RarityTier::Gold => 5,
            RarityTier::Platinum => 8,
        }
    }

    /// Validates whether an upgrade to `target` is valid given completed milestone count.
    pub fn can_upgrade_to(&self, target: RarityTier, completed_count: u32) -> bool {
        // Must be strictly higher tier
        if target <= *self {
            return false;
        }
        // Must meet target milestone threshold
        completed_count >= target.min_milestones()
    }
}
