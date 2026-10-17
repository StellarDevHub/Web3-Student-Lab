use super::*;
use soroban_sdk::{
    crypto::bn254::{Bn254Fr, Bn254G1Affine},
    testutils::Address as _,
    Address, Bytes, BytesN, Env, TryFromVal, Vec,
};

const ONE: [u8; 32] = [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
];
const G1_GENERATOR: [u8; 64] = [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2,
];
const G2_GENERATOR: [u8; 128] = [
    0x19, 0x8e, 0x93, 0x93, 0x92, 0x0d, 0x48, 0x3a, 0x72, 0x60, 0xbf, 0xb7, 0x31, 0xfb, 0x5d, 0x25,
    0xf1, 0xaa, 0x49, 0x33, 0x35, 0xa9, 0xe7, 0x12, 0x97, 0xe4, 0x85, 0xb7, 0xae, 0xf3, 0x12, 0xc2,
    0x18, 0x00, 0xde, 0xef, 0x12, 0x1f, 0x1e, 0x76, 0x42, 0x6a, 0x00, 0x66, 0x5e, 0x5c, 0x44, 0x79,
    0x67, 0x43, 0x22, 0xd4, 0xf7, 0x5e, 0xda, 0xdd, 0x46, 0xde, 0xbd, 0x5c, 0xd9, 0x92, 0xf6, 0xed,
    0x09, 0x06, 0x89, 0xd0, 0x58, 0x5f, 0xf0, 0x75, 0xec, 0x9e, 0x99, 0xad, 0x69, 0x0c, 0x33, 0x95,
    0xbc, 0x4b, 0x31, 0x33, 0x70, 0xb3, 0x8e, 0xf3, 0x55, 0xac, 0xda, 0xdc, 0xd1, 0x22, 0x97, 0x5b,
    0x12, 0xc8, 0x5e, 0xa5, 0xdb, 0x8c, 0x6d, 0xeb, 0x4a, 0xab, 0x71, 0x80, 0x8d, 0xcb, 0x40, 0x8f,
    0xe3, 0xd1, 0xe7, 0x69, 0x0c, 0x43, 0xd3, 0x7b, 0x4c, 0xe6, 0xcc, 0x01, 0x66, 0xfa, 0x7d, 0xaa,
];

fn g1_generator(env: &Env) -> Bytes {
    Bytes::from_array(env, &G1_GENERATOR)
}

fn g1_infinity(env: &Env) -> Bytes {
    Bytes::from_array(env, &[0; 64])
}

fn g2_generator(env: &Env) -> Bytes {
    Bytes::from_array(env, &G2_GENERATOR)
}

fn g2_infinity(env: &Env) -> Bytes {
    Bytes::from_array(env, &[0; 128])
}

fn test_key(env: &Env) -> VerifyingKey {
    let mut gamma_abc_g1 = Vec::new(env);
    gamma_abc_g1.push_back(g1_infinity(env));
    gamma_abc_g1.push_back(g1_generator(env));
    gamma_abc_g1.push_back(g1_generator(env));
    VerifyingKey {
        alpha_g1: g1_infinity(env),
        beta_g2: g2_infinity(env),
        gamma_g2: g2_generator(env),
        delta_g2: g2_generator(env),
        gamma_abc_g1,
    }
}

fn proof_for(
    env: &Env,
    key: &VerifyingKey,
    course_hash: &BytesN<32>,
    nullifier: &BytesN<32>,
) -> Groth16Proof {
    let mut ic_points = Vec::<Bn254G1Affine>::new(env);
    for point in key.gamma_abc_g1.iter().skip(1) {
        ic_points.push_back(Bn254G1Affine::from_bytes(
            BytesN::<64>::try_from_val(env, point.as_val()).unwrap(),
        ));
    }
    let mut scalars = Vec::new(env);
    scalars.push_back(Bn254Fr::from_bytes(course_hash.clone()));
    scalars.push_back(Bn254Fr::from_bytes(nullifier.clone()));
    let vk_x = env.crypto().bn254().g1_msm(ic_points, scalars);
    let c = -vk_x;
    Groth16Proof {
        a_g1: g1_infinity(env),
        b_g2: g2_infinity(env),
        c_g1: Bytes::from_array(env, &c.to_bytes().to_array()),
    }
}

fn initialized_client(env: &Env) -> (ZkProofVerifierContractClient<'_>, Address) {
    let contract_id = env.register(ZkProofVerifierContract, ());
    let client = ZkProofVerifierContractClient::new(env, &contract_id);
    let admin = Address::generate(env);
    env.mock_all_auths();
    client.initialize(&admin, &test_key(env));
    (client, admin)
}

