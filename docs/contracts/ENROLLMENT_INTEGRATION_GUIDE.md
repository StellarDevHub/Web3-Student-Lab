# Enrollment Module - Integration Guide

## Overview

This guide shows how to integrate the gas-efficient enrollment tracking module into the existing Web3-Student-Lab smart contract architecture.

## Architecture

```
┌─────────────────────────────────────┐
│   Main Certificate Contract         │
│   (Governance, Roles, Certificates) │
└──────────────┬──────────────────────┘
               │
               ├── enrollment module
               ├── token module (RS-Token)
               ├── staking module
               ├── session module
               └── payment_gateway module
```

## Integration Steps

### Step 1: Module Declaration

The enrollment module is already declared in [contracts/src/lib.rs](../contracts/src/lib.rs):

```rust
#![no_std]

pub mod enrollment;  // <- Already added
pub mod payment_gateway;
pub mod session;
pub mod staking;
pub mod token;
```

### Step 2: Client Setup

In your main contract implementation, create an enrollment client:

```rust
use crate::enrollment::{
    EnrollmentContractClient,
    EnrollmentState,
    EnrollmentError
};

#[contractimpl]
impl MainContract {
    // ... existing functions

    pub fn setup_enrollment(env: Env, enrollment_contract_id: Address) {
        // Store the enrollment contract address
        let key = DataKey::EnrollmentContractId;
        env.storage().instance().set(&key, &enrollment_contract_id);
    }

    fn get_enrollment_client(env: &Env) -> EnrollmentContractClient {
        let enrollment_id: Address = env
            .storage()
            .instance()
            .get(&DataKey::EnrollmentContractId)
            .expect("Enrollment contract not initialized");

        EnrollmentContractClient::new(env, &enrollment_id)
    }
}
```

### Step 3: Enroll Student on Certificate Issuance

When issuing a certificate, enroll the student:

```rust
#[contractimpl]
impl MainContract {
    /// Issues a certificate to a student after course completion
    pub fn issue_certificate(
        env: Env,
        student: Address,
        course_symbol: Symbol,
        course_name: String,
    ) {
        // Authenticate student/instructor
        student.require_auth();

        // 1. Create enrollment record (if not exists)
        let enrollment_client = Self::get_enrollment_client(&env);

        // Check if already enrolled
        if enrollment_client.get_enrollment_status(&student, &course_symbol).is_none() {
            enrollment_client.enroll_student(
                &student,
                &course_symbol,
                &env.current_contract_address(),
            );
        }

        // 2. Mark as completed
        enrollment_client.complete_enrollment(
            &student,
            &course_symbol,
            &env.current_contract_address(),
        );

        // 3. Issue the certificate
        let certificate = Certificate {
            course_symbol: course_symbol.clone(),
            student: student.clone(),
            course_name,
            issue_date: env.ledger().timestamp(),
            revoked: false,
        };

        let cert_key = CertKey {
            course_symbol,
            student,
        };

        env.storage().persistent().set(&cert_key, &certificate);

        env.events().publish(
            (Symbol::new(&env, "certificate_issued"), student),
            certificate,
        );
    }
}
```

### Step 4: Handle Enrollment Status Changes

Track enrollment changes throughout student journey:

```rust
#[contractimpl]
impl MainContract {
    /// Called when student withdraws from a course
    pub fn withdraw_from_course(
        env: Env,
        student: Address,
        course_id: Symbol,
    ) {
        student.require_auth();

        let enrollment_client = Self::get_enrollment_client(&env);

        // Update enrollment status
        enrollment_client.drop_enrollment(
            &student,
            &course_id,
            &env.current_contract_address(),
        );

        // Update any related state (e.g., refunds, badge revocation)
        // ...

        env.events().publish(
            (Symbol::new(&env, "student_withdrawn"), student),
            course_id,
        );
    }

    /// Called at course deadline to drop inactive students
    pub fn drop_inactive_students(
        env: Env,
        course_id: Symbol,
        instructor: Address,
    ) {
        instructor.require_auth();

        let enrollment_client = Self::get_enrollment_client(&env);

        // Get all students in course
        let students = enrollment_client.get_course_students(&course_id);

        for student in students {
            // Check attendance, assignments, etc.
            let is_inactive = Self::check_student_inactive(&env, &student, &course_id);

            if is_inactive {
                enrollment_client.drop_enrollment(
                    &student,
                    &course_id,
                    &instructor,
                );
            }
        }
    }

    fn check_student_inactive(env: &Env, student: &Address, course_id: &Symbol) -> bool {
        // Check attendance records, submission timestamps, etc.
        // This is application-specific logic
        false // placeholder
    }
}
```

