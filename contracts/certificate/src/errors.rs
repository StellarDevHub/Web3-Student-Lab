//! # Certificate Error Definitions
//!
//! Standardized, documented error codes for academic and achievement certificates.
//! Namespaces:
//! - 100-199: Auth / Access / Soulbound
//! - 200-299: Storage / Records / Cohorts
//! - 300-399: Royalties & Arithmetic Bounds

use soroban_sdk::contracterror;

/// Typed, documented contract errors for the certificate registry contract.
#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum CertificateError {
    /// 101 — Caller is not the authorized issuer or administrator.
    Unauthorized = 101,
    /// 106 — Soulbound certificate cannot be transferred or delegated.
    SoulboundNonTransferable = 106,
    /// 107 - Certificate transfer or delegation attempted; certificates are non-transferable.
    NonTransferable = 107,
    /// 201 — Certificate record was not found in persistent storage.
    NotFound = 201,
    /// 202 — Certificate has already been revoked.
    AlreadyRevoked = 202,
    /// 203 — Certificate is not in a revoked state; reissuance denied.
    NotRevoked = 203,
    /// 204 — Cohort merkle root was not found.
    CohortNotFound = 204,
    /// 305 — Configured royalty basis points exceeds allowable ceiling (MAX_ROYALTY_BPS).
    RoyaltyTooHigh = 305,
}

pub type Error = CertificateError;
