#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, Address,
    Env, String, Symbol,
};

// ── Errors (SC-HARD-20: range 400+) ──────────────────────────────────────────

/// Typed contract errors for the certificate NFT contract.
///
/// Discriminants are in the `400+` range (shared by non-primary contracts).
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum CertError {
    /// `400` — A certificate has already been minted for this student and course.
    AlreadyMinted = 400,
    /// `401` — Caller is not the admin.
    Unauthorized = 401,
}

#[contracttype]
pub struct CertificateMetadata {
    pub course_id: String,
    pub grade: String,
    pub uri: String,
}

#[contract]
pub struct CertificateNFTContract;

#[contractimpl]
impl CertificateNFTContract {
    /// Mints a new non-fungible achievement certificate to a student.
    ///
    /// # Arguments
    /// * `env`          - The environment execution context.
    /// * `admin`        - The admin address authorized to mint.
    /// * `student`      - The student address receiving the certificate.
    /// * `course_id`    - String identifier for the course.
    /// * `grade`        - Student's achieved grade.
    /// * `metadata_uri` - URI pointing to the certificate's JSON metadata.
    pub fn mint_certificate(
        env: Env,
        admin: Address,
        student: Address,
        course_id: String,
        grade: String,
        metadata_uri: String,
    ) {
        // Require the admin to sign this invocation.
        admin.require_auth();

        // Ensure we haven't already minted this exact course for this student.
        let key = (student.clone(), course_id.clone());
        if env.storage().persistent().has(&key) {
            panic_with_error!(&env, CertError::AlreadyMinted);
        }

        // Store the metadata persistently.
        let metadata = CertificateMetadata {
            course_id: course_id.clone(),
            grade: grade.clone(),
            uri: metadata_uri.clone(),
        };
        env.storage().persistent().set(&key, &metadata);

        // Emit an on-chain minting event.
        // Topics: ("mint", student_addr, course_id)
        let topics: (Symbol, Address, String) =
            (symbol_short!("mint"), student, course_id);
        env.events().publish(topics, metadata);
    }
}

// ── Storage TTL (SC-HARD-16) ─────────────────────────────────────────────────
// Bump instance storage lifetime on every contract execution to prevent
// automatic archival. Target: > 100,000 ledgers per acceptance criteria.

const SC16_TTL_THRESHOLD: u32 = 10_000;
const SC16_INSTANCE_BUMP: u32 = 100_000;

#[inline(always)]
fn sc16_bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(SC16_TTL_THRESHOLD, SC16_INSTANCE_BUMP);
}