### Step 5: Add Enrollment-Based Dashboard Functions

Create analytics endpoints using the fast count functions:

```rust
#[contracttype]
#[derive(Clone, Debug)]
pub struct CourseStats {
    pub course_id: Symbol,
    pub total_enrollments: u32,
    pub active_students: u32,
    pub completed_students: u32,
    pub dropped_students: u32,
    pub completion_rate: u32, // percentage * 100
}

#[contractimpl]
impl MainContract {
    /// Get detailed course enrollment statistics
    pub fn get_course_stats(env: Env, course_id: Symbol) -> CourseStats {
        let enrollment_client = Self::get_enrollment_client(&env);

        let active = enrollment_client.get_active_count(&course_id);
        let completed = enrollment_client.get_completed_count(&course_id);
        let dropped = enrollment_client.get_dropped_count(&course_id);
        let total = active + completed + dropped;

        let completion_rate = if total > 0 {
            ((completed as u32 * 10000) / (total as u32)) // basis points
        } else {
            0
        };

        CourseStats {
            course_id,
            total_enrollments: total,
            active_students: active,
            completed_students: completed,
            dropped_students: dropped,
            completion_rate,
        }
    }

    /// Get student's enrollment status across all courses
    pub fn get_student_transcript(env: Env, student: Address) -> soroban_sdk::Vec<TranscriptEntry> {
        let enrollment_client = Self::get_enrollment_client(&env);

        let course_ids = enrollment_client.get_student_courses(&student);
        let mut transcript: soroban_sdk::Vec<TranscriptEntry> = soroban_sdk::Vec::new(&env);

        for course_id in course_ids {
            let status = enrollment_client.get_enrollment_status(&student, &course_id);
            let timestamp = enrollment_client.get_enrollment_timestamp(&student, &course_id);

            if let Some(state) = status {
                let entry = TranscriptEntry {
                    course_id,
                    enrollment_status: state,
                    enrollment_date: timestamp.unwrap_or(0),
                    certificate_issued: state == EnrollmentState::Completed,
                };
                transcript.push_back(entry);
            }
        }

        transcript
    }
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct TranscriptEntry {
    pub course_id: Symbol,
    pub enrollment_status: EnrollmentState,
    pub enrollment_date: u64,
    pub certificate_issued: bool,
}
```

### Step 6: Add Role-Based Enrollment Management

Leverage existing RBAC with enrollment operations:

```rust
#[contractimpl]
impl MainContract {
    /// Instructor enrolls a student (requires Instructor role)
    pub fn instructor_enroll_student(
        env: Env,
        student: Address,
        course_id: Symbol,
        instructor: Address,
    ) {
        // Verify instructor has Instructor role
        Self::verify_role(&env, &instructor, Role::Instructor);
        instructor.require_auth();

        let enrollment_client = Self::get_enrollment_client(&env);
        enrollment_client.enroll_student(&student, &course_id, &instructor);
    }

    /// Admin can override enrollment status
    pub fn admin_enroll_student(
        env: Env,
        student: Address,
        course_id: Symbol,
        admin: Address,
    ) {
        // Verify admin has Admin role
        Self::verify_role(&env, &admin, Role::Admin);
        admin.require_auth();

        let enrollment_client = Self::get_enrollment_client(&env);
        enrollment_client.enroll_student(&student, &course_id, &admin);
    }

    /// Student can view own enrollment
    pub fn get_my_courses(env: Env, student: Address) -> soroban_sdk::Vec<Symbol> {
        student.require_auth();

        let enrollment_client = Self::get_enrollment_client(&env);
        enrollment_client.get_student_courses(&student)
    }
}
```

## Complete Integration Example

Here's a complete flow showing enrollment integrated with certificates and tokens:

