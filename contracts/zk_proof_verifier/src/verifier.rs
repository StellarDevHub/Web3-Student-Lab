use crate::{
    pairing::{parse_g1, parse_g2},
    Groth16Proof, VerifierError, VerifyingKey,
};
use soroban_sdk::{
    crypto::bn254::{Bn254Fr, Bn254G1Affine, Bn254G2Affine},
    panic_with_error, BytesN, Env, Vec, U256,
};

pub(crate) fn verify(
    env: &Env,
    key: &VerifyingKey,
    proof: &Groth16Proof,
    course_hash: &BytesN<32>,
    nullifier: &BytesN<32>,
    public_inputs: &Vec<BytesN<32>>,
) -> bool {
    let expected_ic_len = public_inputs.len() + 3;
    if key.gamma_abc_g1.len() != expected_ic_len {
        panic_with_error!(env, VerifierError::InvalidPublicInput);
    }

    let one = Bn254Fr::from_u256(U256::from_u32(env, 1));
    let mut scalars = Vec::new(env);
    scalars.push_back(one);
    scalars.push_back(parse_scalar(env, course_hash));
    scalars.push_back(parse_scalar(env, nullifier));
    for input in public_inputs.iter() {
        scalars.push_back(parse_scalar(env, &input));
    }

    let bn254 = env.crypto().bn254();
    let mut ic_points = Vec::<Bn254G1Affine>::new(env);
    for point in key.gamma_abc_g1.iter() {
        ic_points.push_back(parse_g1(env, &point, VerifierError::InvalidVerifyingKey));
    }
    let vk_x = bn254.g1_msm(ic_points, scalars);

    let a = parse_g1(env, &proof.a_g1, VerifierError::InvalidProof);
    let b = parse_g2(env, &proof.b_g2, VerifierError::InvalidProof);
    let c = parse_g1(env, &proof.c_g1, VerifierError::InvalidProof);
    let alpha = parse_g1(env, &key.alpha_g1, VerifierError::InvalidVerifyingKey);
    let beta = parse_g2(env, &key.beta_g2, VerifierError::InvalidVerifyingKey);
    let gamma = parse_g2(env, &key.gamma_g2, VerifierError::InvalidVerifyingKey);
    let delta = parse_g2(env, &key.delta_g2, VerifierError::InvalidVerifyingKey);

    let mut g1 = Vec::<Bn254G1Affine>::new(env);
    let mut g2 = Vec::<Bn254G2Affine>::new(env);
    g1.push_back(a);
    g2.push_back(b);
    g1.push_back(-alpha);
    g2.push_back(beta);
    g1.push_back(-vk_x);
    g2.push_back(gamma);
    g1.push_back(-c);
    g2.push_back(delta);

    bn254.pairing_check(g1, g2)
}

fn parse_scalar(env: &Env, bytes: &BytesN<32>) -> Bn254Fr {
    let scalar = Bn254Fr::from_bytes(bytes.clone());
    if scalar.to_bytes() != *bytes {
        panic_with_error!(env, VerifierError::InvalidPublicInput);
    }
    scalar
}
