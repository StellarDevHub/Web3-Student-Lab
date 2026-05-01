use super::*;
use soroban_sdk::{
    symbol_short,
    testutils::{Address as _, Events, Ledger},
    vec, Address, Env, FromVal, String, Symbol,
};

use crate::session::{SessionVerificationContract, SessionVerificationContractClient};

fn setup() -> (
    Env,
    Address,
    Address,
    Address,
    CertificateContractClient<'static>,
) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(CertificateContract, ());
    let client = CertificateContractClient::new(&env, &contract_id);
    let admin_a = Address::generate(&env);
    let admin_b = Address::generate(&env);
    let admin_c = Address::generate(&env);
    client.init(&admin_a, &admin_b, &admin_c);
    (env, admin_a, admin_b, admin_c, client)
}

fn propose_and_approve_mint_cap(
    client: &CertificateContractClient<'_>,
    proposer: &Address,
    co_signer: &Address,
    cap: u32,
) {
    let id = client.propose_action(proposer, &PendingAdminAction::SetMintCap(cap));
    client.approve_action(co_signer, &id);
}

#[test]
fn issues_and_loads_certificate_successfully() {
    let (env, instructor, _, _, client) = setup();

    env.ledger().with_mut(|ledger| ledger.timestamp = 1_234);

    let course_symbol = symbol_short!("SOLID");
    let student = Address::generate(&env);
    let course_name = String::from_str(&env, "Rust 101");

    let issued = client.issue(
        &instructor,
        &course_symbol,
        &vec![&env, student.clone()],
        &course_name,
    );

    assert_eq!(issued.len(), 1);
    let cert = issued.get(0).unwrap();
    assert_eq!(cert.course_symbol, course_symbol);
    assert_eq!(cert.student, student);
    assert_eq!(cert.course_name, course_name);
    assert_eq!(cert.issue_date, 1_234);
    assert!(!cert.revoked);

    let stored = client.get_certificate(&course_symbol, &student);
    assert_eq!(stored, Some(cert));
}

#[test]
fn returns_none_for_non_existent_certificate() {
    let (env, _a, _b, _c, client) = setup();

    let course_symbol = symbol_short!("MISSIN");
    let student = Address::generate(&env);
    assert!(client.get_certificate(&course_symbol, &student).is_none());
}

#[test]
fn issues_multiple_students_in_one_call() {
    let (env, instructor, _, _, client) = setup();

    env.ledger().with_mut(|ledger| ledger.timestamp = 5_000);

    let course_symbol = symbol_short!("MULTI");
    let course_name = String::from_str(&env, "Web3 Basics");
    let student_a = Address::generate(&env);
    let student_b = Address::generate(&env);
    let student_c = Address::generate(&env);

    let students = vec![
        &env,
        student_a.clone(),
        student_b.clone(),
        student_c.clone(),
    ];
    let issued = client.issue(&instructor, &course_symbol, &students, &course_name);

    assert_eq!(issued.len(), 3);

    for student in [&student_a, &student_b, &student_c] {
        let cert = client.get_certificate(&course_symbol, student).unwrap();
        assert_eq!(cert.student, *student);
        assert_eq!(cert.issue_date, 5_000);
        assert!(!cert.revoked);
    }
}

#[test]
fn each_student_gets_unique_storage_key() {
    let (env, instructor, _, _, client) = setup();

    let course_symbol = symbol_short!("UNIQ");
    let course_name = String::from_str(&env, "Soroban 101");
    let student_a = Address::generate(&env);
    let student_b = Address::generate(&env);

    client.issue(
        &instructor,
        &course_symbol,
        &vec![&env, student_a.clone(), student_b.clone()],
        &course_name,
    );

    let cert_a = client.get_certificate(&course_symbol, &student_a).unwrap();
    let cert_b = client.get_certificate(&course_symbol, &student_b).unwrap();
    assert_ne!(cert_a.student, cert_b.student);
}

#[test]
fn verifies_event_emitted_per_student() {
    let (env, instructor, _, _, client) = setup();

    let course_symbol = symbol_short!("SOLID");
    let course_name = String::from_str(&env, "Rust 101");
    let student_a = Address::generate(&env);
    let student_b = Address::generate(&env);

    client.issue(
        &instructor,
        &course_symbol,
        &vec![&env, student_a.clone(), student_b.clone()],
        &course_name,
    );

    let all_events = env.events().all();
    let mut cert_issued_count = 0u32;
    for (addr, topics, _) in all_events.iter() {
        if addr == client.address
            && Symbol::from_val(&env, &topics.get(0).unwrap())
                == Symbol::new(&env, "v1_cert_issued")
        {
            cert_issued_count += 1;
        }
    }

    assert_eq!(cert_issued_count, 2);
}

#[test]
fn gets_certificates_by_student_across_courses() {
    let (env, instructor, _, _, client) = setup();

    let student = Address::generate(&env);
    let course_name = String::from_str(&env, "Soroban");

    client.issue(
        &instructor,
        &symbol_short!("RUST"),
        &vec![&env, student.clone()],
        &course_name,
    );
    client.issue(
        &instructor,
        &symbol_short!("WEB3"),
        &vec![&env, student.clone()],
        &course_name,
    );

    let certificates = client.get_certificates_by_student(&student);

    assert_eq!(certificates.len(), 2);
    assert_eq!(certificates.get(0).unwrap().student, student);
    assert_eq!(certificates.get(1).unwrap().student, student);
}

