#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Bytes, BytesN, Env, String, Vec};

/// Helper harness to set up the Soroban environment, register the contract,
/// initialize the admin, and generate mock participants.
fn setup_test<'a>() -> (
    Env,
    CertificateContractClient<'a>,
    Address,
    Address,
    Address,
) {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let issuer = Address::generate(&env);
    let owner = Address::generate(&env);

    let contract_id = env.register(CertificateContract, ());
    let client = CertificateContractClient::new(&env, &contract_id);
    client.initialize(&admin);

    (env, client, admin, issuer, owner)
}

/// Computes sha256 parent hash for two child nodes according to the Merkle tree rule.
fn compute_parent_hash(env: &Env, left: &BytesN<32>, right: &BytesN<32>) -> BytesN<32> {
    let mut combined = Bytes::new(env);
    if left.to_array() < right.to_array() {
        combined.append(&left.clone().into());
        combined.append(&right.clone().into());
    } else {
        combined.append(&right.clone().into());
        combined.append(&left.clone().into());
    }
    env.crypto().sha256(&combined).into()
}

// ============================================================================
// 1. ADMIN INITIALIZATION & BASIC MINTING / ISSUANCE TESTS
// ============================================================================

#[test]
fn test_initialize_and_state() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(CertificateContract, ());
    let client = CertificateContractClient::new(&env, &contract_id);

    client.initialize(&admin);
    // Re-initialization should overwrite or reset admin without breaking
    let new_admin = Address::generate(&env);
    client.initialize(&new_admin);
}

#[test]
fn test_issue_certificate_success() {
    let (env, client, _admin, issuer, owner) = setup_test();
    let course_id = String::from_str(&env, "SOROBAN-101");
    let content_hash = BytesN::from_array(&env, &[0xAA; 32]);

    let cert_id = client.issue_certificate(&owner, &issuer, &course_id, &content_hash);
    let record = client.get_certificate(&cert_id);

    assert_eq!(record.cert_id, cert_id);
    assert_eq!(record.owner, owner);
    assert_eq!(record.issuer, issuer);
    assert_eq!(record.course_id, course_id);
    assert_eq!(record.status, CertificateStatus::Active);
    assert_eq!(record.revocation_reason, String::from_str(&env, ""));
    assert_eq!(record.previous_cert_id, BytesN::from_array(&env, &[0u8; 32]));
    assert_eq!(record.content_hash, content_hash);
    assert_eq!(record.royalty_bps, 0);
    assert!(record.soulbound);

    let audit_log = client.get_audit_log(&cert_id);
    assert_eq!(audit_log.len(), 1);
    let log = audit_log.get(0).unwrap();
    assert_eq!(log.action, String::from_str(&env, "ISSUED"));
    assert_eq!(log.actor, issuer);
    assert_eq!(log.reason, String::from_str(&env, ""));
}

#[test]
fn test_issue_multiple_certificates_duplicate_prevention() {
    let (env, client, _admin, issuer, owner) = setup_test();
    let course_id = String::from_str(&env, "RUST-ADVANCED");
    let content_hash = BytesN::from_array(&env, &[0xBB; 32]);

    let cert_id_1 = client.issue_certificate(&owner, &issuer, &course_id, &content_hash);
    let cert_id_2 = client.issue_certificate(&owner, &issuer, &course_id, &content_hash);
    let cert_id_3 = client.issue_certificate(&owner, &issuer, &course_id, &content_hash);

    // Verify sequential unique IDs are generated for duplicate preventions
    assert_ne!(cert_id_1, cert_id_2);
    assert_ne!(cert_id_2, cert_id_3);
    assert_ne!(cert_id_1, cert_id_3);

    let record1 = client.get_certificate(&cert_id_1);
    let record2 = client.get_certificate(&cert_id_2);
    let record3 = client.get_certificate(&cert_id_3);

    assert_eq!(record1.status, CertificateStatus::Active);
    assert_eq!(record2.status, CertificateStatus::Active);
    assert_eq!(record3.status, CertificateStatus::Active);
}

// ============================================================================
// 2. ROLE-BASED REVOCATION WORKFLOW TESTS
// ============================================================================

