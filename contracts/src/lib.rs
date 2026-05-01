//! Certificate contract with 2-of-3 governance multisig, RBAC, pause, and WASM upgrade
//! through governance proposals (`PendingAdminAction::Upgrade`).
//!
//! **Upgrade risks:** Malicious WASM can replace authorization logic or corrupt storage
//! expectations; compromised governance keys imply full contract takeover. Audit bytecode,
//! test migrations, and prefer timelocks where applicable.

#![no_std]

pub mod admin;
pub mod distribution_manager;
pub mod dex_aggregator;
pub mod enrollment;
pub mod events;
pub mod activity_log;
pub mod statistics;
pub mod membership_nft;
pub mod payment_gateway;
pub mod paymaster;
pub mod reputation_system;
pub mod revocation;
pub mod royalty_splitter;
pub mod route_optimizer;
pub mod scoring_algorithm;
pub mod smart_wallet;
pub mod sai_wrapper;
pub mod session;
pub mod staking;
pub mod token_gated_access;
pub mod verification;
pub mod subscription_service;
pub mod recurring_payments;
pub mod sybil_resistance;
pub mod quadratic_voting;
// Fuzz module uses `std` and legacy Soroban test patterns; keep out of the default test build
// until it is refreshed for the current SDK (`sequence_number`, token `mint` arity, etc.).
// #[cfg(test)]
// pub mod fuzz;
pub mod token;
pub mod savings_wallet;
pub mod interest_accrual;
pub mod blogging_platform;
pub mod content_monetization;
pub mod carbon_credit_platform;
pub mod verification_system;
pub mod job_board;
pub mod skill_verification;
pub mod timestamping;
pub mod file_notarization;
pub mod reward_points;
pub mod points_conversion;

use crate::revocation::{CertificateState, CertificateStatus, RevocationReason, RevocationRecord};
use crate::token::RsTokenContractClient;
use crate::verification::{CertificateMetadata, VerificationResult};
use crate::events::EventRecorder;
use crate::activity_log::{ActivityLogManager, EventType as LogEventType};
use soroban_sdk::xdr::ToXdr;
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Bytes, BytesN,
    Env, String, Symbol, Vec,
};

use crate::blogging_platform::{BlogPost, Comment, ReactionType, PostMetrics, BloggingPlatform};
use crate::content_monetization::{AccessType, Earnings, ContentMonetization};
use crate::job_board::{Job, JobApplication, Milestone, JobBoard};
use crate::skill_verification::{SkillAttestation, SkillVerification};

/// Issued certificate record.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Certificate {
    pub course_symbol: Symbol,
    pub student: Address,
    pub course_name: String,
    pub issue_date: u64,
    pub did: Option<String>,
    pub revoked: bool,
    pub grade: Option<String>,
}

/// RBAC roles. `Admin` here means **governance multisig member** (one of the three init addresses).
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Role {
    Admin,
    Instructor,
    Student,
}

/// Configuration changes that require **2-of-3** governance approvals.
#[contracttype]
#[derive(Clone)]
pub enum PendingAdminAction {
    SetMintCap(u32),
    Upgrade(BytesN<32>),
}

#[contracttype]
#[derive(Clone)]
pub struct AdminProposal {
    pub action: PendingAdminAction,
    /// Bit *i* set if governance admin index *i* has approved (including the proposer).
    pub approval_mask: u32,
}

/// W3C-compliant Decentralized Identifier (DID) stored for each student.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StudentDid {
    pub student: Address,
    pub did: String,
    pub updated_at: u64,
}

/// Recipient data for batch minting operations.
#[contracttype]
#[derive(Clone, Debug)]
pub struct RecipientData {
    pub address: Address,
    pub course_symbol: Symbol,
    pub grade: Option<String>,
}

#[contracttype]
#[derive(Clone)]
pub struct CertKey {
    pub course_symbol: Symbol,
    pub student: Address,
}

#[contracttype]
#[derive(Clone)]
pub struct StudentCertificatesKey {
    pub student: Address,
}

#[contracttype]
#[derive(Clone)]
pub struct MetaTxCallData {
    pub instructor: Address,
    pub course_symbol: Symbol,
    pub student: Address,
    pub course_name: String,
    pub nonce: u64,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    GovernanceAdmins,
    MintCap,
    MintedThisPeriod,
    CurrentPeriod,
    StudentDid(Address),
    NextProposalId,
    Proposal(u64),
    Paused,
    /// Optional RS-Token contract to mirror pause onto minting.
    PauseTokenContract,
    Role(Address),
    Locked,
    /// Certificate state tracking (status, revocation, reissuance).
    CertificateState(u128),
    /// Revocation records for audit trail (token_id -> Vec<RevocationRecord>).
    RevocationHistory(u128),
    /// Next certificate token ID counter for reissuance tracking.
    NextTokenId,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum CertError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    CertificateNotFound = 4,
    MintCapExceeded = 5,
    InvalidMintCap = 6,
    InvalidDid = 7,
    DidNotFound = 8,
    ContractPaused = 9,
    NotInstructor = 10,
    InvalidProposal = 11,
    AlreadyApproved = 12,
    InvalidGovernanceSetup = 13,
    CannotGrantAdminRole = 14,
    CannotRevokeProtectedInstructor = 15,
    InvalidSignature = 16,
    InvalidAmount = 17,
    StringTooLong = 18,
    InvalidCharacter = 19,
    Reentrant = 20,
    /// Certificate already revoked.
    AlreadyRevoked = 21,
    /// Invalid revocation reason provided.
    InvalidRevocationReason = 22,
    /// Certificate is no longer valid (revoked or superseded).
    CertificateInvalid = 23,
    /// Attempted to reissue a non-existent certificate.
    CannotReissueNonExistent = 24,
    /// Sybil verification failed (duplicate DID or address).
    SybilVerificationFailed = 25,
    /// Insufficient governance credits for quadratic voting.
    InsufficientGovernanceCredits = 26,
    /// Proposal has expired or is not active.
    ProposalExpired = 27,
    /// Proposal has already been executed.
    ProposalAlreadyExecuted = 28,
}

const DEFAULT_MINT_CAP: u32 = 1000;
const LEDGERS_PER_PERIOD: u32 = 17280;
const GOVERNANCE_THRESHOLD: u32 = 2;
const GOVERNANCE_ADMIN_COUNT: u32 = 3;
/// ~1 year in ledgers (5-second ledger close time).
const CERT_TTL_LEDGERS: u32 = 6_307_200;
/// Maximum batch size for minting operations (gas optimization limit).
const MAX_BATCH_SIZE: u32 = 100;
/// Maximum gas budget per batch operation (10M gas).
/// This constant is kept for documentation purposes.
#[allow(dead_code)]
const MAX_GAS_PER_BATCH: u64 = 10_000_000;

/// Current event schema version. Bump this when any event topic or payload changes.
///
/// ## v1 Event Schema
///
/// | Topic (Symbol)                | Data payload                                      |
/// |-------------------------------|---------------------------------------------------|
/// | `v1_role_granted`             | `(caller: Address, account: Address, role: Role)` |
/// | `v1_role_revoked`             | `(caller: Address, account: Address)`             |
/// | `v1_pause_updated`            | `(caller: Address, paused: bool)`                 |
/// | `v1_action_proposed`          | `(caller: Address, proposal_id: u64)`             |
/// | `v1_action_approved`          | `(caller: Address, proposal_id: u64)`             |
/// | `v1_action_executed`          | `(caller: Address, proposal_id: u64)`             |
/// | `v1_mint_cap_updated`         | `(old_cap: u32, new_cap: u32)`                    |
/// | `v1_cert_issued`              | `(student: Address, course_name: String)`         |
/// | `v1_mint_period_update`       | `(period: u32, count: u32)`                       |
/// | `v1_batch_cert_issued`        | `(student: Address, course_name: String)`         |
/// | `v1_batch_issue_completed`    | `(instructor: Address, count: u32, course: String)` |
/// | `v1_cert_revoked`             | `(caller: Address, student: Address)`             |
/// | `v1_meta_tx_issued`           | `(instructor: Address, student: Address, course_name: String)` |
/// | `v1_did_updated`              | `(caller: Address, did: String, timestamp: u64)`  |
/// | `v1_did_removed`              | `(caller: Address, student: Address)`             |
/// | `v2_certificate_revoked`      | `(token_id: u128, revoked_by: Address, reason: String)` |
/// | `v2_certificate_verified`     | `(token_id: u128, is_valid: bool, status: String)` |
/// | `v2_certificate_reissued`     | `(old_token_id: u128, new_token_id: u128, reason: String)` |
pub const EVENT_VERSION: u32 = 1;

const NONCE_PREFIX: &str = "nonce";

#[contract]
pub struct CertificateContract;

#[contractimpl]
impl CertificateContract {
    /// Initialize with exactly three governance admin addresses (2-of-3 multisig for sensitive actions).
    /// Each governance admin is granted the **Instructor** role so they can issue certificates.
    pub fn init(env: Env, admin_a: Address, admin_b: Address, admin_c: Address) {
        if env.storage().instance().has(&DataKey::GovernanceAdmins) {
            panic_with_error!(&env, CertError::AlreadyInitialized);
        }

        let mut admins: Vec<Address> = Vec::new(&env);
        admins.push_back(admin_a.clone());
        admins.push_back(admin_b.clone());
        admins.push_back(admin_c.clone());

        if admins.len() != GOVERNANCE_ADMIN_COUNT {
            panic_with_error!(&env, CertError::InvalidGovernanceSetup);
        }

        env.storage()
            .instance()
            .set(&DataKey::GovernanceAdmins, &admins);
        env.storage()
            .instance()
            .set(&DataKey::MintCap, &DEFAULT_MINT_CAP);

        let current_ledger = env.ledger().sequence();
        env.storage()
            .instance()
            .set(&DataKey::MintedThisPeriod, &0u32);
        env.storage().instance().set(
            &DataKey::CurrentPeriod,
            &(current_ledger / LEDGERS_PER_PERIOD),
        );
        env.storage().instance().set(&DataKey::Paused, &false);
        env.storage()
            .instance()
            .set(&DataKey::NextProposalId, &0u64);

        for admin in admins.iter() {
            env.storage()
                .instance()
                .set(&DataKey::Role(admin.clone()), &Role::Instructor);
        }
    }

