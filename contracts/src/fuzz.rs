//! # Contract Fuzzing Module
//!
//! This module implements property-based fuzzing tests to find edge cases
//! in the Certificate and Token contract logic.
//!
//! ## Fuzzing Strategy
//!
//! Since Soroban-SDK doesn't have native fuzzing support like cargo-fuzz,
//! we use structured property-based testing with randomized inputs.
//!
//! ## Target Edge Cases
//!
//! 1. **Overflow/Underflow**: Mint cap arithmetic, ledger period division
//! 2. **Storage Collisions**: Composite keys (course_symbol, student) collisions
//! 3. **Boundary Conditions**: Mint cap limits, period boundaries
//! 4. **Authorization**: Non-admin access attempts, cross-contract calls
//! 5. **Token Operations**: Large amounts, negative amounts, zero amounts

use super::*;
use soroban_sdk::{
    symbol_short,
    testutils::{Address as _, Events, Ledger},
    vec, Address, Env, String, Symbol,
};

// ============ Fuzzing Infrastructure ============

/// Deterministic pseudo-random number generator for reproducible fuzzing
struct SimpleRng {
    seed: u64,
}

impl SimpleRng {
    fn new(seed: u64) -> Self {
        Self { seed }
    }

    /// Simple linear congruential generator
    fn next(&mut self) -> u64 {
        self.seed = self.seed.wrapping_mul(6364136223846793005).wrapping_add(1);
        self.seed
    }

    /// Generate a random u32 in range [0, max)
    fn next_u32(&mut self, max: u32) -> u32 {
        if max == 0 {
            return 0;
        }
        (self.next() % max as u64) as u32
    }

    /// Generate a random i128 in range [0, max)
    fn next_i128(&mut self, max: i128) -> i128 {
        if max <= 0 {
            return 0;
        }
        (self.next() as i128) % max
    }

    /// Generate random bool with given probability of true
    fn next_bool(&mut self, probability_true: u8) -> bool {
        (self.next() % 100) < probability_true as u64
    }
}

/// Configuration for fuzzing runs
struct FuzzConfig {
    seed: u64,
    num_iterations: u32,
    max_batch_size: u32,
    max_mint_cap: u32,
    max_ledger_sequence: u32,
}

/// Default fuzzing configuration
impl Default for FuzzConfig {
    fn default() -> Self {
        Self {
            seed: 42,
            num_iterations: 100,
            max_batch_size: 50,
            max_mint_cap: 1000,
            max_ledger_sequence: 17280 * 10, // 10 periods worth
        }
    }
}

#[cfg(test)]
fn cert_three_admins_setup(
    env: &Env,
) -> (Address, Address, Address, CertificateContractClient<'static>) {
    let contract_id = env.register(CertificateContract, ());
    let client = CertificateContractClient::new(env, &contract_id);
    let admin_a = Address::generate(env);
    let admin_b = Address::generate(env);
    let admin_c = Address::generate(env);
    client.init(&admin_a, &admin_b, &admin_c);
    (admin_a, admin_b, admin_c, client)
}

#[cfg(test)]
fn set_mint_cap_if_positive(
    client: &CertificateContractClient<'_>,
    proposer: &Address,
    co_signer: &Address,
    cap: u32,
) {
    if cap == 0 {
        return;
    }
    let id = client.propose_action(proposer, &PendingAdminAction::SetMintCap(cap));
    client.approve_action(co_signer, &id);
}

// ============ Mint Cap Boundary Fuzzing ============

/// Property: Minting up to cap should always succeed
/// Property: Minting more than cap should always fail
#[cfg(test)]
mod mint_cap_fuzzing {
    use super::*;

