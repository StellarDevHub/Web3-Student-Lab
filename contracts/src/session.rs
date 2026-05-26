use soroban_sdk::{
    contract, contractimpl, contracttype, xdr::ToXdr, Address, Bytes, BytesN, Env, Symbol,
};

#[contracttype]
#[derive(Clone)]
pub enum SessionKey {
    /// Storage key for a student's active session code.
    /// Maps Address (student) -> BytesN<16> (128-bit verification code).
    VerificationCode(Address),
}

#[contract]
pub struct SessionVerificationContract;

#[contractimpl]
impl SessionVerificationContract {
    /// Starts a new session for a student by generating a 128-bit temporary key.
    /// The key is stored in temporary storage with a short TTL.
    pub fn start_session(env: Env, student: Address) -> BytesN<16> {
        // Authenticate the student so only they can start their own session
        student.require_auth();

        // Generate a 128-bit (16-byte) session code.
        // We use the student's address and current timestamp to generate a unique key
        // as a workaround if the SDK prng() has issues in this environment.
        let mut msg = Bytes::new(&env);
        msg.append(&student.clone().to_xdr(&env));
        msg.append(&env.ledger().timestamp().to_xdr(&env));
        // Use Bytes to work with variable length if needed
        let mut session_bytes = [0u8; 16];
        let hash: [u8; 32] = env.crypto().sha256(&msg).into();

        // Take first 16 bytes of the 32-byte hash
        session_bytes.copy_from_slice(&hash[..16]);

        let session_code = BytesN::from_array(&env, &session_bytes);

        let storage_key = SessionKey::VerificationCode(student.clone());

        // Store the key in temporary storage.
        env.storage().temporary().set(&storage_key, &session_code);

        // Explicitly set a short TTL (e.g., ~100 ledgers, roughly 8-10 minutes)
        env.storage().temporary().extend_ttl(&storage_key, 100, 200);

        // Publish an event for transparency
        env.events()
            .publish((Symbol::new(&env, "session_started"), student), ());

        session_code
    }

    /// Verifies if a provided session code is valid for the student.
    /// Returns true if the code matches and has not expired.
    pub fn verify_session(env: Env, student: Address, provided_code: BytesN<16>) -> bool {
        let storage_key = SessionKey::VerificationCode(student);

        // Retrieve the code from temporary storage.
        // If it has expired or was never set, this will return None.
        let stored_code: Option<BytesN<16>> = env.storage().temporary().get(&storage_key);

        match stored_code {
            Some(code) => {
                // Check if the provided code matches the stored one
                code == provided_code
            }
            None => false, // Expired or not found
        }
    }

    /// Extends the session's TTL if the student is still active.
    pub fn extend_session(env: Env, student: Address) {
        student.require_auth();
        let storage_key = SessionKey::VerificationCode(student);

        if env.storage().temporary().has(&storage_key) {
            env.storage().temporary().extend_ttl(&storage_key, 100, 200);
        }
    }
}