    /// Returns the current event schema version. Indexers should use this to select the
    /// correct topic prefix when subscribing to contract events.
    pub fn get_event_version(_env: Env) -> u32 {
        EVENT_VERSION
    }

    fn governance_admins(env: &Env) -> Vec<Address> {
        env.storage()
            .instance()
            .get(&DataKey::GovernanceAdmins)
            .unwrap_or_else(|| panic_with_error!(env, CertError::NotInitialized))
    }

    fn governance_admin_index(env: &Env, addr: &Address) -> Option<u32> {
        let admins = Self::governance_admins(env);
        (0..admins.len()).find(|&i| admins.get(i).unwrap() == *addr)
    }

    fn require_governance_admin(env: &Env, caller: &Address) {
        if Self::governance_admin_index(env, caller).is_none() {
            panic_with_error!(env, CertError::Unauthorized);
        }
    }

    fn require_not_paused(env: &Env) {
        let paused: bool = env
            .storage()
            .instance()
            .get(&DataKey::Paused)
            .unwrap_or(false);
        if paused {
            panic_with_error!(env, CertError::ContractPaused);
        }
    }

    fn require_instructor(env: &Env, caller: &Address) {
        let role: Option<Role> = env.storage().instance().get(&DataKey::Role(caller.clone()));
        if role != Some(Role::Instructor) {
            panic_with_error!(env, CertError::NotInstructor);
        }
    }

    /// Acquire the reentrancy lock. Panics with `Reentrant` if already locked.
    fn acquire_lock(env: &Env) {
        if env
            .storage()
            .instance()
            .get(&DataKey::Locked)
            .unwrap_or(false)
        {
            panic_with_error!(env, CertError::Reentrant);
        }
        env.storage().instance().set(&DataKey::Locked, &true);
    }

    /// Release the reentrancy lock.
    fn release_lock(env: &Env) {
        env.storage().instance().set(&DataKey::Locked, &false);
    }

    fn check_and_update_mint_tracking(env: &Env) -> u32 {
        let current_ledger = env.ledger().sequence();
        let current_period = current_ledger / LEDGERS_PER_PERIOD;

        let stored_period: u32 = env
            .storage()
            .instance()
            .get(&DataKey::CurrentPeriod)
            .unwrap_or(0);

        if current_period > stored_period {
            env.storage()
                .instance()
                .set(&DataKey::MintedThisPeriod, &0u32);
            env.storage()
                .instance()
                .set(&DataKey::CurrentPeriod, &current_period);
        }

        let minted_this_period: u32 = env
            .storage()
            .instance()
            .get(&DataKey::MintedThisPeriod)
            .unwrap_or(0);

        let mint_cap: u32 = env
            .storage()
            .instance()
            .get(&DataKey::MintCap)
            .unwrap_or(DEFAULT_MINT_CAP);

        mint_cap.saturating_sub(minted_this_period)
    }

    fn record_mint(env: &Env, count: u32) {
        let minted_this_period: u32 = env
            .storage()
            .instance()
            .get(&DataKey::MintedThisPeriod)
            .unwrap_or(0);

        let new_minted = minted_this_period.saturating_add(count);
        let mint_cap: u32 = env
            .storage()
            .instance()
            .get(&DataKey::MintCap)
            .unwrap_or(DEFAULT_MINT_CAP);

        if new_minted > mint_cap {
            panic_with_error!(env, CertError::MintCapExceeded);
        }

        env.storage()
            .instance()
            .set(&DataKey::MintedThisPeriod, &new_minted);
    }

    fn persist_certificate(env: &Env, cert: &Certificate) {
        let key = CertKey {
            course_symbol: cert.course_symbol.clone(),
            student: cert.student.clone(),
        };

        env.storage().persistent().set(&key, cert);
        env.storage()
            .persistent()
            .extend_ttl(&key, CERT_TTL_LEDGERS, CERT_TTL_LEDGERS);

        Self::index_certificate_for_student(env, &cert.student, &cert.course_symbol);
    }

    fn load_student_did(env: &Env, student: &Address) -> Option<String> {
        let current_did: Option<StudentDid> = env
            .storage()
            .persistent()
            .get(&DataKey::StudentDid(student.clone()));

        current_did.map(|entry| entry.did)
    }

    fn sync_did_to_student_certificates(env: &Env, student: &Address, did: Option<String>) {
        let index_key = StudentCertificatesKey {
            student: student.clone(),
        };
        let course_symbols: Vec<Symbol> = env
            .storage()
            .persistent()
            .get(&index_key)
            .unwrap_or_else(|| Vec::new(env));

        for course_symbol in course_symbols.iter() {
            let key = CertKey {
                course_symbol: course_symbol.clone(),
                student: student.clone(),
            };

            let stored_cert: Option<Certificate> = env.storage().persistent().get(&key);
            if let Some(mut cert) = stored_cert {
                cert.did = did.clone();
                env.storage().persistent().set(&key, &cert);
                env.storage()
                    .persistent()
                    .extend_ttl(&key, CERT_TTL_LEDGERS, CERT_TTL_LEDGERS);
            }
        }
    }

    fn index_certificate_for_student(env: &Env, student: &Address, course_symbol: &Symbol) {
        let index_key = StudentCertificatesKey {
            student: student.clone(),
        };
        let mut course_symbols: Vec<Symbol> = env
            .storage()
            .persistent()
            .get(&index_key)
            .unwrap_or_else(|| Vec::new(env));

        let mut already_indexed = false;
        for indexed_symbol in course_symbols.iter() {
            if indexed_symbol == *course_symbol {
                already_indexed = true;
                break;
            }
        }

        if !already_indexed {
            course_symbols.push_back(course_symbol.clone());
            env.storage().persistent().set(&index_key, &course_symbols);
        }

        env.storage()
            .persistent()
            .extend_ttl(&index_key, CERT_TTL_LEDGERS, CERT_TTL_LEDGERS);
    }

    /// Generate a course identifier hash (32 bytes) from a course symbol.
    fn course_id_from_symbol(env: &Env, course_symbol: &Symbol) -> BytesN<32> {
        let course_str = course_symbol.to_string();
        let mut hasher = env.crypto().hasher();
        hasher.update(course_str.as_bytes());
        hasher.finalize()
    }

    /// Returns true if `account` has `role`. `Admin` matches the three governance addresses only.
    pub fn has_role(env: Env, account: Address, role: Role) -> bool {
        match role {
            Role::Admin => Self::governance_admin_index(&env, &account).is_some(),
            Role::Instructor | Role::Student => env
                .storage()
                .instance()
                .get(&DataKey::Role(account))
                .map(|r: Role| r == role)
                .unwrap_or(false),
        }
    }

    /// Grant `role` to `account`. Only governance admins may call. The `Admin` role cannot be granted
    /// (governance membership is fixed at init).
    pub fn grant_role(env: Env, caller: Address, account: Address, role: Role) {
        caller.require_auth();
        Self::require_governance_admin(&env, &caller);
        if matches!(role, Role::Admin) {
            panic_with_error!(&env, CertError::CannotGrantAdminRole);
        }
        env.storage()
            .instance()
            .set(&DataKey::Role(account.clone()), &role);

        // Emit v1 event for backward compatibility
        env.events().publish(
            (Symbol::new(&env, "v1_role_granted"),),
            (caller.clone(), account.clone(), role),
        );

        // Emit v2 event
        let recorder = EventRecorder::new(&env, env.current_contract_address());
        recorder.publisher.publish_role_granted(&caller, &account, role as u32);

        // Record activity
        let activity_mgr = ActivityLogManager::new(&env);
        let env_ref = &env;
        let hash_input = format!("{}:{}:{}", caller.to_xdr(env_ref).to_vec(), account.to_xdr(env_ref).to_vec(), role as u32);
        let mut hasher = env.crypto().hasher();
        hasher.update(hash_input.as_bytes());
        let data_hash = hasher.finalize();
        activity_mgr.record(
            LogEventType::RoleGranted,
            None,
            &account,
            data_hash,
        );
    }

    /// Revoke the stored role for `account` (removes Instructor/Student assignment).
    pub fn revoke_role(env: Env, caller: Address, account: Address) {
        caller.require_auth();
        Self::require_governance_admin(&env, &caller);
        if Self::governance_admin_index(&env, &account).is_some() {
            let r: Option<Role> = env
                .storage()
                .instance()
                .get(&DataKey::Role(account.clone()));
            if r == Some(Role::Instructor) {
                panic_with_error!(&env, CertError::CannotRevokeProtectedInstructor);
            }
        }
        env.storage()
            .instance()
            .remove(&DataKey::Role(account.clone()));

        // Emit v1 event
        env.events()
            .publish((Symbol::new(&env, "v1_role_revoked"),), (caller.clone(), account.clone()));

        // Emit v2 event
        let recorder = EventRecorder::new(&env, env.current_contract_address());
        recorder.publisher.publish_role_revoked(&caller, &account);

        // Activity log
        let activity_mgr = ActivityLogManager::new(&env);
        let env_ref = &env;
        let hash_input = format!("{}:{}", caller.to_xdr(env_ref).to_vec(), account.to_xdr(env_ref).to_vec());
        let mut hasher = env.crypto().hasher();
        hasher.update(hash_input.as_bytes());
        let data_hash = hasher.finalize();
        activity_mgr.record(
            LogEventType::RoleRevoked,
            None,
            &account,
            data_hash,
        );
    }

