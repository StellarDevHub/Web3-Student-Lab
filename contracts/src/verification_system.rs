//! Carbon Credit Verification System
//!
//! This module implements a comprehensive verification system for carbon credits,
//! including verifier registration, verification workflows, and certification signatures.

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error,
    Address, Bytes, BytesN, Env, String, Symbol, Vec, Map
};

use crate::carbon_credit_platform::{
    CarbonProject, CarbonCredit, ProjectStatus, VerificationStatus
};

/// Verifier information and credentials
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VerifierProfile {
    /// Verifier's address
    pub address: Address,
    /// Verifier's organization name
    pub organization: String,
    /// Verifier's accreditation number
    pub accreditation_number: String,
    /// Accreditation standard (Verra, Gold Standard, etc.)
    pub accreditation_standard: Symbol,
    /// Verifier's specialization areas
    pub specializations: Vec<Symbol>,
    /// Verification status
    pub status: VerifierStatus,
    /// Registration timestamp
    pub registered_at: u64,
    /// Total verifications performed
    pub total_verifications: u32,
    /// Successful verifications
    pub successful_verifications: u32,
    /// Verifier rating (0-1000, 1000 = perfect)
    pub rating: u32,
    /// Metadata URI
    pub metadata_uri: String,
}

/// Verifier status
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum VerifierStatus {
    Pending,
    Approved,
    Suspended,
    Revoked,
}

/// Verification request for a project
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VerificationRequest {
    /// Unique request ID
    pub request_id: u128,
    /// Project being verified
    pub project_id: Symbol,
    /// Request initiator
    pub requester: Address,
    /// Assigned verifier
    pub assigned_verifier: Option<Address>,
    /// Verification type
    pub verification_type: VerificationType,
    /// Request status
    pub status: VerificationRequestStatus,
    /// Request creation timestamp
    pub created_at: u64,
    /// Last updated timestamp
    pub updated_at: u64,
    /// Expected completion date
    pub expected_completion: Option<u64>,
    /// Verification fee
    pub fee: u64,
    /// Additional notes
    pub notes: String,
    /// Required documents
    pub required_documents: Vec<Symbol>,
    /// Submitted documents
    pub submitted_documents: Vec<DocumentReference>,
}

/// Verification type
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum VerificationType {
    InitialVerification,
    AnnualVerification,
    SpotCheck,
    Recertification,
}

/// Verification request status
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum VerificationRequestStatus {
    Pending,
    Assigned,
    InProgress,
    Submitted,
    Approved,
    Rejected,
    Expired,
}

/// Document reference for verification
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DocumentReference {
    /// Document type
    pub document_type: Symbol,
    /// Document URI
    pub uri: String,
    /// Document hash for integrity verification
    pub hash: BytesN<32>,
    /// Submission timestamp
    pub submitted_at: u64,
    /// Verification status
    pub status: DocumentStatus,
}

/// Document status
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum DocumentStatus {
    Pending,
    Verified,
    Rejected,
}

/// Verification report and result
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VerificationReport {
    /// Report ID
    pub report_id: u128,
    /// Associated verification request
    pub request_id: u128,
    /// Verifier who created the report
    pub verifier: Address,
    /// Project verified
    pub project_id: Symbol,
    /// Verification outcome
    pub outcome: VerificationOutcome,
    /// Verification score (0-1000)
    pub score: u32,
    /// Report creation timestamp
    pub created_at: u64,
    /// Report validity period (in seconds)
    pub validity_period: u64,
    /// Findings and observations
    pub findings: Vec<Finding>,
    /// Recommendations
    pub recommendations: Vec<String>,
    /// Verifier's digital signature
    pub signature: Bytes,
    /// Report URI
    pub report_uri: String,
}

/// Verification outcome
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum VerificationOutcome {
    Approved,
    ApprovedWithConditions,
    Rejected,
    RequiresMoreInformation,
}

