use super::*;
use soroban_sdk::{
    testutils::Address as _,
    Env, String, Vec,
};

fn setup() -> (Env, CertificateNFTContractClient<'static>, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(CertificateNFTContract, ());
    let client = CertificateNFTContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let student = Address::generate(&env);
    (env, client, admin, student)
}

#[test]
fn test_mint_badge_and_soulbound_enforcement() {
    let (env, client, admin, student) = setup();

    let course_id = String::from_str(&env, "SORO-101");
    let uri = String::from_str(
        &env,
        "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
    );
    let milestone1 = String::from_str(&env, "Milestone 1: Smart Contract Basics");

    let badge_id = client.mint_badge(
        &admin,
        &student,
        &course_id,
        &RarityTier::Bronze,
        &uri,
        &milestone1,
    );

    let badge = client.get_badge(&badge_id);
    assert_eq!(badge.owner, student);
    assert_eq!(badge.tier, RarityTier::Bronze);
    assert_eq!(badge.completed_milestones.len(), 1);
    assert_eq!(badge.provenance.len(), 0);
}

#[test]
#[should_panic(expected = "Error(Contract, #402)")]
fn test_badge_transfer_fails_soulbound() {
    let (env, client, admin, student) = setup();
    let recipient = Address::generate(&env);

    let course_id = String::from_str(&env, "SORO-101");
    let uri = String::from_str(&env, "ipfs://cid1");
    let milestone1 = String::from_str(&env, "Milestone 1");

    let badge_id = client.mint_badge(
        &admin,
        &student,
        &course_id,
        &RarityTier::Bronze,
        &uri,
        &milestone1,
    );

    // Transfer must panic with Soulbound (402)
    client.transfer(&student, &recipient, &badge_id);
}

#[test]
#[should_panic(expected = "Error(Contract, #402)")]
fn test_badge_transfer_from_fails_non_transferable() {
    let (env, client, admin, student) = setup();
    let recipient = Address::generate(&env);

    let badge_id = client.mint_badge(
        &admin,
        &student,
        &String::from_str(&env, "SORO-101"),
        &RarityTier::Bronze,
        &String::from_str(&env, "ipfs://cid1"),
        &String::from_str(&env, "Milestone 1"),
    );

    client.transfer_from(&admin, &student, &recipient, &badge_id);
}

#[test]
fn test_batch_mint_issues_certificates_and_returns_ids() {
    let (env, client, admin, _) = setup();
    let first = Address::generate(&env);
    let second = Address::generate(&env);
    let recipients = Vec::from_array(&env, [first.clone(), second.clone()]);
    let uris = Vec::from_array(
        &env,
        [
            String::from_str(&env, "ipfs://certificate-1"),
            String::from_str(&env, "ipfs://certificate-2"),
        ],
    );

    let batch_id = client.batch_mint(&admin, &recipients, &uris);
    assert_eq!(batch_id, 1);
    assert_eq!(
        client.get_certificate(&(batch_id << 6 | 1)),
        BatchCertificate {
            owner: first,
            metadata_uri: String::from_str(&env, "ipfs://certificate-1"),
        }
    );
    assert_eq!(
        client.get_certificate(&(batch_id << 6 | 2)),
        BatchCertificate {
            owner: second,
            metadata_uri: String::from_str(&env, "ipfs://certificate-2"),
        }
    );
}

#[test]
fn test_batch_mint_accepts_limit_of_50() {
    let (env, client, admin, _) = setup();
    let mut recipients = Vec::new(&env);
    let mut uris = Vec::new(&env);
    for _ in 0..50 {
        recipients.push_back(Address::generate(&env));
        uris.push_back(String::from_str(&env, "ipfs://cohort"));
    }

    client.batch_mint(&admin, &recipients, &uris);
}

#[test]
fn test_batch_mint_cpu_cost_can_be_measured() {
    let (env, client, admin, _) = setup();
    let course_id = String::from_str(&env, "GAS-BENCH");
    let grade = String::from_str(&env, "A");
    let uri = String::from_str(&env, "ipfs://gas-bench");
    let mut recipients = Vec::new(&env);
    let mut uris = Vec::new(&env);
    for _ in 0..50 {
        recipients.push_back(Address::generate(&env));
        uris.push_back(uri.clone());
    }

    let mut budget = env.cost_estimate().budget();
    budget.reset_tracker();
    for recipient in recipients.iter() {
        client.mint_certificate(&admin, &recipient, &course_id, &grade, &uri);
    }
    let individual_cpu = budget.cpu_instruction_cost();

    budget.reset_tracker();
    client.batch_mint(&admin, &recipients, &uris);
    let batch_cpu = budget.cpu_instruction_cost();

    assert!(individual_cpu > 0);
    assert!(batch_cpu > 0);
}