#[test]
fn verifies_groth16_pairing_without_revealing_address() {
    let env = Env::default();
    let (client, _) = initialized_client(&env);
    let course_hash = BytesN::from_array(&env, &ONE);
    let nullifier = BytesN::from_array(&env, &ONE);
    let public_inputs = Vec::new(&env);
    let proof = proof_for(&env, &test_key(&env), &course_hash, &nullifier);

    assert!(client.verify_completion(&course_hash, &nullifier, &public_inputs, &proof));
    assert!(client.is_nullifier_used(&nullifier));
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn rejects_a_proof_that_fails_the_pairing_equation() {
    let env = Env::default();
    let (client, _) = initialized_client(&env);
    let course_hash = BytesN::from_array(&env, &ONE);
    let nullifier = BytesN::from_array(&env, &ONE);
    let public_inputs = Vec::new(&env);
    let invalid_proof = Groth16Proof {
        c_g1: g1_infinity(&env),
        ..proof_for(&env, &test_key(&env), &course_hash, &nullifier)
    };

    client.verify_completion(&course_hash, &nullifier, &public_inputs, &invalid_proof);
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn proof_is_bound_to_its_course_hash() {
    let env = Env::default();
    let (client, _) = initialized_client(&env);
    let course_hash = BytesN::from_array(&env, &ONE);
    let other_course = BytesN::from_array(&env, &{
        let mut two = ONE;
        two[31] = 2;
        two
    });
    let nullifier = BytesN::from_array(&env, &ONE);
    let public_inputs = Vec::new(&env);
    let proof = proof_for(&env, &test_key(&env), &course_hash, &nullifier);

    client.verify_completion(&other_course, &nullifier, &public_inputs, &proof);
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn proof_is_bound_to_its_nullifier() {
    let env = Env::default();
    let (client, _) = initialized_client(&env);
    let course_hash = BytesN::from_array(&env, &ONE);
    let nullifier = BytesN::from_array(&env, &ONE);
    let other_nullifier = BytesN::from_array(&env, &{
        let mut two = ONE;
        two[31] = 2;
        two
    });
    let public_inputs = Vec::new(&env);
    let proof = proof_for(&env, &test_key(&env), &course_hash, &nullifier);

    client.verify_completion(&course_hash, &other_nullifier, &public_inputs, &proof);
}

#[test]
#[should_panic(expected = "Error(Contract, #6)")]
fn rejects_public_input_vectors_with_the_wrong_arity() {
    let env = Env::default();
    let (client, _) = initialized_client(&env);
    let course_hash = BytesN::from_array(&env, &ONE);
    let nullifier = BytesN::from_array(&env, &ONE);
    let mut public_inputs = Vec::new(&env);
    public_inputs.push_back(BytesN::from_array(&env, &ONE));
    let proof = proof_for(&env, &test_key(&env), &course_hash, &nullifier);

    client.verify_completion(&course_hash, &nullifier, &public_inputs, &proof);
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn rejects_malformed_proof_point_encodings() {
    let env = Env::default();
    let (client, _) = initialized_client(&env);
    let course_hash = BytesN::from_array(&env, &ONE);
    let nullifier = BytesN::from_array(&env, &ONE);
    let public_inputs = Vec::new(&env);
    let invalid_proof = Groth16Proof {
        b_g2: Bytes::from_array(&env, &[0; 127]),
        ..proof_for(&env, &test_key(&env), &course_hash, &nullifier)
    };

    client.verify_completion(&course_hash, &nullifier, &public_inputs, &invalid_proof);
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn rejects_replay_of_a_valid_proof() {
    let env = Env::default();
    let (client, _) = initialized_client(&env);
    let course_hash = BytesN::from_array(&env, &ONE);
    let nullifier = BytesN::from_array(&env, &ONE);
    let public_inputs = Vec::new(&env);
    let proof = proof_for(&env, &test_key(&env), &course_hash, &nullifier);

    client.verify_completion(&course_hash, &nullifier, &public_inputs, &proof);
    client.verify_completion(&course_hash, &nullifier, &public_inputs, &proof);
}

#[test]
#[should_panic(expected = "Error(Contract, #6)")]
fn rejects_noncanonical_course_hash_scalar() {
    let env = Env::default();
    let (client, _) = initialized_client(&env);
    let course_hash = BytesN::from_array(&env, &[0xff; 32]);
    let nullifier = BytesN::from_array(&env, &ONE);
    let public_inputs = Vec::new(&env);
    let canonical_course = BytesN::from_array(&env, &ONE);
    let proof = proof_for(&env, &test_key(&env), &canonical_course, &nullifier);

    client.verify_completion(&course_hash, &nullifier, &public_inputs, &proof);
}

#[test]
fn admin_can_rotate_the_verifying_key() {
    let env = Env::default();
    let (client, admin) = initialized_client(&env);
    let mut new_key = test_key(&env);
    let mut new_ic = Vec::new(&env);
    new_ic.push_back(g1_infinity(&env));
    new_ic.push_back(g1_infinity(&env));
    new_ic.push_back(g1_generator(&env));
    new_key.gamma_abc_g1 = new_ic;
    client.update_verifying_key(&admin, &new_key);

    let course_hash = BytesN::from_array(&env, &ONE);
    let nullifier = BytesN::from_array(&env, &ONE);
    let public_inputs = Vec::new(&env);
    let proof = proof_for(&env, &new_key, &course_hash, &nullifier);
    assert!(client.verify_completion(&course_hash, &nullifier, &public_inputs, &proof));
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn non_admin_cannot_rotate_the_verifying_key() {
    let env = Env::default();
    let (client, _) = initialized_client(&env);
    let attacker = Address::generate(&env);
    client.update_verifying_key(&attacker, &test_key(&env));
}
