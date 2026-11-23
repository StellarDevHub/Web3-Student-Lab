//! Sybil resistance registry.
//!
//! Requires verified identities, refundable stake, or an authorized institutional attestation
//! before downstream contracts allow an account to participate.

#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, Address,
    BytesN, Env,
};

pub mod attestation;
pub mod staking;

// ── Errors (SC-HARD-20: range 400+) ──────────────────────────────────────────

/// Typed contract errors for the sybil resistance registry.
///
/// Discriminants are in the `400+` range.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum SybilError {
    /// `460` — Contract has already been initialised.
    AlreadyInitialized = 460,
    /// `461` — Caller is not the admin.
    Unauthorized = 461,
    /// `462` — The target user is not currently verified.
    NotVerified = 462,
    /// `463` — Contract has not been initialised.
    NotInitialized = 463,
    /// `464` — Staking configuration is invalid or missing.
    InvalidStakingConfig = 464,
    /// `465` — Stake is below the configured security bond.
    InsufficientStake = 465,
    /// `466` — No stake is available for this operation.
    NoStake = 466,
    /// `467` — Stake cooling-off period has not elapsed.
    CoolingOffPeriod = 467,
    /// `468` — Invalid amount or time value.
    InvalidAmount = 468,
    /// `469` — Duplicate fraud evidence or account already banned.
    DuplicateEvidence = 469,
    /// `470` — User was banned after proven duplicate activity.
    UserBanned = 470,
    /// `471` — Institution is not authorized.
    UnauthorizedInstitution = 471,
    /// `472` — Attestation or chain is invalid.
    InvalidAttestation = 472,
    /// `473` — The attestation has expired.
    AttestationExpired = 473,
}

#[contracttype]
pub enum DataKey {
    Admin,
    VerifiedUser(Address),
    Reputation(Address),
    BannedUser(Address),
    StakeConfig,
    Stake(Address),
    Institution(Address),
    SupportedChain(u32),
    Attestation(Address),
    UsedAttestation(BytesN<32>),
    FraudEvidence(BytesN<32>),
    FraudReporter(Address),
}

#[contract]
pub struct SybilResistanceContract;

#[contractimpl]
impl SybilResistanceContract {
    /// Initializes the Sybil resistance registry with an admin.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, SybilError::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    /// Configure the refundable security bond and the destination for slashed funds.
    pub fn configure_staking(
        env: Env,
        admin: Address,
        token: Address,
        treasury: Address,
        minimum_stake: i128,
    ) {
        admin.require_auth();
        Self::require_admin(&env, &admin);
        if minimum_stake <= 0 || env.storage().instance().has(&DataKey::StakeConfig) {
            panic_with_error!(&env, SybilError::InvalidStakingConfig);
        }
        staking::configure(&env, token, treasury, minimum_stake);
    }

    /// Deposit or increase the user's refundable security bond.
    pub fn stake(env: Env, user: Address, amount: i128) {
        user.require_auth();
        staking::deposit(&env, &user, amount);
    }

    /// Start the mandatory 14-day cooling-off period for the user's full bond.
    pub fn request_withdrawal(env: Env, user: Address) -> u64 {
        user.require_auth();
        staking::request_withdrawal(&env, &user)
    }

    /// Withdraw the full bond after the cooling-off period.
    pub fn withdraw_stake(env: Env, user: Address) -> i128 {
        user.require_auth();
        staking::withdraw(&env, &user)
    }

    /// Return the current stake amount and withdrawal-unlock timestamp, if any.
    pub fn get_stake(env: Env, user: Address) -> Option<staking::StakePosition> {
        staking::get_stake(&env, &user)
    }