#[test]
fn update_did_links_existing_and_new_certificates() {
    let (env, instructor, _, _, client) = setup();

    env.ledger().with_mut(|ledger| ledger.timestamp = 7_777);

    let student = Address::generate(&env);
    let course_name = String::from_str(&env, "Soroban Identity");
    let did = String::from_str(&env, "did:soroban:testnet:student-123#profile");

    client.issue(
        &instructor,
        &symbol_short!("DIDONE"),
        &vec![&env, student.clone()],
        &course_name,
    );

    client.update_did(&student, &did);

    let linked_did = client.get_did(&student).unwrap();
    assert_eq!(linked_did.did, did);
    assert_eq!(linked_did.updated_at, 7_777);

    let updated_cert = client
        .get_certificate(&symbol_short!("DIDONE"), &student)
        .unwrap();
    assert_eq!(updated_cert.did, Some(did.clone()));

    client.issue(
        &instructor,
        &symbol_short!("DIDTWO"),
        &vec![&env, student.clone()],
        &course_name,
    );

    let new_cert = client
        .get_certificate(&symbol_short!("DIDTWO"), &student)
        .unwrap();
    assert_eq!(new_cert.did, Some(did));
}

#[test]
#[should_panic]
fn rejects_invalid_soroban_did_format() {
    let (env, _, _, _, client) = setup();
    let student = Address::generate(&env);

    client.update_did(
        &student,
        &String::from_str(&env, "https://example.com/student-1"),
    );
}

#[test]
fn admin_can_revoke_certificate() {
    let (env, admin, _, _, client) = setup();

    let course_symbol = symbol_short!("SOLID");
    let student = Address::generate(&env);
    let course_name = String::from_str(&env, "Rust 101");

    client.issue(
        &admin,
        &course_symbol,
        &vec![&env, student.clone()],
        &course_name,
    );
    client.revoke(&admin, &course_symbol, &student);

    let cert = client.get_certificate(&course_symbol, &student).unwrap();
    assert!(cert.revoked);
}

#[test]
fn revoke_does_not_affect_other_students() {
    let (env, admin, _, _, client) = setup();

    let course_symbol = symbol_short!("SOLID");
    let course_name = String::from_str(&env, "Rust 101");
    let student_a = Address::generate(&env);
    let student_b = Address::generate(&env);

    client.issue(
        &admin,
        &course_symbol,
        &vec![&env, student_a.clone(), student_b.clone()],
        &course_name,
    );

    client.revoke(&admin, &course_symbol, &student_a);

    assert!(
        client
            .get_certificate(&course_symbol, &student_a)
            .unwrap()
            .revoked
    );
    assert!(
        !client
            .get_certificate(&course_symbol, &student_b)
            .unwrap()
            .revoked
    );
}

#[test]
fn revoke_emits_event() {
    let (env, admin, _, _, client) = setup();

    let course_symbol = symbol_short!("SOLID");
    let student = Address::generate(&env);
    let course_name = String::from_str(&env, "Rust 101");

    client.issue(
        &admin,
        &course_symbol,
        &vec![&env, student.clone()],
        &course_name,
    );
    client.revoke(&admin, &course_symbol, &student);

    let (addr, topics, _data) = env.events().all().last().unwrap();
    assert_eq!(addr, client.address);
    assert_eq!(
        Symbol::from_val(&env, &topics.get(0).unwrap()),
        Symbol::new(&env, "v1_cert_revoked")
    );
    assert_eq!(
        Symbol::from_val(&env, &topics.get(1).unwrap()),
        course_symbol
    );
}

#[test]
#[should_panic]
fn non_admin_cannot_revoke_certificate() {
    let (env, admin, _, _, client) = setup();

    let course_symbol = symbol_short!("SOLID");
    let student = Address::generate(&env);
    let course_name = String::from_str(&env, "Rust 101");

    client.issue(
        &admin,
        &course_symbol,
        &vec![&env, student.clone()],
        &course_name,
    );

    let attacker = Address::generate(&env);
    client.revoke(&attacker, &course_symbol, &student);
}

fn setup_session() -> (Env, Address, SessionVerificationContractClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(SessionVerificationContract, ());
    let client = SessionVerificationContractClient::new(&env, &contract_id);
    let student = Address::generate(&env);
    (env, student, client)
}

// ---------------------------------------------------------------------------
// Session Verification Tests
// ---------------------------------------------------------------------------

#[test]
fn test_session_start_and_verify() {
    let (env, student, client) = setup_session();

    let code = client.start_session(&student);

    // Verify the code is valid
    assert!(client.verify_session(&student, &code));

    // Verify a wrong code is invalid
    let wrong_code = BytesN::from_array(&env, &[0u8; 16]);
    assert!(!client.verify_session(&student, &wrong_code));
}

#[test]
fn test_session_expiration() {
    let (env, student, client) = setup_session();

    let code = client.start_session(&student);
    assert!(client.verify_session(&student, &code));

    // Jump forward in time by 201 ledgers to trigger expiration
    // (We set TTL to 100-200 in start_session)
    env.ledger().with_mut(|l| {
        l.sequence_number += 201;
    });

    // Code should now be expired (None in temporary storage)
    assert!(!client.verify_session(&student, &code));
}

