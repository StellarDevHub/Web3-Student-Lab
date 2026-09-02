use soroban_sdk::{contract, contractimpl, Address, Bytes, BytesN, Env, String, Vec};

#[derive(Clone, Debug, PartialEq)]
#[contracttype]
pub enum CertificateStatus {
    Active,
    Revoked,
    Reissued,
    Expired,
}

#[derive(Clone, Debug)]
#[contracttype]
pub struct CertificateRecord {
    pub cert_id: BytesN<32>,
    pub owner: Address,
    pub issuer: Address,
    pub course_id: String,
    pub issued_at: u64,
    pub status: CertificateStatus,
    pub revocation_reason: String,
    pub previous_cert_id: BytesN<32>,
    pub content_hash: BytesN<32>,
}

#[derive(Clone, Debug)]
#[contracttype]
pub struct RevocationAuditLog {
    pub cert_id: BytesN<32>,
    pub actor: Address,
    pub reason: String,
    pub timestamp: u64,
    pub action: String,
}

#[derive(Clone, Debug)]
#[contracttype]
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

    pub fn issue_certificate(
        env: Env,
        owner: Address,
        issuer: Address,
        course_id: String,
        content_hash: BytesN<32>,
    ) -> BytesN<32> {
        issuer.require_auth();

        let cert_id: u64 = env.storage().instance().get(&DataKey::NextCertId).unwrap_or(0);
        let cert_id_bytes = BytesN::from_array(&env, &cert_id.to_be_bytes());

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
        };

        env.storage().persistent().set(&DataKey::Certificate(cert_id_bytes.clone()), &record);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Certificate(cert_id_bytes.clone()), 500_000, 500_000);

        env.storage().instance().set(&DataKey::NextCertId, &(cert_id + 1));

        Self::log_audit(&env, &cert_id_bytes, &issuer, String::from_str(&env, "ISSUED"), String::from_str(&env, ""));

        cert_id_bytes
    }

    pub fn revoke_certificate(env: Env, cert_id: BytesN<32>, reason_code: String) {
        let caller = env.current_contract_address();
        let mut record: CertificateRecord = env.storage().persistent().get(&DataKey::Certificate(cert_id.clone())).unwrap_or_else(|| env.panic_with_error(Error::from_contract_error(1)));
        if record.status == CertificateStatus::Revoked {
            env.panic_with_error(Error::from_contract_error(2));
        }
        record.status = CertificateStatus::Revoked;
        record.revocation_reason = reason_code.clone();
        env.storage().persistent().set(&DataKey::Certificate(cert_id.clone()), &record);

        Self::log_audit(&env, &cert_id, &caller, String::from_str(&env, "REVOKED"), reason_code);
    }

    pub fn reissue_certificate(
        env: Env,
        old_cert_id: BytesN<32>,
        new_content_hash: BytesN<32>,
    ) -> BytesN<32> {
        let caller = env.current_contract_address();
        let mut old_record: CertificateRecord = env.storage().persistent().get(&DataKey::Certificate(old_cert_id.clone())).unwrap_or_else(|| env.panic_with_error(Error::from_contract_error(1)));
        if old_record.status != CertificateStatus::Revoked {
            env.panic_with_error(Error::from_contract_error(3));
        }

        let new_cert_id: u64 = env.storage().instance().get(&DataKey::NextCertId).unwrap_or(0);
        let new_cert_id_bytes = BytesN::from_array(&env, &new_cert_id.to_be_bytes());

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
        };

        env.storage().persistent().set(&DataKey::Certificate(new_cert_id_bytes.clone()), &new_record);
        env.storage().persistent().extend_ttl(&DataKey::Certificate(new_cert_id_bytes.clone()), 500_000, 500_000);
        env.storage().instance().set(&DataKey::NextCertId, &(new_cert_id + 1));

        old_record.status = CertificateStatus::Reissued;
        env.storage().persistent().set(&DataKey::Certificate(old_cert_id), &old_record);

        Self::log_audit(&env, &new_cert_id_bytes, &caller, String::from_str(&env, "REISSUED"), String::from_str(&env, ""));

        new_cert_id_bytes
    }

    pub fn anchor_merkle_cohort(env: Env, cohort_id: String, root_hash: BytesN<32>) {
        let caller = env.current_contract_address();
        let root = MerkleCohortRoot {
            cohort_id: cohort_id.clone(),
            root_hash,
            anchored_at: env.ledger().timestamp(),
            issuer: caller,
        };
        env.storage().persistent().set(&DataKey::MerkleRoot(cohort_id.clone()), &root);
        env.storage().persistent().extend_ttl(&DataKey::MerkleRoot(cohort_id), 500_000, 500_000);
    }

    pub fn verify_merkle_inclusion(env: Env, cohort_id: String, leaf_hash: BytesN<32>, proof: Vec<BytesN<32>>) -> bool {
        let root_entry: MerkleCohortRoot = env.storage().persistent().get(&DataKey::MerkleRoot(cohort_id)).unwrap_or_else(|| env.panic_with_error(Error::from_contract_error(4)));
        let mut current = leaf_hash;
        for sibling in proof.iter() {
            let mut combined = Bytes::new(&env);
            if current < *sibling {
                combined.append(&Bytes::from(current.clone()));
                combined.append(&Bytes::from(sibling.clone()));
            } else {
                combined.append(&Bytes::from(sibling.clone()));
                combined.append(&Bytes::from(current.clone()));
            }
            current = env.crypto().sha256(&combined).into();
        }
        current == root_entry.root_hash
    }

    pub fn get_certificate(env: Env, cert_id: BytesN<32>) -> CertificateRecord {
        env.storage().persistent().get(&DataKey::Certificate(cert_id)).unwrap_or_else(|| env.panic_with_error(Error::from_contract_error(1)))
    }

    pub fn get_merkle_root(env: Env, cohort_id: String) -> MerkleCohortRoot {
        env.storage().persistent().get(&DataKey::MerkleRoot(cohort_id)).unwrap_or_else(|| env.panic_with_error(Error::from_contract_error(4)))
    }

    pub fn get_audit_log(env: Env, cert_id: BytesN<32>) -> Vec<RevocationAuditLog> {
        env.storage().persistent().get(&DataKey::AuditLog(cert_id)).unwrap_or_else(|| Vec::new(&env))
    }

    fn log_audit(env: &Env, cert_id: &BytesN<32>, actor: &Address, action: String, reason: String) {
        let mut logs: Vec<RevocationAuditLog> = env.storage().persistent().get(&DataKey::AuditLog(cert_id.clone())).unwrap_or_else(|| Vec::new(env));
        logs.push_back(RevocationAuditLog {
            cert_id: cert_id.clone(),
            actor: actor.clone(),
            reason,
            timestamp: env.ledger().timestamp(),
            action,
        });
        env.storage().persistent().set(&DataKey::AuditLog(cert_id.clone()), &logs);
        env.storage().persistent().extend_ttl(&DataKey::AuditLog(cert_id.clone()), 500_000, 500_000);
    }
}