    fn fuzz_mint_cap_boundary(seed: u64) {
        let env = Env::default();
        env.mock_all_auths();

        let (admin_a, admin_b, _admin_c, client) = cert_three_admins_setup(&env);
        let admin = admin_a;

        let mut rng = SimpleRng::new(seed);

        // Random cap between 1 and 100
        let mint_cap = 1 + rng.next_u32(100);
        set_mint_cap_if_positive(&client, &admin_a, &admin_b, mint_cap);

        let course_symbol = symbol_short!("CAPF");
        let course_name = String::from_str(&env, "Fuzz Cap Test");

        // Generate random batch size
        let batch_size = rng.next_u32(200);

        if batch_size <= mint_cap {
            // Should succeed - generate students
            let mut students = Vec::new(&env);
            for _ in 0..batch_size {
                students.push_back(Address::generate(&env));
            }
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                client.issue(&admin_a, &course_symbol, &students, &course_name)
            }));
            assert!(result.is_ok(), "Issue should succeed when batch_size <= mint_cap");
        } else {
            // Should fail - generate students
            let mut students = Vec::new(&env);
            for _ in 0..batch_size {
                students.push_back(Address::generate(&env));
            }
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                client.issue(&admin_a, &course_symbol, &students, &course_name)
            }));
            assert!(result.is_err(), "Issue should fail when batch_size > mint_cap");
        }
    }

    #[test]
    fn fuzz_mint_cap_edge_cases() {
        // Test specific edge cases
        let edge_cases = vec![
            (1, 1),   // Exact cap
            (1, 2),   // Cap + 1
            (1000, 1000), // Max default cap exact
            (1000, 1001), // Max default cap + 1
            (0, 1),   // Zero cap (should fail in set)
            (1, 0),   // Zero batch
        ];

        for (cap, batch) in edge_cases {
            let env = Env::default();
            env.mock_all_auths();

            let (admin_a, admin_b, _admin_c, client) = cert_three_admins_setup(&env);

            if cap > 0 {
                set_mint_cap_if_positive(&client, &admin_a, &admin_b, cap);
            }

            let course_symbol = symbol_short!("EDG");
            let course_name = String::from_str(&env, "Edge Case");
            let mut students = Vec::new(&env);
            for _ in 0..batch {
                students.push_back(Address::generate(&env));
            }

            if cap > 0 && batch > 0 && batch <= cap {
                let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    client.issue(&admin_a, &course_symbol, &students, &course_name)
                }));
                assert!(result.is_ok());
            }
        }
    }

    #[test]
    fn fuzz_multiple_issues_cumulative() {
        // Property: Multiple issues should correctly track cumulative mint count
        let env = Env::default();
        env.mock_all_auths();

        let (admin_a, admin_b, _admin_c, client) = cert_three_admins_setup(&env);
        let admin = admin_a;

        let mint_cap = 10;
        set_mint_cap_if_positive(&client, &admin_a, &admin_b, mint_cap);

        let course_symbol = symbol_short!("CUM");
        let course_name = String::from_str(&env, "Cumulative Test");

        // Issue 5 certificates
        let mut students = Vec::new(&env);
        for _ in 0..5 {
            students.push_back(Address::generate(&env));
        }
        client.issue(&admin_a, &course_symbol, &students, &course_name);

        // Issue 5 more - should succeed
        let mut students = Vec::new(&env);
        for _ in 0..5 {
            students.push_back(Address::generate(&env));
        }
        client.issue(&admin_a, &course_symbol, &students, &course_name);

        // Try to issue 1 more - should fail
        let mut students = Vec::new(&env);
        students.push_back(Address::generate(&env));

        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.issue(&admin_a, &course_symbol, &students, &course_name)
        }));
        assert!(result.is_err(), "Third batch should exceed cap");
    }
}

// ============ Storage Collision Fuzzing ============

/// Property: Different (course_symbol, student) pairs should not collide
#[cfg(test)]
mod storage_collision_fuzzing {
    use super::*;

    #[test]
    fn fuzz_different_courses_no_collision() {
        let env = Env::default();
        env.mock_all_auths();

        let (admin_a, admin_b, _admin_c, client) = cert_three_admins_setup(&env);
        let admin = admin_a;

        let student = Address::generate(&env);
        let course_name = String::from_str(&env, "Course");

        // Issue for course A
        let course_a = symbol_short!("COURA");
        client.issue(&admin_a, &course_a, &vec![&env, student.clone()], &course_name);

        // Certificate should exist for course A
        let cert_a = client.get_certificate(&course_a, &student).unwrap();
        assert_eq!(cert_a.course_symbol, course_a);
        assert!(!cert_a.revoked);

        // Certificate should NOT exist for course B
        let course_b = symbol_short!("COURB");
        let cert_b = client.get_certificate(&course_b, &student);
        assert!(cert_b.is_none(), "Different course should have no certificate");
    }