/// Individual finding in verification report
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Finding {
    /// Finding category
    pub category: Symbol,
    /// Finding severity
    pub severity: FindingSeverity,
    /// Finding description
    pub description: String,
    /// Required corrective actions
    pub corrective_actions: Vec<String>,
    /// Deadline for corrective actions
    pub deadline: Option<u64>,
}

/// Finding severity
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum FindingSeverity {
    Critical,
    Major,
    Minor,
    Observation,
}

/// Storage keys
#[contracttype]
#[derive(Clone)]
enum VerificationDataKey {
    /// Next verifier ID
    NextVerifierId,
    /// Next verification request ID
    NextRequestId,
    /// Next report ID
    NextReportId,
    /// Verifier profiles (address -> VerifierProfile)
    VerifierProfile(Address),
    /// Verification requests (request_id -> VerificationRequest)
    VerificationRequest(u128),
    /// Verification reports (report_id -> VerificationReport)
    VerificationReport(u128),
    /// Project verification history (project_id -> Vec<request_id>)
    ProjectVerificationHistory(Symbol),
    /// Verifier's assigned requests (address -> Vec<request_id>)
    VerifierRequests(Address),
    /// Pending verification requests (Vec<request_id>)
    PendingRequests,
    /// Verification system configuration
    Config,
}

/// Verification system configuration
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VerificationConfig {
    /// System admin
    pub admin: Address,
    /// Default verification fee
    pub default_verification_fee: u64,
    /// Maximum verification fee
    pub max_verification_fee: u64,
    /// Standard verification period (seconds)
    pub standard_verification_period: u64,
    /// Minimum verifier rating
    pub min_verifier_rating: u32,
    /// Required documents for initial verification
    pub initial_verification_docs: Vec<Symbol>,
    /// Required documents for annual verification
    pub annual_verification_docs: Vec<Symbol>,
}

/// Contract errors
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum VerificationError {
    NotInitialized = 200,
    Unauthorized = 201,
    InvalidVerifier = 202,
    VerifierNotFound = 203,
    VerifierNotApproved = 204,
    InvalidRequestId = 205,
    RequestNotFound = 206,
    RequestAlreadyAssigned = 207,
    InvalidRequestStatus = 208,
    InvalidReportId = 209,
    ReportNotFound = 210,
    InvalidProjectId = 211,
    ProjectNotFound = 212,
    InvalidDocument = 213,
    DocumentRequired = 214,
    InvalidSignature = 215,
    VerificationExpired = 216,
    InsufficientFee = 217,
    RatingTooLow = 218,
    StringTooLong = 219,
    InvalidAddress = 220,
}

/// Constants
const DEFAULT_VERIFICATION_FEE: u64 = 1000; // In base currency units
const MAX_VERIFICATION_FEE: u64 = 10000;
const STANDARD_VERIFICATION_PERIOD: u64 = 30 * 24 * 3600; // 30 days
const MIN_VERIFIER_RATING: u32 = 700; // 70%
const MAX_STRING_LENGTH: u32 = 256;
const VERIFICATION_TTL_LEDGERS: u32 = 6_307_200; // ~1 year

#[contract]
pub struct VerificationSystem;

#[contractimpl]
impl VerificationSystem {
    /// Initialize the verification system
    pub fn init(env: Env, admin: Address) {
        if env.storage().instance().has(&VerificationDataKey::Config) {
            panic_with_error!(&env, VerificationError::NotInitialized);
        }

        let config = VerificationConfig {
            admin: admin.clone(),
            default_verification_fee: DEFAULT_VERIFICATION_FEE,
            max_verification_fee: MAX_VERIFICATION_FEE,
            standard_verification_period: STANDARD_VERIFICATION_PERIOD,
            min_verifier_rating: MIN_VERIFIER_RATING,
            initial_verification_docs: Self::get_default_initial_docs(&env),
            annual_verification_docs: Self::get_default_annual_docs(&env),
        };

        env.storage().instance().set(&VerificationDataKey::Config, &config);
        env.storage().instance().set(&VerificationDataKey::NextRequestId, &1u128);
        env.storage().instance().set(&VerificationDataKey::NextReportId, &1u128);
        env.storage().instance().set(&VerificationDataKey::PendingRequests, &Vec::new(&env));
    }