#[test]
fn test_revoke_certificate_success() {
    let (env, client, _admin, issuer, owner) = setup_test();
    let course_id = String::from_str(&env, "WEB3-BOOTCAMP");
    let content_hash = BytesN::from_array(&env, &[0x11; 32]);

    let cert_id = client.issue_certificate(&owner, &issuer, &course_id, &content_hash);
    let reason = String::from_str(&env, "Academic dishonesty violation");

    client.revoke_certificate(&cert_id, &reason);

    let record = client.get_certificate(&cert_id);
    assert_eq!(record.status, CertificateStatus::Revoked);
    assert_eq!(record.revocation_reason, reason);

    let audit_log = client.get_audit_log(&cert_id);
    assert_eq!(audit_log.len(), 2);
    let revoke_log = audit_log.get(1).unwrap();
    assert_eq!(revoke_log.action, String::from_str(&env, "REVOKED"));
    assert_eq!(revoke_log.reason, reason);
}

#[test]
#[should_panic]
fn test_revoke_already_revoked_fails() {
    let (env, client, _admin, issuer, owner) = setup_test();
    let course_id = String::from_str(&env, "WEB3-BOOTCAMP");
    let content_hash = BytesN::from_array(&env, &[0x11; 32]);

    let cert_id = client.issue_certificate(&owner, &issuer, &course_id, &content_hash);
    let reason = String::from_str(&env, "First revocation");

    client.revoke_certificate(&cert_id, &reason);
    // Second revocation should panic with Error::AlreadyRevoked
    client.revoke_certificate(&cert_id, &reason);
}

#[test]
#[should_panic]
fn test_revoke_nonexistent_certificate_fails() {
    let (env, client, _admin, _issuer, _owner) = setup_test();
    let fake_id = BytesN::from_array(&env, &[0x99; 32]);
    let reason = String::from_str(&env, "Invalid cert");
    client.revoke_certificate(&fake_id, &reason);
}

// ============================================================================
// 3. REISSUE WORKFLOW TESTS
// ============================================================================

#[test]
fn test_reissue_certificate_success() {
    let (env, client, _admin, issuer, owner) = setup_test();
    let course_id = String::from_str(&env, "MATH-201");
    let old_hash = BytesN::from_array(&env, &[0x10; 32]);
    let new_hash = BytesN::from_array(&env, &[0x20; 32]);

    let old_cert_id = client.issue_certificate(&owner, &issuer, &course_id, &old_hash);
    client.set_royalty_bps(&old_cert_id, &300u32); // 3%
    client.revoke_certificate(&old_cert_id, &String::from_str(&env, "Name misspelled"));

    let new_cert_id = client.reissue_certificate(&old_cert_id, &new_hash);

    let old_record = client.get_certificate(&old_cert_id);
    assert_eq!(old_record.status, CertificateStatus::Reissued);

    let new_record = client.get_certificate(&new_cert_id);
    assert_eq!(new_record.status, CertificateStatus::Active);
    assert_eq!(new_record.owner, owner);
    assert_eq!(new_record.issuer, issuer);
    assert_eq!(new_record.course_id, course_id);
    assert_eq!(new_record.content_hash, new_hash);
    assert_eq!(new_record.previous_cert_id, old_cert_id);
    assert_eq!(new_record.royalty_bps, 300);
    assert!(new_record.soulbound);

    let audit_log = client.get_audit_log(&new_cert_id);
    assert_eq!(audit_log.len(), 1);
    let log = audit_log.get(0).unwrap();
    assert_eq!(log.action, String::from_str(&env, "REISSUED"));
}

#[test]
#[should_panic]
fn test_reissue_active_certificate_fails() {
    let (env, client, _admin, issuer, owner) = setup_test();
    let course_id = String::from_str(&env, "MATH-201");
    let old_hash = BytesN::from_array(&env, &[0x10; 32]);
    let new_hash = BytesN::from_array(&env, &[0x20; 32]);

    let cert_id = client.issue_certificate(&owner, &issuer, &course_id, &old_hash);
    // Reissuing an Active (non-revoked) cert must panic with Error::NotRevoked
    client.reissue_certificate(&cert_id, &new_hash);
}

#[test]
#[should_panic]
fn test_reissue_nonexistent_certificate_fails() {
    let (env, client, _admin, _issuer, _owner) = setup_test();
    let fake_id = BytesN::from_array(&env, &[0x99; 32]);
    let new_hash = BytesN::from_array(&env, &[0x20; 32]);
    client.reissue_certificate(&fake_id, &new_hash);
}

// ============================================================================
// 4. MERKLE COHORT ANCHORING & PROOF VALIDATION TESTS
// ============================================================================

