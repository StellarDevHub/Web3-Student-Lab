use crate::{DataKey, SybilError};
use soroban_sdk::{contracttype, panic_with_error, Address, BytesN, Env};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InstitutionalAttestation {
    pub institution: Address,
    pub chain_id: u32,
    pub voucher_id: BytesN<32>,
    pub valid_until: u64,
}

pub fn set_institution(env: &Env, institution: Address, enabled: bool) {
    env.storage()
        .persistent()
        .set(&DataKey::Institution(institution), &enabled);
}

pub fn set_supported_chain(env: &Env, chain_id: u32, enabled: bool) {
    if chain_id == 0 {
        panic_with_error!(env, SybilError::InvalidAttestation);
    }
    env.storage()
        .persistent()
        .set(&DataKey::SupportedChain(chain_id), &enabled);
}

pub fn submit(
    env: &Env,
    institution: &Address,
    user: &Address,
    chain_id: u32,
    voucher_id: BytesN<32>,
    valid_until: u64,
) {
    if env
        .storage()
        .persistent()
        .get::<_, bool>(&DataKey::BannedUser(user.clone()))
        .unwrap_or(false)
    {
        panic_with_error!(env, SybilError::UserBanned);
    }
    if !env
        .storage()
        .persistent()
        .get::<_, bool>(&DataKey::Institution(institution.clone()))
        .unwrap_or(false)
    {
        panic_with_error!(env, SybilError::UnauthorizedInstitution);
    }
    if !env
        .storage()
        .persistent()
        .get::<_, bool>(&DataKey::SupportedChain(chain_id))
        .unwrap_or(false)
    {
        panic_with_error!(env, SybilError::InvalidAttestation);
    }
    if env.ledger().timestamp() >= valid_until {
        panic_with_error!(env, SybilError::AttestationExpired);
    }
    if env
        .storage()
        .persistent()
        .has(&DataKey::UsedAttestation(voucher_id.clone()))
    {
        panic_with_error!(env, SybilError::InvalidAttestation);
    }

    let attestation = InstitutionalAttestation {
        institution: institution.clone(),
        chain_id,
        voucher_id: voucher_id.clone(),
        valid_until,
    };
    env.storage()
        .persistent()
        .set(&DataKey::UsedAttestation(voucher_id), user);
    env.storage()
        .persistent()
        .set(&DataKey::Attestation(user.clone()), &attestation);
    env.events().publish(
        (soroban_sdk::symbol_short!("attest"), user.clone()),
        (institution.clone(), chain_id, valid_until),
    );
}

pub fn revoke(env: &Env, institution: &Address, user: &Address) {
    let attestation = env
        .storage()
        .persistent()
        .get::<_, InstitutionalAttestation>(&DataKey::Attestation(user.clone()))
        .unwrap_or_else(|| panic_with_error!(env, SybilError::InvalidAttestation));
    if attestation.institution != *institution {
        panic_with_error!(env, SybilError::UnauthorizedInstitution);
    }
    env.storage()
        .persistent()
        .remove(&DataKey::Attestation(user.clone()));
    env.events().publish(
        (soroban_sdk::symbol_short!("att_rev"), user.clone()),
        institution.clone(),
    );
}

pub fn is_valid(env: &Env, user: &Address) -> bool {
    match env
        .storage()
        .persistent()
        .get::<_, InstitutionalAttestation>(&DataKey::Attestation(user.clone()))
    {
        Some(attestation) => {
            attestation.valid_until > env.ledger().timestamp()
                && env
                    .storage()
                    .persistent()
                    .get::<_, bool>(&DataKey::Institution(attestation.institution))
                    .unwrap_or(false)
                && env
                    .storage()
                    .persistent()
                    .get::<_, bool>(&DataKey::SupportedChain(attestation.chain_id))
                    .unwrap_or(false)
        }
        None => false,
    }
}