    /// Register as a verifier
    pub fn register_verifier(
        env: Env,
        caller: Address,
        organization: String,
        accreditation_number: String,
        accreditation_standard: Symbol,
        specializations: Vec<Symbol>,
        metadata_uri: String,
    ) {
        caller.require_auth();

        Self::validate_string_length(&env, &organization)?;
        Self::validate_string_length(&env, &accreditation_number)?;
        Self::validate_string_length(&env, &metadata_uri)?;

        let config = Self::get_config(&env);

        let profile = VerifierProfile {
            address: caller.clone(),
            organization,
            accreditation_number,
            accreditation_standard,
            specializations,
            status: VerifierStatus::Pending,
            registered_at: env.ledger().timestamp(),
            total_verifications: 0,
            successful_verifications: 0,
            rating: 800, // Start with good rating
            metadata_uri,
        };

        env.storage().instance().set(&VerificationDataKey::VerifierProfile(caller.clone()), &profile);

        // Emit verifier registration event
        env.events().publish(
            (Symbol::new(&env, "verifier_registered"),),
            (caller.clone(), profile.accreditation_standard),
        );
    }

    /// Approve a verifier (admin only)
    pub fn approve_verifier(env: Env, caller: Address, verifier: Address) {
        caller.require_auth();

        let config = Self::get_config(&env);
        if caller != config.admin {
            panic_with_error!(&env, VerificationError::Unauthorized);
        }

        let mut profile: VerifierProfile = env.storage().instance()
            .get(&VerificationDataKey::VerifierProfile(verifier.clone()))
            .unwrap_or_else(|| panic_with_error!(&env, VerificationError::VerifierNotFound));

        if profile.status == VerifierStatus::Approved {
            panic_with_error!(&env, VerificationError::InvalidVerifier);
        }

        profile.status = VerifierStatus::Approved;
        env.storage().instance().set(&VerificationDataKey::VerifierProfile(verifier.clone()), &profile);

        // Emit verifier approval event
        env.events().publish(
            (Symbol::new(&env, "verifier_approved"),),
            (verifier.clone(), caller),
        );
    }

    /// Create a verification request
    pub fn create_verification_request(
        env: Env,
        caller: Address,
        project_id: Symbol,
        verification_type: VerificationType,
        notes: String,
    ) -> u128 {
        caller.require_auth();

        Self::validate_string_length(&env, &notes)?;

        let config = Self::get_config(&env);
        let fee = match verification_type {
            VerificationType::InitialVerification => config.default_verification_fee,
            VerificationType::AnnualVerification => config.default_verification_fee / 2,
            VerificationType::SpotCheck => config.default_verification_fee / 4,
            VerificationType::Recertification => config.default_verification_fee * 3 / 4,
        };

        let request_id = Self::generate_request_id(&env);
        let current_time = env.ledger().timestamp();

        let required_docs = match verification_type {
            VerificationType::InitialVerification => config.initial_verification_docs.clone(),
            VerificationType::AnnualVerification => config.annual_verification_docs.clone(),
            _ => Vec::new(&env),
        };

        let request = VerificationRequest {
            request_id,
            project_id: project_id.clone(),
            requester: caller.clone(),
            assigned_verifier: None,
            verification_type,
            status: VerificationRequestStatus::Pending,
            created_at: current_time,
            updated_at: current_time,
            expected_completion: Some(current_time.saturating_add(config.standard_verification_period)),
            fee,
            notes,
            required_documents: required_docs.clone(),
            submitted_documents: Vec::new(&env),
        };

        env.storage().instance().set(&VerificationDataKey::VerificationRequest(request_id), &request);

        // Add to project verification history
        Self::add_project_verification(&env, &project_id, request_id);

        // Add to pending requests
        Self::add_pending_request(&env, request_id);

        // Emit verification request event
        env.events().publish(
            (Symbol::new(&env, "verification_request_created"),),
            (request_id, project_id, caller, verification_type as u32),
        );

        request_id
    }

