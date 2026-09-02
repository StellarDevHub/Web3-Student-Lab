#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, String, Symbol};

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
    /// * `env` - The environment execution context.
    /// * `admin` - The admin address authorized to mint.
    /// * `student` - The student address receiving the certificate.
    /// * `course_id` - String identifier for the course.
    /// * `grade` - Student's achieved grade.
    /// * `metadata_uri` - URI pointing to the certificate's JSON metadata.
    pub fn mint_certificate(
        env: Env,
        admin: Address,
        student: Address,
        course_id: String,
        grade: String,
        metadata_uri: String,
    ) {
        // Require the admin to sign this invocation
        admin.require_auth();

        // Ensure we haven't already minted this exact course for this student
        // Using a tuple (student, course_id) as the key
        let key = (student.clone(), course_id.clone());
        if env.storage().persistent().has(&key) {
            panic!("Certificate already minted for this student and course");
        }

        // Store the metadata persistently
        let metadata = CertificateMetadata {
            course_id: course_id.clone(),
            grade: grade.clone(),
            uri: metadata_uri.clone(),
        };
        env.storage().persistent().set(&key, &metadata);

        // Emit an on-chain minting event with indexed student and course topic symbols
        // Topics: ("mint", student_addr, course_id)
        let topics = (
            symbol_short!("mint"),
            student,
            course_id,
        );
        env.events().publish(topics, metadata);
    }
}
