/// Token buyback program module
/// Handles automated token buyback configuration, frequency scheduling, and treasury management

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Env, Symbol,
    Vec, U128,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum BuybackError {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    NotAuthorized = 3,
    InvalidPercentage = 4,
    InvalidFrequency = 5,
    InvalidLimits = 6,
    InsufficientTreasury = 7,
    BuybackNotDue = 8,
    InvalidAmount = 9,
    TransactionFailed = 10,
}

/// Buyback configuration settings
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BuybackConfig {
    /// Percentage of revenue allocated to buyback (0-100)
    pub revenue_percentage: u32,
    /// Frequency of buyback in seconds
    pub frequency: u64,
    /// Minimum amount that triggers a buyback
    pub min_buyback_amount: u128,
    /// Maximum amount per buyback transaction
    pub max_buyback_amount: u128,
    /// Owner/administrator of the buyback program
    pub admin: Address,
    /// DEX contract address for purchasing tokens
    pub dex_contract: Address,
    /// Treasury address holding accumulated revenue
    pub treasury: Address,
    /// Enabled flag
    pub enabled: bool,
}

/// Buyback execution record
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BuybackRecord {
    /// Timestamp of buyback execution
    pub timestamp: u64,
    /// Amount of stablecoin/currency used for purchase
    pub purchase_amount: u128,
    /// Amount of tokens purchased
    pub tokens_purchased: u128,
    /// Price per token at time of purchase
    pub price_per_token: u128,
    /// Transaction hash/ID
    pub transaction_id: Symbol,
}

/// Data storage keys
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    BuybackConfig,
    LastBuybackTime,
    BuybackHistory(u32),     // indexed by record number
    BuybackCount,
    TreasuryBalance,
    CumulativeTokensBought,
}

#[contract]
pub struct TokenBuyback;

#[contractimpl]
impl TokenBuyback {
    /// Initialize the buyback program with configuration
    pub fn init(
        env: Env,
        admin: Address,
        dex_contract: Address,
        treasury: Address,
        revenue_percentage: u32,
        frequency: u64,
        min_buyback_amount: u128,
        max_buyback_amount: u128,
    ) {
        if env.storage().instance().has(&DataKey::BuybackConfig) {
            panic_with_error!(&env, BuybackError::AlreadyInitialized);
        }

        admin.require_auth();

        if revenue_percentage > 100 {
            panic_with_error!(&env, BuybackError::InvalidPercentage);
        }

        if frequency == 0 {
            panic_with_error!(&env, BuybackError::InvalidFrequency);
        }

        if min_buyback_amount > max_buyback_amount {
            panic_with_error!(&env, BuybackError::InvalidLimits);
        }

        let config = BuybackConfig {
            revenue_percentage,
            frequency,
            min_buyback_amount,
            max_buyback_amount,
            admin: admin.clone(),
            dex_contract,
            treasury,
            enabled: true,
        };

        env.storage().instance().set(&DataKey::BuybackConfig, &config);
        env.storage()
            .instance()
            .set(&DataKey::LastBuybackTime, &env.ledger().timestamp());
        env.storage().instance().set(&DataKey::BuybackCount, &0u32);
        env.storage()
            .instance()
            .set(&DataKey::TreasuryBalance, &0u128);
        env.storage()
            .instance()
            .set(&DataKey::CumulativeTokensBought, &0u128);

        env.events().publish(
            (Symbol::new(&env, "buyback"), Symbol::new(&env, "init")),
            (admin, revenue_percentage, frequency),
        );
    }