    /// Assign a verifier to a verification request
    pub fn assign_verifier(env: Env, caller: Address, request_id: u128, verifier: Address) {
        caller.require_auth();

        let config = Self::get_config(&env);
        if caller != config.admin {
            panic_with_error!(&env, VerificationError::Unauthorized);
        }

        let mut request: VerificationRequest = env.storage().instance()
            .get(&VerificationDataKey::VerificationRequest(request_id))
            .unwrap_or_else(|| panic_with_error!(&env, VerificationError::RequestNotFound));

        if request.status != VerificationRequestStatus::Pending {
            panic_with_error!(&env, VerificationError::InvalidRequestStatus);
        }

        if request.assigned_verifier.is_some() {
            panic_with_error!(&env, VerificationError::RequestAlreadyAssigned);
        }

        let verifier_profile: VerifierProfile = env.storage().instance()
            .get(&VerificationDataKey::VerifierProfile(verifier.clone()))
            .unwrap_or_else(|| panic_with_error!(&env, VerificationError::VerifierNotFound));

        if verifier_profile.status != VerifierStatus::Approved {
            panic_with_error!(&env, VerificationError::VerifierNotApproved);
        }

        if verifier_profile.rating < config.min_verifier_rating {
            panic_with_error!(&env, VerificationError::RatingTooLow);
        }

        request.assigned_verifier = Some(verifier.clone());
        request.status = VerificationRequestStatus::Assigned;
        request.updated_at = env.ledger().timestamp();

        env.storage().instance().set(&VerificationDataKey::VerificationRequest(request_id), &request);

        // Remove from pending requests
        Self::remove_pending_request(&env, request_id);

        // Add to verifier's assigned requests
        Self::add_verifier_request(&env, &verifier, request_id);

        // Emit verifier assignment event
        env.events().publish(
            (Symbol::new(&env, "verifier_assigned"),),
            (request_id, verifier, caller),
        );
    }

    /// Submit verification report
    pub fn submit_verification_report(
        env: Env,
        caller: Address,
        request_id: u128,
        outcome: VerificationOutcome,
        score: u32,
        findings: Vec<Finding>,
        recommendations: Vec<String>,
        signature: Bytes,
        report_uri: String,
    ) {
        caller.require_auth();

        Self::validate_string_length(&env, &report_uri)?;

        let request: VerificationRequest = env.storage().instance()
            .get(&VerificationDataKey::VerificationRequest(request_id))
            .unwrap_or_else(|| panic_with_error!(&env, VerificationError::RequestNotFound));

        if request.assigned_verifier != Some(caller.clone()) {
            panic_with_error!(&env, VerificationError::Unauthorized);
        }

        if request.status != VerificationRequestStatus::Assigned &&
           request.status != VerificationRequestStatus::InProgress {
            panic_with_error!(&env, VerificationError::InvalidRequestStatus);
        }

        if score > 1000 {
            panic_with_error!(&env, VerificationError::InvalidVerifier);
        }

        let report_id = Self::generate_report_id(&env);
        let current_time = env.ledger().timestamp();

        let report = VerificationReport {
            report_id,
            request_id,
            verifier: caller.clone(),
            project_id: request.project_id.clone(),
            outcome,
            score,
            created_at: current_time,
            validity_period: STANDARD_VERIFICATION_PERIOD,
            findings,
            recommendations,
            signature,
            report_uri: String::from_str_slice(&env, &format!("https://api.carbon-credits.io/reports/{}", report_id)),
        };

        env.storage().instance().set(&VerificationDataKey::VerificationReport(report_id), &report);

        // Update request status
        let mut updated_request = request;
        updated_request.status = VerificationRequestStatus::Submitted;
        updated_request.updated_at = current_time;
        env.storage().instance().set(&VerificationDataKey::VerificationRequest(request_id), &updated_request);

        // Update verifier stats
        Self::update_verifier_stats(&env, &caller, true);

        // Emit report submission event
        env.events().publish(
            (Symbol::new(&env, "verification_report_submitted"),),
            (report_id, request_id, caller, outcome as u32, score),
        );
    }