#[test]
fn test_anchor_and_verify_merkle_inclusion_4_leaves() {
    let (env, client, _admin, _issuer, _owner) = setup_test();
    let cohort_id = String::from_str(&env, "COHORT-FALL-2026");

    let l0 = BytesN::from_array(&env, &[0x01; 32]);
    let l1 = BytesN::from_array(&env, &[0x02; 32]);
    let l2 = BytesN::from_array(&env, &[0x03; 32]);
    let l3 = BytesN::from_array(&env, &[0x04; 32]);

    let h01 = compute_parent_hash(&env, &l0, &l1);
    let h23 = compute_parent_hash(&env, &l2, &l3);
    let root = compute_parent_hash(&env, &h01, &h23);

    client.anchor_merkle_cohort(&cohort_id, &root);

    let cohort_root = client.get_merkle_root(&cohort_id);
    assert_eq!(cohort_root.cohort_id, cohort_id);
    assert_eq!(cohort_root.root_hash, root);

    // Proof for leaf l0 is [l1, h23]
    let proof_l0 = Vec::from_array(&env, [l1.clone(), h23.clone()]);
    assert!(client.verify_merkle_inclusion(&cohort_id, &l0, &proof_l0));

    // Proof for leaf l2 is [l3, h01]
    let proof_l2 = Vec::from_array(&env, [l3.clone(), h01.clone()]);
    assert!(client.verify_merkle_inclusion(&cohort_id, &l2, &proof_l2));
}

#[test]
fn test_verify_merkle_inclusion_invalid_proof_returns_false() {
    let (env, client, _admin, _issuer, _owner) = setup_test();
    let cohort_id = String::from_str(&env, "COHORT-SPRING-2026");

    let l0 = BytesN::from_array(&env, &[0x01; 32]);
    let l1 = BytesN::from_array(&env, &[0x02; 32]);
    let root = compute_parent_hash(&env, &l0, &l1);

    client.anchor_merkle_cohort(&cohort_id, &root);

    // Wrong sibling proof
    let bad_sibling = BytesN::from_array(&env, &[0xFF; 32]);
    let bad_proof = Vec::from_array(&env, [bad_sibling]);

    assert!(!client.verify_merkle_inclusion(&cohort_id, &l0, &bad_proof));
}

#[test]
fn test_verify_merkle_inclusion_unregistered_leaf_returns_false() {
    let (env, client, _admin, _issuer, _owner) = setup_test();
    let cohort_id = String::from_str(&env, "COHORT-SUMMER-2026");

    let l0 = BytesN::from_array(&env, &[0x05; 32]);
    let l1 = BytesN::from_array(&env, &[0x06; 32]);
    let root = compute_parent_hash(&env, &l0, &l1);

    client.anchor_merkle_cohort(&cohort_id, &root);

    let unanchored_leaf = BytesN::from_array(&env, &[0x07; 32]);
    let proof = Vec::from_array(&env, [l1]);

    assert!(!client.verify_merkle_inclusion(&cohort_id, &unanchored_leaf, &proof));
}

#[test]
#[should_panic]
fn test_verify_merkle_inclusion_nonexistent_cohort_fails() {
    let (env, client, _admin, _issuer, _owner) = setup_test();
    let cohort_id = String::from_str(&env, "NONEXISTENT-COHORT");
    let leaf = BytesN::from_array(&env, &[0x01; 32]);
    let proof = Vec::new(&env);
    client.verify_merkle_inclusion(&cohort_id, &leaf, &proof);
}

#[test]
#[should_panic]
fn test_get_merkle_root_nonexistent_cohort_fails() {
    let (env, client, _admin, _issuer, _owner) = setup_test();
    let cohort_id = String::from_str(&env, "UNKNOWN");
    client.get_merkle_root(&cohort_id);
}

// ============================================================================
// 5. ROYALTY SETTING & SECONDARY SALE SPLIT TESTS
// ============================================================================

#[test]
fn test_set_royalty_bps_and_calculate_royalty() {
    let (env, client, _admin, issuer, owner) = setup_test();
    let course_id = String::from_str(&env, "ART-101");
    let hash = BytesN::from_array(&env, &[0x55; 32]);
    let cert_id = client.issue_certificate(&owner, &issuer, &course_id, &hash);

    // Initial royalty is 0
    let (creator, seller) = client.calculate_royalty(&cert_id, &10_000i128);
    assert_eq!(creator, 0);
    assert_eq!(seller, 10_000);

    // Set royalty to 250 bps (2.5%)
    client.set_royalty_bps(&cert_id, &250u32);
    let (creator, seller) = client.calculate_royalty(&cert_id, &10_000i128);
    assert_eq!(creator, 250);
    assert_eq!(seller, 9_750);
    assert_eq!(creator + seller, 10_000);

    // Set royalty to MAX_ROYALTY_BPS (50%)
    client.set_royalty_bps(&cert_id, &MAX_ROYALTY_BPS);
    let (creator, seller) = client.calculate_royalty(&cert_id, &10_000i128);
    assert_eq!(creator, 5_000);
    assert_eq!(seller, 5_000);
}