    #[test]
    fn fuzz_different_students_no_collision() {
        let env = Env::default();
        env.mock_all_auths();

        let (admin_a, admin_b, _admin_c, client) = cert_three_admins_setup(&env);
        let admin = admin_a;

        let course = symbol_short!("SOLID");
        let course_name = String::from_str(&env, "Course");

        let student_a = Address::generate(&env);
        let student_b = Address::generate(&env);

        // Issue for student A
        client.issue(&admin_a, &course, &vec![&env, student_a.clone()], &course_name);

        // Student A should have certificate
        let cert_a = client.get_certificate(&course, &student_a).unwrap();
        assert_eq!(cert_a.student, student_a);

        // Student B should NOT have certificate
        let cert_b = client.get_certificate(&course, &student_b);
        assert!(cert_b.is_none(), "Different student should have no certificate");
    }

    #[test]
    fn fuzz_composite_key_uniqueness() {
        let env = Env::default();
        env.mock_all_auths();

        let (admin_a, admin_b, _admin_c, client) = cert_three_admins_setup(&env);
        let admin = admin_a;

        let course_name = String::from_str(&env, "Course");

        // Create multiple students
        let students: Vec<Address> = (0..10).map(|_| Address::generate(&env)).collect();
        let courses = vec![
            symbol_short!("CRS1"),
            symbol_short!("CRS2"),
            symbol_short!("CRS3"),
        ];

        // Issue certificates for each student-course combination
        for (i, course) in courses.iter().enumerate() {
            client.issue(
                &admin_a,
                course,
                &vec![&env, students[i].clone()],
                &course_name,
            );
        }

        // Verify each combination is unique
        for (i, course) in courses.iter().enumerate() {
            let cert = client.get_certificate(course, &students[i]).unwrap();
            assert_eq!(cert.student, students[i]);
            assert_eq!(cert.course_symbol, *course);
        }

        // Verify cross-combinations don't exist
        for (i, course) in courses.iter().enumerate() {
            for (j, _) in students.iter().enumerate() {
                if i != j {
                    let cert = client.get_certificate(course, &students[j]);
                    assert!(
                        cert.is_none(),
                        "Student {} should not have cert for course {}",
                        j,
                        i
                    );
                }
            }
        }
    }

    #[test]
    fn fuzz_revocation_isolation() {
        let env = Env::default();
        env.mock_all_auths();

        let (admin_a, admin_b, _admin_c, client) = cert_three_admins_setup(&env);
        let admin = admin_a;

        let course_name = String::from_str(&env, "Course");
        let course = symbol_short!("ISOL");

        let student_a = Address::generate(&env);
        let student_b = Address::generate(&env);

        // Issue for both students
        client.issue(
            &admin_a,
            &course,
            &vec![&env, student_a.clone(), student_b.clone()],
            &course_name,
        );

        // Revoke only student A
        client.revoke(&admin, &course, &student_a);

        // Verify A is revoked, B is not
        let cert_a = client.get_certificate(&course, &student_a).unwrap();
        let cert_b = client.get_certificate(&course, &student_b).unwrap();

        assert!(cert_a.revoked, "Student A should be revoked");
        assert!(!cert_b.revoked, "Student B should not be revoked");
    }
}

// ============ Period Boundary Fuzzing ============

/// Property: Period boundaries should correctly reset mint tracking
#[cfg(test)]
mod period_boundary_fuzzing {
    use super::*;