#[test]
#[should_panic(expected = "Error(Contract, #407)")]
fn test_batch_mint_rejects_more_than_50_certificates() {
    let (env, client, admin, _) = setup();
    let mut recipients = Vec::new(&env);
    let mut uris = Vec::new(&env);
    for _ in 0..51 {
        recipients.push_back(Address::generate(&env));
        uris.push_back(String::from_str(&env, "ipfs://cohort"));
    }

    client.batch_mint(&admin, &recipients, &uris);
}

#[test]
#[should_panic(expected = "Error(Contract, #408)")]
fn test_batch_mint_rejects_mismatched_inputs() {
    let (env, client, admin, student) = setup();
    let recipients = Vec::from_array(&env, [student]);
    let uris = Vec::new(&env);

    client.batch_mint(&admin, &recipients, &uris);
}

#[test]
#[should_panic(expected = "Error(Contract, #402)")]
fn test_certificate_approval_fails_soulbound() {
    let (env, client, _, owner) = setup();
    let delegate = Address::generate(&env);

    client.approve(&owner, &delegate, &1);
}

#[test]
#[should_panic(expected = "Error(Contract, #402)")]
fn test_certificate_delegation_fails_soulbound() {
    let (env, client, _, owner) = setup();
    let delegate = Address::generate(&env);

    client.delegate(&owner, &delegate, &1);
}

#[test]
fn test_badge_tier_upgrade_and_provenance_history() {
    let (env, client, admin, student) = setup();

    let course_id = String::from_str(&env, "RUST-201");
    let bronze_uri = String::from_str(&env, "ipfs://cid-bronze");
    let m1 = String::from_str(&env, "Milestone 1: Syntax");

    let badge_id = client.mint_badge(
        &admin,
        &student,
        &course_id,
        &RarityTier::Bronze,
        &bronze_uri,
        &m1,
    );

    // Add milestone 2 and 3
    client.add_badge_milestone(
        &admin,
        &badge_id,
        &String::from_str(&env, "Milestone 2: Borrow Checker"),
    );
    client.add_badge_milestone(
        &admin,
        &badge_id,
        &String::from_str(&env, "Milestone 3: Lifetimes"),
    );

    let badge_before_upgrade = client.get_badge(&badge_id);
    assert_eq!(badge_before_upgrade.completed_milestones.len(), 3);

    // Upgrade to Silver
    let silver_uri = String::from_str(&env, "ipfs://cid-silver");
    client.upgrade_badge_tier(&admin, &badge_id, &RarityTier::Silver, &silver_uri);

    let badge_after_upgrade = client.get_badge(&badge_id);
    assert_eq!(badge_after_upgrade.tier, RarityTier::Silver);
    assert_eq!(badge_after_upgrade.metadata_uri, silver_uri);
    assert_eq!(badge_after_upgrade.provenance.len(), 1);

    let prov = badge_after_upgrade.provenance.get(0).unwrap();
    assert_eq!(prov.previous_tier, RarityTier::Bronze);
    assert_eq!(prov.previous_uri, bronze_uri);
}

#[test]
#[should_panic(expected = "Error(Contract, #403)")]
fn test_premature_tier_upgrade_rejected_without_milestones() {
    let (env, client, admin, student) = setup();

    let course_id = String::from_str(&env, "RUST-201");
    let bronze_uri = String::from_str(&env, "ipfs://cid-bronze");
    let m1 = String::from_str(&env, "Milestone 1");

    let badge_id = client.mint_badge(
        &admin,
        &student,
        &course_id,
        &RarityTier::Bronze,
        &bronze_uri,
        &m1,
    );

    // Attempting to upgrade to Gold (requires 5 milestones) with only 1 milestone must fail
    let gold_uri = String::from_str(&env, "ipfs://cid-gold");
    client.upgrade_badge_tier(&admin, &badge_id, &RarityTier::Gold, &gold_uri);
}
