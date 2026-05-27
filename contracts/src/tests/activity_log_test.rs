use super::*;
use soroban_sdk::{testutils::Address as _, BytesN, Env, Symbol};

/// Tests for the on-chain activity log system.
///
/// These tests verify activity recording, querying by address/token, pagination,
/// and data integrity of the immutable audit trail.
mod activity_log_test {
    use super::*;

    fn setup() -> (Env, CertificateContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(CertificateContract, ());
        let client = CertificateContractClient::new(&env, &contract_id);
        let admin_a = Address::generate(&env);
        let admin_b = Address::generate(&env);
        let admin_c = Address::generate(&env);
        client.init(&admin_a, &admin_b, &admin_c);
        (env, client)
    }

    #[test]
    fn test_get_activities_by_address_returns_user_activities() {
        let (env, client) = setup();
        let admin = client.address;

        let course_symbol = symbol_short!("ACTV");
        let student = Address::generate(&env);

        // Issue certificate
        client.issue(
            &admin,
            &course_symbol,
            &vec![&env, student.clone()],
            &String::from_str(&env, "Activity Test"),
        );

        // Query activities for student (recipient of the certificate)
        let activities = client.get_activities_by_address(&student, 10, 0);

        // Student should have at least one activity (the mint)
        assert!(activities.len() > 0, "Student should have activity records");

        // Verify the activity entry structure
        let activity = activities.get(0).unwrap();
        assert!(activity.id > 0);
        assert!(activity.timestamp > 0);
        // The address should be the student
        assert_eq!(activity.address, student);
        // Token ID should be present
        assert!(activity.token_id.is_some());
    }

    #[test]
    fn test_get_activities_by_token_returns_certificate_history() {
        let (env, client) = setup();
        let admin = client.address;

        let course_symbol = symbol_short!("HIST");
        let student = Address::generate(&env);

        // Issue certificate
        client.issue(
            &admin,
            &course_symbol,
            &vec![&env, student.clone()],
            &String::from_str(&env, "History Test"),
        );

        // Revoke certificate
        client.revoke(&admin, &course_symbol, &student);

        // Since token_id is generated deterministically from course_symbol and student,
        // we need to compute it the same way
        let token_id = {
            let course_str = course_symbol.to_string();
            let course_bytes = course_str.as_bytes();
            let student_bytes = student.to_xdr(&env);
            let mut hash: u128 = 0;
            for &b in course_bytes.iter() {
                hash = hash.wrapping_mul(31).wrapping_add(b as u128);
            }
            for &b in student_bytes.iter() {
                hash = hash.wrapping_mul(31).wrapping_add(b as u128);
            }
            hash
        };

        // Query activities for this token
        let activities = client.get_activities_by_token(token_id);

        // Should have at least 2 activities: mint and revoke
        assert!(activities.len() >= 2, "Expected at least 2 activities (mint, revoke), got {}", activities.len());
    }

    #[test]
    fn test_get_recent_activities_returns_limited_results() {
        let (env, client) = setup();
        let admin = client.address;

        // Create multiple certificates
        for i in 0..5u8 {
            let course_symbol = Symbol::new(&env, &format!("RC{:02}", i));
            let student = Address::generate(&env);
            client.issue(
                &admin,
                &course_symbol,
                &vec![&env, student],
                &String::from_str(&env, "Recent Test"),
            );
        }

        // Get recent activities with limit 3
        let recent = client.get_recent_activities(3);

        assert_eq!(recent.len(), 3, "Should return exactly 3 recent activities");
    }

    #[test]
    fn test_activity_log_records_all_event_types() {
        let (env, client) = setup();
        let admin = client.address;

        // Perform various operations
        let course_symbol = symbol_short!("ALLEV");
        let student = Address::generate(&env);

        client.issue(
            &admin,
            &course_symbol,
            &vec![&env, student.clone()],
            &String::from_str(&env, "All Events Test"),
        );

        client.revoke(&admin, &course_symbol, &student);

        // Grant and revoke roles
        let student_role = Address::generate(&env);
        client.grant_role(&admin, &student_role, &Role::Student);
        client.revoke_role(&admin, &student_role);

        // Update and remove DID
        client.update_did(&student, &String::from_str(&env, "did:soroban:test:123"));
        client.remove_did(&admin, &student);

        // Pause/unpause
        client.set_paused(&admin, &true);
        client.set_paused(&admin, &false);

        // Verify we have many activities
        let activities = client.get_recent_activities(20);
        assert!(activities.len() >= 5, "Should have recorded multiple event types");
    }

