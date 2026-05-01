use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Env, String, Address, Map, Symbol};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RarityTier {
    Common = 0,
    Uncommon = 1,
    Rare = 2,
    Epic = 3,
    Legendary = 4,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RarityData {
    pub score: u32,
    pub tier: RarityTier,
    pub verified: bool,
    pub developer_attestation: Option<Address>,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    AssetRarity(u32), // asset_id -> RarityData
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum RarityError {
    NotAuthorized = 1,
    AssetNotFound = 2,
}

#[contract]
pub struct RarityValidatorContract;

#[contractimpl]
impl RarityValidatorContract {
    pub fn init(env: Env, admin: Address) {
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    pub fn calculate_rarity(env: Env, asset_id: u32, base_score: u32, traits: Map<String, u32>) -> RarityData {
        let mut total_score = base_score;
        for (_trait_name, value) in traits.iter() {
            total_score += value;
        }

        let tier = if total_score >= 1000 {
            RarityTier::Legendary
        } else if total_score >= 750 {
            RarityTier::Epic
        } else if total_score >= 400 {
            RarityTier::Rare
        } else if total_score >= 150 {
            RarityTier::Uncommon
        } else {
            RarityTier::Common
        };

        let rarity_data = RarityData {
            score: total_score,
            tier: tier.clone(),
            verified: false,
            developer_attestation: None,
        };

        env.storage().instance().set(&DataKey::AssetRarity(asset_id), &rarity_data);
        env.events().publish((Symbol::new(&env, "RarityCalculated"),), (asset_id, total_score, tier as u32));
        
        rarity_data
    }

    pub fn attest_by_developer(env: Env, developer: Address, asset_id: u32) {
        developer.require_auth();
        
        let mut rarity_data: RarityData = env.storage().instance().get(&DataKey::AssetRarity(asset_id)).unwrap_or_else(|| {
            soroban_sdk::panic_with_error!(&env, RarityError::AssetNotFound)
        });

        rarity_data.verified = true;
        rarity_data.developer_attestation = Some(developer.clone());

        env.storage().instance().set(&DataKey::AssetRarity(asset_id), &rarity_data);
        env.events().publish((Symbol::new(&env, "Attested"),), (asset_id, developer));
    }

    pub fn get_rarity(env: Env, asset_id: u32) -> RarityData {
        env.storage().instance().get(&DataKey::AssetRarity(asset_id)).unwrap_or_else(|| {
            soroban_sdk::panic_with_error!(&env, RarityError::AssetNotFound)
        })
    }
}