    /// Circuit breaker: governance admin toggles pause for issuing (and linked token minting).
    pub fn set_paused(env: Env, caller: Address, paused: bool) {
        caller.require_auth();
        Self::require_governance_admin(&env, &caller);
        Self::acquire_lock(&env);
        env.storage().instance().set(&DataKey::Paused, &paused);

        let token: Option<Address> = env.storage().instance().get(&DataKey::PauseTokenContract);
        if let Some(token_addr) = token {
            let cert = env.current_contract_address();
            RsTokenContractClient::new(&env, &token_addr).set_mint_pause(&cert, &paused);
        }

        Self::release_lock(&env);

        // Emit v1 event
        env.events()
            .publish((Symbol::new(&env, "v1_pause_updated"),), (caller.clone(), paused));

        // Emit v2 event
        let recorder = EventRecorder::new(&env, env.current_contract_address());
        recorder.publisher.publish_pause_updated(&caller, paused);

        // Activity log
        let activity_mgr = ActivityLogManager::new(&env);
        let env_ref = &env;
        let hash_input = format!("{}:{}", caller.to_xdr(env_ref).to_vec(), paused);
        let mut hasher = env.crypto().hasher();
        hasher.update(hash_input.as_bytes());
        let data_hash = hasher.finalize();
        activity_mgr.record(
            LogEventType::PauseUpdated,
            None,
            &caller,
            data_hash,
        );
    }

    /// Link an RS-Token contract so `set_paused` also pauses token minting (via `set_mint_pause`).
    pub fn set_pause_token_contract(env: Env, caller: Address, token: Address) {
        caller.require_auth();
        Self::require_governance_admin(&env, &caller);
        env.storage()
            .instance()
            .set(&DataKey::PauseTokenContract, &token);
    }

