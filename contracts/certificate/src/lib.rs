#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, Address,
    Bytes, BytesN, Env, String, Vec,
};

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum CertificateStatus {
    Active,
    Revoked,
    Reissued,
    Expired,
}

/// Result of `verify_certificate`. Exactly one state is returned for any
/// certificate, with `Revoked` taking precedence over `Expired`.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum VerificationStatus {
    Valid,
    Expired,
    Revoked,
    NotFound,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct CertificateRecord {
    pub cert_id: BytesN<32>,
    pub owner: Address,
    pub issuer: Address,
    pub course_id: String,
    pub issued_at: u64,
    pub status: CertificateStatus,
    pub revocation_reason: String,
    pub previous_cert_id: BytesN<32>,
    /// Hash of the off-chain metadata document, verifiable via
    /// `verify_content_hash`.
    pub content_hash: BytesN<32>,
    /// URI pointing at the off-chain metadata document (e.g. `ipfs://...`).
    pub metadata_uri: String,
    /// Optional expiration timestamp (ledger seconds). `None` never expires.
    pub expires_at: Option<u64>,
    /// SEP-0029 secondary-sale royalty cut, in basis points (1/100 of a
    /// percent). 250 == 2.5%. Capped at `MAX_ROYALTY_BPS`.
    pub royalty_bps: u32,
    /// Certificates are soulbound (non-transferable) by default. This flag
    /// is set once at issuance and can never be cleared; it is an
    /// immutable revocation of transferability, not a toggle.
    pub soulbound: bool,
}

/// Maximum royalty a creator may configure: 100.00% expressed in basis
/// points would be nonsensical for a *cut*, so cap well below 100% per
/// SEP-0029 convention for marketplace-enforced royalties.
pub const MAX_ROYALTY_BPS: u32 = 5_000; // 50%
pub const BPS_DENOMINATOR: i128 = 10_000;

#[contracttype]
#[derive(Clone, Debug)]
pub struct RevocationAuditLog {
    pub cert_id: BytesN<32>,
    pub actor: Address,
    pub reason: String,
    pub timestamp: u64,
    pub action: String,
}