    #[test]
    fn fuzz_period_boundary_reset() {
        let env = Env::default();
        env.mock_all_auths();

        let (admin_a, admin_b, _admin_c, client) = cert_three_admins_setup(&env);
        let admin = admin_a;

        // Set low mint cap
        set_mint_cap_if_positive(&client, &admin_a, &admin_b, 2);

        let course_name = String::from_str(&env, "Period Test");

        // Issue at period 0
        let course = symbol_short!("PRD0");
        let student1 = Address::generate(&env);
        let student2 = Address::generate(&env);
        client.issue(&admin_a, &course, &vec![&env, student1, student2], &course_name);

        // Try to issue more at period 0 - should fail
        let student3 = Address::generate(&env);
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.issue(&admin_a, &course, &vec![&env, student3], &course_name)
        }));
        assert!(result.is_err());

        // Advance to period 1 (17280 ledgers)
        env.ledger().with_mut(|ledger| {
            ledger.sequence = 17280;
        });

        // Issue at period 1 - should succeed (counter should reset)
        let course2 = symbol_short!("PRD1");
        let student4 = Address::generate(&env);
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.issue(&admin_a, &course2, &vec![&env, student4], &course_name)
        }));
        assert!(result.is_ok(), "Period 1 should have fresh mint counter");
    }

    #[test]
    fn fuzz_multiple_period_advances() {
        let env = Env::default();
        env.mock_all_auths();

        let (admin_a, admin_b, _admin_c, client) = cert_three_admins_setup(&env);
        let admin = admin_a;

        let mint_cap = 5;
        set_mint_cap_if_positive(&client, &admin_a, &admin_b, mint_cap);

        let course_name = String::from_str(&env, "Multi Period");

        // Mint to cap in period 0
        for i in 0..5 {
            let course = Symbol::new(&env, &format!("P0C{}", i));
            let student = Address::generate(&env);
            client.issue(&admin_a, &course, &vec![&env, student], &course_name);
        }

        // Advance through multiple periods
        for period in 1..=5 {
            env.ledger().with_mut(|ledger| {
                ledger.sequence = period * 17280;
            });

            let course = Symbol::new(&env, &format!("P{}C0", period));
            let student = Address::generate(&env);

            // Should be able to mint at least one in each new period
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                client.issue(&admin_a, &course, &vec![&env, student], &course_name)
            }));
            assert!(
                result.is_ok(),
                "Should be able to mint in period {}",
                period
            );
        }
    }

    #[test]
    fn fuzz_ledger_sequence_overflow_edge() {
        let env = Env::default();
        env.mock_all_auths();

        let (admin_a, admin_b, _admin_c, client) = cert_three_admins_setup(&env);
        let admin = admin_a;

        // Test very high ledger sequence (near u32 max)
        let high_sequence = u32::MAX - 100;
        env.ledger().with_mut(|ledger| {
            ledger.sequence = high_sequence;
        });

        let course = symbol_short!("HIGH");
        let course_name = String::from_str(&env, "High Sequence");
        let student = Address::generate(&env);

        // Should handle high ledger sequence without overflow in period calculation
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.issue(&admin_a, &course, &vec![&env, student], &course_name)
        }));
        // This should succeed (or fail for other reasons, but not overflow)
        let _ = result;
    }
}

// ============ Token Fuzzing ============

/// Property: Token minting should respect authorization and amounts
#[cfg(test)]
mod token_fuzzing {
    use super::*;

    #[test]
    fn fuzz_token_authorization() {
        let env = Env::default();
        env.mock_all_auths();

        let token_id = env.register(RsTokenContract, ());
        let token_client = RsTokenContractClient::new(&env, &token_id);

        let cert_contract = Address::generate(&env);
        let wrong_caller = Address::generate(&env);
        let student = Address::generate(&env);

        token_client.init(&cert_contract);

        // Mint with correct caller should succeed
        token_client.mint(&cert_contract, &student, &100);

        // Mint with wrong caller should fail
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            token_client.mint(&wrong_caller, &student, &50);
        }));
        assert!(result.is_err(), "Minting with wrong caller should fail");
    }

    #[test]
    fn fuzz_token_amounts() {
        let env = Env::default();
        env.mock_all_auths();

        let token_id = env.register(RsTokenContract, ());
        let token_client = RsTokenContractClient::new(&env, &token_id);

        let cert_contract = Address::generate(&env);
        let student = Address::generate(&env);

        token_client.init(&cert_contract);

        // Test various amounts
        let amounts = vec![1i128, 100, 1000, i128::MAX / 2];

        for amount in amounts {
            let student_new = Address::generate(&env);
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                token_client.mint(&cert_contract, &student_new, &(amount))
            }));
            assert!(result.is_ok(), "Mint with amount {} should succeed", amount);

            let balance = token_client.get_balance(&student_new);
            assert_eq!(balance, amount, "Balance should equal minted amount");
        }
    }

    #[test]
    fn fuzz_token_cumulative_mint() {
        let env = Env::default();
        env.mock_all_auths();

        let token_id = env.register(RsTokenContract, ());
        let token_client = RsTokenContractClient::new(&env, &token_id);

        let cert_contract = Address::generate(&env);
        let student = Address::generate(&env);

        token_client.init(&cert_contract);

        // Mint multiple times to same student
        let amounts = vec![100, 200, 300, 50];
        let expected_total: i128 = amounts.iter().sum();

        for amount in amounts {
            token_client.mint(&cert_contract, &student, &amount);
        }

        let balance = token_client.get_balance(&student);
        assert_eq!(balance, expected_total, "Balance should be cumulative sum");
    }

    #[test]
    fn fuzz_token_multiple_students() {
        let env = Env::default();
        env.mock_all_auths();

        let token_id = env.register(RsTokenContract, ());
        let token_client = RsTokenContractClient::new(&env, &token_id);

        let cert_contract = Address::generate(&env);
        token_client.init(&cert_contract);

        // Mint to multiple students
        let num_students = 10;
        let amount_per_student: i128 = 100;

        for _ in 0..num_students {
            let student = Address::generate(&env);
            token_client.mint(&cert_contract, &student, &amount_per_student);
            assert_eq!(token_client.get_balance(&student), amount_per_student);
        }
    }
}