    /// Record confirmed duplicate activity and slash the user's entire stake.
    /// Only the admin or an authorized reporter can submit unique fraud evidence.
    pub fn slash_duplicate(env: Env, reporter: Address, user: Address, evidence_id: BytesN<32>) {
        reporter.require_auth();
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, SybilError::NotInitialized));
        let authorized = env
            .storage()
            .persistent()
            .get::<_, bool>(&DataKey::FraudReporter(reporter.clone()))
            .unwrap_or(false);
        if reporter != admin && !authorized {
            panic_with_error!(&env, SybilError::Unauthorized);
        }
        staking::slash_duplicate(&env, &user, evidence_id);
    }

    /// Enable or disable an institution authorized to attest to student identity.
    pub fn set_institution(env: Env, admin: Address, institution: Address, enabled: bool) {
        admin.require_auth();
        Self::require_admin(&env, &admin);
        attestation::set_institution(&env, institution, enabled);
    }

    /// Enable or disable a source chain accepted for institutional attestations.
    pub fn set_supported_chain(env: Env, admin: Address, chain_id: u32, enabled: bool) {
        admin.require_auth();
        Self::require_admin(&env, &admin);
        attestation::set_supported_chain(&env, chain_id, enabled);
    }

    /// Enable or disable an authorized fraud-detection reporter.
    pub fn set_fraud_reporter(env: Env, admin: Address, reporter: Address, enabled: bool) {
        admin.require_auth();
        Self::require_admin(&env, &admin);
        env.storage()
            .persistent()
            .set(&DataKey::FraudReporter(reporter), &enabled);
    }

    /// Submit a unique voucher authorized by an enabled institution on a supported chain.
    pub fn submit_attestation(
        env: Env,
        institution: Address,
        user: Address,
        chain_id: u32,
        voucher_id: BytesN<32>,
        valid_until: u64,
    ) {
        institution.require_auth();
        attestation::submit(&env, &institution, &user, chain_id, voucher_id, valid_until);
    }

    /// Revoke an existing attestation. Its issuing institution must authorize the revocation.
    pub fn revoke_attestation(env: Env, institution: Address, user: Address) {
        institution.require_auth();
        attestation::revoke(&env, &institution, &user);
    }

    /// Whether a user's institutional attestation is currently valid.
    pub fn has_valid_attestation(env: Env, user: Address) -> bool {
        attestation::is_valid(&env, &user)
    }

    /// True when the user is verified, holds sufficient active stake, or has a valid attestation.
    pub fn is_eligible(env: Env, user: Address) -> bool {
        if Self::is_banned(env.clone(), user.clone()) {
            return false;
        }
        Self::is_verified(env.clone(), user.clone())
            || staking::is_eligible(&env, &user)
            || attestation::is_valid(&env, &user)
    }

    /// Verifies a user's identity, granting them a base identity for voting.
    /// Only the admin (or a designated identity oracle) can call this.
    pub fn verify_user(env: Env, user: Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, SybilError::NotInitialized));
        admin.require_auth();
        if Self::is_banned(env.clone(), user.clone()) {
            panic_with_error!(&env, SybilError::UserBanned);
        }

        env.storage()
            .persistent()
            .set(&DataKey::VerifiedUser(user.clone()), &true);

        env.events().publish((symbol_short!("usr_vrfd"),), user);
    }

    /// Checks if a user has been verified as a unique human identity.
    pub fn is_verified(env: Env, user: Address) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::VerifiedUser(user))
            .unwrap_or(false)
    }

    /// Checks whether fraud detection permanently banned an account.
    pub fn is_banned(env: Env, user: Address) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::BannedUser(user))
            .unwrap_or(false)
    }

    /// Revokes a user's verified status if they are found to be a sybil account.
    pub fn revoke_user(env: Env, user: Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, SybilError::NotInitialized));
        admin.require_auth();

        if env
            .storage()
            .persistent()
            .has(&DataKey::VerifiedUser(user.clone()))
        {
            env.storage()
                .persistent()
                .remove(&DataKey::VerifiedUser(user.clone()));
            env.events().publish((symbol_short!("usr_rvkd"),), user);
        } else {
            panic_with_error!(&env, SybilError::NotVerified);
        }
    }

    /// Retrieves current reputation score after applying exponential time decay.
    pub fn get_reputation(env: Env, user: Address) -> u64 {
        reputation::get_reputation(&env, &user)
    }

    /// Adjusts user reputation score according to an action, capping at MAX_REPUTATION_SCORE
    /// and emitting a transparent adjustment event with a reasoning code.
    pub fn adjust_reputation(
        env: Env,
        user: Address,
        delta: i64,
        reason: reputation::ReputationReason,
    ) -> u64 {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, SybilError::NotInitialized));
        admin.require_auth();

        reputation::adjust_reputation(&env, user, delta, reason)
    }

    /// Applies time decay and commits the settled reputation score on-chain.
    pub fn settle_decay(env: Env, user: Address) -> u64 {
        reputation::settle_decay(&env, user)
    }

    /// Retrieves raw reputation record without auto-decay settlement.
    pub fn get_reputation_record(env: Env, user: Address) -> Option<reputation::ReputationRecord> {
        reputation::get_reputation_record(&env, &user)
    }

    fn require_admin(env: &Env, admin: &Address) {
        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, SybilError::NotInitialized));
        if stored_admin != *admin {
            panic_with_error!(env, SybilError::Unauthorized);
        }
    }
}

pub mod decay;
pub mod reputation;

#[cfg(test)]
mod test;