    /// Update buyback configuration (admin only)
    pub fn update_config(
        env: Env,
        revenue_percentage: u32,
        frequency: u64,
        min_buyback_amount: u128,
        max_buyback_amount: u128,
    ) {
        let mut config: BuybackConfig = env
            .storage()
            .instance()
            .get(&DataKey::BuybackConfig)
            .ok_or_else(|| panic_with_error!(&env, BuybackError::NotInitialized))
            .unwrap();

        config.admin.require_auth();

        if revenue_percentage > 100 {
            panic_with_error!(&env, BuybackError::InvalidPercentage);
        }

        if frequency == 0 {
            panic_with_error!(&env, BuybackError::InvalidFrequency);
        }

        if min_buyback_amount > max_buyback_amount {
            panic_with_error!(&env, BuybackError::InvalidLimits);
        }

        config.revenue_percentage = revenue_percentage;
        config.frequency = frequency;
        config.min_buyback_amount = min_buyback_amount;
        config.max_buyback_amount = max_buyback_amount;

        env.storage().instance().set(&DataKey::BuybackConfig, &config);

        env.events().publish(
            (Symbol::new(&env, "buyback"), Symbol::new(&env, "config_updated")),
            (revenue_percentage, frequency, min_buyback_amount, max_buyback_amount),
        );
    }

    /// Get current buyback configuration
    pub fn get_config(env: Env) -> BuybackConfig {
        env.storage()
            .instance()
            .get(&DataKey::BuybackConfig)
            .ok_or_else(|| panic_with_error!(&env, BuybackError::NotInitialized))
            .unwrap()
    }

    /// Enable or disable buyback program
    pub fn set_enabled(env: Env, enabled: bool) {
        let mut config: BuybackConfig = env
            .storage()
            .instance()
            .get(&DataKey::BuybackConfig)
            .ok_or_else(|| panic_with_error!(&env, BuybackError::NotInitialized))
            .unwrap();

        config.admin.require_auth();
        config.enabled = enabled;

        env.storage().instance().set(&DataKey::BuybackConfig, &config);

        env.events().publish(
            (Symbol::new(&env, "buyback"), Symbol::new(&env, "enabled_changed")),
            (enabled,),
        );
    }

    /// Deposit revenue to treasury
    pub fn deposit_revenue(env: Env, amount: u128) {
        if amount == 0 {
            panic_with_error!(&env, BuybackError::InvalidAmount);
        }

        let current_balance: u128 = env
            .storage()
            .instance()
            .get(&DataKey::TreasuryBalance)
            .unwrap_or(0);
        let new_balance = current_balance + amount;

        env.storage()
            .instance()
            .set(&DataKey::TreasuryBalance, &new_balance);

        env.events().publish(
            (Symbol::new(&env, "buyback"), Symbol::new(&env, "revenue_deposited")),
            (amount,),
        );
    }

    /// Check if buyback is due based on frequency
    pub fn is_buyback_due(env: Env) -> bool {
        let config: BuybackConfig = env
            .storage()
            .instance()
            .get(&DataKey::BuybackConfig)
            .ok_or_else(|| panic_with_error!(&env, BuybackError::NotInitialized))
            .unwrap();

        if !config.enabled {
            return false;
        }

        let last_buyback: u64 = env
            .storage()
            .instance()
            .get(&DataKey::LastBuybackTime)
            .unwrap_or(0);
        let current_time = env.ledger().timestamp();

        current_time >= last_buyback + config.frequency
    }

