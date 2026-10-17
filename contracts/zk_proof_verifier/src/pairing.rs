use crate::{VerifierError, VerifyingKey, MAX_PUBLIC_INPUTS};
use soroban_sdk::{
    crypto::bn254::{Bn254G1Affine, Bn254G2Affine},
    panic_with_error, Bytes, BytesN, Env, TryFromVal,
};

const G1_BYTES: u32 = 64;
const G2_BYTES: u32 = 128;
const FIELD_BYTES: usize = 32;
const BN254_FP_MODULUS: [u8; FIELD_BYTES] = [
    0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29, 0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
    0x97, 0x81, 0x6a, 0x91, 0x68, 0x71, 0xca, 0x8d, 0x3c, 0x20, 0x8c, 0x16, 0xd8, 0x7c, 0xfd, 0x47,
];

pub(crate) fn parse_g1(env: &Env, bytes: &Bytes, error: VerifierError) -> Bn254G1Affine {
    if bytes.len() != G1_BYTES {
        panic_with_error!(env, error);
    }
    let encoded = BytesN::<64>::try_from_val(env, bytes.as_val())
        .unwrap_or_else(|_| panic_with_error!(env, error));
    let point = Bn254G1Affine::from_bytes(encoded);
    if !env.crypto().bn254().g1_is_on_curve(&point) {
        panic_with_error!(env, error);
    }
    point
}

pub(crate) fn parse_g2(env: &Env, bytes: &Bytes, error: VerifierError) -> Bn254G2Affine {
    if bytes.len() != G2_BYTES {
        panic_with_error!(env, error);
    }
    let encoded = BytesN::<128>::try_from_val(env, bytes.as_val())
        .unwrap_or_else(|_| panic_with_error!(env, error));
    let limbs = encoded.to_array();
    for limb in limbs.chunks_exact(FIELD_BYTES) {
        if limb >= BN254_FP_MODULUS.as_slice() {
            panic_with_error!(env, error);
        }
    }
    Bn254G2Affine::from_bytes(encoded)
}

pub(crate) fn validate_verifying_key(env: &Env, key: &VerifyingKey) {
    if key.gamma_abc_g1.len() < 3 || key.gamma_abc_g1.len() > MAX_PUBLIC_INPUTS + 3 {
        panic_with_error!(env, VerifierError::InvalidVerifyingKey);
    }

    parse_g1(env, &key.alpha_g1, VerifierError::InvalidVerifyingKey);
    parse_g2(env, &key.beta_g2, VerifierError::InvalidVerifyingKey);
    parse_g2(env, &key.gamma_g2, VerifierError::InvalidVerifyingKey);
    parse_g2(env, &key.delta_g2, VerifierError::InvalidVerifyingKey);
    for point in key.gamma_abc_g1.iter() {
        parse_g1(env, &point, VerifierError::InvalidVerifyingKey);
    }
}