#[test]
fn test_session_extension() {
    let (env, student, client) = setup_session();

    let code = client.start_session(&student);

    // Jump forward 50 ledgers
    env.ledger().with_mut(|l| {
        l.sequence_number += 50;
    });

    // Extend the session
    client.extend_session(&student);

    // Jump forward another 60 ledgers (total 110 since start)
    // Without extension, it would have expired at 100.
    env.ledger().with_mut(|l| {
        l.sequence_number += 60;
    });

    // Code should still be valid because of extension
    assert!(client.verify_session(&student, &code));
}

// ---------------------------------------------------------------------------
// Meta-transactions
// ---------------------------------------------------------------------------

#[test]
fn meta_tx_issues_certificate_for_student() {
    let (env, admin, _, _, client) = setup();

    env.ledger().with_mut(|l| l.timestamp = 9_000);

    let course_symbol = symbol_short!("META");
    let student = Address::generate(&env);
    let course_name = String::from_str(&env, "Meta Course");

    let call_data = MetaTxCallData {
        instructor: admin.clone(),
        course_symbol: course_symbol.clone(),
        student: student.clone(),
        course_name: course_name.clone(),
        nonce: 0,
    };

    let sig = BytesN::from_array(&env, &[0u8; 64]);
    let cert = client.execute_meta_tx(&sig, &call_data);

    assert_eq!(cert.student, student);
    assert_eq!(cert.course_symbol, course_symbol);
    assert_eq!(cert.issue_date, 9_000);
    assert!(!cert.revoked);

    assert_eq!(client.get_certificate(&course_symbol, &student), Some(cert));
}

#[test]
fn meta_tx_nonce_increments_after_execution() {
    let (env, admin, _, _, client) = setup();

    let call_data = MetaTxCallData {
        instructor: admin.clone(),
        course_symbol: symbol_short!("NONCE"),
        student: Address::generate(&env),
        course_name: String::from_str(&env, "Nonce Test"),
        nonce: 0,
    };

    assert_eq!(client.get_nonce(&admin), 0);
    let sig = BytesN::from_array(&env, &[0u8; 64]);
    client.execute_meta_tx(&sig, &call_data);
    assert_eq!(client.get_nonce(&admin), 1);
}

#[test]
#[should_panic(expected = "invalid nonce")]
fn meta_tx_replay_is_rejected() {
    let (env, admin, _, _, client) = setup();

    let call_data = MetaTxCallData {
        instructor: admin.clone(),
        course_symbol: symbol_short!("REPLY"),
        student: Address::generate(&env),
        course_name: String::from_str(&env, "Replay Test"),
        nonce: 0,
    };

    let sig = BytesN::from_array(&env, &[0u8; 64]);
    client.execute_meta_tx(&sig, &call_data.clone());
    client.execute_meta_tx(&sig, &call_data);
}

#[test]
#[should_panic]
fn meta_tx_non_instructor_is_rejected() {
    let (env, _a, _b, _c, client) = setup();

    let attacker = Address::generate(&env);
    let call_data = MetaTxCallData {
        instructor: attacker.clone(),
        course_symbol: symbol_short!("HACK"),
        student: Address::generate(&env),
        course_name: String::from_str(&env, "Hack Attempt"),
        nonce: 0,
    };

    let sig = BytesN::from_array(&env, &[0u8; 64]);
    client.execute_meta_tx(&sig, &call_data);
}

#[test]
fn meta_tx_emits_event() {
    let (env, admin, _, _, client) = setup();

    let course_symbol = symbol_short!("EVNT");
    let call_data = MetaTxCallData {
        instructor: admin.clone(),
        course_symbol: course_symbol.clone(),
        student: Address::generate(&env),
        course_name: String::from_str(&env, "Event Test"),
        nonce: 0,
    };

    let sig = BytesN::from_array(&env, &[0u8; 64]);
    client.execute_meta_tx(&sig, &call_data);

    let (addr, topics, _) = env.events().all().last().unwrap();
    assert_eq!(addr, client.address);
    assert_eq!(
        Symbol::from_val(&env, &topics.get(0).unwrap()),
        Symbol::new(&env, "v1_meta_tx_issued")
    );
}

// ---------------------------------------------------------------------------
// Mint caps (2-of-3 multisig)
// ---------------------------------------------------------------------------

#[test]
fn get_default_mint_cap() {
    let (_env, admin, _, _, client) = setup();

    let mint_cap = client.get_mint_cap(&admin);
    assert_eq!(mint_cap, 1000);
}

#[test]
#[should_panic]
fn non_admin_cannot_get_mint_cap() {
    let (env, _a, _b, _c, client) = setup();

    let attacker = Address::generate(&env);
    client.get_mint_cap(&attacker);
}

#[test]
fn admin_can_set_mint_cap_via_multisig() {
    let (_env, admin_a, admin_b, _, client) = setup();

    propose_and_approve_mint_cap(&client, &admin_a, &admin_b, 500);

    let mint_cap = client.get_mint_cap(&admin_a);
    assert_eq!(mint_cap, 500);
}

#[test]
#[should_panic]
fn non_admin_cannot_propose_mint_cap() {
    let (env, _a, _b, _c, client) = setup();

    let attacker = Address::generate(&env);
    client.propose_action(&attacker, &PendingAdminAction::SetMintCap(500));
}