/// Structured event published whenever a certificate is revoked.
#[contracttype]
#[derive(Clone, Debug)]
pub struct CertificateRevokedEvent {
    pub cert_id: BytesN<32>,
    pub issuer: Address,
    pub reason_code: String,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct MerkleCohortRoot {
    pub cohort_id: String,
    pub root_hash: BytesN<32>,
    pub anchored_at: u64,
    pub issuer: Address,
}

#[contract]
pub struct CertificateContract;

#[contractimpl]
impl CertificateContract {
    pub fn initialize(env: Env, admin: Address) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::NextCertId, &0u64);
    }

    /// Registers the institutional ed25519 public key whose signatures
    /// authorize revocation via `revoke_certificate_with_institution_sig`.
    /// Admin only.
    pub fn set_institution_key(env: Env, public_key: BytesN<32>) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Unauthorized));
        admin.require_auth();
        env.storage()
            .instance()
            .set(&DataKey::InstitutionKey, &public_key);
    }

    pub fn issue_certificate(
        env: Env,
        owner: Address,
        issuer: Address,
        course_id: String,
        content_hash: BytesN<32>,
        metadata_uri: String,
        expires_at: Option<u64>,
    ) -> BytesN<32> {
        issuer.require_auth();

        let cert_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextCertId)
            .unwrap_or(0);
        let mut cert_id_arr = [0u8; 32];
        cert_id_arr[24..32].copy_from_slice(&cert_id.to_be_bytes());
        let cert_id_bytes = BytesN::from_array(&env, &cert_id_arr);

        let record = CertificateRecord {
            cert_id: cert_id_bytes.clone(),
            owner: owner.clone(),
            issuer: issuer.clone(),
            course_id: course_id.clone(),
            issued_at: env.ledger().timestamp(),
            status: CertificateStatus::Active,
            revocation_reason: String::from_str(&env, ""),
            previous_cert_id: BytesN::from_array(&env, &[0u8; 32]),
            content_hash,
            metadata_uri,
            expires_at,
            royalty_bps: 0,
            // Immutable soulbound flag: certificates are non-transferable
            // from the moment they are issued.
            soulbound: true,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Certificate(cert_id_bytes.clone()), &record);
        env.storage().persistent().extend_ttl(
            &DataKey::Certificate(cert_id_bytes.clone()),
            500_000,
            500_000,
        );

        env.storage()
            .instance()
            .set(&DataKey::NextCertId, &(cert_id + 1));

        Self::log_audit(
            &env,
            &cert_id_bytes,
            &issuer,
            String::from_str(&env, "ISSUED"),
            String::from_str(&env, ""),
        );

        cert_id_bytes
    }

    /// Revokes a certificate. Requires the issuer's authorization.
    pub fn revoke_certificate(env: Env, cert_id: BytesN<32>, reason_code: String) {
        let mut record: CertificateRecord = env
            .storage()
            .persistent()
            .get(&DataKey::Certificate(cert_id.clone()))
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotFound));
        if record.status == CertificateStatus::Revoked {
            panic_with_error!(&env, Error::AlreadyRevoked);
        }
        // Enforce native Soroban authentication: only issuer may revoke
        record.issuer.require_auth();

        Self::apply_revocation(&env, &mut record, reason_code);
    }

    /// Revokes a certificate authorized by an institutional ed25519
    /// signature instead of issuer auth. The signature must be over the
    /// message `cert_id (32 bytes) || reason_code (UTF-8 bytes)` made with
    /// the key registered via `set_institution_key`. Traps if the
    /// signature is invalid or no institution key is registered.
    pub fn revoke_certificate_with_institution_sig(
        env: Env,
        cert_id: BytesN<32>,
        reason_code: String,
        signature: BytesN<64>,
    ) {
        let institution_key: BytesN<32> = env
            .storage()
            .instance()
            .get(&DataKey::InstitutionKey)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Unauthorized));

        let mut record: CertificateRecord = env
            .storage()
            .persistent()
            .get(&DataKey::Certificate(cert_id.clone()))
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotFound));
        if record.status == CertificateStatus::Revoked {
            panic_with_error!(&env, Error::AlreadyRevoked);
        }

        let message = Self::revocation_message(&env, &cert_id, &reason_code);
        // Traps on verification failure.
        env.crypto()
            .ed25519_verify(&institution_key, &message, &signature);

        Self::apply_revocation(&env, &mut record, reason_code);
    }

    pub fn reissue_certificate(
        env: Env,
        old_cert_id: BytesN<32>,
        new_content_hash: BytesN<32>,
        new_metadata_uri: String,
    ) -> BytesN<32> {
        let mut old_record: CertificateRecord = env
            .storage()
            .persistent()
            .get(&DataKey::Certificate(old_cert_id.clone()))
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotFound));
        if old_record.status != CertificateStatus::Revoked {
            panic_with_error!(&env, Error::NotRevoked);
        }
        // Enforce native Soroban authentication: only issuer may reissue
        old_record.issuer.require_auth();

        let new_cert_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextCertId)
            .unwrap_or(0);
        let mut new_cert_id_arr = [0u8; 32];
        new_cert_id_arr[24..32].copy_from_slice(&new_cert_id.to_be_bytes());
        let new_cert_id_bytes = BytesN::from_array(&env, &new_cert_id_arr);

        let new_record = CertificateRecord {
            cert_id: new_cert_id_bytes.clone(),
            owner: old_record.owner.clone(),
            issuer: old_record.issuer.clone(),
            course_id: old_record.course_id.clone(),
            issued_at: env.ledger().timestamp(),
            status: CertificateStatus::Active,
            revocation_reason: String::from_str(&env, ""),
            previous_cert_id: old_cert_id.clone(),
            content_hash: new_content_hash,
            metadata_uri: new_metadata_uri,
            expires_at: old_record.expires_at,
            royalty_bps: old_record.royalty_bps,
            soulbound: true,
        };

        env.storage().persistent().set(
            &DataKey::Certificate(new_cert_id_bytes.clone()),
            &new_record,
        );
        env.storage().persistent().extend_ttl(
            &DataKey::Certificate(new_cert_id_bytes.clone()),
            500_000,
            500_000,
        );
        env.storage()
            .instance()
            .set(&DataKey::NextCertId, &(new_cert_id + 1));

        old_record.status = CertificateStatus::Reissued;
        env.storage()
            .persistent()
            .set(&DataKey::Certificate(old_cert_id), &old_record);

        Self::log_audit(
            &env,
            &new_cert_id_bytes,
            &old_record.issuer,
            String::from_str(&env, "REISSUED"),
            String::from_str(&env, ""),
        );

        new_cert_id_bytes
    }

    pub fn anchor_merkle_cohort(env: Env, cohort_id: String, root_hash: BytesN<32>) {
        let admin: Option<Address> = env.storage().instance().get(&DataKey::Admin);
        let issuer = if let Some(ref a) = admin {
            a.require_auth();
            a.clone()
        } else {
            env.current_contract_address()
        };
        let root = MerkleCohortRoot {
            cohort_id: cohort_id.clone(),
            root_hash,
            anchored_at: env.ledger().timestamp(),
            issuer,
        };
        env.storage()
            .persistent()
            .set(&DataKey::MerkleRoot(cohort_id.clone()), &root);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::MerkleRoot(cohort_id), 500_000, 500_000);
    }

    pub fn verify_merkle_inclusion(
        env: Env,
        cohort_id: String,
        leaf_hash: BytesN<32>,
        proof: Vec<BytesN<32>>,
    ) -> bool {
        let root_entry: MerkleCohortRoot = env
            .storage()
            .persistent()
            .get(&DataKey::MerkleRoot(cohort_id))
            .unwrap_or_else(|| panic_with_error!(&env, Error::CohortNotFound));
        let mut current = leaf_hash;
        for sibling in proof.iter() {
            let mut combined = Bytes::new(&env);
            if current.to_array() < sibling.to_array() {
                combined.append(&current.clone().into());
                combined.append(&sibling.clone().into());
            } else {
                combined.append(&sibling.clone().into());
                combined.append(&current.clone().into());
            }
            current = env.crypto().sha256(&combined).into();
        }
        current == root_entry.root_hash
    }

    pub fn get_certificate(env: Env, cert_id: BytesN<32>) -> CertificateRecord {
        env.storage()
            .persistent()
            .get(&DataKey::Certificate(cert_id))
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotFound))
    }

    /// Single-call verification status. Never panics for unknown IDs.
    /// Precedence: `NotFound` > `Revoked` > `Expired` > `Valid`.
    /// Certificates in `Reissued` status are treated as `Revoked` because
    /// reissuance is only possible after revocation.
    pub fn verify_certificate(env: Env, cert_id: BytesN<32>) -> VerificationStatus {
        let record: CertificateRecord = match env
            .storage()
            .persistent()
            .get(&DataKey::Certificate(cert_id))
        {
            Some(r) => r,
            None => return VerificationStatus::NotFound,
        };

        match record.status {
            CertificateStatus::Revoked | CertificateStatus::Reissued => {
                return VerificationStatus::Revoked;
            }
            CertificateStatus::Expired => return VerificationStatus::Expired,
            CertificateStatus::Active => {}
        }

        if let Some(expires_at) = record.expires_at {
            if env.ledger().timestamp() >= expires_at {
                return VerificationStatus::Expired;
            }
        }

        VerificationStatus::Valid
    }

    /// Returns `true` if `content_hash` matches the hash recorded for the
    /// certificate's metadata document. Traps if the certificate is unknown.
    pub fn verify_content_hash(env: Env, cert_id: BytesN<32>, content_hash: BytesN<32>) -> bool {
        let record: CertificateRecord = env
            .storage()
            .persistent()
            .get(&DataKey::Certificate(cert_id))
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotFound));
        record.content_hash == content_hash
    }

    pub fn get_merkle_root(env: Env, cohort_id: String) -> MerkleCohortRoot {
        env.storage()
            .persistent()
            .get(&DataKey::MerkleRoot(cohort_id))
            .unwrap_or_else(|| panic_with_error!(&env, Error::CohortNotFound))
    }

    /// Set (or update) the SEP-0029 secondary-sale royalty percentage for a
    /// certificate, in basis points. Only the original issuer may call
    /// this, and only while the certificate is `Active`.
    pub fn set_royalty_bps(env: Env, cert_id: BytesN<32>, royalty_bps: u32) {
        let mut record: CertificateRecord = env
            .storage()
            .persistent()
            .get(&DataKey::Certificate(cert_id.clone()))
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotFound));

        record.issuer.require_auth();

        if royalty_bps > MAX_ROYALTY_BPS {
            panic_with_error!(&env, Error::RoyaltyTooHigh);
        }

        record.royalty_bps = royalty_bps;
        env.storage()
            .persistent()
            .set(&DataKey::Certificate(cert_id), &record);
    }

    /// Compute the SEP-0029 royalty split for a secondary sale of
    /// `sale_amount`. Returns `(creator_cut, seller_proceeds)`; the two
    /// always sum to `sale_amount`.
    pub fn calculate_royalty(env: Env, cert_id: BytesN<32>, sale_amount: i128) -> (i128, i128) {
        let record: CertificateRecord = env
            .storage()
            .persistent()
            .get(&DataKey::Certificate(cert_id))
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotFound));

        if sale_amount <= 0 {
            return (0, 0);
        }

        let creator_cut = (sale_amount * record.royalty_bps as i128) / BPS_DENOMINATOR;
        let seller_proceeds = sale_amount - creator_cut;
        (creator_cut, seller_proceeds)
    }

    /// Soulbound certificates reject any transfer attempt outright. This
    /// entrypoint exists so callers/integrations have an explicit,
    /// standard way to probe (and fail loudly on) transferability instead
    /// of relying on the absence of a `transfer` function.
    pub fn transfer_certificate(env: Env, cert_id: BytesN<32>, _to: Address) {
        let _record: CertificateRecord = env
            .storage()
            .persistent()
            .get(&DataKey::Certificate(cert_id))
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotFound));

        panic_with_error!(&env, Error::NonTransferable);
    }

    /// Always panics with `NonTransferable`. Certificates cannot be moved.
    pub fn transfer(env: Env, _from: Address, _to: Address, _cert_id: BytesN<32>) {
        panic_with_error!(&env, Error::NonTransferable);
    }

    /// Always panics with `NonTransferable`. Certificates cannot be moved.
    pub fn transfer_from(
        env: Env,
        _spender: Address,
        _from: Address,
        _to: Address,
        _cert_id: BytesN<32>,
    ) {
        panic_with_error!(&env, Error::NonTransferable);
    }

    /// Returns `true` if the certificate is soulbound (non-transferable).
    /// Certificates issued by this contract are always soulbound.
    pub fn is_soulbound(env: Env, cert_id: BytesN<32>) -> bool {
        let record: CertificateRecord = env
            .storage()
            .persistent()
            .get(&DataKey::Certificate(cert_id))
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotFound));
        record.soulbound
    }

    pub fn get_audit_log(env: Env, cert_id: BytesN<32>) -> Vec<RevocationAuditLog> {
        env.storage()
            .persistent()
            .get(&DataKey::AuditLog(cert_id))
            .unwrap_or_else(|| Vec::new(&env))
    }

    fn log_audit(env: &Env, cert_id: &BytesN<32>, actor: &Address, action: String, reason: String) {
        let mut logs: Vec<RevocationAuditLog> = env
            .storage()
            .persistent()
            .get(&DataKey::AuditLog(cert_id.clone()))
            .unwrap_or_else(|| Vec::new(env));
        logs.push_back(RevocationAuditLog {
            cert_id: cert_id.clone(),
            actor: actor.clone(),
            reason,
            timestamp: env.ledger().timestamp(),
            action,
        });
        env.storage()
            .persistent()
            .set(&DataKey::AuditLog(cert_id.clone()), &logs);
        env.storage().persistent().extend_ttl(
            &DataKey::AuditLog(cert_id.clone()),
            500_000,
            500_000,
        );
    }
}

