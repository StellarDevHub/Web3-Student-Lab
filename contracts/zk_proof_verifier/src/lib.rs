#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Bytes, BytesN,
    Env,
};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    VerifyingKeyHash,
    UsedNullifier(BytesN<32>),
}

#[contracterror]
#[derive(Copy, Clone, Eq, PartialEq, Debug)]
pub enum VerifierError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidProof = 3,
    NullifierAlreadyUsed = 4,
    Unauthorized = 5,
}

#[contract]
pub struct ZkProofVerifierContract;

#[contractimpl]
impl ZkProofVerifierContract {
    pub fn initialize(env: Env, admin: Address, verifying_key_hash: BytesN<32>) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, VerifierError::AlreadyInitialized);
        }

        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::VerifyingKeyHash, &verifying_key_hash);
    }

    pub fn update_verifying_key(env: Env, admin: Address, new_verifying_key_hash: BytesN<32>) {
        ensure_initialized(&env);
        let stored_admin = read_admin(&env);
        if admin != stored_admin {
            panic_with_error!(&env, VerifierError::Unauthorized);
        }
        admin.require_auth();

        env.storage()
            .instance()
            .set(&DataKey::VerifyingKeyHash, &new_verifying_key_hash);
    }

    pub fn verify_lab_completion(
        env: Env,
        student: Address,
        public_input_hash: BytesN<32>,
        proof: Bytes,
        nullifier: BytesN<32>,
    ) -> bool {
        ensure_initialized(&env);
        student.require_auth();

        if env
            .storage()
            .persistent()
            .has(&DataKey::UsedNullifier(nullifier.clone()))
        {
            panic_with_error!(&env, VerifierError::NullifierAlreadyUsed);
        }

        let expected = expected_proof_hash(&env, &student, &public_input_hash, &nullifier);
        let provided = env.crypto().sha256(&proof);

        if provided != expected {
            panic_with_error!(&env, VerifierError::InvalidProof);
        }

        env.storage()
            .persistent()
            .set(&DataKey::UsedNullifier(nullifier.clone()), &true);

        env.events().publish(
            ("zk_verified", student.clone()),
            (public_input_hash, nullifier),
        );

        true
    }

    pub fn is_nullifier_used(env: Env, nullifier: BytesN<32>) -> bool {
        env.storage()
            .persistent()
            .has(&DataKey::UsedNullifier(nullifier))
    }
}

fn ensure_initialized(env: &Env) {
    if !env.storage().instance().has(&DataKey::Admin) {
        panic_with_error!(env, VerifierError::NotInitialized);
    }
}

fn read_admin(env: &Env) -> Address {
    env.storage()
        .instance()
        .get::<_, Address>(&DataKey::Admin)
        .unwrap_or_else(|| panic_with_error!(env, VerifierError::NotInitialized))
}

fn expected_proof_hash(
    env: &Env,
    student: &Address,
    public_input_hash: &BytesN<32>,
    nullifier: &BytesN<32>,
) -> BytesN<32> {
    let vk_hash: BytesN<32> = env
        .storage()
        .instance()
        .get(&DataKey::VerifyingKeyHash)
        .unwrap_or_else(|| panic_with_error!(env, VerifierError::NotInitialized));

    let mut payload = Bytes::new(env);
    payload.append(&Bytes::from_array(env, &vk_hash.to_array()));
    payload.append(&Bytes::from_array(env, &public_input_hash.to_array()));
    payload.append(&Bytes::from_array(env, &nullifier.to_array()));
    payload.append(&student.serialize(env));

    env.crypto().sha256(&payload).into()
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Address, Bytes, BytesN, Env};

    fn make_valid_proof(
        env: &Env,
        vk_hash: &BytesN<32>,
        student: &Address,
        public_input_hash: &BytesN<32>,
        nullifier: &BytesN<32>,
    ) -> Bytes {
        let mut payload = Bytes::new(env);
        payload.append(&Bytes::from_array(env, &vk_hash.to_array()));
        payload.append(&Bytes::from_array(env, &public_input_hash.to_array()));
        payload.append(&Bytes::from_array(env, &nullifier.to_array()));
        payload.append(&student.serialize(env));
        payload
    }

    #[test]
    fn verifies_valid_proof_once() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let student = Address::generate(&env);

        let vk_hash = BytesN::from_array(&env, &[1; 32]);
        let public_input_hash = BytesN::from_array(&env, &[2; 32]);
        let nullifier = BytesN::from_array(&env, &[3; 32]);

        env.mock_all_auths();
        ZkProofVerifierContract::initialize(env.clone(), admin, vk_hash.clone());

        let proof = make_valid_proof(&env, &vk_hash, &student, &public_input_hash, &nullifier);

        let ok = ZkProofVerifierContract::verify_lab_completion(
            env.clone(),
            student.clone(),
            public_input_hash,
            proof,
            nullifier.clone(),
        );

        assert!(ok);
        assert!(ZkProofVerifierContract::is_nullifier_used(env.clone(), nullifier));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn rejects_invalid_proof() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let student = Address::generate(&env);

        let vk_hash = BytesN::from_array(&env, &[10; 32]);
        let public_input_hash = BytesN::from_array(&env, &[11; 32]);
        let nullifier = BytesN::from_array(&env, &[12; 32]);

        env.mock_all_auths();
        ZkProofVerifierContract::initialize(env.clone(), admin, vk_hash);

        let fake_proof = Bytes::from_array(&env, &[9, 9, 9, 9]);
        let _ = ZkProofVerifierContract::verify_lab_completion(
            env.clone(),
            student,
            public_input_hash,
            fake_proof,
            nullifier,
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn rejects_replay_with_same_nullifier() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let student = Address::generate(&env);

        let vk_hash = BytesN::from_array(&env, &[4; 32]);
        let public_input_hash = BytesN::from_array(&env, &[5; 32]);
        let nullifier = BytesN::from_array(&env, &[6; 32]);

        env.mock_all_auths();
        ZkProofVerifierContract::initialize(env.clone(), admin, vk_hash.clone());

        let proof = make_valid_proof(&env, &vk_hash, &student, &public_input_hash, &nullifier);

        let _ = ZkProofVerifierContract::verify_lab_completion(
            env.clone(),
            student.clone(),
            public_input_hash.clone(),
            proof.clone(),
            nullifier.clone(),
        );

        let _ = ZkProofVerifierContract::verify_lab_completion(
            env.clone(),
            student,
            public_input_hash,
            proof,
            nullifier,
        );
    }
}