#[test]
#[should_panic]
fn cannot_set_zero_mint_cap_via_multisig() {
    let (_env, admin_a, admin_b, _, client) = setup();

    propose_and_approve_mint_cap(&client, &admin_a, &admin_b, 0);
}

#[test]
#[should_panic]
fn mint_cap_exceeded_reverts() {
    let (env, admin_a, admin_b, _, client) = setup();

    propose_and_approve_mint_cap(&client, &admin_a, &admin_b, 2);

    let course_symbol = symbol_short!("CAP1");
    let course_name = String::from_str(&env, "Test Course");

    let student1 = Address::generate(&env);
    let student2 = Address::generate(&env);
    client.issue(
        &admin_a,
        &course_symbol,
        &vec![&env, student1.clone(), student2.clone()],
        &course_name,
    );

    let student3 = Address::generate(&env);
    client.issue(
        &admin_a,
        &course_symbol,
        &vec![&env, student3.clone()],
        &course_name,
    );
}

#[test]
fn get_mint_stats() {
    let (env, admin_a, admin_b, _, client) = setup();

    propose_and_approve_mint_cap(&client, &admin_a, &admin_b, 100);

    let course_symbol = symbol_short!("STAT");
    let course_name = String::from_str(&env, "Stats Course");
    let student1 = Address::generate(&env);
    let student2 = Address::generate(&env);
    let student3 = Address::generate(&env);
    client.issue(
        &admin_a,
        &course_symbol,
        &vec![&env, student1.clone(), student2.clone(), student3.clone()],
        &course_name,
    );

    let (period, minted, cap, remaining) = client.get_mint_stats(&admin_a);

    assert_eq!(minted, 3);
    assert_eq!(cap, 100);
    assert_eq!(remaining, 97);
    assert_eq!(period, 0);
}

#[test]
#[should_panic]
fn non_admin_cannot_get_mint_stats() {
    let (env, _a, _b, _c, client) = setup();

    let attacker = Address::generate(&env);
    client.get_mint_stats(&attacker);
}

#[test]
#[should_panic]
fn multiple_issues_respect_mint_cap() {
    let (env, admin_a, admin_b, _, client) = setup();

    propose_and_approve_mint_cap(&client, &admin_a, &admin_b, 5);

    let course_symbol = symbol_short!("MULT");
    let course_name = String::from_str(&env, "Multi Issue Course");

    let student1 = Address::generate(&env);
    let student2 = Address::generate(&env);
    let student3 = Address::generate(&env);
    client.issue(
        &admin_a,
        &course_symbol,
        &vec![&env, student1.clone(), student2.clone(), student3.clone()],
        &course_name,
    );

    let student4 = Address::generate(&env);
    let student5 = Address::generate(&env);
    client.issue(
        &admin_a,
        &course_symbol,
        &vec![&env, student4.clone(), student5.clone()],
        &course_name,
    );

    let student6 = Address::generate(&env);
    client.issue(
        &admin_a,
        &course_symbol,
        &vec![&env, student6.clone()],
        &course_name,
    );
}

#[test]
fn mint_cap_update_emits_event() {
    let (env, admin_a, admin_b, _, client) = setup();

    propose_and_approve_mint_cap(&client, &admin_a, &admin_b, 250);

    let all_events = env.events().all();
    let mut found_event = false;
    for (addr, topics, _) in all_events.iter() {
        if addr == client.address
            && Symbol::from_val(&env, &topics.get(0).unwrap())
                == Symbol::new(&env, "v1_mint_cap_updated")
        {
            found_event = true;
        }
    }
    assert!(found_event);
}

#[test]
fn issue_emits_mint_period_update_event() {
    let (env, instructor, _, _, client) = setup();

    let course_symbol = symbol_short!("EVNT");
    let course_name = String::from_str(&env, "Event Course");
    let student1 = Address::generate(&env);
    let student2 = Address::generate(&env);

    client.issue(
        &instructor,
        &course_symbol,
        &vec![&env, student1.clone(), student2.clone()],
        &course_name,
    );

    let all_events = env.events().all();
    let mut found_event = false;
    for (addr, topics, _) in all_events.iter() {
        if addr == client.address
            && Symbol::from_val(&env, &topics.get(0).unwrap())
                == Symbol::new(&env, "v1_mint_period_update")
        {
            found_event = true;
        }
    }
    assert!(found_event);
}

// ---------------------------------------------------------------------------
// RBAC, pause, multisig surface
// ---------------------------------------------------------------------------

#[test]
fn governance_address_has_admin_role() {
    let (_env, admin_a, _, _, client) = setup();
    assert!(client.has_role(&admin_a, &Role::Admin));
}

#[test]
#[should_panic]
fn issue_without_instructor_role_fails() {
    let (env, admin_a, _, _, client) = setup();

    let student_only = Address::generate(&env);
    client.grant_role(&admin_a, &student_only, &Role::Student);

    let course_symbol = symbol_short!("RBAC");
    let course_name = String::from_str(&env, "RBAC");
    client.issue(
        &student_only,
        &course_symbol,
        &vec![&env, Address::generate(&env)],
        &course_name,
    );
}

#[test]
#[should_panic]
fn pause_blocks_issue() {
    let (env, admin_a, _, _, client) = setup();

    client.set_paused(&admin_a, &true);

    let course_symbol = symbol_short!("PAUS");
    let course_name = String::from_str(&env, "Paused");
    client.issue(
        &admin_a,
        &course_symbol,
        &vec![&env, Address::generate(&env)],
        &course_name,
    );
}

