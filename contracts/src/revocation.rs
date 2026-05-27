//! On-chain certificate revocation system with comprehensive audit trail.
//!
//! This module provides:
//! - Revocation reason enums
//! - Revocation record tracking
//! - Certificate status lifecycle management
//! - Revocation history querying

use soroban_sdk::{contracttype, Address, Env, String};

/// Certificate lifecycle states for tracking status changes.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CertificateStatus {
    /// Certificate is valid and verifiable on-chain.
    Active,
    /// Certificate has been revoked by an administrator.
    Revoked,
    /// Certificate has been replaced by a new certificate.
    Reissued,
    /// Old certificate version after a reissuance event.
    Superseded,
}

/// Reasons for certificate revocation with audit trail support.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RevocationReason {
    /// Student engaged in academic dishonesty (plagiarism, cheating, etc.)
    AcademicDishonesty,
    /// Certificate was issued by mistake or error.
    IssuedInError,
    /// Revocation requested by the student themselves.
    StudentRequest,
    /// The course or coursework has been invalidated.
    CourseInvalidated,
    /// Evidence of fraudulent activity detected.
    FraudulentActivity,
    /// Other reason (with additional context).
    Other,
}

/// Complete revocation audit record stored on-chain.
///
/// Immutable once created; enables comprehensive revocation history queries
/// for compliance and dispute resolution.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RevocationRecord {
    /// Token/certificate ID being revoked.
    pub token_id: u128,
    /// Ledger timestamp when revocation occurred.
    pub revoked_at: u64,
    /// Address of the administrator who performed the revocation.
    pub revoked_by: Address,
    /// Reason for revocation (supports custom notes via Other variant).
    pub reason: RevocationReason,
    /// Additional context notes (e.g., "Plagiarism in Section 3.2").
    pub notes: String,
    /// Original mint date of the certificate (for historical tracking).
    pub original_mint_date: u64,
}

/// Complete certificate state tracking all lifecycle events.
///
/// Enables efficient certificate status queries without iterating
/// through the full revocation history.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CertificateState {
    /// Current status of the certificate.
    pub status: CertificateStatus,
    /// Timestamp when the certificate was minted.
    pub minted_at: u64,
    /// Timestamp when revoked (if applicable).
    pub revoked_at: Option<u64>,
    /// Token ID of the replacement certificate (if reissued).
    pub reissued_token_id: Option<u128>,
    /// Token ID of the certificate that superseded this one.
    pub superseded_by: Option<u128>,
}

impl CertificateState {
    /// Create a new active certificate state.
    pub fn new_active(minted_at: u64) -> Self {
        Self {
            status: CertificateStatus::Active,
            minted_at,
            revoked_at: None,
            reissued_token_id: None,
            superseded_by: None,
        }
    }

    /// Mark this certificate as revoked.
    pub fn revoke(&mut self, revoked_at: u64) {
        self.status = CertificateStatus::Revoked;
        self.revoked_at = Some(revoked_at);
    }

    /// Mark this certificate as reissued (creates new certificate).
    pub fn mark_reissued(&mut self, new_token_id: u128, reissued_at: u64) {
        self.status = CertificateStatus::Reissued;
        self.reissued_token_id = Some(new_token_id);
        self.revoked_at = Some(reissued_at);
    }

    /// Mark this certificate as superseded by another.
    pub fn mark_superseded(&mut self, superseded_by: u128) {
        self.status = CertificateStatus::Superseded;
        self.superseded_by = Some(superseded_by);
    }

    /// Check if certificate is currently valid (not revoked, not superseded).
    pub fn is_valid(&self) -> bool {
        matches!(self.status, CertificateStatus::Active)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_certificate_state_new_active() {
        let state = CertificateState::new_active(1000);
        assert_eq!(state.status, CertificateStatus::Active);
        assert_eq!(state.minted_at, 1000);
        assert!(state.revoked_at.is_none());
        assert!(state.is_valid());
    }

    #[test]
    fn test_certificate_state_revoke() {
        let mut state = CertificateState::new_active(1000);
        state.revoke(2000);
        assert_eq!(state.status, CertificateStatus::Revoked);
        assert_eq!(state.revoked_at, Some(2000));
        assert!(!state.is_valid());
    }

    #[test]
    fn test_certificate_state_mark_reissued() {
        let mut state = CertificateState::new_active(1000);
        state.mark_reissued(99, 2000);
        assert_eq!(state.status, CertificateStatus::Reissued);
        assert_eq!(state.reissued_token_id, Some(99));
        assert_eq!(state.revoked_at, Some(2000));
        assert!(!state.is_valid());
    }

    #[test]
    fn test_certificate_state_mark_superseded() {
        let mut state = CertificateState::new_active(1000);
        state.mark_superseded(88);
        assert_eq!(state.status, CertificateStatus::Superseded);
        assert_eq!(state.superseded_by, Some(88));
        assert!(!state.is_valid());
    }
}
