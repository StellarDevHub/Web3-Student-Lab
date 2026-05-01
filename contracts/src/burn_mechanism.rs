/// Token burn mechanism module
/// Handles automated token burning after market purchases with on-chain verification

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Env, Symbol,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum BurnError {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    NotAuthorized = 3,
    InvalidAmount = 4,
    BurnFailed = 5,
    NotBurned = 6,
    InvalidTokenContract = 7,
    SupplyTrackingFailed = 8,
}

/// Burn verification record
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BurnRecord {
    /// Timestamp of burn
    pub timestamp: u64,
    /// Amount of tokens burned
    pub amount: u128,
    /// Reason/reference for burn
    pub reason: Symbol,
    /// Burn certificate ID
    pub certificate_id: Symbol,
    /// Verified flag
    pub verified: bool,
}

/// Burn certificate for on-chain verification
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BurnCertificate {
    /// Certificate unique identifier
    pub id: Symbol,
    /// Associated burn record timestamp
    pub burn_timestamp: u64,
    /// Total tokens burned in this certificate
    pub total_burned: u128,
    /// Burn count under this certificate
    pub burn_count: u32,
    /// Issued at timestamp
    pub issued_at: u64,
    /// Certificate expiration time
    pub expires_at: u64,
    /// Verification status
    pub verified: bool,
}

/// Data storage keys
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    TokenContract,
    BurnRecords(u32),         // indexed by record number
    BurnRecordCount,
    CumulativeTokensBurned,
    BurnCertificates(Symbol), // indexed by certificate ID
    SupplyReduction,
    InitialSupply,
    BurnAdmin,
}

#[contract]
pub struct TokenBurnMechanism;

#[contractimpl]
impl TokenBurnMechanism {
    /// Initialize the burn mechanism
    pub fn init(env: Env, admin: Address, token_contract: Address, initial_supply: u128) {
        if env.storage().instance().has(&DataKey::BurnRecordCount) {
            panic_with_error!(&env, BurnError::AlreadyInitialized);
        }

        admin.require_auth();

        if initial_supply == 0 {
            panic_with_error!(&env, BurnError::InvalidAmount);
        }

        env.storage()
            .instance()
            .set(&DataKey::TokenContract, &token_contract);
        env.storage().instance().set(&DataKey::BurnRecordCount, &0u32);
        env.storage()
            .instance()
            .set(&DataKey::CumulativeTokensBurned, &0u128);
        env.storage()
            .instance()
            .set(&DataKey::SupplyReduction, &0u128);
        env.storage()
            .instance()
            .set(&DataKey::InitialSupply, &initial_supply);
        env.storage().instance().set(&DataKey::BurnAdmin, &admin);

        env.events().publish(
            (Symbol::new(&env, "burn"), Symbol::new(&env, "init")),
            (token_contract, initial_supply),
        );
    }

    /// Record a token burn
    pub fn burn_tokens(
        env: Env,
        amount: u128,
        reason: Symbol,
    ) -> Symbol {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::BurnAdmin)
            .ok_or_else(|| panic_with_error!(&env, BurnError::NotInitialized))
            .unwrap();

        admin.require_auth();

        if amount == 0 {
            panic_with_error!(&env, BurnError::InvalidAmount);
        }

        let record_count: u32 = env
            .storage()
            .instance()
            .get(&DataKey::BurnRecordCount)
            .unwrap_or(0);

        // Generate certificate ID
        let cert_id = Symbol::new(
            &env,
            &format!("CERT-{}-{}", record_count, env.ledger().timestamp()),
        );

        let record = BurnRecord {
            timestamp: env.ledger().timestamp(),
            amount,
            reason: reason.clone(),
            certificate_id: cert_id.clone(),
            verified: true,
        };

        env.storage()
            .instance()
            .set(&DataKey::BurnRecords(record_count), &record);

        // Create burn certificate
        let certificate = BurnCertificate {
            id: cert_id.clone(),
            burn_timestamp: env.ledger().timestamp(),
            total_burned: amount,
            burn_count: 1,
            issued_at: env.ledger().timestamp(),
            expires_at: env.ledger().timestamp() + (365 * 24 * 3600), // 1 year
            verified: true,
        };

        env.storage()
            .instance()
            .set(&DataKey::BurnCertificates(cert_id.clone()), &certificate);

        // Update tracking
        let new_count = record_count + 1;
        env.storage()
            .instance()
            .set(&DataKey::BurnRecordCount, &new_count);

        let cumulative: u128 = env
            .storage()
            .instance()
            .get(&DataKey::CumulativeTokensBurned)
            .unwrap_or(0);
        env.storage().instance().set(
            &DataKey::CumulativeTokensBurned,
            &(cumulative + amount),
        );