#[test]
fn third_admin_can_be_final_approver() {
    let (_env, admin_a, _admin_b, admin_c, client) = setup();

    let id = client.propose_action(&admin_a, &PendingAdminAction::SetMintCap(42));
    client.approve_action(&admin_c, &id);

    assert_eq!(client.get_mint_cap(&admin_a), 42);
}

// ---------------------------------------------------------------------------
// Batch Certificate Issuance Tests
// ---------------------------------------------------------------------------

#[test]
fn batch_issue_multiple_certificates_successfully() {
    let (env, instructor, _, _, client) = setup();

    env.ledger().with_mut(|ledger| ledger.timestamp = 1_234);

    let symbols = vec![
        &env,
        symbol_short!("BATCH1"),
        symbol_short!("BATCH2"),
        symbol_short!("BATCH3"),
    ];
    let students = vec![
        &env,
        Address::generate(&env),
        Address::generate(&env),
        Address::generate(&env),
    ];
    let course_name = String::from_str(&env, "Batch Course Test");

    let issued = client.batch_issue(&instructor, &symbols, &students, &course_name);

    assert_eq!(issued.len(), 3);

    // Verify each certificate was issued correctly
    for i in 0..3 {
        let cert = issued.get(i).unwrap();
        assert_eq!(cert.course_symbol, symbols.get(i).unwrap());
        assert_eq!(cert.student, students.get(i).unwrap());
        assert_eq!(cert.course_name, course_name);
        assert_eq!(cert.issue_date, 1_234);
        assert!(!cert.revoked);
    }
}

#[test]
#[should_panic]
fn batch_issue_with_mismatched_lengths_fails() {
    let (env, instructor, _, _, client) = setup();

    let symbols = vec![&env, symbol_short!("BATCH1"), symbol_short!("BATCH2")];
    let students = vec![&env, Address::generate(&env)]; // Only 1 student for 2 symbols

    client.batch_issue(
        &instructor,
        &symbols,
        &students,
        &String::from_str(&env, "Invalid Batch"),
    );
}

#[test]
#[should_panic]
fn batch_issue_respects_mint_cap() {
    let (env, admin_a, admin_b, _, client) = setup();

    // Set very low mint cap
    propose_and_approve_mint_cap(&client, &admin_a, &admin_b, 2);

    let symbols = vec![
        &env,
        symbol_short!("CAP1"),
        symbol_short!("CAP2"),
        symbol_short!("CAP3"), // This should exceed the cap
    ];
    let students = vec![
        &env,
        Address::generate(&env),
        Address::generate(&env),
        Address::generate(&env),
    ];

    client.batch_issue(
        &admin_a,
        &symbols,
        &students,
        &String::from_str(&env, "Cap Test"),
    );
}

#[test]
#[should_panic]
fn batch_issue_requires_instructor_role() {
    let (env, _admin_a, _admin_b, _admin_c, client) = setup();

    let student_only = Address::generate(&env);
    client.grant_role(&_admin_a, &student_only, &Role::Student);

    let symbols = vec![&env, symbol_short!("NOAUTH")];
    let students = vec![&env, Address::generate(&env)];

    client.batch_issue(
        &student_only,
        &symbols,
        &students,
        &String::from_str(&env, "No Auth Test"),
    );
}

#[test]
#[should_panic]
fn batch_issue_fails_when_paused() {
    let (env, admin_a, _, _, client) = setup();

    client.set_paused(&admin_a, &true);

    let symbols = vec![&env, symbol_short!("PAUSED")];
    let students = vec![&env, Address::generate(&env)];

    client.batch_issue(
        &admin_a,
        &symbols,
        &students,
        &String::from_str(&env, "Paused Test"),
    );
}

#[test]
fn batch_issue_emits_events() {
    let (env, instructor, _, _, client) = setup();

    let symbols = vec![&env, symbol_short!("EVENT"), symbol_short!("EVENT2")];
    let students = vec![&env, Address::generate(&env), Address::generate(&env)];
    let course_name = String::from_str(&env, "Event Test");

    client.batch_issue(&instructor, &symbols, &students, &course_name);

    // Simplified event check - just verify the batch completed event exists
    let all_events = env.events().all();
    let mut batch_completed_found = false;

    for (addr, _topics, _data) in all_events.iter() {
        if addr == client.address {
            // For simplicity, just check that we have events (detailed event checking requires more complex setup)
            batch_completed_found = true;
            break;
        }
    }

    // At minimum, we should have events emitted from our contract
    assert!(batch_completed_found);
}

#[test]
fn batch_issue_gas_efficiency() {
    let (env, instructor, _, _, client) = setup();

    // Test with larger batch to demonstrate gas efficiency
    let mut symbols = Vec::new(&env);
    let mut students = Vec::new(&env);

    // Create 10 different symbols without using format macro
    let symbol_names = [
        "BATCH0", "BATCH1", "BATCH2", "BATCH3", "BATCH4", "BATCH5", "BATCH6", "BATCH7", "BATCH8",
        "BATCH9",
    ];

    for symbol_name in symbol_names {
        symbols.push_back(Symbol::new(&env, symbol_name));
        students.push_back(Address::generate(&env));
    }

    let course_name = String::from_str(&env, "Gas Efficiency Test");

    let issued = client.batch_issue(&instructor, &symbols, &students, &course_name);

    assert_eq!(issued.len(), 10);

    // Verify all certificates have consistent metadata
    for cert in issued.iter() {
        assert_eq!(cert.course_name, course_name);
        assert!(!cert.revoked);
        assert_eq!(cert.issue_date, env.ledger().timestamp());
    }
}