    /// Approve a verification report (admin only)
    pub fn approve_verification_report(env: Env, caller: Address, report_id: u128) {
        caller.require_auth();

        let config = Self::get_config(&env);
        if caller != config.admin {
            panic_with_error!(&env, VerificationError::Unauthorized);
        }

        let report: VerificationReport = env.storage().instance()
            .get(&VerificationDataKey::VerificationReport(report_id))
            .unwrap_or_else(|| panic_with_error!(&env, VerificationError::ReportNotFound));

        let mut request: VerificationRequest = env.storage().instance()
            .get(&VerificationDataKey::VerificationRequest(report.request_id))
            .unwrap_or_else(|| panic_with_error!(&env, VerificationError::RequestNotFound));

        if request.status != VerificationRequestStatus::Submitted {
            panic_with_error!(&env, VerificationError::InvalidRequestStatus);
        }

        // Update request status based on outcome
        request.status = match report.outcome {
            VerificationOutcome::Approved | VerificationOutcome::ApprovedWithConditions => {
                VerificationRequestStatus::Approved
            },
            VerificationOutcome::Rejected => VerificationRequestStatus::Rejected,
            VerificationOutcome::RequiresMoreInformation => VerificationRequestStatus::Pending,
        };

        request.updated_at = env.ledger().timestamp();
        env.storage().instance().set(&VerificationDataKey::VerificationRequest(report.request_id), &request);

        // Emit report approval event
        env.events().publish(
            (Symbol::new(&env, "verification_report_approved"),),
            (report_id, caller, report.outcome as u32),
        );
    }

    /// Get verifier profile
    pub fn get_verifier(env: Env, verifier: Address) -> VerifierProfile {
        env.storage().instance()
            .get(&VerificationDataKey::VerifierProfile(verifier))
            .unwrap_or_else(|| panic_with_error!(&env, VerificationError::VerifierNotFound))
    }

    /// Get verification request
    pub fn get_verification_request(env: Env, request_id: u128) -> VerificationRequest {
        env.storage().instance()
            .get(&VerificationDataKey::VerificationRequest(request_id))
            .unwrap_or_else(|| panic_with_error!(&env, VerificationError::RequestNotFound))
    }

    /// Get verification report
    pub fn get_verification_report(env: Env, report_id: u128) -> VerificationReport {
        env.storage().instance()
            .get(&VerificationDataKey::VerificationReport(report_id))
            .unwrap_or_else(|| panic_with_error!(&env, VerificationError::ReportNotFound))
    }

