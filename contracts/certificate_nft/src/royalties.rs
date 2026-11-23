//! # EIP-2981 Compatible Royalty Engine for NFT Badges
//!
//! Calculates creator royalties on secondary market sales and manages
//! creator payout addresses.

use soroban_sdk::{contracttype, Address, Env, String};

pub const BPS_DENOMINATOR: u128 = 10_000;
pub const MAX_ROYALTY_BPS: u32 = 5_000; // 50% max royalty

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RoyaltyInfo {
    pub recipient: Option<Address>,
    pub royalty_amount: u128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TokenRoyaltyConfig {
    pub recipient: Address,
    pub royalty_bps: u32,
}

#[contracttype]
#[derive(Clone)]
pub enum RoyaltyKey {
    Config(String),
}

pub struct Royalties;

impl Royalties {
    pub fn set_royalty_config(env: &Env, token_id: &String, recipient: &Address, royalty_bps: u32) {
        if royalty_bps > MAX_ROYALTY_BPS {
            panic!("Royalty percentage exceeds maximum cap");
        }
        let config = TokenRoyaltyConfig {
            recipient: recipient.clone(),
            royalty_bps,
        };
        env.storage()
            .persistent()
            .set(&RoyaltyKey::Config(token_id.clone()), &config);
    }

    pub fn update_payout_address(
        env: &Env,
        token_id: &String,
        current_recipient: &Address,
        new_recipient: &Address,
    ) {
        current_recipient.require_auth();
        let key = RoyaltyKey::Config(token_id.clone());
        let mut config: TokenRoyaltyConfig = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic!("Royalty config not found"));

        if config.recipient != *current_recipient {
            panic!("Unauthorized payout address update");
        }

        config.recipient = new_recipient.clone();
        env.storage().persistent().set(&key, &config);
    }

    pub fn get_royalty_config(env: &Env, token_id: &String) -> Option<TokenRoyaltyConfig> {
        env.storage()
            .persistent()
            .get(&RoyaltyKey::Config(token_id.clone()))
    }

    pub fn royalty_info(env: &Env, token_id: &String, sale_price: u128) -> RoyaltyInfo {
        if let Some(config) = Self::get_royalty_config(env, token_id) {
            let royalty_amount = (sale_price)
                .checked_mul(config.royalty_bps as u128)
                .and_then(|val| val.checked_div(BPS_DENOMINATOR))
                .unwrap_or(0);

            RoyaltyInfo {
                recipient: Some(config.recipient),
                royalty_amount,
            }
        } else {
            RoyaltyInfo {
                recipient: None,
                royalty_amount: 0,
            }
        }
    }
}