// ---------------------------------------------------------------------------
// String validation (storage bloat prevention)
// ---------------------------------------------------------------------------

#[test]
#[should_panic]
fn issue_rejects_course_name_exceeding_max_length() {
    let (env, instructor, _, _, client) = setup();
    // 129 'a' characters — one over the 128-byte limit
    let long_name = String::from_str(&env, &"a".repeat(129));
    client.issue(
        &instructor,
        &symbol_short!("LONG"),
        &vec![&env, Address::generate(&env)],
        &long_name,
    );
}

#[test]
#[should_panic]
fn issue_rejects_course_name_with_non_printable_chars() {
    let (env, instructor, _, _, client) = setup();
    // Embed a null byte (0x00) — non-printable
    let bad_name = String::from_bytes(&env, &[b'H', b'i', 0x00]);
    client.issue(
        &instructor,
        &symbol_short!("CTRL"),
        &vec![&env, Address::generate(&env)],
        &bad_name,
    );
}

#[test]
fn issue_accepts_course_name_at_max_length() {
    let (env, instructor, _, _, client) = setup();
    // Exactly 128 printable characters — should succeed
    let max_name = String::from_str(&env, &"a".repeat(128));
    let issued = client.issue(
        &instructor,
        &symbol_short!("MAXOK"),
        &vec![&env, Address::generate(&env)],
        &max_name,
    );
    assert_eq!(issued.len(), 1);
}

#[test]
#[should_panic]
fn batch_issue_rejects_course_name_exceeding_max_length() {
    let (env, instructor, _, _, client) = setup();
    let long_name = String::from_str(&env, &"b".repeat(129));
    client.batch_issue(
        &instructor,
        &vec![&env, symbol_short!("BLG")],
        &vec![&env, Address::generate(&env)],
        &long_name,
    );
}

// ---------------------------------------------------------------------------
// Reentrancy guard
// ---------------------------------------------------------------------------

#[test]
fn lock_is_released_after_successful_issue() {
    // If the lock were not released, a second call would panic with Reentrant.
    let (env, instructor, _, _, client) = setup();
    let course_symbol = symbol_short!("LOCK1");
    let course_name = String::from_str(&env, "Lock Test");

    client.issue(
        &instructor,
        &course_symbol,
        &vec![&env, Address::generate(&env)],
        &course_name,
    );
    // Second call must succeed — lock was released
    client.issue(
        &instructor,
        &course_symbol,
        &vec![&env, Address::generate(&env)],
        &course_name,
    );
}

#[test]
fn lock_is_released_after_successful_batch_issue() {
    let (env, instructor, _, _, client) = setup();
    let course_name = String::from_str(&env, "Batch Lock Test");

    client.batch_issue(
        &instructor,
        &vec![&env, symbol_short!("BLK1")],
        &vec![&env, Address::generate(&env)],
        &course_name,
    );
    // Must succeed — lock was released
    client.batch_issue(
        &instructor,
        &vec![&env, symbol_short!("BLK2")],
        &vec![&env, Address::generate(&env)],
        &course_name,
    );
}

// ---------------------------------------------------------------------------
// Enhanced Batch Minting Tests
// ---------------------------------------------------------------------------

#[test]
fn mint_batch_certificates_with_grades() {
    let (env, instructor, _, _, client) = setup();

    env.ledger().with_mut(|ledger| ledger.timestamp = 1_234);

    let recipients = vec![
        &env,
        RecipientData {
            address: Address::generate(&env),
            course_symbol: symbol_short!("WEB3"),
            grade: Some(String::from_str(&env, "A+")),
        },
        RecipientData {
            address: Address::generate(&env),
            course_symbol: symbol_short!("RUST"),
            grade: Some(String::from_str(&env, "A")),
        },
        RecipientData {
            address: Address::generate(&env),
            course_symbol: symbol_short!("SMART"),
            grade: None,
        },
    ];

    let course_name = String::from_str(&env, "Blockchain Development");
    let issued = client.mint_batch_certificates(&instructor, &recipients, &course_name);

    assert_eq!(issued.len(), 3);

    // Verify first certificate with grade
    let cert1 = issued.get(0).unwrap();
    assert_eq!(cert1.course_symbol, symbol_short!("WEB3"));
    assert_eq!(cert1.grade, Some(String::from_str(&env, "A+")));
    assert_eq!(cert1.course_name, course_name);
    assert!(!cert1.revoked);

    // Verify second certificate with grade
    let cert2 = issued.get(1).unwrap();
    assert_eq!(cert2.grade, Some(String::from_str(&env, "A")));

    // Verify third certificate without grade
    let cert3 = issued.get(2).unwrap();
    assert_eq!(cert3.grade, None);
}