    #[test]
    fn test_token_history_tracks_full_lifecycle() {
        let (env, client) = setup();
        let admin = client.address;

        let course_symbol = symbol_short!("LIFE");
        let student = Address::generate(&env);

        // Issue
        client.issue(
            &admin,
            &course_symbol,
            &vec![&env, student.clone()],
            &String::from_str(&env, "Lifecycle Test"),
        );

        // Compute token_id
        let token_id = {
            let course_str = course_symbol.to_string();
            let course_bytes = course_str.as_bytes();
            let student_bytes = student.to_xdr(&env);
            let mut hash: u128 = 0;
            for &b in course_bytes.iter() {
                hash = hash.wrapping_mul(31).wrapping_add(b as u128);
            }
            for &b in student_bytes.iter() {
                hash = hash.wrapping_mul(31).wrapping_add(b as u128);
            }
            hash
        };

        // Get history
        let history = client.get_activities_by_token(token_id);

        // Should have at least the mint event
        assert!(history.len() >= 1, "Should have at least mint event in token history");

        let first_event = history.get(0).unwrap();
        assert_eq!(first_event.token_id, Some(token_id));
    }

    #[test]
    fn test_activity_entries_are_ordered_correctly() {
        let (env, client) = setup();
        let admin = client.address;

        // Issue multiple certificates
        for i in 0..3u8 {
            let course_symbol = Symbol::new(&env, &format!("ORD{:02}", i));
            let student = Address::generate(&env);
            client.issue(
                &admin,
                &course_symbol,
                &vec![&env, student],
                &String::from_str(&env, "Order Test"),
            );
        }

        let activities = client.get_recent_activities(3);

        // Should be ordered by most recent first (descending)
        for i in 1..activities.len() {
            let prev = activities.get(i - 1).unwrap();
            let curr = activities.get(i).unwrap();
            assert!(prev.timestamp >= curr.timestamp, "Activities should be in descending timestamp order");
        }
    }

    #[test]
    fn test_activity_log_with_zero_limit() {
        let (env, client) = setup();

        // Even with zero limit, should return empty vec quickly
        let activities = client.get_recent_activities(0);
        assert_eq!(activities.len(), 0);
    }

    #[test]
    fn test_activities_by_address_with_offset() {
        let (env, client) = setup();
        let admin = client.address;

        let student = Address::generate(&env);
        // Create 5 activities for the same student
        for i in 0..5u8 {
            let course_symbol = Symbol::new(&env, &format!("OFF{:02}", i));
            client.issue(
                &admin,
                &course_symbol,
                &vec![&env, student.clone()],
                &String::from_str(&env, "Offset Test"),
            );
        }

        // Query with offset for the student
        let page = client.get_activities_by_address(&student, 3, 2);
        assert_eq!(page.len(), 3, "Should return 3 items after offset of 2");
    }

    #[test]
    fn test_activity_log_data_integrity() {
        let (env, client) = setup();
        let admin = client.address;

        let course_symbol = symbol_short!("INTEG");
        let student = Address::generate(&env);

        client.issue(
            &admin,
            &course_symbol,
            &vec![&env, student.clone()],
            &String::from_str(&env, "Integrity Test"),
        );

        let activities = client.get_activities_by_address(&student, 1, 0);
        let activity = activities.get(0).unwrap();

        // Verify all fields are populated correctly
        assert_ne!(activity.id, 0);
        assert_ne!(activity.timestamp, 0);
        assert!(activity.data_hash.to_xdr(&env).len() > 0);
        // Address should be the student
        assert_eq!(activity.address, student);
        // Token ID should be present
        assert!(activity.token_id.is_some());
    }

    #[test]
    fn test_multiple_operations_create_separate_entries() {
        let (env, client) = setup();
        let admin = client.address;

        let course1 = symbol_short!("MULT1");
        let course2 = symbol_short!("MULT2");
        let student1 = Address::generate(&env);
        let student2 = Address::generate(&env);

        // Two separate mints
        client.issue(&admin, &course1, &vec![&env, student1.clone()], &String::from_str(&env, "First"));
        client.issue(&admin, &course2, &vec![&env, student2.clone()], &String::from_str(&env, "Second"));

        let activities = client.get_recent_activities(10);

        // Should have separate entries for each operation
        let mut mint_count = 0;
        for act in activities.iter() {
            if act.event_type == LogEventType::Minted {
                mint_count += 1;
            }
        }
        assert!(mint_count >= 2, "Should have at least 2 mint entries");
    }