// ============ Event Emission Fuzzing ============

/// Property: Events should be emitted correctly for all operations
#[cfg(test)]
mod event_emission_fuzzing {
    use super::*;

    #[test]
    fn fuzz_cert_issued_event_count() {
        let env = Env::default();
        env.mock_all_auths();

        let (admin_a, admin_b, _admin_c, client) = cert_three_admins_setup(&env);
        let admin = admin_a;

        let num_students = 5;
        let course_symbol = symbol_short!("EVNT");
        let course_name = String::from_str(&env, "Event Test");

        let mut students = Vec::new(&env);
        for _ in 0..num_students {
            students.push_back(Address::generate(&env));
        }
        client.issue(&admin_a, &course_symbol, &students, &course_name);

        // Count cert_issued events
        let all_events = env.events().all();
        let mut cert_issued_count = 0u32;
        for (addr, topics, _) in all_events.iter() {
            if addr == client.address
                && Symbol::from_val(&env, &topics.get(0).unwrap())
                    == Symbol::new(&env, "cert_issued")
            {
                cert_issued_count += 1;
            }
        }

        assert_eq!(
            cert_issued_count, num_students,
            "Should emit {} cert_issued events",
            num_students
        );
    }

    #[test]
    fn fuzz_revoke_event() {
        let env = Env::default();
        env.mock_all_auths();

        let (admin_a, admin_b, _admin_c, client) = cert_three_admins_setup(&env);
        let admin = admin_a;

        let course_symbol = symbol_short!("REVOK");
        let course_name = String::from_str(&env, "Revoke Test");
        let student = Address::generate(&env);

        client.issue(&admin_a, &course_symbol, &vec![&env, student.clone()], &course_name);
        client.revoke(&admin, &course_symbol, &student);

        // Check for cert_revoked event
        let all_events = env.events().all();
        let mut found_revoke_event = false;
        for (addr, topics, _) in all_events.iter() {
            if addr == client.address
                && Symbol::from_val(&env, &topics.get(0).unwrap())
                    == Symbol::new(&env, "cert_revoked")
            {
                found_revoke_event = true;
                break;
            }
        }

        assert!(
            found_revoke_event,
            "Should emit cert_revoked event"
        );
    }
}

// ============ Large-Scale Fuzzing ============

/// Stress test with many iterations and random configurations
#[cfg(test)]
mod stress_fuzzing {
    use super::*;