#[derive(Clone, Debug)]
#[contracttype]
pub enum DataKey {
    Admin,
    NextCertId,
    Certificate(BytesN<32>),
    MerkleRoot(String),
    AuditLog(BytesN<32>),
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotFound = 1,
    AlreadyRevoked = 2,
    NotRevoked = 3,
    CohortNotFound = 4,
}

impl From<Error> for soroban_sdk::Error {
    fn from(e: Error) -> Self {
        soroban_sdk::Error::from_contract_error(e as u32)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, BytesN, Env};

    #[test]
    fn test_issue_revoke_reissue() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let contract_id = env.register(CertificateContract, ());
        let client = CertificateContractClient::new(&env, &contract_id);
        client.initialize(&admin);

        let owner = Address::generate(&env);
        let issuer = Address::generate(&env);
        let course_id = String::from_str(&env, "RUST-101");
        let hash = BytesN::from_array(&env, &[1u8; 32]);

        let cert_id = client.issue_certificate(&owner, &issuer, &course_id, &hash);
        let record = client.get_certificate(&cert_id);
        assert_eq!(record.status, CertificateStatus::Active);

        client.revoke_certificate(&cert_id, &String::from_str(&env, "violation"));
        let revoked = client.get_certificate(&cert_id);
        assert_eq!(revoked.status, CertificateStatus::Revoked);

        let new_id = client.reissue_certificate(&cert_id, &BytesN::from_array(&env, &[2u8; 32]));
        let new_record = client.get_certificate(&new_id);
        assert_eq!(new_record.status, CertificateStatus::Active);
        assert_eq!(new_record.previous_cert_id, cert_id);
    }

    #[test]
    fn test_merkle_anchor_and_verify() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let contract_id = env.register(CertificateContract, ());
        let client = CertificateContractClient::new(&env, &contract_id);
        client.initialize(&admin);

        let cohort_id = String::from_str(&env, "cohort-2025-01");
        let root = BytesN::from_array(&env, &[9u8; 32]);
        client.anchor_merkle_cohort(&cohort_id, &root);

        let leaf = BytesN::from_array(&env, &[1u8; 32]);
        let proof: Vec<BytesN<32>> = Vec::from_array(&env, [BytesN::from_array(&env, &[2u8; 32]), BytesN::from_array(&env, &[3u8; 32])]);
        assert!(client.verify_merkle_inclusion(&cohort_id, &leaf, &proof));
    }
}