```rust
#[contractimpl]
impl MainContract {
    /// Complete student flow: Enroll → Complete → Issue Certificate → Mint Token
    pub fn complete_course_workflow(
        env: Env,
        student: Address,
        course_id: Symbol,
        course_name: String,
        instructor: Address,
    ) {
        instructor.require_auth();

        let enrollment_client = Self::get_enrollment_client(&env);
        let token_client = Self::get_token_client(&env);

        // Step 1: Enroll if not already
        if enrollment_client.get_enrollment_status(&student, &course_id).is_none() {
            enrollment_client.enroll_student(&student, &course_id, &instructor);
        }

        // Step 2: Complete enrollment
        enrollment_client.complete_enrollment(&student, &course_id, &instructor);

        // Step 3: Issue certificate
        let certificate = Certificate {
            course_symbol: course_id.clone(),
            student: student.clone(),
            course_name,
            issue_date: env.ledger().timestamp(),
            revoked: false,
        };

        let cert_key = CertKey {
            course_symbol: course_id.clone(),
            student: student.clone(),
        };
        env.storage().persistent().set(&cert_key, &certificate);

        // Step 4: Mint completion token
        token_client.mint_certificate(&student, 1i128);

        // Step 5: Update analytics cache
        let active = enrollment_client.get_active_count(&course_id);
        let completed = enrollment_client.get_completed_count(&course_id);

        env.events().publish(
            (Symbol::new(&env, "course_completed"), student),
            (course_id, active, completed),
        );
    }
}
```

## Testing Integration

Create tests that verify enrollment works with your contract:

```rust
#[cfg(test)]
mod integration_tests {
    use super::*;

    #[test]
    fn test_enroll_and_issue_certificate() {
        let env = Env::default();
        let student = Address::generate(&env);
        let instructor = Address::generate(&env);
        let course_id = Symbol::new(&env, "RUST101");

        // Register both contracts
        let contract_id = env.register_contract(None, MainContract);
        let enrollment_contract_id = env.register_contract(None, EnrollmentContract);

        let client = MainContractClient::new(&env, &contract_id);
        let enrollment_client = EnrollmentContractClient::new(&env, &enrollment_contract_id);

        // Setup
        client.setup_enrollment(&enrollment_contract_id);

        // Execute: Complete course workflow
        client.complete_course_workflow(
            &student,
            &course_id,
            String::from_str(&env, "Rust 101"),
            &instructor,
        );

        // Verify: Student is marked as completed
        let status = enrollment_client.get_enrollment_status(&student, &course_id);
        assert_eq!(status, Some(EnrollmentState::Completed));

        // Verify: Certificate was issued
        let cert_key = CertKey {
            course_symbol: course_id.clone(),
            student: student.clone(),
        };
        let cert: Option<Certificate> = env.storage().persistent().get(&cert_key);
        assert!(cert.is_some());

        // Verify: Counts updated
        assert_eq!(enrollment_client.get_completed_count(&course_id), 1);
    }
}
```

## Performance Optimization Tips

### 1. Cache Version Counters Client-Side

```rust
// Store version locally
let version = enrollment_client.get_enrollment_version(&course_id);

// Later: Only refresh if version changed
let new_version = enrollment_client.get_enrollment_version(&course_id);
if new_version != version {
    let count = enrollment_client.get_active_count(&course_id);
    update_ui(count);
}
```

### 2. Batch Enroll Students

```rust
pub fn batch_enroll(
    env: Env,
    students: soroban_sdk::Vec<Address>,
    course_id: Symbol,
    instructor: Address,
) {
    instructor.require_auth();
    let enrollment_client = Self::get_enrollment_client(&env);

    for student in students {
        if enrollment_client.get_enrollment_status(&student, &course_id).is_none() {
            enrollment_client.enroll_student(&student, &course_id, &instructor);
        }
    }
}
```

### 3. Use Counts Instead of Lists

```rust
// ❌ DON'T: Iterate all students to count
let students = enrollment_client.get_course_students(&course_id);
let active_count = students.iter().filter(|s| {
    enrollment_client.get_enrollment_status(s, &course_id) == Some(EnrollmentState::Active)
}).count();

// ✅ DO: Use the fast count
let active_count = enrollment_client.get_active_count(&course_id);
```

## Configuration

No additional configuration needed. The enrollment module works standalone and can be used immediately after importing.

## Troubleshooting

### Issue: "Enrollment contract not initialized"

**Solution**: Call `setup_enrollment()` first with the correct contract address.

### Issue: "AlreadyEnrolled" error when re-enrolling

**Solution**: Student must be dropped before re-enrolling. Use `drop_enrollment()` first.

### Issue: High gas costs for student list operations

**Solution**: Use `get_active_count()`, `get_completed_count()` instead of iterating student lists.

## Maintenance

- Update [ENROLLMENT_TRACKING.md](ENROLLMENT_TRACKING.md) when adding new features
- Run tests: `cargo test enrollment`
- Check gas benchmarks when modifying storage access patterns

## See Also

- [Enrollment Module Documentation](ENROLLMENT_TRACKING.md)
- [Quick Reference](ENROLLMENT_QUICK_REFERENCE.md)
- [Enrollment Source Code](../contracts/src/enrollment.rs)

---

**Last updated**: March 2026