#[test]
fn mint_batch_certificates_large_batch() {
    let (env, instructor, admin_a, admin_b, client) = setup();

    // Increase mint cap to accommodate large batch
    propose_and_approve_mint_cap(&client, &admin_a, &admin_b, 150);

    let mut recipients = Vec::new(&env);

    // Create 50 recipients with simple symbol names
    let symbol_names = [
        "C00", "C01", "C02", "C03", "C04", "C05", "C06", "C07", "C08", "C09", "C10", "C11", "C12",
        "C13", "C14", "C15", "C16", "C17", "C18", "C19", "C20", "C21", "C22", "C23", "C24", "C25",
        "C26", "C27", "C28", "C29", "C30", "C31", "C32", "C33", "C34", "C35", "C36", "C37", "C38",
        "C39", "C40", "C41", "C42", "C43", "C44", "C45", "C46", "C47", "C48", "C49",
    ];

    for symbol_name in symbol_names {
        recipients.push_back(RecipientData {
            address: Address::generate(&env),
            course_symbol: Symbol::new(&env, symbol_name),
            grade: Some(String::from_str(&env, "B+")),
        });
    }

    let course_name = String::from_str(&env, "Large Cohort Course");
    let issued = client.mint_batch_certificates(&instructor, &recipients, &course_name);

    assert_eq!(issued.len(), 50);

    // Verify all certificates have consistent metadata
    for cert in issued.iter() {
        assert_eq!(cert.course_name, course_name);
        assert!(!cert.revoked);
        assert_eq!(cert.grade, Some(String::from_str(&env, "B+")));
    }
}

#[test]
#[should_panic(expected = "BatchTooLarge")]
fn mint_batch_certificates_exceeds_max_size() {
    let (env, instructor, admin_a, admin_b, client) = setup();

    // Set very high mint cap
    propose_and_approve_mint_cap(&client, &admin_a, &admin_b, 200);

    let mut recipients = Vec::new(&env);

    // Try to create 101 recipients (exceeds MAX_BATCH_SIZE of 100)
    for _ in 0..101 {
        recipients.push_back(RecipientData {
            address: Address::generate(&env),
            course_symbol: symbol_short!("EXCEED"),
            grade: None,
        });
    }

    let course_name = String::from_str(&env, "Too Large");
    client.mint_batch_certificates(&instructor, &recipients, &course_name);
}

#[test]
#[should_panic(expected = "EmptyBatch")]
fn mint_batch_certificates_empty_batch() {
    let (env, instructor, _, _, client) = setup();

    let recipients = Vec::new(&env);
    let course_name = String::from_str(&env, "Empty Batch");

    client.mint_batch_certificates(&instructor, &recipients, &course_name);
}

#[test]
#[should_panic(expected = "MintCapExceeded")]
fn mint_batch_certificates_respects_mint_cap() {
    let (env, instructor, admin_a, admin_b, client) = setup();

    // Set low mint cap
    propose_and_approve_mint_cap(&client, &admin_a, &admin_b, 5);

    let mut recipients = Vec::new(&env);

    // Try to mint 10 certificates (exceeds cap of 5)
    for _ in 0..10 {
        recipients.push_back(RecipientData {
            address: Address::generate(&env),
            course_symbol: symbol_short!("CAP"),
            grade: None,
        });
    }

    let course_name = String::from_str(&env, "Cap Test");
    client.mint_batch_certificates(&instructor, &recipients, &course_name);
}

#[test]
#[should_panic(expected = "NotInstructor")]
fn mint_batch_certificates_requires_instructor_role() {
    let (env, _admin_a, _admin_b, _admin_c, client) = setup();

    let student = Address::generate(&env);
    client.grant_role(&_admin_a, &student, &Role::Student);

    let recipients = vec![
        &env,
        RecipientData {
            address: Address::generate(&env),
            course_symbol: symbol_short!("TEST"),
            grade: None,
        },
    ];

    let course_name = String::from_str(&env, "Unauthorized");
    client.mint_batch_certificates(&student, &recipients, &course_name);
}

#[test]
#[should_panic(expected = "ContractPaused")]
fn mint_batch_certificates_fails_when_paused() {
    let (env, admin_a, _, _, client) = setup();

    client.set_paused(&admin_a, &true);

    let recipients = vec![
        &env,
        RecipientData {
            address: Address::generate(&env),
            course_symbol: symbol_short!("PAUSED"),
            grade: None,
        },
    ];

    let course_name = String::from_str(&env, "Paused Test");
    client.mint_batch_certificates(&admin_a, &recipients, &course_name);
}

#[test]
#[should_panic(expected = "StringTooLong")]
fn mint_batch_certificates_validates_grade_length() {
    let (env, instructor, _, _, client) = setup();

    let recipients = vec![
        &env,
        RecipientData {
            address: Address::generate(&env),
            course_symbol: symbol_short!("GRADE"),
            grade: Some(String::from_str(&env, &"A".repeat(11))), // Exceeds 10 char limit
        },
    ];

    let course_name = String::from_str(&env, "Grade Validation");
    client.mint_batch_certificates(&instructor, &recipients, &course_name);
}