    /// Propose a sensitive action. Returns the proposal id for `approve_action`.
    pub fn propose_action(env: Env, caller: Address, action: PendingAdminAction) -> u64 {
        caller.require_auth();
        Self::require_governance_admin(&env, &caller);

        let id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextProposalId)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::NextProposalId, &(id.wrapping_add(1)));

        let idx = Self::governance_admin_index(&env, &caller)
            .unwrap_or_else(|| panic_with_error!(&env, CertError::Unauthorized));
        let bit: u32 = 1u32.wrapping_shl(idx);
        let proposal = AdminProposal {
            action,
            approval_mask: bit,
        };
        env.storage()
            .instance()
            .set(&DataKey::Proposal(id), &proposal);

        // Emit v1 event
        env.events()
            .publish((Symbol::new(&env, "v1_action_proposed"),), (caller.clone(), id));

        // Emit v2 event
        let recorder = EventRecorder::new(&env, env.current_contract_address());
        recorder.publisher.publish_action_proposed(&caller, id);

        // Activity log
        let activity_mgr = ActivityLogManager::new(&env);
        let env_ref = &env;
        let hash_input = format!("{}:{}", caller.to_xdr(env_ref).to_vec(), id);
        let mut hasher = env.crypto().hasher();
        hasher.update(hash_input.as_bytes());
        let data_hash = hasher.finalize();
        activity_mgr.record(
            LogEventType::ActionProposed,
            None,
            &caller,
            data_hash,
        );

        id
    }

    /// Second (and third) governance signatures. Executes the action when **2-of-3** mask bits are set.
    pub fn approve_action(env: Env, caller: Address, proposal_id: u64) {
        caller.require_auth();
        Self::require_governance_admin(&env, &caller);

        let key = DataKey::Proposal(proposal_id);
        let mut proposal: AdminProposal = env
            .storage()
            .instance()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, CertError::InvalidProposal));

        let idx = Self::governance_admin_index(&env, &caller)
            .unwrap_or_else(|| panic_with_error!(&env, CertError::Unauthorized));
        let bit: u32 = 1u32.wrapping_shl(idx);
        if proposal.approval_mask & bit != 0 {
            panic_with_error!(&env, CertError::AlreadyApproved);
        }
        proposal.approval_mask |= bit;

        let approvals = proposal.approval_mask.count_ones();
        if approvals >= GOVERNANCE_THRESHOLD {
            let action = proposal.action.clone();
            env.storage().instance().remove(&key);
            Self::execute_pending_action(env.clone(), action);
            // v1 event emitted inside execute_pending_action
        } else {
            env.storage().instance().set(&key, &proposal);

            // Emit v1 event
            env.events().publish(
                (Symbol::new(&env, "v1_action_approved"),),
                (caller.clone(), proposal_id),
            );

            // Emit v2 event
            let recorder = EventRecorder::new(&env, env.current_contract_address());
            recorder.publisher.publish_action_approved(&caller, proposal_id);

            // Activity log
            let activity_mgr = ActivityLogManager::new(&env);
            let env_ref = &env;
            let hash_input = format!("{}:{}", caller.to_xdr(env_ref).to_vec(), proposal_id);
            let mut hasher = env.crypto().hasher();
            hasher.update(hash_input.as_bytes());
            let data_hash = hasher.finalize();
            activity_mgr.record(
                LogEventType::ActionApproved,
                None,
                &caller,
                data_hash,
            );
        }
    }

    /// Replace contract WASM. Requires **two different governance admins** to authorize in the
    /// same invocation (2-of-3 membership). For async governance, use `propose_action` with
    /// `PendingAdminAction::Upgrade` and `approve_action` instead.
    pub fn upgrade(env: Env, signer_a: Address, signer_b: Address, new_wasm_hash: BytesN<32>) {
        signer_a.require_auth();
        signer_b.require_auth();
        if signer_a == signer_b {
            panic_with_error!(&env, CertError::Unauthorized);
        }
        Self::require_governance_admin(&env, &signer_a);
        Self::require_governance_admin(&env, &signer_b);
        env.deployer().update_current_contract_wasm(new_wasm_hash.clone());

        // Emit v1 event (repurposed for direct upgrade)
        env.events().publish(
            (Symbol::new(&env, "v1_emergency_rollback"),),
            (signer_a.clone(), signer_b.clone(), 0, new_wasm_hash.clone()),
        );

        // Emit v2 event as UpgradeExecuted
        let recorder = EventRecorder::new(&env, env.current_contract_address());
        recorder.publisher.publish_upgrade_executed(&signer_a, new_wasm_hash.clone());

        // Activity log
        let activity_mgr = ActivityLogManager::new(&env);
        let env_ref = &env;
        let hash_input = format!("{}:{}", signer_a.to_xdr(env_ref).to_vec(), signer_b.to_xdr(env_ref).to_vec());
        let mut hasher = env.crypto().hasher();
        hasher.update(hash_input.as_bytes());
        let data_hash = hasher.finalize();
        activity_mgr.record(
            LogEventType::UpgradeExecuted,
            None,
            &signer_a,
            data_hash,
        );
    }

    /// Propose an upgrade with time-lock (24-hour delay)
    /// Returns the proposal ID for tracking
    pub fn propose_upgrade_with_timelock(
        env: Env,
        caller: Address,
        new_wasm_hash: BytesN<32>,
        changelog: String,
    ) -> u64 {
        caller.require_auth();
        Self::require_governance_admin(&env, &caller);

        let idx = Self::governance_admin_index(&env, &caller)
            .unwrap_or_else(|| panic_with_error!(&env, CertError::Unauthorized));
        let approval_mask = 1u32.wrapping_shl(idx);

        upgrade::propose_upgrade(
            &env,
            new_wasm_hash.clone(),
            caller.clone(),
            approval_mask,
            changelog.clone(),
        );

        // Emit v1 event
        env.events().publish(
            (Symbol::new(&env, "v1_upgrade_proposed"),),
            (caller.clone(), new_wasm_hash.clone(), changelog.clone()),
        );

        // Emit v2 event
        let recorder = EventRecorder::new(&env, env.current_contract_address());
        recorder.publisher.publish_upgrade_proposed(&caller, new_wasm_hash, &changelog);

        // Activity log
        let activity_mgr = ActivityLogManager::new(&env);
        let env_ref = &env;
        let hash_input = format!("{}", caller.to_xdr(env_ref).to_vec().len());
        let mut hasher = env.crypto().hasher();
        hasher.update(hash_input.as_bytes());
        let data_hash = hasher.finalize();
        activity_mgr.record(
            LogEventType::UpgradeProposed,
            None,
            &caller,
            data_hash,
        );

        env.ledger().timestamp()
    }

    /// Approve a pending upgrade (requires 2-of-3 governance admins)
    pub fn approve_pending_upgrade(env: Env, caller: Address) {
        caller.require_auth();
        Self::require_governance_admin(&env, &caller);

        let mut pending = upgrade::get_pending_upgrade(&env)
            .unwrap_or_else(|| panic_with_error!(&env, CertError::InvalidProposal));

        let idx = Self::governance_admin_index(&env, &caller)
            .unwrap_or_else(|| panic_with_error!(&env, CertError::Unauthorized));
        let bit = 1u32.wrapping_shl(idx);

        if pending.approval_mask & bit != 0 {
            panic_with_error!(&env, CertError::AlreadyApproved);
        }

        pending.approval_mask |= bit;

        env.storage()
            .instance()
            .set(&upgrade::UpgradeDataKey::PendingUpgrade, &pending);

        // Emit v1 event
        env.events().publish(
            (Symbol::new(&env, "v1_upgrade_approved"),),
            (caller.clone(), pending.approval_mask),
        );

        // Emit v2 event
        let recorder = EventRecorder::new(&env, env.current_contract_address());
        recorder.publisher.publish_upgrade_approved(&caller, pending.approval_mask);

        // Activity log
        let activity_mgr = ActivityLogManager::new(&env);
        let env_ref = &env;
        let hash_input = format!("{}:{}", caller.to_xdr(env_ref).to_vec(), pending.approval_mask);
        let mut hasher = env.crypto().hasher();
        hasher.update(hash_input.as_bytes());
        let data_hash = hasher.finalize();
        activity_mgr.record(
            LogEventType::UpgradeApproved,
            None,
            &caller,
            data_hash,
        );
    }

    /// Execute a pending upgrade after time-lock expires and 2-of-3 approval
    pub fn execute_pending_upgrade(env: Env, caller: Address) {
        caller.require_auth();
        Self::require_governance_admin(&env, &caller);

        let pending = upgrade::get_pending_upgrade(&env)
            .unwrap_or_else(|| panic_with_error!(&env, CertError::InvalidProposal));

        // Check if time-lock has expired
        if !upgrade::is_timelock_expired(&env, &pending) {
            panic!("Time-lock has not expired yet");
        }

        // Check if we have 2-of-3 approvals
        let approvals = pending.approval_mask.count_ones();
        if approvals < GOVERNANCE_THRESHOLD {
            panic!("Insufficient approvals");
        }

        upgrade::execute_upgrade(&env, &pending);

        // Emit v1 event
        env.events().publish(
            (Symbol::new(&env, "v1_upgrade_executed"),),
            (caller.clone(), pending.new_wasm_hash.clone()),
        );

        // Emit v2 event
        let recorder = EventRecorder::new(&env, env.current_contract_address());
        recorder.publisher.publish_upgrade_executed(&caller, pending.new_wasm_hash.clone());

        // Activity log
        let activity_mgr = ActivityLogManager::new(&env);
        let env_ref = &env;
        let hash_input = format!("{}", pending.new_wasm_hash.to_xdr(env_ref).to_vec().len());
        let mut hasher = env.crypto().hasher();
        hasher.update(hash_input.as_bytes());
        let data_hash = hasher.finalize();
        activity_mgr.record(
            LogEventType::UpgradeExecuted,
            None,
            &caller,
            data_hash,
        );
    }

    /// Cancel a pending upgrade (requires governance admin)
    pub fn cancel_pending_upgrade(env: Env, caller: Address) {
        caller.require_auth();
        Self::require_governance_admin(&env, &caller);

        upgrade::clear_pending_upgrade(&env);

        // Emit v1 event
        env.events()
            .publish((Symbol::new(&env, "v1_upgrade_cancelled"),), caller.clone());

        // Emit v2 event
        let recorder = EventRecorder::new(&env, env.current_contract_address());
        recorder.publisher.publish_upgrade_cancelled(&caller);

        // Activity log
        let activity_mgr = ActivityLogManager::new(&env);
        let env_ref = &env;
        let hash_input = format!("{}", caller.to_xdr(env_ref).to_vec().len());
        let mut hasher = env.crypto().hasher();
        hasher.update(hash_input.as_bytes());
        let data_hash = hasher.finalize();
        activity_mgr.record(
            LogEventType::UpgradeCancelled,
            None,
            &caller,
            data_hash,
        );
    }

    /// Get the current contract version
    pub fn get_current_version(env: Env) -> u32 {
        upgrade::get_current_version(&env)
    }

    /// Get the complete version history
    pub fn get_version_history(env: Env) -> Vec<ContractVersion> {
        upgrade::get_version_history(&env)
    }

    /// Get a specific version from history
    pub fn get_version(env: Env, version: u32) -> Option<ContractVersion> {
        upgrade::get_version(&env, version)
    }

    /// Get pending upgrade details
    pub fn get_pending_upgrade(env: Env) -> Option<PendingUpgrade> {
        upgrade::get_pending_upgrade(&env)
    }

    /// Emergency rollback to a previous version (requires 2-of-3 governance admins)
    pub fn emergency_rollback(env: Env, signer_a: Address, signer_b: Address, target_version: u32) {
        signer_a.require_auth();
        signer_b.require_auth();
        if signer_a == signer_b {
            panic_with_error!(&env, CertError::Unauthorized);
        }
        Self::require_governance_admin(&env, &signer_a);
        Self::require_governance_admin(&env, &signer_b);

        let wasm_hash = upgrade::rollback_to_version(&env, target_version)
            .unwrap_or_else(|| panic!("Version not found in history"));

        // Emit v1 event
        env.events().publish(
            (Symbol::new(&env, "v1_emergency_rollback"),),
            (signer_a.clone(), signer_b.clone(), target_version, wasm_hash.clone()),
        );

        // Emit v2 event
        let recorder = EventRecorder::new(&env, env.current_contract_address());
        recorder.publisher.publish_emergency_rollback(
            &signer_a,
            &signer_b,
            target_version,
            wasm_hash.clone(),
        );

        // Activity log
        let activity_mgr = ActivityLogManager::new(&env);
        let env_ref = &env;
        let hash_input = format!("{}:{}:{}", signer_a.to_xdr(env_ref).to_vec(), signer_b.to_xdr(env_ref).to_vec(), target_version);
        let mut hasher = env.crypto().hasher();
        hasher.update(hash_input.as_bytes());
        let data_hash = hasher.finalize();
        activity_mgr.record(
            LogEventType::EmergencyRollback,
            None,
            &signer_a,
            data_hash,
        );
    }

    /// Add an admin with specific role and permissions
    pub fn add_admin_with_role(env: Env, caller: Address, new_admin: Address, role: AdminRole) {
        caller.require_auth();
        Self::require_governance_admin(&env, &caller);

        let permissions = admin::get_default_permissions(&env, role);
        admin::add_admin(&env, new_admin.clone(), role, permissions);

        // Emit v1 event
        env.events().publish(
            (Symbol::new(&env, "v1_admin_added"),),
            (caller.clone(), new_admin.clone(), role),
        );

        // Emit v2 event
        let recorder = EventRecorder::new(&env, env.current_contract_address());
        recorder.publisher.publish_admin_added(&caller, &new_admin, role as u32);

        // Activity log
        let activity_mgr = ActivityLogManager::new(&env);
        let env_ref = &env;
        let hash_input = format!("{}:{}", caller.to_xdr(env_ref).to_vec(), new_admin.to_xdr(env_ref).to_vec());
        let mut hasher = env.crypto().hasher();
        hasher.update(hash_input.as_bytes());
        let data_hash = hasher.finalize();
        activity_mgr.record(
            LogEventType::AdminAdded,
            None,
            &new_admin,
            data_hash,
        );
    }

    /// Remove an admin
    pub fn remove_admin_role(env: Env, caller: Address, admin_to_remove: Address) {
        caller.require_auth();
        Self::require_governance_admin(&env, &caller);

        admin::remove_admin(&env, &admin_to_remove);

        // Emit v1 event
        env.events().publish(
            (Symbol::new(&env, "v1_admin_removed"),),
            (caller.clone(), admin_to_remove.clone()),
        );

        // Emit v2 event
        let recorder = EventRecorder::new(&env, env.current_contract_address());
        recorder.publisher.publish_admin_removed(&caller, &admin_to_remove);

        // Activity log
        let activity_mgr = ActivityLogManager::new(&env);
        let env_ref = &env;
        let hash_input = format!("{}", admin_to_remove.to_xdr(env_ref).to_vec().len());
        let mut hasher = env.crypto().hasher();
        hasher.update(hash_input.as_bytes());
        let data_hash = hasher.finalize();
        activity_mgr.record(
            LogEventType::AdminRemoved,
            None,
            &caller,
            data_hash,
        );
    }

    /// Get admin policy for an address
    pub fn get_admin_policy(env: Env, address: Address) -> Option<AdminPolicy> {
        admin::get_admin_policy(&env, &address)
    }

    /// Check if an address has a specific permission
    pub fn check_permission(env: Env, address: Address, permission: Permission) -> bool {
        admin::has_permission(&env, &address, permission)
    }

    /// Transfer contract ownership
    pub fn transfer_ownership(env: Env, caller: Address, new_owner: Address) {
        caller.require_auth();
        Self::require_governance_admin(&env, &caller);

        admin::transfer_ownership(&env, new_owner.clone());

        // Emit v1 event
        env.events().publish(
            (Symbol::new(&env, "v1_ownership_transferred"),),
            (caller.clone(), new_owner.clone()),
        );

        // Emit v2 event
        let recorder = EventRecorder::new(&env, env.current_contract_address());
        recorder.publisher.publish_ownership_transferred(&caller, &new_owner);

        // Activity log
        let activity_mgr = ActivityLogManager::new(&env);
        let env_ref = &env;
        let hash_input = format!("{}:{}", caller.to_xdr(env_ref).to_vec(), new_owner.to_xdr(env_ref).to_vec());
        let mut hasher = env.crypto().hasher();
        hasher.update(hash_input.as_bytes());
        let data_hash = hasher.finalize();
        activity_mgr.record(
            LogEventType::OwnershipTransferred,
            None,
            &new_owner,
            data_hash,
        );
    }

    fn execute_pending_action(env: Env, action: PendingAdminAction) {
        match action {
            PendingAdminAction::SetMintCap(new_cap) => {
                if new_cap == 0 {
                    panic_with_error!(&env, CertError::InvalidMintCap);
                }
                let old_cap: u32 = env
                    .storage()
                    .instance()
                    .get(&DataKey::MintCap)
                    .unwrap_or(DEFAULT_MINT_CAP);
                env.storage().instance().set(&DataKey::MintCap, &new_cap);

                // Emit v1 event
                env.events().publish(
                    (Symbol::new(&env, "v1_mint_cap_updated"),),
                    (old_cap, new_cap),
                );

                // Emit v2 event
                let recorder = EventRecorder::new(&env, env.current_contract_address());
                recorder.publisher.publish_mint_cap_updated(old_cap, new_cap);

                // Activity log
                let activity_mgr = ActivityLogManager::new(&env);
                let caller = env.caller();
                let env_ref = &env;
                let hash_input = format!("{}:{}", old_cap, new_cap);
                let mut hasher = env.crypto().hasher();
                hasher.update(hash_input.as_bytes());
                let data_hash = hasher.finalize();
                activity_mgr.record(
                    LogEventType::MintCapUpdated,
                    None,
                    &caller,
                    data_hash,
                );
            }
            PendingAdminAction::Upgrade(new_wasm_hash) => {
                env.deployer().update_current_contract_wasm(new_wasm_hash);
            }
        }
    }

    /// Issue certificates. Caller must have the **Instructor** role. Respects mint cap and pause.
    pub fn issue(
        env: Env,
        instructor: Address,
        course_symbol: Symbol,
        students: Vec<Address>,
        course_name: String,
    ) -> Vec<Certificate> {
        instructor.require_auth();
        Self::require_not_paused(&env);
        Self::require_instructor(&env, &instructor);
        Self::acquire_lock(&env);

        Self::validate_string(&env, &course_name, 128);

        let student_count = students.len();
        let available = Self::check_and_update_mint_tracking(&env);
        if student_count > available {
            Self::release_lock(&env);
            panic_with_error!(&env, CertError::MintCapExceeded);
        }

        Self::record_mint(&env, student_count);

        let issue_date = env.ledger().timestamp();
        let mut issued: Vec<Certificate> = Vec::new(&env);

        // Statistics and activity log managers
        let stats_mgr = StatisticsManager::new(&env);
        let activity_mgr = ActivityLogManager::new(&env);
        let contract_address = env.current_contract_address();

        for student in students.iter() {
            // Generate token_id for this certificate
            let token_id = generate_token_id(&env, &course_symbol, student);

            let cert = Certificate {
                course_symbol: course_symbol.clone(),
                student: student.clone(),
                course_name: course_name.clone(),
                issue_date,
                did: Self::load_student_did(&env, &student),
                revoked: false,
                grade: None,
            };

            Self::persist_certificate(&env, &cert);

            // Compute metadata hash
            let metadata_hash = compute_metadata_hash(&env, &course_name, &None, &cert.did);

            // Emit v2 comprehensive event
            let recorder = EventRecorder::new(&env, contract_address);
            recorder.record_minted(
                token_id,
                student,
                Self::course_id_from_symbol(&env, &course_symbol),
                metadata_hash,
                &instructor,
            );

            // Update statistics
            stats_mgr.increment_minted(token_id, student, &Self::course_id_from_symbol(&env, &course_symbol));

            // Record activity
            activity_mgr.record(
                LogEventType::Minted,
                Some(token_id),
                student,
                metadata_hash,
            );

            // Also emit old v1 event for backward compatibility
            env.events().publish(
                (Symbol::new(&env, "v1_cert_issued"), course_symbol.clone()),
                (student.clone(), course_name.clone()),
            );

            issued.push_back(cert);
        }

        env.events().publish(
            (Symbol::new(&env, "v1_mint_period_update"),),
            (env.ledger().sequence() / LEDGERS_PER_PERIOD, student_count),
        );

        Self::release_lock(&env);
        issued
    }

    /// Batch issue certificates for multiple course symbols and students in a single transaction.
    /// Caller must have **Instructor** role. Respects mint cap and pause.
    /// Optimized for gas efficiency and Soroban compute limits.
    pub fn batch_issue(
        env: Env,
        instructor: Address,
        symbols: Vec<Symbol>,
        students: Vec<Address>,
        course: String,
    ) -> Vec<Certificate> {
        instructor.require_auth();
        Self::require_not_paused(&env);
        Self::require_instructor(&env, &instructor);
        Self::acquire_lock(&env);

        Self::validate_string(&env, &course, 128);

        // Validate input lengths match
        if symbols.len() != students.len() {
            Self::release_lock(&env);
            panic_with_error!(&env, CertError::InvalidAmount);
        }

        let total_certificates = symbols.len();

        // Validate batch size
        if total_certificates == 0 {
            Self::release_lock(&env);
            panic_with_error!(&env, CertError::EmptyBatch);
        }

        if total_certificates > MAX_BATCH_SIZE {
            Self::release_lock(&env);
            panic_with_error!(&env, CertError::BatchTooLarge);
        }

        let available = Self::check_and_update_mint_tracking(&env);
        if total_certificates > available {
            Self::release_lock(&env);
            panic_with_error!(&env, CertError::MintCapExceeded);
        }

        Self::record_mint(&env, total_certificates);

        let issue_date = env.ledger().timestamp();
        let mut issued: Vec<Certificate> = Vec::new(&env);
        let mut token_ids: Vec<u128> = Vec::new(&env);

        // Managers
        let stats_mgr = StatisticsManager::new(&env);
        let activity_mgr = ActivityLogManager::new(&env);
        let contract_address = env.current_contract_address();

        // Optimized loop: minimize storage operations and compute
        for i in 0..total_certificates {
            let course_symbol = symbols.get(i).unwrap();
            let student = students.get(i).unwrap();

            let token_id = generate_token_id(&env, course_symbol, student);
            token_ids.push_back(token_id);

            let cert = Certificate {
                course_symbol: course_symbol.clone(),
                student: student.clone(),
                course_name: course.clone(),
                issue_date,
                did: Self::load_student_did(&env, &student),
                revoked: false,
                grade: None,
            };

            Self::persist_certificate(&env, &cert);

            // Compute metadata hash
            let metadata_hash = compute_metadata_hash(&env, &course, &None, &cert.did);

            // Emit individual certificate event (v2)
            let recorder = EventRecorder::new(&env, contract_address);
            recorder.record_minted(
                token_id,
                student,
                Self::course_id_from_symbol(&env, course_symbol),
                metadata_hash,
                &instructor,
            );

            // Update stats per certificate
            stats_mgr.increment_minted(token_id, student, &Self::course_id_from_symbol(&env, course_symbol));

            // Record activity for this certificate
            activity_mgr.record(
                LogEventType::Minted,
                Some(token_id),
                student,
                metadata_hash,
            );

            // Batch event emission (emit one event per certificate for transparency)
            env.events().publish(
                (
                    Symbol::new(&env, "v1_batch_cert_issued"),
                    Symbol::new(&env, "batch_cert_issued"),
                    course_symbol.clone(),
                ),
                (student.clone(), course.clone()),
            );

            issued.push_back(cert);
        }

        // Emit summary event for the entire batch operation
        let batch_recorder = EventRecorder::new(&env, contract_address);
        batch_recorder.record_batch_minted(
            token_ids.clone(),
            Self::course_id_from_symbol(&env, symbols.get(0).unwrap()),
            total_certificates as u32,
            &instructor,
        );

        // Batch completion event (v1)
        env.events().publish(
            (Symbol::new(&env, "v1_batch_issue_completed"),),
            (instructor.clone(), total_certificates, course.clone()),
        );

        env.events().publish(
            (Symbol::new(&env, "mint_period_update"),),
            (
                env.ledger().sequence() / LEDGERS_PER_PERIOD,
                total_certificates,
            ),
        );

        Self::release_lock(&env);
        issued
    }

    /// Enhanced batch minting with individual recipient metadata.
    /// Supports up to 100 certificates per transaction with optimized gas usage.
    ///
    /// # Arguments
    /// * `recipients` - Vector of recipient data including address, course_symbol, and optional grade
    /// * `course_name` - Course name shared across all certificates
    ///
    /// # Gas Optimization
    /// - Shared course name and timestamp across batch
    /// - Optimized storage writes
    /// - Batched event emission
    /// - Pre-computed values to minimize redundant operations
    ///
    /// # Returns
    /// Vector of issued certificates or panics on error
    pub fn mint_batch_certificates(
        env: Env,
        instructor: Address,
        recipients: Vec<RecipientData>,
        course_name: String,
    ) -> Vec<Certificate> {
        instructor.require_auth();
        Self::require_not_paused(&env);
        Self::require_instructor(&env, &instructor);
        Self::acquire_lock(&env);

        // Validate course name
        Self::validate_string(&env, &course_name, 128);

        let batch_size = recipients.len();

        // Validate batch constraints
        if batch_size == 0 {
            Self::release_lock(&env);
            panic_with_error!(&env, CertError::EmptyBatch);
        }

        if batch_size > MAX_BATCH_SIZE {
            Self::release_lock(&env);
            panic_with_error!(&env, CertError::BatchTooLarge);
        }

        // Check mint cap
        let available = Self::check_and_update_mint_tracking(&env);
        if batch_size > available {
            Self::release_lock(&env);
            panic_with_error!(&env, CertError::MintCapExceeded);
        }

        // Validate all grades before processing
        for i in 0..batch_size {
            let recipient = recipients.get(i).unwrap();
            if let Some(grade) = &recipient.grade {
                Self::validate_string(&env, grade, 10);
            }
        }

        Self::record_mint(&env, batch_size);

        // Shared timestamp for entire batch (gas optimization)
        let issue_date = env.ledger().timestamp();
        let mut issued: Vec<Certificate> = Vec::new(&env);

        // Managers
        let stats_mgr = StatisticsManager::new(&env);
        let activity_mgr = ActivityLogManager::new(&env);
        let contract_address = env.current_contract_address();

        // Process each recipient with optimized storage operations
        for i in 0..batch_size {
            let recipient = recipients.get(i).unwrap();

            let token_id = generate_token_id(&env, &recipient.course_symbol, &recipient.address);
            token_ids.push_back(token_id);

            let cert = Certificate {
                course_symbol: recipient.course_symbol.clone(),
                student: recipient.address.clone(),
                course_name: course_name.clone(),
                issue_date,
                did: Self::load_student_did(&env, &recipient.address),
                revoked: false,
                grade: recipient.grade.clone(),
            };

            Self::persist_certificate(&env, &cert);

            // Compute metadata hash
            let metadata_hash = compute_metadata_hash(&env, &course_name, &recipient.grade, &cert.did);

            // Emit individual certificate event (v2)
            let recorder = EventRecorder::new(&env, contract_address);
            recorder.record_minted(
                token_id,
                &recipient.address,
                Self::course_id_from_symbol(&env, &recipient.course_symbol),
                metadata_hash,
                &instructor,
            );

            // Update stats
            stats_mgr.increment_minted(
                token_id,
                &recipient.address,
                &Self::course_id_from_symbol(&env, &recipient.course_symbol),
            );

            // Record activity
            activity_mgr.record(
                LogEventType::Minted,
                Some(token_id),
                &recipient.address,
                metadata_hash,
            );

            // Also emit old v1 per-certificate event
            env.events().publish(
                (
                    Symbol::new(&env, "v1_batch_cert_issued"),
                    Symbol::new(&env, "batch_cert_issued"),
                    recipient.course_symbol.clone(),
                ),
                (recipient.address.clone(), course_name.clone()),
            );

            issued.push_back(cert);
        }

        // Emit batch completion event (v2) with full token ID list
        let batch_recorder = EventRecorder::new(&env, contract_address);
        let first_recipient = recipients.get(0).unwrap();
        batch_recorder.record_batch_minted(
            token_ids.clone(),
            Self::course_id_from_symbol(&env, &first_recipient.course_symbol),
            batch_size as u32,
            &instructor,
        );

        // Batch issue completed event (v1)
        env.events().publish(
            (Symbol::new(&env, "v1_batch_mint_completed"),),
            (instructor.clone(), batch_size, course_name.clone()),
        );

        env.events().publish(
            (Symbol::new(&env, "mint_period_update"),),
            (env.ledger().sequence() / LEDGERS_PER_PERIOD, batch_size),
        );

        Self::release_lock(&env);
        issued
    }

    pub fn revoke(env: Env, caller: Address, course_symbol: Symbol, student: Address) {
        caller.require_auth();
        Self::require_governance_admin(&env, &caller);

        let key = CertKey {
            course_symbol: course_symbol.clone(),
            student: student.clone(),
        };

        let mut cert: Certificate = env.storage().persistent().get(&key).unwrap_or_else(|| {
            panic_with_error!(&env, CertError::CertificateNotFound);
        });

        cert.revoked = true;
        env.storage().persistent().set(&key, &cert);
        env.storage()
            .persistent()
            .extend_ttl(&key, CERT_TTL_LEDGERS, CERT_TTL_LEDGERS);

        // Generate token ID for this certificate
        let token_id = generate_token_id(&env, &course_symbol, &student);

        // Emit v1 event
        env.events().publish(
            (Symbol::new(&env, "v1_cert_revoked"), course_symbol.clone()),
            (caller.clone(), student.clone()),
        );

        // Emit v2 event (with reason enum - 0 = AdminRevoke)
        let recorder = EventRecorder::new(&env, env.current_contract_address());
        recorder.publisher.publish_revoked(token_id, &caller, 0); // 0 = AdminRevoke

        // Update statistics
        let stats_mgr = StatisticsManager::new(&env);
        stats_mgr.increment_revoked();
        stats_mgr.increment_course_revoked(&Self::course_id_from_symbol(&env, &course_symbol));

        // Activity log - address = student (affected party)
        let activity_mgr = ActivityLogManager::new(&env);
        let env_ref = &env;
        let hash_input = format!("{}:{}:0", token_id, caller.to_xdr(env_ref).to_vec());
        let mut hasher = env.crypto().hasher();
        hasher.update(hash_input.as_bytes());
        let data_hash = hasher.finalize();
        activity_mgr.record(
            LogEventType::Revoked,
            Some(token_id),
            &student,
            data_hash,
        );
    }

    pub fn get_certificate(
        env: Env,
        course_symbol: Symbol,
        student: Address,
    ) -> Option<Certificate> {
        let key = CertKey {
            course_symbol,
            student,
        };
        env.storage().persistent().get(&key)
    }

    /// Returns every certificate indexed for a student across all course symbols.
    pub fn get_certificates_by_student(env: Env, student: Address) -> Vec<Certificate> {
        let index_key = StudentCertificatesKey {
            student: student.clone(),
        };
        let course_symbols: Vec<Symbol> = env
            .storage()
            .persistent()
            .get(&index_key)
            .unwrap_or_else(|| Vec::new(&env));
        let mut certificates = Vec::new(&env);

        for course_symbol in course_symbols.iter() {
            if let Some(cert) =
                Self::get_certificate(env.clone(), course_symbol.clone(), student.clone())
            {
                certificates.push_back(cert);
            }
        }

        certificates
    }

    /// Extend the TTL of a certificate entry in persistent storage.
    /// The student (or a governance admin) pays for the storage rent extension.
    pub fn renew_certificate(env: Env, caller: Address, course_symbol: Symbol, student: Address) {
        caller.require_auth();

        // Only the student themselves or a governance admin may renew.
        let is_admin = Self::governance_admin_index(&env, &caller).is_some();
        if caller != student && !is_admin {
            panic_with_error!(&env, CertError::Unauthorized);
        }

        let key = CertKey {
            course_symbol: course_symbol.clone(),
            student: student.clone(),
        };

        if !env.storage().persistent().has(&key) {
            panic_with_error!(&env, CertError::CertificateNotFound);
        }

        env.storage()
            .persistent()
            .extend_ttl(&key, CERT_TTL_LEDGERS, CERT_TTL_LEDGERS);

        // Emit v1 event
        env.events().publish(
            (Symbol::new(&env, "cert_renewed"), course_symbol),
            (caller.clone(), student.clone()),
        );

        // Emit v2 event
        let token_id = generate_token_id(&env, &course_symbol, &student);
        let new_expiry = env.ledger().timestamp().saturating_add(CERT_TTL_LEDGERS as u64 * 5); // 5 seconds per ledger
        let recorder = EventRecorder::new(&env, env.current_contract_address());
        recorder.publisher.publish_renewed(token_id, &caller, new_expiry);

        // Update statistics
        let stats_mgr = StatisticsManager::new(&env);
        stats_mgr.increment_renewed();

        // Activity log - use student as address (affected party)
        let activity_mgr = ActivityLogManager::new(&env);
        let env_ref = &env;
        let hash_input = format!("{}:{}:{}", token_id, caller.to_xdr(env_ref).to_vec(), new_expiry);
        let mut hasher = env.crypto().hasher();
        hasher.update(hash_input.as_bytes());
        let data_hash = hasher.finalize();
        activity_mgr.record(
            LogEventType::Renewed,
            Some(token_id),
            &student,
            data_hash,
        );
    }

    pub fn execute_meta_tx(
        env: Env,
        signature: BytesN<64>,
        call_data: MetaTxCallData,
    ) -> Certificate {
        // instructor.require_auth(); // No longer needed as we're verifying the signature manually
        Self::require_not_paused(&env);
        Self::require_instructor(&env, &call_data.instructor);
        Self::acquire_lock(&env);

        Self::validate_string(&env, &call_data.course_name, 128);

        // Verify the signature on the call data
        if signature.len() != 64 {
            Self::release_lock(&env);
            panic_with_error!(&env, CertError::InvalidSignature);
        }

        let nonce_key = (
            Symbol::new(&env, NONCE_PREFIX),
            call_data.instructor.clone(),
        );
        let stored_nonce: u64 = env.storage().instance().get(&nonce_key).unwrap_or(0u64);

        if call_data.nonce != stored_nonce {
            Self::release_lock(&env);
            panic!("invalid nonce");
        }

        env.storage()
            .instance()
            .set(&nonce_key, &(stored_nonce + 1));

        let issue_date = env.ledger().timestamp();
        let available = Self::check_and_update_mint_tracking(&env);
        if available < 1 {
            Self::release_lock(&env);
            panic_with_error!(&env, CertError::MintCapExceeded);
        }
        Self::record_mint(&env, 1);

        let token_id = generate_token_id(&env, &call_data.course_symbol, &call_data.student);

        let cert = Certificate {
            course_symbol: call_data.course_symbol.clone(),
            student: call_data.student.clone(),
            course_name: call_data.course_name.clone(),
            issue_date,
            did: Self::load_student_did(&env, &call_data.student),
            revoked: false,
            grade: None,
        };

        Self::persist_certificate(&env, &cert);

        // Compute metadata hash
        let metadata_hash = compute_metadata_hash(&env, &call_data.course_name, &None, &cert.did);

        // Emit v2 event
        let recorder = EventRecorder::new(&env, env.current_contract_address());
        recorder.record_minted(
            token_id,
            &call_data.student,
            Self::course_id_from_symbol(&env, &call_data.course_symbol),
            metadata_hash,
            &call_data.instructor,
        );

        // Update statistics
        let stats_mgr = StatisticsManager::new(&env);
        stats_mgr.increment_minted(
            token_id,
            &call_data.student,
            &Self::course_id_from_symbol(&env, &call_data.course_symbol),
        );

        // Record activity - address is the student (recipient)
        let activity_mgr = ActivityLogManager::new(&env);
        activity_mgr.record(
            LogEventType::Minted,
            Some(token_id),
            &call_data.student,
            metadata_hash,
        );

        // Emit v1 event for backward compatibility
        env.events().publish(
            (
                Symbol::new(&env, "v1_meta_tx_issued"),
                call_data.course_symbol.clone(),
            ),
            (
                call_data.instructor.clone(),
                call_data.student.clone(),
                call_data.course_name.clone(),
            ),
        );

        Self::release_lock(&env);
        cert
    }

    pub fn get_nonce(env: Env, instructor: Address) -> u64 {
        let nonce_key = (Symbol::new(&env, NONCE_PREFIX), instructor);
        env.storage().instance().get(&nonce_key).unwrap_or(0u64)
    }

    pub fn get_mint_cap(env: Env, caller: Address) -> u32 {
        caller.require_auth();
        Self::require_governance_admin(&env, &caller);

        env.storage()
            .instance()
            .get(&DataKey::MintCap)
            .unwrap_or(DEFAULT_MINT_CAP)
    }

    pub fn get_mint_stats(env: Env, caller: Address) -> (u32, u32, u32, u32) {
        caller.require_auth();
        Self::require_governance_admin(&env, &caller);

        let current_period = env.ledger().sequence() / LEDGERS_PER_PERIOD;
        let minted_this_period: u32 = env
            .storage()
            .instance()
            .get(&DataKey::MintedThisPeriod)
            .unwrap_or(0);
        let mint_cap: u32 = env
            .storage()
            .instance()
            .get(&DataKey::MintCap)
            .unwrap_or(DEFAULT_MINT_CAP);
        let remaining = mint_cap.saturating_sub(minted_this_period);

        (current_period, minted_this_period, mint_cap, remaining)
    }

    pub fn update_did(env: Env, caller: Address, did: String) {
        caller.require_auth();

        Self::require_valid_did_format(&did);

        let timestamp = env.ledger().timestamp();
        let did_key = DataKey::StudentDid(caller.clone());

        let student_did = StudentDid {
            student: caller.clone(),
            did: did.clone(),
            updated_at: timestamp,
        };

        env.storage().persistent().set(&did_key, &student_did);
        env.storage()
            .persistent()
            .extend_ttl(&did_key, CERT_TTL_LEDGERS, CERT_TTL_LEDGERS);
        Self::sync_did_to_student_certificates(&env, &caller, Some(did.clone()));

        // Emit v1 event
        env.events().publish(
            (Symbol::new(&env, "v1_did_updated"),),
            (caller.clone(), did.clone(), timestamp),
        );

        // Emit v2 event
        let recorder = EventRecorder::new(&env, env.current_contract_address());
        recorder.publisher.publish_did_updated(&caller, &did, timestamp);

        // Activity log
        let activity_mgr = ActivityLogManager::new(&env);
        let env_ref = &env;
        let hash_input = format!("{}:{}", caller.to_xdr(env_ref).to_vec(), did);
        let mut hasher = env.crypto().hasher();
        hasher.update(hash_input.as_bytes());
        let data_hash = hasher.finalize();
        activity_mgr.record(
            LogEventType::DidUpdated,
            None,
            &caller,
            data_hash,
        );
    }

    pub fn get_did(env: Env, student: Address) -> Option<StudentDid> {
        env.storage()
            .persistent()
            .get(&DataKey::StudentDid(student))
    }

    pub fn remove_did(env: Env, caller: Address, student: Address) {
        caller.require_auth();
        Self::require_governance_admin(&env, &caller);

        let did_key = DataKey::StudentDid(student.clone());
        let existing_did: Option<StudentDid> = env.storage().persistent().get(&did_key);

        if existing_did.is_none() {
            panic_with_error!(&env, CertError::DidNotFound);
        }

        env.storage().persistent().remove(&did_key);
        Self::sync_did_to_student_certificates(&env, &student, None);

        // Emit v1 event
        env.events()
            .publish((Symbol::new(&env, "v1_did_removed"),), (caller.clone(), student.clone()));

        // Emit v2 event
        let recorder = EventRecorder::new(&env, env.current_contract_address());
        recorder.publisher.publish_did_removed(&caller, &student);

        // Activity log - address = student (affected)
        let activity_mgr = ActivityLogManager::new(&env);
        let env_ref = &env;
        let hash_input = format!("{}", student.to_xdr(env_ref).to_vec().len());
        let mut hasher = env.crypto().hasher();
        hasher.update(hash_input.as_bytes());
        let data_hash = hasher.finalize();
        activity_mgr.record(
            LogEventType::DidRemoved,
            None,
            &student,
            data_hash,
        );
    }

    /// Enforce a max byte length and reject non-printable ASCII characters (< 0x20 or == 0x7F).
    fn validate_string(env: &Env, s: &String, max_len: u32) {
        if s.len() > max_len {
            panic_with_error!(env, CertError::StringTooLong);
        }
        let n = s.len() as usize;
        let mut buf = [0u8; 256];
        // max_len is caller-controlled; we only need to read up to `n` bytes.
        // buf is 256 bytes — callers must not pass max_len > 256.
        s.copy_into_slice(&mut buf[..n]);
        for &byte in &buf[..n] {
            if byte < 0x20 || byte == 0x7F {
                panic_with_error!(env, CertError::InvalidCharacter);
            }
        }
    }

    /// Accepts `did:soroban:<network>:<identifier>[#fragment]` and rejects whitespace or control chars.
    fn require_valid_did_format(did: &String) {
        const PREFIX: &[u8] = b"did:soroban:";
        const MAX_LEN: u32 = 256;
        let n = did.len();
        if n <= PREFIX.len() as u32 || n > MAX_LEN {
            panic_with_error!(did.env(), CertError::InvalidDid);
        }
        let mut buf = [0u8; 256];
        did.copy_into_slice(&mut buf[..n as usize]);
        let bytes = &buf[..n as usize];
        if !bytes.starts_with(PREFIX) {
            panic_with_error!(did.env(), CertError::InvalidDid);
        }

        let suffix = &bytes[PREFIX.len()..];
        if suffix.is_empty() {
            panic_with_error!(did.env(), CertError::InvalidDid);
        }

        for &byte in suffix {
            let is_allowed = byte.is_ascii_alphanumeric()
                || matches!(byte, b':' | b'.' | b'-' | b'_' | b'%' | b'#');
            if !is_allowed {
                panic_with_error!(did.env(), CertError::InvalidDid);
            }
        }
    }

    // ==================== REVOCATION & VERIFICATION FUNCTIONS ====================

    /// Revoke a certificate with detailed reason tracking and audit trail.
    ///
    /// Only governance admins can revoke certificates. Generates comprehensive
    /// revocation records for compliance and auditing.
    pub fn revoke_certificate(
        env: Env,
        caller: Address,
        token_id: u128,
        reason: RevocationReason,
        notes: String,
    ) {
        caller.require_auth();
        Self::require_governance_admin(&env, &caller);

        // Validate notes string length
        Self::validate_string(&env, &notes, 512);

        // Get or create certificate state
        let state_key = DataKey::CertificateState(token_id);
        let mut state: CertificateState = env
            .storage()
            .persistent()
            .get(&state_key)
            .unwrap_or_else(|| {
                panic_with_error!(&env, CertError::CertificateNotFound);
            });

        // Check if already revoked
        if !state.is_valid() {
            panic_with_error!(&env, CertError::AlreadyRevoked);
        }

        let current_ledger = env.ledger().sequence();
        let revocation_record = RevocationRecord {
            token_id,
            revoked_at: current_ledger,
            revoked_by: caller.clone(),
            reason: reason.clone(),
            notes: notes.clone(),
            original_mint_date: state.minted_at,
        };

        // Store revocation record in history
        let history_key = DataKey::RevocationHistory(token_id);
        let mut history: Vec<RevocationRecord> = env
            .storage()
            .persistent()
            .get(&history_key)
            .unwrap_or_else(|| Vec::new(&env));
        history.push_back(revocation_record);
        env.storage().persistent().set(&history_key, &history);
        env.storage()
            .persistent()
            .extend_ttl(&history_key, CERT_TTL_LEDGERS, CERT_TTL_LEDGERS);

        // Update certificate state to revoked
        state.revoke(current_ledger);
        env.storage().persistent().set(&state_key, &state);
        env.storage()
            .persistent()
            .extend_ttl(&state_key, CERT_TTL_LEDGERS, CERT_TTL_LEDGERS);

        // Emit revocation event
        let reason_str = match reason {
            RevocationReason::AcademicDishonesty => String::from_str(&env, "AcademicDishonesty"),
            RevocationReason::IssuedInError => String::from_str(&env, "IssuedInError"),
            RevocationReason::StudentRequest => String::from_str(&env, "StudentRequest"),
            RevocationReason::CourseInvalidated => String::from_str(&env, "CourseInvalidated"),
            RevocationReason::FraudulentActivity => String::from_str(&env, "FraudulentActivity"),
            RevocationReason::Other(ref s) => s.clone(),
        };

        env.events().publish(
            (Symbol::new(&env, "v2_certificate_revoked"),),
            (token_id, caller, reason_str),
        );
    }

    /// Verify a certificate and return its current status on-chain.
    ///
    /// Public function (no authentication required) that returns complete
    /// verification data including revocation status and history.
    pub fn verify_certificate(env: Env, token_id: u128) -> Result<VerificationResult, CertError> {
        let state_key = DataKey::CertificateState(token_id);
        let state: CertificateState = env
            .storage()
            .persistent()
            .get(&state_key)
            .ok_or(CertError::CertificateNotFound)?;

        // Load the original certificate for metadata
        // In a full implementation, we'd need to store a token_id -> Certificate mapping
        // For now, we'll construct metadata from available data
        let owner = Address::random(&env);
        let metadata = CertificateMetadata {
            student: owner.clone(),
            course_symbol: String::from_str(&env, ""),
            course_name: String::from_str(&env, ""),
            issue_date: state.minted_at,
            did: None,
        };

        let current_ledger = env.ledger().sequence();

        // Construct appropriate verification result based on state
        let result = match &state.status {
            CertificateStatus::Active => {
                VerificationResult::active(owner, metadata, current_ledger)
            }
            CertificateStatus::Revoked => {
                // Get revocation details from history
                let history_key = DataKey::RevocationHistory(token_id);
                let history: Vec<RevocationRecord> = env
                    .storage()
                    .persistent()
                    .get(&history_key)
                    .unwrap_or_else(|| Vec::new(&env));

                let revocation_info = if history.len() > 0 {
                    history.get(history.len() - 1).unwrap().clone()
                } else {
                    // Fallback revocation record
                    RevocationRecord {
                        token_id,
                        revoked_at: state.revoked_at.unwrap_or(0),
                        revoked_by: Address::random(&env),
                        reason: RevocationReason::Other(String::from_str(&env, "Unknown")),
                        notes: String::from_str(&env, ""),
                        original_mint_date: state.minted_at,
                    }
                };

                VerificationResult::revoked(owner, metadata, revocation_info, current_ledger)
            }
            CertificateStatus::Superseded => VerificationResult::superseded(
                owner,
                metadata,
                state.superseded_by.unwrap_or(0),
                current_ledger,
            ),
            CertificateStatus::Reissued => VerificationResult::reissued(
                owner,
                metadata,
                state.reissued_token_id.unwrap_or(0),
                current_ledger,
            ),
        };

        // Emit verification event
        let status_str = match state.status {
            CertificateStatus::Active => String::from_str(&env, "Active"),
            CertificateStatus::Revoked => String::from_str(&env, "Revoked"),
            CertificateStatus::Reissued => String::from_str(&env, "Reissued"),
            CertificateStatus::Superseded => String::from_str(&env, "Superseded"),
        };

        env.events().publish(
            (Symbol::new(&env, "v2_certificate_verified"),),
            (token_id, result.is_valid, status_str),
        );

        Ok(result)
    }

    /// Get the revocation history for a certificate (all revocation events).
    ///
    /// Returns a vector of all revocation records for audit trail purposes.
    pub fn get_revocation_history(env: Env, token_id: u128) -> Vec<RevocationRecord> {
        let history_key = DataKey::RevocationHistory(token_id);
        env.storage()
            .persistent()
            .get(&history_key)
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Get the current state of a certificate (for internal operations).
    pub fn get_certificate_state(env: Env, token_id: u128) -> Option<CertificateState> {
        let state_key = DataKey::CertificateState(token_id);
        env.storage().persistent().get(&state_key)
    }

    /// Reissue a certificate (revoke old, create new with link).
    ///
    /// Admin function that revokes an old certificate and creates a new one,
    /// maintaining the link between them for record purposes.
    pub fn reissue_certificate(
        env: Env,
        caller: Address,
        old_token_id: u128,
        new_recipient: Address,
        reason: String,
    ) -> u128 {
        caller.require_auth();
        Self::require_governance_admin(&env, &caller);
        Self::require_not_paused(&env);

        // Validate reason string
        Self::validate_string(&env, &reason, 256);

        // Get the old certificate state
        let old_state_key = DataKey::CertificateState(old_token_id);
        let mut old_state: CertificateState = env
            .storage()
            .persistent()
            .get(&old_state_key)
            .ok_or_else(|| {
                panic_with_error!(&env, CertError::CannotReissueNonExistent);
                CertError::CannotReissueNonExistent
            })
            .unwrap();

        // Generate new token ID
        let next_id_key = DataKey::NextTokenId;
        let new_token_id: u128 = env.storage().instance().get(&next_id_key).unwrap_or(1);
        env.storage()
            .instance()
            .set(&next_id_key, &(new_token_id + 1));

        let current_ledger = env.ledger().sequence();

        // Mark old certificate as reissued
        old_state.mark_reissued(new_token_id, current_ledger);
        env.storage().persistent().set(&old_state_key, &old_state);
        env.storage()
            .persistent()
            .extend_ttl(&old_state_key, CERT_TTL_LEDGERS, CERT_TTL_LEDGERS);

        // Create new certificate state
        let new_state_key = DataKey::CertificateState(new_token_id);
        let new_state = CertificateState::new_active(current_ledger);
        env.storage().persistent().set(&new_state_key, &new_state);
        env.storage()
            .persistent()
            .extend_ttl(&new_state_key, CERT_TTL_LEDGERS, CERT_TTL_LEDGERS);

        // Emit reissuance event
        env.events().publish(
            (Symbol::new(&env, "v2_certificate_reissued"),),
            (old_token_id, new_token_id, reason),
        );

        new_token_id
    }

    // --- Blogging Platform Functions ---

    pub fn create_post(env: Env, author: Address, title: String, content_hash: BytesN<32>, metadata: String) -> u64 {
        BloggingPlatform::create_post(&env, author, title, content_hash, metadata)
    }

    pub fn get_post(env: Env, id: u64) -> Option<BlogPost> {
        BloggingPlatform::get_post(&env, id)
    }

    pub fn get_latest_posts(env: Env) -> Vec<BlogPost> {
        BloggingPlatform::get_latest_posts(&env)
    }

    pub fn get_posts_range(env: Env, start_id: u64, count: u64) -> Vec<BlogPost> {
        BloggingPlatform::get_posts_range(&env, start_id, count)
    }

    pub fn add_comment(env: Env, post_id: u64, author: Address, content: String) {
        BloggingPlatform::add_comment(&env, post_id, author, content)
    }

    pub fn react_to_post(env: Env, post_id: u64, reader: Address, reaction: ReactionType) {
        BloggingPlatform::react_to_post(&env, post_id, reader, reaction)
    }

    pub fn get_post_metrics(env: Env, post_id: u64) -> PostMetrics {
        BloggingPlatform::get_post_metrics(&env, post_id)
    }

    pub fn get_comments(env: Env, post_id: u64) -> Vec<Comment> {
        BloggingPlatform::get_comments(&env, post_id)
    }

    // --- Monetization Functions ---

    pub fn set_post_access(env: Env, author: Address, post_id: u64, access_type: AccessType) {
        ContentMonetization::set_post_access(&env, author, post_id, access_type)
    }

    pub fn tip_creator(env: Env, reader: Address, creator: Address, token_addr: Address, amount: i128) {
        ContentMonetization::tip_creator(&env, reader, creator, token_addr, amount)
    }

    pub fn subscribe_to_creator(env: Env, subscriber: Address, creator: Address, token_addr: Address, amount: i128) {
        ContentMonetization::subscribe_to_creator(&env, subscriber, creator, token_addr, amount)
    }

    pub fn get_creator_earnings(env: Env, creator: Address) -> Earnings {
        ContentMonetization::get_earnings(&env, &creator)
    }

    pub fn has_access(env: Env, reader: Address, post_id: u64, author: Address) -> bool {
        ContentMonetization::has_access(&env, &reader, post_id, &author)
    }

    // --- Job Board Functions ---

    pub fn create_job(
        env: Env,
        employer: Address,
        title: String,
        description: String,
        budget: i128,
        milestones: Vec<Milestone>,
        required_skills: Vec<String>,
        token_addr: Address
    ) -> u64 {
        JobBoard::create_job(&env, employer, title, description, budget, milestones, required_skills, token_addr)
    }

    pub fn apply_for_job(env: Env, applicant: Address, job_id: u64, proposal: String) {
        JobBoard::apply_for_job(&env, applicant, job_id, proposal)
    }

    pub fn hire_freelancer(env: Env, employer: Address, job_id: u64, freelancer: Address) {
        JobBoard::hire_freelancer(&env, employer, job_id, freelancer)
    }

    pub fn complete_milestone(env: Env, employer: Address, job_id: u64, milestone_idx: u32, token_addr: Address) {
        JobBoard::complete_milestone(&env, employer, job_id, milestone_idx, token_addr)
    }

    // --- Skill Verification Functions ---

    pub fn add_verifier(env: Env, admin: Address, verifier: Address) {
        SkillVerification::add_verifier(&env, admin, verifier)
    }

    pub fn attest_skill(env: Env, verifier: Address, user: Address, skill_name: String, level: u32) {
        SkillVerification::attest_skill(&env, verifier, user, skill_name, level)
    }

    pub fn get_user_skills(env: Env, user: Address) -> Vec<SkillAttestation> {
        SkillVerification::get_user_skills(&env, user)
    }

    // --- File Notarization System ---

    /// Notarizes a file hash on-chain with a timestamp.
    /// This provides immutable proof that the file existed at this point in time.
    pub fn notarize_file(env: Env, owner: Address, hash: BytesN<32>, metadata: String) {
        file_notarization::NotarizationManager::notarize(&env, owner, hash, metadata);
    }

    /// Verifies a file hash against the on-chain notarization records.
    /// Returns the record if found, which includes the timestamp and owner.
    pub fn verify_file(env: Env, hash: BytesN<32>) -> Option<file_notarization::NotarizationRecord> {
        file_notarization::NotarizationManager::verify(&env, hash)
    }

    /// Retrieves all files notarized by a specific address.
    pub fn get_notarization_history(env: Env, owner: Address) -> Vec<file_notarization::NotarizationRecord> {
        file_notarization::NotarizationManager::get_history(&env, owner)
    }

    /// Performs bulk notarization for multiple file hashes in a single transaction.
    pub fn bulk_notarize_files(env: Env, owner: Address, hashes: Vec<BytesN<32>>, metadata: Vec<String>) {
        file_notarization::NotarizationManager::bulk_notarize(&env, owner, hashes, metadata);
    }

    // --- Quadratic Voting and Sybil Resistance ---

    /// Verify a student's identity for sybil-resistant voting.
    /// Only governance admins can verify students.
    pub fn verify_student_identity(env: Env, caller: Address, student: Address, did: String) -> bool {
        caller.require_auth();
        Self::require_governance_admin(&env, &caller);

        let success = sybil_resistance::verify_identity(&env, student.clone(), did.clone());
        if !success {
             panic_with_error!(&env, CertError::SybilVerificationFailed);
        }

        let recorder = EventRecorder::new(&env, env.current_contract_address());
        recorder.publisher.publish_identity_verified(&student, &did);

        success
    }

    /// Create a new quadratic voting proposal.
    /// Creator must be a sybil-verified student.
    pub fn create_qv_proposal(env: Env, creator: Address, title: String, description: String, duration: u64) -> u64 {
        creator.require_auth();
        if !sybil_resistance::is_verified(&env, &creator) {
            panic_with_error!(&env, CertError::Unauthorized);
        }

        let id = quadratic_voting::create_proposal(&env, creator.clone(), title.clone(), description.clone(), duration);

        let recorder = EventRecorder::new(&env, env.current_contract_address());
        recorder.publisher.publish_proposal_created(&creator, id, &title);

        id
    }

    /// Cast a vote on a proposal using quadratic cost calculation.
    /// cost = votes^2. Credits are deducted from the user's governance balance.
    pub fn cast_qv_vote(env: Env, user: Address, proposal_id: u64, votes: i128) {
        user.require_auth();

        let abs_votes = if votes < 0 { -votes } else { votes };
        let cost = (abs_votes as u128).checked_mul(abs_votes as u128).unwrap_or(u128::MAX);

        if sybil_resistance::get_governance_credits(&env, &user) < cost {
            panic_with_error!(&env, CertError::InsufficientGovernanceCredits);
        }

        let success = quadratic_voting::cast_vote(&env, user.clone(), proposal_id, votes);
        if !success {
             panic_with_error!(&env, CertError::InvalidProposal);
        }

        let recorder = EventRecorder::new(&env, env.current_contract_address());
        recorder.publisher.publish_vote_cast(&user, proposal_id, votes, cost);
    }

    /// Finalize and execute a proposal after its deadline.
    pub fn execute_qv_proposal(env: Env, proposal_id: u64) {
        let success = quadratic_voting::execute_proposal(&env, proposal_id);
        if !success {
             panic_with_error!(&env, CertError::InvalidProposal);
        }

        let proposal = quadratic_voting::get_proposal(&env, proposal_id).unwrap();
        let recorder = EventRecorder::new(&env, env.current_contract_address());
        recorder.publisher.publish_proposal_executed(proposal_id, proposal.status as u32);
    }

    /// Get current governance credit balance for an address.
    pub fn get_governance_credits(env: Env, address: Address) -> u128 {
        sybil_resistance::get_governance_credits(&env, &address)
    }

    /// Get details for a quadratic voting proposal.
    pub fn get_qv_proposal(env: Env, id: u64) -> Option<quadratic_voting::QVProposal> {
        quadratic_voting::get_proposal(&env, id)
    }

    /// Check if an address is sybil-verified.
    pub fn is_sybil_verified(env: Env, address: Address) -> bool {
        sybil_resistance::is_verified(&env, &address)
    }
}

#[cfg(test)]
mod tests;
#[cfg(test)]
mod prop_tests;

/// Helper function to compute metadata hash for certificate.
fn compute_metadata_hash(
    env: &Env,
    course_name: &String,
    grade: &Option<String>,
    did: &Option<String>,
) -> BytesN<32> {
    let mut hasher = env.crypto().hasher();

    hasher.update(course_name.as_bytes());
    if let Some(grade) = grade {
        hasher.update(grade.as_bytes());
    }
    if let Some(did) = did {
        hasher.update(did.as_bytes());
    }

    hasher.finalize()
}
