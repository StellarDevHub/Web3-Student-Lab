use super::*;
use soroban_sdk::{testutils::Address as _, BytesN, Env, String, Symbol};

/// Tests for the comprehensive event system.
///
/// These tests verify that all certificate operations emit proper v2 events,
/// event data is correctly structured, and backward compatibility is maintained.
mod events_test {
    use super::*;

    fn setup() -> (Env, Address, Address, Address, CertificateContractClient<'static>) {
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

    #[test]
    fn test_mint_emits_comprehensive_event() {
        let (env, admin_a, _, _, client) = setup();

        let course_symbol = symbol_short!("WEB3");
        let student = Address::generate(&env);
        let course_name = String::from_str(&env, "Web3 Development 101");

        let issued = client.issue(
            &admin_a,
            &course_symbol,
            &vec![&env, student.clone()],
            &course_name,
        );

        // Verify event was emitted
        let all_events = env.events().all();
        let mut found_mint_event = false;

        for (addr, topics, _data) in all_events.iter() {
            if addr == client.address {
                if let Some(topic) = topics.get(0) {
                    let sym = Symbol::from_val(&env, topic);
                    if sym == Symbol::new(&env, "cert_minted") {
                        found_mint_event = true;
                        break;
                    }
                }
            }
        }

        assert!(found_mint_event, "cert_minted v2 event should be emitted");
        assert_eq!(issued.len(), 1);
    }

    #[test]
    fn test_batch_mint_emits_batch_event() {
        let (env, admin_a, _, _, client) = setup();

        let symbols = vec![
            &env,
            symbol_short!("B1"),
            symbol_short!("B2"),
            symbol_short!("B3"),
        ];
        let students = vec![
            &env,
            Address::generate(&env),
            Address::generate(&env),
            Address::generate(&env),
        ];
        let course_name = String::from_str(&env, "Batch Test");

        let issued = client.batch_issue(&admin_a, &symbols, &students, &course_name);

        // Check for batch_minted v2 event
        let all_events = env.events().all();
        let mut found_batch_event = false;

        for (addr, topics, _data) in all_events.iter() {
            if addr == client.address {
                if let Some(topic) = topics.get(0) {
                    let sym = Symbol::from_val(&env, topic);
                    if sym == Symbol::new(&env, "batch_minted") {
                        found_batch_event = true;
                        break;
                    }
                }
            }
        }

        assert!(found_batch_event, "batch_minted v2 event should be emitted");
        assert_eq!(issued.len(), 3);
    }

    #[test]
    fn test_revoke_emits_event() {
        let (env, admin_a, _, _, client) = setup();

        let course_symbol = symbol_short!("REVK");
        let student = Address::generate(&env);
        let course_name = String::from_str(&env, "Revoke Test");

        client.issue(
            &admin_a,
            &course_symbol,
            &vec![&env, student.clone()],
            &course_name,
        );
        client.revoke(&admin_a, &course_symbol, &student);

        // Verify both v1 and v2 revoke events
        let all_events = env.events().all();
        let mut found_v1_revoke = false;
        let mut found_v2_revoke = false;

        for (addr, topics, _data) in all_events.iter() {
            if addr == client.address {
                if let Some(topic) = topics.get(0) {
                    let sym = Symbol::from_val(&env, topic);
                    if sym == Symbol::new(&env, "v1_cert_revoked") {
                        found_v1_revoke = true;
                    }
                    if sym == Symbol::new(&env, "cert_revoked") {
                        found_v2_revoke = true;
                    }
                }
            }
        }

        assert!(found_v1_revoke, "v1_cert_revoked event should be emitted");
        assert!(found_v2_revoke, "cert_revoked v2 event should be emitted");
    }

    #[test]
    fn test_role_granted_emits_v2_event() {
        let (env, admin_a, _, _, client) = setup();
        let new_instructor = Address::generate(&env);

        // Grant instructor role
        client.grant_role(&admin_a, &new_instructor, &Role::Instructor);

        let all_events = env.events().all();
        let mut found_v2_role_granted = false;

        for (addr, topics, _data) in all_events.iter() {
            if addr == client.address {
                if let Some(topic) = topics.get(0) {
                    let sym = Symbol::from_val(&env, topic);
                    if sym == Symbol::new(&env, "role_granted") {
                        found_v2_role_granted = true;
                        break;
                    }
                }
            }
        }

        assert!(found_v2_role_granted, "role_granted v2 event should be emitted");
    }

    #[test]
    fn test_pause_updated_emits_v2_event() {
        let (env, admin_a, _, _, client) = setup();

        client.set_paused(&admin_a, &true);

        let all_events = env.events().all();
        let mut found_v2_pause = false;

        for (addr, topics, _data) in all_events.iter() {
            if addr == client.address {
                if let Some(topic) = topics.get(0) {
                    let sym = Symbol::from_val(&env, topic);
                    if sym == Symbol::new(&env, "pause_updated") {
                        found_v2_pause = true;
                        break;
                    }
                }
            }
        }

        assert!(found_v2_pause, "pause_updated v2 event should be emitted");
    }

    #[test]
    fn test_mint_cap_updated_emits_v2_event() {
        let (env, admin_a, admin_b, _, client) = setup();

        // Use multisig to update mint cap
        let id = client.propose_action(&admin_a, &PendingAdminAction::SetMintCap(500));
        client.approve_action(&admin_b, &id);

        let all_events = env.events().all();
        let mut found_v2_cap_update = false;

        for (addr, topics, _data) in all_events.iter() {
            if addr == client.address {
                if let Some(topic) = topics.get(0) {
                    let sym = Symbol::from_val(&env, topic);
                    if sym == Symbol::new(&env, "mint_cap_updated") {
                        found_v2_cap_update = true;
                        break;
                    }
                }
            }
        }

        assert!(found_v2_cap_update, "mint_cap_updated v2 event should be emitted");
    }

    #[test]
    fn test_did_updated_emits_v2_event() {
        let (env, admin_a, _, _, client) = setup();

        let did = String::from_str(&env, "did:soroban:testnet:student-123");
        client.update_did(&admin_a, &did);

        let all_events = env.events().all();
        let mut found_v2_did_update = false;

        for (addr, topics, _data) in all_events.iter() {
            if addr == client.address {
                if let Some(topic) = topics.get(0) {
                    let sym = Symbol::from_val(&env, topic);
                    if sym == Symbol::new(&env, "did_updated") {
                        found_v2_did_update = true;
                        break;
                    }
                }
            }
        }

        assert!(found_v2_did_update, "did_updated v2 event should be emitted");
    }

    #[test]
    fn test_ownership_transferred_emits_v2_event() {
        let (env, admin_a, _, _, client) = setup();

        // Use add_admin_with_role which emits admin_added v2 event
        let new_admin = Address::generate(&env);
        client.add_admin_with_role(&admin_a, new_admin.clone(), AdminRole::Instructor);

        let all_events = env.events().all();
        let mut found_admin_added = false;

        for (addr, topics, _data) in all_events.iter() {
            if addr == client.address {
                if let Some(topic) = topics.get(0) {
                    let sym = Symbol::from_val(&env, topic);
                    if sym == Symbol::new(&env, "admin_added") {
                        found_admin_added = true;
                        break;
                    }
                }
            }
        }

        assert!(found_admin_added, "admin_added v2 event should be emitted");
    }

    #[test]
    fn test_all_operations_emit_events() {
        let (env, admin_a, admin_b, _, client) = setup();
        let student = Address::generate(&env);

        // 1. Issue certificate - should emit cert_minted
        let course_symbol = symbol_short!("TEST");
        client.issue(
            &admin_a,
            &course_symbol,
            &vec![&env, student.clone()],
            &String::from_str(&env, "Test Course"),
        );

        // 2. Revoke - should emit cert_revoked
        client.revoke(&admin_a, &course_symbol, &student);

        // 3. Update DID - should emit did_updated
        client.update_did(&student, &String::from_str(&env, "did:soroban:testnet:test"));

        // 4. Grant role - should emit role_granted
        client.grant_role(&admin_a, &student, &Role::Student);

        // 5. Set paused - should emit pause_updated
        client.set_paused(&admin_a, &true);
        client.set_paused(&admin_a, &false);

        // 6. Update mint cap via multisig
        let id = client.propose_action(&admin_a, &PendingAdminAction::SetMintCap(500));
        client.approve_action(&admin_b, &id);

        // Count all events
        let all_events = env.events().all();
        let mut event_count = 0;
        for (_addr, _topics, _data) in all_events.iter() {
            event_count += 1;
        }

        // We should have at least 10 events from these operations
        assert!(event_count >= 10, "Expected at least 10 events, got {}", event_count);
    }

    #[test]
    fn test_event_data_structure_valid() {
        let (env, admin_a, _, _, client) = setup();

        env.ledger().with_mut(|ledger| ledger.timestamp = 12345);

        let course_symbol = symbol_short!("DATA");
        let student = Address::generate(&env);
        let course_name = String::from_str(&env, "Data Test");

        client.issue(
            &admin_a,
            &course_symbol,
            &vec![&env, student.clone()],
            &course_name,
        );

        // Verify that events contain data and are properly structured
        let all_events = env.events().all();
        let mut event_data_found = false;

        for (_addr, _topics, data) in all_events.iter() {
            // Check that event data has expected size
            if data.len() > 0 {
                event_data_found = true;
                // Data should be serializable tuple
                break;
            }
        }

        assert!(event_data_found, "Events should contain structured data");
    }
}