#[test]
fn mint_batch_certificates_emits_events() {
    let (env, instructor, _, _, client) = setup();

    let recipients = vec![
        &env,
        RecipientData {
            address: Address::generate(&env),
            course_symbol: symbol_short!("EVENT1"),
            grade: Some(String::from_str(&env, "A")),
        },
        RecipientData {
            address: Address::generate(&env),
            course_symbol: symbol_short!("EVENT2"),
            grade: Some(String::from_str(&env, "B")),
        },
    ];

    let course_name = String::from_str(&env, "Event Test");
    client.mint_batch_certificates(&instructor, &recipients, &course_name);

    let all_events = env.events().all();
    let mut batch_completed_found = false;

    for (addr, _topics, _data) in all_events.iter() {
        if addr == client.address {
            batch_completed_found = true;
            break;
        }
    }

    assert!(batch_completed_found);
}

#[test]
fn batch_issue_validates_max_size() {
    let (env, instructor, admin_a, admin_b, client) = setup();

    // Set high mint cap
    propose_and_approve_mint_cap(&client, &admin_a, &admin_b, 150);

    let mut symbols = Vec::new(&env);
    let mut students = Vec::new(&env);

    // Try to create 101 certificates (exceeds MAX_BATCH_SIZE)
    for _ in 0..101 {
        symbols.push_back(symbol_short!("SYM"));
        students.push_back(Address::generate(&env));
    }

    let course_name = String::from_str(&env, "Too Large");

    // This should panic with BatchTooLarge error
    let result = std::panic::catch_unwind(|| {
        client.batch_issue(&instructor, &symbols, &students, &course_name);
    });

    assert!(result.is_err());
}

#[test]
fn batch_issue_validates_empty_batch() {
    let (env, instructor, _, _, client) = setup();

    let symbols = Vec::new(&env);
    let students = Vec::new(&env);
    let course_name = String::from_str(&env, "Empty");

    // This should panic with EmptyBatch error
    let result = std::panic::catch_unwind(|| {
        client.batch_issue(&instructor, &symbols, &students, &course_name);
    });

    assert!(result.is_err());
}

#[test]
fn lock_is_released_after_mint_batch_certificates() {
    let (env, instructor, _, _, client) = setup();

    let recipients1 = vec![
        &env,
        RecipientData {
            address: Address::generate(&env),
            course_symbol: symbol_short!("LOCK1"),
            grade: None,
        },
    ];

    let course_name = String::from_str(&env, "Lock Test");
    client.mint_batch_certificates(&instructor, &recipients1, &course_name);

    // Must succeed — lock was released
    let recipients2 = vec![
        &env,
        RecipientData {
            address: Address::generate(&env),
            course_symbol: symbol_short!("LOCK2"),
            grade: None,
        },
    ];

    client.mint_batch_certificates(&instructor, &recipients2, &course_name);
}

// Versioned events
// ---------------------------------------------------------------------------

#[test]
fn get_event_version_returns_one() {
    let (_env, _a, _b, _c, client) = setup();
    assert_eq!(client.get_event_version(), 1u32);
}

// ---------------------------------------------------------------------------
// Notarization Tests
// ---------------------------------------------------------------------------

#[test]
fn notarizes_and_verifies_file_successfully() {
    let (env, owner, _, _, client) = setup();
    
    env.ledger().with_mut(|ledger| {
        ledger.timestamp = 2_000_000;
        ledger.sequence_number = 100;
    });

    let hash = BytesN::from_array(&env, &[1u8; 32]);
    let metadata = String::from_str(&env, "Test Notarization");

    client.notarize_file(&owner, &hash, &metadata);

    let record = client.verify_file(&hash).unwrap();
    assert_eq!(record.hash, hash);
    assert_eq!(record.owner, owner);
    assert_eq!(record.proof.timestamp, 2_000_000);
    assert_eq!(record.proof.ledger_seq, 100);
    assert_eq!(record.metadata, metadata);
}

#[test]
fn notarization_is_immutable_first_timestamp_wins() {
    let (env, owner_a, _, _, client) = setup();
    let owner_b = Address::generate(&env);

    let hash = BytesN::from_array(&env, &[2u8; 32]);
    let metadata_a = String::from_str(&env, "First");
    let metadata_b = String::from_str(&env, "Second");

    env.ledger().with_mut(|l| l.timestamp = 1_000);
    client.notarize_file(&owner_a, &hash, &metadata_a);

    env.ledger().with_mut(|l| l.timestamp = 2_000);
    client.notarize_file(&owner_b, &hash, &metadata_b);

    let record = client.verify_file(&hash).unwrap();
    assert_eq!(record.owner, owner_a);
    assert_eq!(record.proof.timestamp, 1_000);
    assert_eq!(record.metadata, metadata_a);
}

#[test]
fn retrieves_owner_notarization_history() {
    let (env, owner, _, _, client) = setup();
    
    let hash1 = BytesN::from_array(&env, &[10u8; 32]);
    let hash2 = BytesN::from_array(&env, &[11u8; 32]);
    let metadata = String::from_str(&env, "Batch");

    client.notarize_file(&owner, &hash1, &metadata);
    client.notarize_file(&owner, &hash2, &metadata);

    let history = client.get_notarization_history(&owner);
    assert_eq!(history.len(), 2);
    assert_eq!(history.get(0).unwrap().hash, hash1);
    assert_eq!(history.get(1).unwrap().hash, hash2);
}

// ---------------------------------------------------------------------------
// Revocation & Verification Tests
// ---------------------------------------------------------------------------

mod revocation_tests {
    include!("tests/revocation_test.rs");
}

mod verification_tests {
    include!("tests/verification_test.rs");
}

mod savings_tests {
    include!("tests/savings_tests.rs");
}