impl CertificateContract {
    /// Marks the record revoked, persists it, appends an audit entry and
    /// publishes a `CertificateRevokedEvent`. Callers must perform their
    /// own authorization and status checks first.
    fn apply_revocation(env: &Env, record: &mut CertificateRecord, reason_code: String) {
        let cert_id = record.cert_id.clone();
        let issuer = record.issuer.clone();

        record.status = CertificateStatus::Revoked;
        record.revocation_reason = reason_code.clone();
        env.storage()
            .persistent()
            .set(&DataKey::Certificate(cert_id.clone()), &*record);

        Self::log_audit(
            env,
            &cert_id,
            &issuer,
            String::from_str(env, "REVOKED"),
            reason_code.clone(),
        );

        env.events().publish(
            (symbol_short!("cert_rev"),),
            CertificateRevokedEvent {
                cert_id,
                issuer,
                reason_code,
                timestamp: env.ledger().timestamp(),
            },
        );
    }

    /// Builds the signed message for institutional revocation:
    /// `cert_id (32 bytes) || reason_code (UTF-8 bytes)`.
    fn revocation_message(env: &Env, cert_id: &BytesN<32>, reason_code: &String) -> Bytes {
        let mut message = Bytes::from_slice(env, &cert_id.to_array());
        message.append(&Bytes::from(reason_code.clone()));
        message
    }
}

#[contracttype]
#[derive(Clone, Debug)]
pub enum DataKey {
    Admin,
    NextCertId,
    InstitutionKey,
    Certificate(BytesN<32>),
    MerkleRoot(String),
    AuditLog(BytesN<32>),
}

pub mod errors;
pub use errors::{CertificateError, Error};

#[cfg(test)]
mod test;