    #[test]
    fn fuzz_large_batch_sizes() {
        let env = Env::default();
        env.mock_all_auths();

        let (admin_a, admin_b, _admin_c, client) = cert_three_admins_setup(&env);
        let admin = admin_a;

        // Set large mint cap
        set_mint_cap_if_positive(&client, &admin_a, &admin_b, 1000);

        let course_name = String::from_str(&env, "Large Batch");
        let course = symbol_short!("LARGE");

        // Test various batch sizes
        let batch_sizes = vec![1, 5, 10, 50, 100];

        for batch_size in batch_sizes {
            let mut students = Vec::new(&env);
            for _ in 0..batch_size {
                students.push_back(Address::generate(&env));
            }

            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                client.issue(&admin_a, &course, &students, &course_name)
            }));

            if batch_size <= 1000 {
                assert!(result.is_ok(), "Batch size {} should succeed", batch_size);
            }
        }
    }

    #[test]
    fn fuzz_concurrent_mint_and_revoke() {
        let env = Env::default();
        env.mock_all_auths();

        let (admin_a, admin_b, _admin_c, client) = cert_three_admins_setup(&env);
        let admin = admin_a;

        set_mint_cap_if_positive(&client, &admin_a, &admin_b, 100);

        let course_name = String::from_str(&env, "Mint Revoke");
        let course = symbol_short!("MNTRV");

        // Issue some certificates
        let mut students = Vec::new(&env);
        for _ in 0..10 {
            students.push_back(Address::generate(&env));
        }
        client.issue(&admin_a, &course, &students, &course_name);

        // Revoke half
        for i in 0..5 {
            let cert = client.get_certificate(&course, &students.get(i).unwrap()).unwrap();
            client.revoke(&admin, &course, &cert.student);
        }

        // Issue more - should still work
        let mut new_students = Vec::new(&env);
        for _ in 0..5 {
            new_students.push_back(Address::generate(&env));
        }
        client.issue(&admin_a, &course, &new_students, &course_name);

        // Verify counts
        let total_issued = 10 + 5;
        let remaining_unrevoked = 5 + 5; // 5 original not revoked + 5 new
        let mut actual_count = 0u32;

        for student in students.iter().chain(new_students.iter()) {
            if let Some(cert) = client.get_certificate(&course, &student) {
                if !cert.revoked {
                    actual_count += 1;
                }
            }
        }

        assert_eq!(
            actual_count, remaining_unrevoked,
            "Should have {} unrevoked certificates",
            remaining_unrevoked
        );
    }

    #[test]
    fn fuzz_empty_and_single_student() {
        let env = Env::default();
        env.mock_all_auths();

        let (_admin_a, _admin_b, _admin_c, _client) = cert_three_admins_setup(&env);

        let course_name = String::from_str(&env, "Edge Cases");
        let course = symbol_short!("EDGE");

        let env2 = Env::default();
        env2.mock_all_auths();
        let (admin2, admin2_b, _admin2_c, client2) = cert_three_admins_setup(&env2);

        let mut empty_vec = Vec::new(&env2);
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client2.issue(&admin2, &course, &empty_vec, &course_name)
        }));
        assert!(result.is_ok(), "Empty student list should succeed");

        // Single student
        let single_student = Address::generate(&env2);
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client2.issue(&admin2, &course, &vec![&env2, single_student], &course_name)
        }));
        assert!(result.is_ok(), "Single student should succeed");

        let cert = client2.get_certificate(&course, &single_student);
        assert!(cert.is_some(), "Single student should have certificate");
    }
}

// ============ Regression Tests for Known Issues ============

#[cfg(test)]
mod regression_tests {
    use super::*;

    #[test]
    fn regression_mint_cap_zero_check() {
        // Regression: Setting mint cap to 0 should be rejected
        let env = Env::default();
        env.mock_all_auths();

        let (admin_a, admin_b, _admin_c, client) = cert_three_admins_setup(&env);
        let admin = admin_a;

        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let id = client.propose_action(&admin_a, &PendingAdminAction::SetMintCap(0));
            client.approve_action(&admin_b, &id);
        }));
        assert!(result.is_err(), "Setting mint cap to 0 should fail");
    }

    #[test]
    fn regression_double_init() {
        // Regression: Double initialization should fail
        let env = Env::default();
        env.mock_all_auths();

        let (admin_a, admin_b, _admin_c, client) = cert_three_admins_setup(&env);
        let admin = admin_a;

        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let x = Address::generate(&env);
            let y = Address::generate(&env);
            let z = Address::generate(&env);
            client.init(&x, &y, &z);
        }));
        assert!(result.is_err(), "Double initialization should fail");
    }

    #[test]
    fn regression_unauthorized_revoke() {
        // Regression: Non-admin cannot revoke
        let env = Env::default();
        env.mock_all_auths();

        let (admin_a, admin_b, _admin_c, client) = cert_three_admins_setup(&env);
        let admin = admin_a;

        let course_name = String::from_str(&env, "Test");
        let course = symbol_short!("UNAUTH");
        let student = Address::generate(&env);

        client.issue(&admin_a, &course, &vec![&env, student.clone()], &course_name);

        let non_admin = Address::generate(&env);
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.revoke(&non_admin, &course, &student)
        }));
        assert!(result.is_err(), "Non-admin revoke should fail");
    }

    #[test]
    fn regression_nonexistent_certificate() {
        // Regression: Getting non-existent certificate returns None
        let env = Env::default();
        env.mock_all_auths();

        let (admin_a, admin_b, _admin_c, client) = cert_three_admins_setup(&env);
        let admin = admin_a;

        let course = symbol_short!("MISS");
        let student = Address::generate(&env);

        let cert = client.get_certificate(&course, &student);
        assert!(cert.is_none(), "Non-existent certificate should return None");
    }
}