    /// Record a buyback transaction
    pub fn record_buyback(
        env: Env,
        purchase_amount: u128,
        tokens_purchased: u128,
        transaction_id: Symbol,
    ) {
        let config: BuybackConfig = env
            .storage()
            .instance()
            .get(&DataKey::BuybackConfig)
            .ok_or_else(|| panic_with_error!(&env, BuybackError::NotInitialized))
            .unwrap();

        config.admin.require_auth();

        if purchase_amount == 0 || tokens_purchased == 0 {
            panic_with_error!(&env, BuybackError::InvalidAmount);
        }

        let treasury_balance: u128 = env
            .storage()
            .instance()
            .get(&DataKey::TreasuryBalance)
            .unwrap_or(0);

        if treasury_balance < purchase_amount {
            panic_with_error!(&env, BuybackError::InsufficientTreasury);
        }

        // Calculate price per token
        let price_per_token = if tokens_purchased > 0 {
            purchase_amount / tokens_purchased
        } else {
            0
        };

        let record = BuybackRecord {
            timestamp: env.ledger().timestamp(),
            purchase_amount,
            tokens_purchased,
            price_per_token,
            transaction_id,
        };

        let record_count: u32 = env
            .storage()
            .instance()
            .get(&DataKey::BuybackCount)
            .unwrap_or(0);

        env.storage()
            .instance()
            .set(&DataKey::BuybackHistory(record_count), &record);

        // Update tracking
        let new_count = record_count + 1;
        env.storage()
            .instance()
            .set(&DataKey::BuybackCount, &new_count);

        let new_balance = treasury_balance - purchase_amount;
        env.storage()
            .instance()
            .set(&DataKey::TreasuryBalance, &new_balance);

        let cumulative: u128 = env
            .storage()
            .instance()
            .get(&DataKey::CumulativeTokensBought)
            .unwrap_or(0);
        env.storage().instance().set(
            &DataKey::CumulativeTokensBought,
            &(cumulative + tokens_purchased),
        );

        env.storage()
            .instance()
            .set(&DataKey::LastBuybackTime, &env.ledger().timestamp());

        env.events().publish(
            (Symbol::new(&env, "buyback"), Symbol::new(&env, "buyback_executed")),
            (purchase_amount, tokens_purchased, price_per_token),
        );
    }

    /// Get buyback history record
    pub fn get_buyback_record(env: Env, index: u32) -> Option<BuybackRecord> {
        env.storage()
            .instance()
            .get(&DataKey::BuybackHistory(index))
    }

    /// Get buyback history count
    pub fn get_buyback_count(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::BuybackCount)
            .unwrap_or(0)
    }

    /// Get treasury balance
    pub fn get_treasury_balance(env: Env) -> u128 {
        env.storage()
            .instance()
            .get(&DataKey::TreasuryBalance)
            .unwrap_or(0)
    }

    /// Get cumulative tokens purchased
    pub fn get_cumulative_tokens_bought(env: Env) -> u128 {
        env.storage()
            .instance()
            .get(&DataKey::CumulativeTokensBought)
            .unwrap_or(0)
    }

    /// Get last buyback time
    pub fn get_last_buyback_time(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::LastBuybackTime)
            .unwrap_or(0)
    }

    /// Get buyback statistics
    pub fn get_statistics(env: Env) -> (u128, u128, u32) {
        let total_spent: u128 = {
            let count: u32 = env
                .storage()
                .instance()
                .get(&DataKey::BuybackCount)
                .unwrap_or(0);
            let mut total = 0u128;
            for i in 0..count {
                if let Some(record) = env.storage().instance().get::<_, BuybackRecord>(&DataKey::BuybackHistory(i)) {
                    total += record.purchase_amount;
                }
            }
            total
        };

        let tokens_bought: u128 = env
            .storage()
            .instance()
            .get(&DataKey::CumulativeTokensBought)
            .unwrap_or(0);

        let buyback_count: u32 = env
            .storage()
            .instance()
            .get(&DataKey::BuybackCount)
            .unwrap_or(0);

        (total_spent, tokens_bought, buyback_count)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Env as _};

    #[test]
    fn test_buyback_init() {
        let env = Env::default();
        let admin = Address::random(&env);
        let dex = Address::random(&env);
        let treasury = Address::random(&env);

        TokenBuyback::init(
            env.clone(),
            admin.clone(),
            dex,
            treasury,
            10,    // 10% revenue
            86400, // Daily frequency
            1000,
            10000,
        );

        let config = TokenBuyback::get_config(env);
        assert_eq!(config.revenue_percentage, 10);
        assert_eq!(config.frequency, 86400);
    }
}