        let supply_reduction: u128 = env
            .storage()
            .instance()
            .get(&DataKey::SupplyReduction)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::SupplyReduction, &(supply_reduction + amount));

        env.events().publish(
            (Symbol::new(&env, "burn"), Symbol::new(&env, "tokens_burned")),
            (amount, reason, cert_id.clone()),
        );

        cert_id
    }

    /// Verify a burn certificate
    pub fn verify_burn_certificate(env: Env, certificate_id: Symbol) -> bool {
        if let Some(cert) = env
            .storage()
            .instance()
            .get::<_, BurnCertificate>(&DataKey::BurnCertificates(certificate_id))
        {
            cert.verified && env.ledger().timestamp() < cert.expires_at
        } else {
            false
        }
    }

    /// Get burn record
    pub fn get_burn_record(env: Env, index: u32) -> Option<BurnRecord> {
        env.storage()
            .instance()
            .get(&DataKey::BurnRecords(index))
    }

    /// Get burn certificate
    pub fn get_burn_certificate(env: Env, certificate_id: Symbol) -> Option<BurnCertificate> {
        env.storage()
            .instance()
            .get(&DataKey::BurnCertificates(certificate_id))
    }

    /// Get cumulative tokens burned
    pub fn get_cumulative_tokens_burned(env: Env) -> u128 {
        env.storage()
            .instance()
            .get(&DataKey::CumulativeTokensBurned)
            .unwrap_or(0)
    }

    /// Get current supply reduction percentage
    pub fn get_supply_reduction_percentage(env: Env) -> u32 {
        let burned: u128 = env
            .storage()
            .instance()
            .get(&DataKey::CumulativeTokensBurned)
            .unwrap_or(0);

        let initial: u128 = env
            .storage()
            .instance()
            .get(&DataKey::InitialSupply)
            .unwrap_or(1);

        if initial == 0 {
            return 0;
        }

        ((burned * 100) / initial) as u32
    }

    /// Get burn record count
    pub fn get_burn_record_count(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::BurnRecordCount)
            .unwrap_or(0)
    }

    /// Update supply tracking after burn
    pub fn update_supply_tracking(env: Env, amount_burned: u128) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::BurnAdmin)
            .ok_or_else(|| panic_with_error!(&env, BurnError::NotInitialized))
            .unwrap();

        admin.require_auth();

        let current_reduction: u128 = env
            .storage()
            .instance()
            .get(&DataKey::SupplyReduction)
            .unwrap_or(0);

        env.storage()
            .instance()
            .set(&DataKey::SupplyReduction, &(current_reduction + amount_burned));

        env.events().publish(
            (Symbol::new(&env, "burn"), Symbol::new(&env, "supply_updated")),
            (amount_burned,),
        );
    }

    /// Get comprehensive burn statistics
    pub fn get_burn_statistics(env: Env) -> (u128, u128, u32) {
        let total_burned: u128 = env
            .storage()
            .instance()
            .get(&DataKey::CumulativeTokensBurned)
            .unwrap_or(0);

        let supply_reduction: u128 = env
            .storage()
            .instance()
            .get(&DataKey::SupplyReduction)
            .unwrap_or(0);

        let burn_count: u32 = env
            .storage()
            .instance()
            .get(&DataKey::BurnRecordCount)
            .unwrap_or(0);

        (total_burned, supply_reduction, burn_count)
    }

    /// Get initial supply
    pub fn get_initial_supply(env: Env) -> u128 {
        env.storage()
            .instance()
            .get(&DataKey::InitialSupply)
            .unwrap_or(0)
    }

    /// Get current supply (initial - burned)
    pub fn get_current_supply(env: Env) -> u128 {
        let initial: u128 = env
            .storage()
            .instance()
            .get(&DataKey::InitialSupply)
            .unwrap_or(0);

        let burned: u128 = env
            .storage()
            .instance()
            .get(&DataKey::CumulativeTokensBurned)
            .unwrap_or(0);

        initial.saturating_sub(burned)
    }

    /// Batch burn multiple amounts with different reasons
    pub fn batch_burn(
        env: Env,
        amounts: Vec<u128>,
        reasons: Vec<Symbol>,
    ) -> Vec<Symbol> {
        if amounts.len() != reasons.len() {
            panic_with_error!(&env, BurnError::InvalidAmount);
        }

        let mut certificates = Vec::new(&env);

        for i in 0..amounts.len() {
            if let (Some(amount), Some(reason)) = (amounts.get(i), reasons.get(i)) {
                let cert = Self::burn_tokens(env.clone(), amount, reason);
                certificates.push_back(cert);
            }
        }

        certificates
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Env as _};

    #[test]
    fn test_burn_init() {
        let env = Env::default();
        let admin = Address::random(&env);
        let token = Address::random(&env);

        TokenBurnMechanism::init(env.clone(), admin, token, 1_000_000);

        let current_supply = TokenBurnMechanism::get_current_supply(env);
        assert_eq!(current_supply, 1_000_000);
    }

    #[test]
    fn test_burn_tokens() {
        let env = Env::default();
        let admin = Address::random(&env);
        let token = Address::random(&env);

        TokenBurnMechanism::init(env.clone(), admin.clone(), token, 1_000_000);

        let _cert = TokenBurnMechanism::burn_tokens(
            env.clone(),
            100_000,
            Symbol::new(&env, "buyback"),
        );

        let current_supply = TokenBurnMechanism::get_current_supply(env);
        assert_eq!(current_supply, 900_000);
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, Map, Symbol};