    /// Get pending verification requests
    pub fn get_pending_requests(env: Env) -> Vec<u128> {
        env.storage().instance()
            .get(&VerificationDataKey::PendingRequests)
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Get verifier's assigned requests
    pub fn get_verifier_requests(env: Env, verifier: Address) -> Vec<u128> {
        env.storage().instance()
            .get(&VerificationDataKey::VerifierRequests(verifier))
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Get project's verification history
    pub fn get_project_verification_history(env: Env, project_id: Symbol) -> Vec<u128> {
        env.storage().instance()
            .get(&VerificationDataKey::ProjectVerificationHistory(project_id))
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Get verification system configuration
    pub fn get_config(env: &Env) -> VerificationConfig {
        env.storage().instance()
            .get(&VerificationDataKey::Config)
            .unwrap_or_else(|| panic_with_error!(env, VerificationError::NotInitialized))
    }

    /// Helper functions
    fn generate_request_id(env: &Env) -> u128 {
        let id: u128 = env.storage().instance()
            .get(&VerificationDataKey::NextRequestId)
            .unwrap_or(1);
        env.storage().instance().set(&VerificationDataKey::NextRequestId, &(id + 1));
        id
    }

    fn generate_report_id(env: &Env) -> u128 {
        let id: u128 = env.storage().instance()
            .get(&VerificationDataKey::NextReportId)
            .unwrap_or(1);
        env.storage().instance().set(&VerificationDataKey::NextReportId, &(id + 1));
        id
    }

    fn add_project_verification(env: &Env, project_id: &Symbol, request_id: u128) {
        let mut history: Vec<u128> = env.storage().instance()
            .get(&VerificationDataKey::ProjectVerificationHistory(project_id.clone()))
            .unwrap_or_else(|| Vec::new(env));
        history.push_back(request_id);
        env.storage().instance().set(&VerificationDataKey::ProjectVerificationHistory(project_id.clone()), &history);
    }

    fn add_verifier_request(env: &Env, verifier: &Address, request_id: u128) {
        let mut requests: Vec<u128> = env.storage().instance()
            .get(&VerificationDataKey::VerifierRequests(verifier.clone()))
            .unwrap_or_else(|| Vec::new(env));
        requests.push_back(request_id);
        env.storage().instance().set(&VerificationDataKey::VerifierRequests(verifier.clone()), &requests);
    }

    fn add_pending_request(env: &Env, request_id: u128) {
        let mut pending: Vec<u128> = env.storage().instance()
            .get(&VerificationDataKey::PendingRequests)
            .unwrap_or_else(|| Vec::new(env));
        pending.push_back(request_id);
        env.storage().instance().set(&VerificationDataKey::PendingRequests, &pending);
    }

    fn remove_pending_request(env: &Env, request_id: u128) {
        let mut pending: Vec<u128> = env.storage().instance()
            .get(&VerificationDataKey::PendingRequests)
            .unwrap_or_else(|| Vec::new(env));

        for i in 0..pending.len() {
            if pending.get(i).unwrap() == request_id {
                pending.remove(i);
                break;
            }
        }

        env.storage().instance().set(&VerificationDataKey::PendingRequests, &pending);
    }

    fn update_verifier_stats(env: &Env, verifier: &Address, successful: bool) {
        let mut profile: VerifierProfile = env.storage().instance()
            .get(&VerificationDataKey::VerifierProfile(verifier.clone()))
            .unwrap_or_else(|| panic_with_error!(env, VerificationError::VerifierNotFound));

        profile.total_verifications = profile.total_verifications.saturating_add(1);
        if successful {
            profile.successful_verifications = profile.successful_verifications.saturating_add(1);
            // Improve rating slightly
            profile.rating = (profile.rating.saturating_add(10)).min(1000);
        } else {
            // Decrease rating slightly
            profile.rating = profile.rating.saturating_sub(5);
        }

        env.storage().instance().set(&VerificationDataKey::VerifierProfile(verifier.clone()), &profile);
    }

    fn validate_string_length(env: &Env, string: &String) -> Result<(), VerificationError> {
        if string.len() > MAX_STRING_LENGTH as usize {
            panic_with_error!(env, VerificationError::StringTooLong);
        }
        Ok(())
    }

    fn get_default_initial_docs(env: &Env) -> Vec<Symbol> {
        let mut docs = Vec::new(env);
        docs.push_back(Symbol::new(env, "project_plan"));
        docs.push_back(Symbol::new(env, "methodology_document"));
        docs.push_back(Symbol::new(env, "baseline_study"));
        docs.push_back(Symbol::new(env, "monitoring_plan"));
        docs.push_back(Symbol::new(env, "legal_documentation"));
        docs
    }

    fn get_default_annual_docs(env: &Env) -> Vec<Symbol> {
        let mut docs = Vec::new(env);
        docs.push_back(Symbol::new(env, "annual_monitoring_report"));
        docs.push_back(Symbol::new(env, "verification_statement"));
        docs.push_back(Symbol::new(env, "performance_data"));
        docs
    }
}
