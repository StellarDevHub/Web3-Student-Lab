use crate::errors::Error;
use crate::storage::{get_content, is_instructor};
use crate::types::StorageKey;
use soroban_sdk::{contracttype, token, symbol_short, Address, BytesN, Env};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LicenseTerms {
    pub content_id: u64,
    pub author: Address,
    pub payment_token: Address,
    pub price: i128,
    pub duration_seconds: u64,
    pub is_active: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LicenseVoucher {
    pub license_id: u64,
    pub content_id: u64,
    pub licensee: Address,
    pub author: Address,
    pub valid_from: u64,
    pub valid_to: u64,
    pub signature: BytesN<64>,
    pub fee_paid: i128,
    pub is_revoked: bool,
}

pub fn set_license_terms(
    env: &Env,
    author: Address,
    content_id: u64,
    payment_token: Address,
    price: i128,
    duration_seconds: u64,
) -> Result<LicenseTerms, Error> {
    author.require_auth();

    if !is_instructor(env, &author) {
        return Err(Error::NotInstructor);
    }

    let content = get_content(env, content_id)?;
    if content.instructor != author {
        return Err(Error::Unauthorized);
    }

    if price < 0 {
        return Err(Error::InvalidLicensePrice);
    }

    if duration_seconds == 0 {
        return Err(Error::InvalidLicenseDuration);
    }

    let terms = LicenseTerms {
        content_id,
        author: author.clone(),
        payment_token,
        price,
        duration_seconds,
        is_active: true,
    };

    let key = StorageKey::LicenseTerms(content_id);
    env.storage().persistent().set(&key, &terms);

    env.events().publish(
        (symbol_short!("lic_terms"), symbol_short!("set")),
        (content_id, author, price, duration_seconds),
    );

    Ok(terms)
}

pub fn get_license_terms(env: &Env, content_id: u64) -> Result<LicenseTerms, Error> {
    let key = StorageKey::LicenseTerms(content_id);
    env.storage()
        .persistent()
        .get(&key)
        .ok_or(Error::LicenseTermsNotSet)
}

pub fn purchase_license(
    env: &Env,
    institution: Address,
    content_id: u64,
    signature: BytesN<64>,
) -> Result<u64, Error> {
    institution.require_auth();

    let terms = get_license_terms(env, content_id)?;
    if !terms.is_active {
        return Err(Error::LicenseTermsNotSet);
    }

    // Direct royalty payment forwarding to the original course creator
    if terms.price > 0 {
        let token_client = token::Client::new(env, &terms.payment_token);
        token_client.transfer(&institution, &terms.author, &terms.price);
    }

    let next_id_key = StorageKey::NextLicenseId;
    let license_id: u64 = env.storage().instance().get(&next_id_key).unwrap_or(1);
    env.storage().instance().set(&next_id_key, &(license_id + 1));

    let now = env.ledger().timestamp();
    let valid_to = now.checked_add(terms.duration_seconds).unwrap_or(u64::MAX);

    let voucher = LicenseVoucher {
        license_id,
        content_id,
        licensee: institution.clone(),
        author: terms.author.clone(),
        valid_from: now,
        valid_to,
        signature,
        fee_paid: terms.price,
        is_revoked: false,
    };

    let license_key = StorageKey::License(license_id);
    env.storage().persistent().set(&license_key, &voucher);

    let active_key = StorageKey::ActiveLicense(content_id, institution.clone());
    env.storage().persistent().set(&active_key, &license_id);

    env.events().publish(
        (symbol_short!("lic_mint"), symbol_short!("voucher")),
        (license_id, content_id, institution, valid_to),
    );

    Ok(license_id)
}

pub fn is_license_valid(env: &Env, institution: Address, content_id: u64) -> bool {
    let active_key = StorageKey::ActiveLicense(content_id, institution);
    let license_id_opt: Option<u64> = env.storage().persistent().get(&active_key);

    if let Some(license_id) = license_id_opt {
        let license_key = StorageKey::License(license_id);
        if let Some(voucher) = env.storage().persistent().get::<_, LicenseVoucher>(&license_key) {
            let now = env.ledger().timestamp();
            return !voucher.is_revoked && now >= voucher.valid_from && now <= voucher.valid_to;
        }
    }
    false
}

pub fn get_license(env: &Env, license_id: u64) -> Result<LicenseVoucher, Error> {
    let license_key = StorageKey::License(license_id);
    env.storage()
        .persistent()
        .get(&license_key)
        .ok_or(Error::LicenseNotFound)
}

pub fn revoke_license(env: &Env, author: Address, license_id: u64) -> Result<(), Error> {
    author.require_auth();

    let mut voucher = get_license(env, license_id)?;
    if voucher.author != author {
        return Err(Error::Unauthorized);
    }
    if voucher.is_revoked {
        return Err(Error::LicenseAlreadyRevoked);
    }

    voucher.is_revoked = true;
    let license_key = StorageKey::License(license_id);
    env.storage().persistent().set(&license_key, &voucher);

    env.events().publish(
        (symbol_short!("lic_rev"), symbol_short!("revoked")),
        (license_id, author),
    );

    Ok(())
}
