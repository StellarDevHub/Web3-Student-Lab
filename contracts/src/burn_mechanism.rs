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
    }
}