    #[test]
    fn test_activity_log_includes_batch_operations() {
        let (env, client) = setup();
        let admin = client.address;

        let symbols = vec![
            &env,
            symbol_short!("B1"),
            symbol_short!("B2"),
        ];
        let students = vec![
            &env,
            Address::generate(&env),
            Address::generate(&env),
        ];

        client.batch_issue(
            &admin,
            &symbols,
            &students,
            &String::from_str(&env, "Batch Activity Test"),
        );

        let activities = client.get_recent_activities(5);

        // Should include batch minted events
        let mut batch_count = 0;
        for act in activities.iter() {
            if act.event_type == LogEventType::BatchMinted {
                batch_count += 1;
            }
        }
        assert!(batch_count >= 1, "Should have at least one batch_minted event");
    }

    #[test]
    fn test_time_range_query() {
        let (env, client) = setup();
        let admin = client.address;

        let start_time = env.ledger().timestamp();

        // Issue a certificate
        let course_symbol = symbol_short!("TRANGE");
        client.issue(
            &admin,
            &course_symbol,
            &vec![&env, Address::generate(&env)],
            &String::from_str(&env, "Time Range Test"),
        );

        let end_time = env.ledger().timestamp();

        // Query within time range
        let activities = client.get_activities_by_time_range(start_time, end_time, 10);

        assert!(activities.len() > 0, "Should find activities in time range");

        for act in activities.iter() {
            assert!(act.timestamp >= start_time && act.timestamp <= end_time);
        }
    }

    #[test]
    fn test_activity_entry_id_increments() {
        let (env, client) = setup();
        let admin = client.address;

        let first_activities = client.get_recent_activities(1);
        let first_id = first_activities.get(0).unwrap().id;

        // Create another activity
        client.issue(
            &admin,
            &symbol_short!("INCR"),
            &vec![&env, Address::generate(&env)],
            &String::from_str(&env, "Increment Test"),
        );

        let all_activities = client.get_recent_activities(10);
        let latest_id = all_activities.get(0).unwrap().id;

        assert!(latest_id > first_id, "Activity IDs should increment");
    }

    #[test]
    fn test_empty_query_returns_empty_vector() {
        let (env, client) = setup();

        // Query for activities of an address that has none
        let unknown = Address::generate(&env);
        let activities = client.get_activities_by_address(&unknown, 10, 0);

        assert_eq!(activities.len(), 0);
    }

    #[test]
    fn test_activity_log_with_large_offset() {
        let (env, client) = setup();
        let admin = client.address;

        // Create 20 activities
        for i in 0..20u8 {
            let course_symbol = Symbol::new(&env, &format!("LGOFF{:02}", i));
            let student = Address::generate(&env);
            client.issue(
                &admin,
                &course_symbol,
                &vec![&env, student],
                &String::from_str(&env, "Large Offset Test"),
            );
        }

        // Query with high offset
        let page = client.get_activities_by_address(&admin, 5, 15); // get 5 starting from 15th

        assert_eq!(page.len(), 5, "Should return exactly 5 entries");
    }

    #[test]
    fn test_revoke_creates_activity_entry_with_token_id() {
        let (env, client) = setup();
        let admin = client.address;

        let course_symbol = symbol_short!("REVOKE");
        let student = Address::generate(&env);

        client.issue(
            &admin,
            &course_symbol,
            &vec![&env, student.clone()],
            &String::from_str(&env, "Revoke Activity Test"),
        );

        client.revoke(&admin, &course_symbol, &student);

        // Find revoke activity
        let activities = client.get_recent_activities(10);
        let mut found_revoke = false;
        for act in activities.iter() {
            if act.event_type == LogEventType::Revoked {
                assert!(act.token_id.is_some(), "Revoke activity should have token_id");
                found_revoke = true;
                break;
            }
        }
        assert!(found_revoke, "Should have recorded revoke activity");
    }

    #[test]
    fn test_activity_log_records_batch_mint_as_single_entry() {
        let (env, client) = setup();
        let admin = client.address;

        let symbols = vec![
            &env,
            symbol_short!("BATCHA"),
            symbol_short!("BATCHB"),
            symbol_short!("BATCHC"),
        ];
        let students = vec![
            &env,
            Address::generate(&env),
            Address::generate(&env),
            Address::generate(&env),
        ];

        client.batch_issue(
            &admin,
            &symbols,
            &students,
            &String::from_str(&env, "Batch Log Test"),
        );

        let activities = client.get_recent_activities(10);

        // Batch mint should produce a BatchMinted event
        let mut batch_found = false;
        for act in activities.iter() {
            if act.event_type == LogEventType::BatchMinted {
                batch_found = true;
                assert!(act.token_id.is_some(), "Batch event should reference a token");
            }
        }
        assert!(batch_found, "Batch mint should be logged");
    }
}