#[test]
fn test_calculate_royalty_zero_and_negative_amounts() {
    let (env, client, _admin, issuer, owner) = setup_test();
    let cert_id = client.issue_certificate(
        &owner,
        &issuer,
        &String::from_str(&env, "COURSE"),
        &BytesN::from_array(&env, &[0x01; 32]),
    );
    client.set_royalty_bps(&cert_id, &500u32);

    let (creator_zero, seller_zero) = client.calculate_royalty(&cert_id, &0i128);
    assert_eq!(creator_zero, 0);
    assert_eq!(seller_zero, 0);

    let (creator_neg, seller_neg) = client.calculate_royalty(&cert_id, &-500i128);
    assert_eq!(creator_neg, 0);
    assert_eq!(seller_neg, 0);
}

#[test]
#[should_panic]
fn test_set_royalty_bps_above_cap_fails() {
    let (env, client, _admin, issuer, owner) = setup_test();
    let cert_id = client.issue_certificate(
        &owner,
        &issuer,
        &String::from_str(&env, "COURSE"),
        &BytesN::from_array(&env, &[0x01; 32]),
    );

    // Setting royalty above MAX_ROYALTY_BPS (5000) should panic with Error::RoyaltyTooHigh
    client.set_royalty_bps(&cert_id, &(MAX_ROYALTY_BPS + 1));
}

#[test]
#[should_panic]
fn test_set_royalty_bps_nonexistent_certificate_fails() {
    let (env, client, _admin, _issuer, _owner) = setup_test();
    let fake_id = BytesN::from_array(&env, &[0xAA; 32]);
    client.set_royalty_bps(&fake_id, &100u32);
}

#[test]
#[should_panic]
fn test_calculate_royalty_nonexistent_certificate_fails() {
    let (env, client, _admin, _issuer, _owner) = setup_test();
    let fake_id = BytesN::from_array(&env, &[0xAA; 32]);
    client.calculate_royalty(&fake_id, &1000i128);
}

// ============================================================================
// 6. SOULBOUND IMMUTABILITY & TRANSFER REJECTION TESTS
// ============================================================================

#[test]
fn test_is_soulbound_returns_true() {
    let (env, client, _admin, issuer, owner) = setup_test();
    let cert_id = client.issue_certificate(
        &owner,
        &issuer,
        &String::from_str(&env, "COURSE"),
        &BytesN::from_array(&env, &[0x01; 32]),
    );

    assert!(client.is_soulbound(&cert_id));
}

#[test]
#[should_panic]
fn test_transfer_certificate_always_panics() {
    let (env, client, _admin, issuer, owner) = setup_test();
    let recipient = Address::generate(&env);
    let cert_id = client.issue_certificate(
        &owner,
        &issuer,
        &String::from_str(&env, "COURSE"),
        &BytesN::from_array(&env, &[0x01; 32]),
    );

    client.transfer_certificate(&cert_id, &recipient);
}

#[test]
#[should_panic]
fn test_transfer_nonexistent_certificate_fails() {
    let (env, client, _admin, _issuer, _owner) = setup_test();
    let fake_id = BytesN::from_array(&env, &[0xBB; 32]);
    let recipient = Address::generate(&env);
    client.transfer_certificate(&fake_id, &recipient);
}

#[test]
#[should_panic]
fn test_is_soulbound_nonexistent_certificate_fails() {
    let (env, client, _admin, _issuer, _owner) = setup_test();
    let fake_id = BytesN::from_array(&env, &[0xBB; 32]);
    client.is_soulbound(&fake_id);
}

// ============================================================================
// 7. AUDIT LOGGING TESTS
// ============================================================================

#[test]
fn test_audit_log_nonexistent_returns_empty_vector() {
    let (env, client, _admin, _issuer, _owner) = setup_test();
    let fake_id = BytesN::from_array(&env, &[0xCC; 32]);
    let logs = client.get_audit_log(&fake_id);
    assert_eq!(logs.len(), 0);
}