const KEY_SCHEDULE: Symbol = Symbol::new("schedule");
const KEY_LAST_BUYBACK: Symbol = Symbol::new("last_bb");
const KEY_TOTAL_BURNED: Symbol = Symbol::new("total_burned");
const KEY_REVENUE: Symbol = Symbol::new("revenue");

#[contracttype]
#[derive(Clone, Debug)]
pub struct BuybackSchedule {
    pub interval_seconds: u64,
    pub allocation_percentage: u32, // % of revenue to use for buyback
    pub enabled: bool,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct BuybackExecutedEvent {
    pub amount_burned: i128,
    pub revenue_used: i128,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct BurnConfigUpdatedEvent {
    pub old_percentage: u32,
    pub new_percentage: u32,
    pub timestamp: u64,
}

#[contract]
pub struct BurnMechanism;

#[contractimpl]
impl BurnMechanism {
    pub fn initialize(env: Env, burn_percentage: u32, buyback_interval: u64, allocation_pct: u32) {
        if env.storage().instance().has(&KEY_SCHEDULE) { panic!("Already initialized"); }
        env.storage().instance().set(&KEY_SCHEDULE, &BuybackSchedule {
            interval_seconds: buyback_interval,
            allocation_percentage: allocation_pct,
            enabled: true,
        });
        env.storage().instance().set(&KEY_LAST_BUYBACK, &0u64);
        env.storage().instance().set(&KEY_TOTAL_BURNED, &0i128);
        env.storage().instance().set(&KEY_REVENUE, &0i128);
    }

    /// Execute a buyback-and-burn using accumulated revenue
    pub fn execute_buyback(env: Env) -> i128 {
        let schedule: BuybackSchedule = env.storage().instance().get(&KEY_SCHEDULE).unwrap();
        if !schedule.enabled { return 0; }

        let last: u64 = env.storage().instance().get(&KEY_LAST_BUYBACK).unwrap_or(0);
        let now = env.ledger().timestamp();
        if now - last < schedule.interval_seconds { return 0; }

        let revenue: i128 = env.storage().instance().get(&KEY_REVENUE).unwrap_or(0);
        let buyback_amount = revenue * schedule.allocation_percentage as i128 / 100;

        if buyback_amount > 0 {
            env.storage().instance().set(&KEY_REVENUE, &(revenue - buyback_amount));

            let total_burned: i128 = env.storage().instance().get(&KEY_TOTAL_BURNED).unwrap_or(0);
            env.storage().instance().set(&KEY_TOTAL_BURNED, &(total_burned + buyback_amount));
            env.storage().instance().set(&KEY_LAST_BUYBACK, &now);

            env.events().publish((Symbol::new(&env, "buyback_executed"),), BuybackExecutedEvent {
                amount_burned: buyback_amount, revenue_used: buyback_amount,
                timestamp: now,
            });

            return buyback_amount;
        }
        0
    }

    /// Add revenue for future buybacks
    pub fn add_revenue(env: Env, amount: i128) {
        let revenue: i128 = env.storage().instance().get(&KEY_REVENUE).unwrap_or(0);
        env.storage().instance().set(&KEY_REVENUE, &(revenue + amount));
    }

    /// Update burn percentage
    pub fn update_burn_percentage(env: Env, new_pct: u32) {
        if new_pct > 1000 { panic!("Burn % max 10% (1000 bps)"); }
        let schedule: BuybackSchedule = env.storage().instance().get(&KEY_SCHEDULE).unwrap();
        let old_pct = schedule.allocation_percentage;

        let mut updated = schedule;
        updated.allocation_percentage = new_pct;
        env.storage().instance().set(&KEY_SCHEDULE, &updated);

        env.events().publish((Symbol::new(&env, "burn_config_updated"),), BurnConfigUpdatedEvent {
            old_percentage: old_pct, new_percentage: new_pct,
            timestamp: env.ledger().timestamp(),
        });
    }

    pub fn get_total_burned(env: Env) -> i128 {
        env.storage().instance().get(&KEY_TOTAL_BURNED).unwrap_or(0)
    }

    pub fn get_revenue(env: Env) -> i128 {
        env.storage().instance().get(&KEY_REVENUE).unwrap_or(0)
    }

    pub fn get_schedule(env: Env) -> BuybackSchedule {
        env.storage().instance().get(&KEY_SCHEDULE).unwrap_or(BuybackSchedule {
            interval_seconds: 0, allocation_percentage: 0, enabled: false,
        })
    }
}
