//! # Student Enrollment Tracking
//!
//! Tracks student enrollments in courses using a gas-efficient two-tier storage approach:
//! - **Persistent Storage**: Student-to-course enrollment status (Active/Completed/Dropped)
//! - **Instance Storage**: Course enrollment counts optimized for quick lookups
//!
//! This design minimizes gas costs for frequent count lookups while maintaining
//! complete enrollment history and state in persistent storage.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Env, Symbol,
};

/// Enrollment status for a student in a course
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EnrollmentState {
    /// Student is actively enrolled and taking the course
    Active = 0,
    /// Student has completed the course successfully
    Completed = 1,
    /// Student has dropped the course
    Dropped = 2,
}

/// Persistent storage keys for enrollment state and history
#[contracttype]
#[derive(Clone)]
pub enum EnrollmentKey {
    /// Student enrollment in a specific course: `EnrollmentStatus(student, course_id)`
    /// Stores: EnrollmentState
    EnrollmentStatus(Address, Symbol),

    /// Timestamp when a student enrolled in a course: `EnrollmentTimestamp(student, course_id)`
    /// Stores: u64 (ledger timestamp)
    EnrollmentTimestamp(Address, Symbol),

    /// List of course IDs a student is enrolled in
    /// Stores: Vec<Symbol>
    StudentCourses(Address),

    /// List of students enrolled in a course (for batch operations)
    /// Stores: Vec<Address>
    CourseStudents(Symbol),
}

/// Instance storage keys for fast enrollment count lookups
#[contracttype]
#[derive(Clone)]
pub enum EnrollmentCountKey {
    /// Total active students in a course: `ActiveCount(course_id)`
    /// Stores: u32
    ActiveCount(Symbol),

    /// Total completed students in a course: `CompletedCount(course_id)`
    /// Stores: u32
    CompletedCount(Symbol),

    /// Total dropped students in a course: `DroppedCount(course_id)`
    /// Stores: u32
    DroppedCount(Symbol),

    /// Overall enrollment count cache to invalidate on changes
    /// Stores: u64 (version/invalidation counter)
    EnrollmentVersion(Symbol),
}

/// Enrollment-related errors
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum EnrollmentError {
    /// Student is not authorized to perform the action
    NotAuthorized = 1,
    /// Student is already enrolled in the course
    AlreadyEnrolled = 2,
    /// Student not enrolled in the course
    NotEnrolled = 3,
    /// Invalid enrollment state transition
    InvalidStateTransition = 4,
    /// Course does not exist
    CourseNotFound = 5,
    /// Student address is invalid
    InvalidStudent = 6,
    /// Cannot enroll more students (cap reached)
    EnrollmentCapReached = 7,
}

#[contract]
pub struct EnrollmentContract;

#[contractimpl]
impl EnrollmentContract {
    /// Enrolls a student in a course with Active status.
    /// Updates both persistent student-course mapping and instance enrollment counts.
    ///
    /// # Arguments
    /// * `student` - The student address to enroll
    /// * `course_id` - The course symbol identifier
    /// * `instructor` - The instructor authorizing the enrollment (required to authenticate)
    ///
    /// # Errors
    /// - NotAuthorized: instructor must authenticate
    /// - AlreadyEnrolled: student is already in the course
    pub fn enroll_student(env: Env, student: Address, course_id: Symbol, instructor: Address) {
        instructor.require_auth();

        // Check if student is already enrolled
        let status_key = EnrollmentKey::EnrollmentStatus(student.clone(), course_id.clone());
        if env.storage().persistent().has(&status_key) {
            let existing_state: EnrollmentState =
                env.storage().persistent().get(&status_key).unwrap();
            if existing_state == EnrollmentState::Active {
                panic_with_error!(&env, EnrollmentError::AlreadyEnrolled);
            }
        }

        // Store enrollment status in persistent storage
        env.storage()
            .persistent()
            .set(&status_key, &EnrollmentState::Active);

        // Record enrollment timestamp
        let timestamp_key = EnrollmentKey::EnrollmentTimestamp(student.clone(), course_id.clone());
        env.storage()
            .persistent()
            .set(&timestamp_key, &env.ledger().timestamp());

        // Update student's course list in persistent storage
        let student_courses_key = EnrollmentKey::StudentCourses(student.clone());
        let mut courses: soroban_sdk::Vec<Symbol> = env
            .storage()
            .persistent()
            .get(&student_courses_key)
            .unwrap_or_else(|| soroban_sdk::Vec::new(&env));

        if !courses.contains(&course_id) {
            courses.push_back(course_id.clone());
            env.storage()
                .persistent()
                .set(&student_courses_key, &courses);
        }

        // Update course's student list in persistent storage
        let course_students_key = EnrollmentKey::CourseStudents(course_id.clone());
        let mut students: soroban_sdk::Vec<Address> = env
            .storage()
            .persistent()
            .get(&course_students_key)
            .unwrap_or_else(|| soroban_sdk::Vec::new(&env));

        if !students.contains(&student) {
            students.push_back(student.clone());
            env.storage()
                .persistent()
                .set(&course_students_key, &students);
        }

        // Update instance storage count for active enrollments (gas-efficient)
        let active_count_key = EnrollmentCountKey::ActiveCount(course_id.clone());
        let current_count: u32 = env.storage().instance().get(&active_count_key).unwrap_or(0);
        env.storage()
            .instance()
            .set(&active_count_key, &(current_count + 1));

        // Increment version counter for cache invalidation
        let version_key = EnrollmentCountKey::EnrollmentVersion(course_id.clone());
        let current_version: u64 = env.storage().instance().get(&version_key).unwrap_or(0);
        env.storage()
            .instance()
            .set(&version_key, &(current_version + 1));

        // Publish enrollment event
        env.events().publish(
            (Symbol::new(&env, "student_enrolled"), student, course_id),
            (),
        );
    }

    /// Marks a student's enrollment as Completed.
    /// Updates both persistent status and instance count.
    ///
    /// # Arguments
    /// * `student` - The student to mark as completed
    /// * `course_id` - The course identifier
    /// * `instructor` - The instructor authorizing the action (required to authenticate)
    ///
    /// # Errors
    /// - NotAuthorized: instructor must authenticate
    /// - NotEnrolled: student is not enrolled in the course
    /// - InvalidStateTransition: student is not in Active state
    pub fn complete_enrollment(env: Env, student: Address, course_id: Symbol, instructor: Address) {
        instructor.require_auth();

        let status_key = EnrollmentKey::EnrollmentStatus(student.clone(), course_id.clone());

        // Check current enrollment status
        let current_state: EnrollmentState = env
            .storage()
            .persistent()
            .get(&status_key)
            .ok_or(EnrollmentError::NotEnrolled)
            .unwrap_or_else(|_| {
                panic_with_error!(&env, EnrollmentError::NotEnrolled);
            });

        // Only allow transition from Active to Completed
        if current_state != EnrollmentState::Active {
            panic_with_error!(&env, EnrollmentError::InvalidStateTransition);
        }

        // Update persistent storage
        env.storage()
            .persistent()
            .set(&status_key, &EnrollmentState::Completed);

        // Update instance counts (decrement active, increment completed)
        let active_count_key = EnrollmentCountKey::ActiveCount(course_id.clone());
        let active: u32 = env.storage().instance().get(&active_count_key).unwrap_or(0);
        if active > 0 {
            env.storage()
                .instance()
                .set(&active_count_key, &(active - 1));
        }

        let completed_count_key = EnrollmentCountKey::CompletedCount(course_id.clone());
        let completed: u32 = env
            .storage()
            .instance()
            .get(&completed_count_key)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&completed_count_key, &(completed + 1));

        // Increment version counter
        let version_key = EnrollmentCountKey::EnrollmentVersion(course_id.clone());
        let version: u64 = env.storage().instance().get(&version_key).unwrap_or(0);
        env.storage().instance().set(&version_key, &(version + 1));

        // Publish completion event
        env.events().publish(
            (
                Symbol::new(&env, "enrollment_completed"),
                student,
                course_id,
            ),
            (),
        );
    }

    /// Marks a student's enrollment as Dropped.
    /// Updates both persistent status and instance count.
    ///
    /// # Arguments
    /// * `student` - The student who is dropping
    /// * `course_id` - The course identifier
    /// * `instructor` - The instructor authorizing the drop (may be the student for self-drop)
    ///
    /// # Errors
    /// - NotAuthorized: student or instructor must authenticate
    /// - NotEnrolled: student is not enrolled in the course
    /// - InvalidStateTransition: student is already dropped or completed
    pub fn drop_enrollment(env: Env, student: Address, course_id: Symbol, instructor: Address) {
        instructor.require_auth();

        let status_key = EnrollmentKey::EnrollmentStatus(student.clone(), course_id.clone());

        // Check current enrollment status
        let current_state: EnrollmentState = env
            .storage()
            .persistent()
            .get(&status_key)
            .ok_or(EnrollmentError::NotEnrolled)
            .unwrap_or_else(|_| {
                panic_with_error!(&env, EnrollmentError::NotEnrolled);
            });

        // Cannot drop if already dropped or completed
        if current_state == EnrollmentState::Dropped || current_state == EnrollmentState::Completed
        {
            panic_with_error!(&env, EnrollmentError::InvalidStateTransition);
        }

        // Update persistent storage
        env.storage()
            .persistent()
            .set(&status_key, &EnrollmentState::Dropped);

        // Update instance counts (decrement active, increment dropped)
        let active_count_key = EnrollmentCountKey::ActiveCount(course_id.clone());
        let active: u32 = env.storage().instance().get(&active_count_key).unwrap_or(0);
        if active > 0 {
            env.storage()
                .instance()
                .set(&active_count_key, &(active - 1));
        }

        let dropped_count_key = EnrollmentCountKey::DroppedCount(course_id.clone());
        let dropped: u32 = env
            .storage()
            .instance()
            .get(&dropped_count_key)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&dropped_count_key, &(dropped + 1));

        // Increment version counter
        let version_key = EnrollmentCountKey::EnrollmentVersion(course_id.clone());
        let version: u64 = env.storage().instance().get(&version_key).unwrap_or(0);
        env.storage().instance().set(&version_key, &(version + 1));

        // Publish drop event
        env.events().publish(
            (Symbol::new(&env, "enrollment_dropped"), student, course_id),
            (),
        );
    }

    /// Gets the enrollment status of a student in a course.
    ///
    /// # Arguments
    /// * `student` - The student address
    /// * `course_id` - The course identifier
    ///
    /// # Returns
    /// `Option<EnrollmentState>` - None if not enrolled, Some(state) if enrolled
    pub fn get_enrollment_status(
        env: Env,
        student: Address,
        course_id: Symbol,
    ) -> Option<EnrollmentState> {
        let status_key = EnrollmentKey::EnrollmentStatus(student, course_id);
        env.storage().persistent().get(&status_key)
    }

    /// Gets the timestamp when a student enrolled in a course.
    ///
    /// # Arguments
    /// * `student` - The student address
    /// * `course_id` - The course identifier
    ///
    /// # Returns
    /// `Option<u64>` - The ledger timestamp of enrollment, or None if not found
    pub fn get_enrollment_timestamp(env: Env, student: Address, course_id: Symbol) -> Option<u64> {
        let timestamp_key = EnrollmentKey::EnrollmentTimestamp(student, course_id);
        env.storage().persistent().get(&timestamp_key)
    }

    /// Gets the number of actively enrolled students in a course (gas-efficient).
    ///
    /// # Arguments
    /// * `course_id` - The course identifier
    ///
    /// # Returns
    /// `u32` - Count of active enrollments
    pub fn get_active_count(env: Env, course_id: Symbol) -> u32 {
        let count_key = EnrollmentCountKey::ActiveCount(course_id);
        env.storage().instance().get(&count_key).unwrap_or(0)
    }

    /// Gets the number of completed students in a course (gas-efficient).
    ///
    /// # Arguments
    /// * `course_id` - The course identifier
    ///
    /// # Returns
    /// `u32` - Count of completed enrollments
    pub fn get_completed_count(env: Env, course_id: Symbol) -> u32 {
        let count_key = EnrollmentCountKey::CompletedCount(course_id);
        env.storage().instance().get(&count_key).unwrap_or(0)
    }

    /// Gets the number of dropped students in a course (gas-efficient).
    ///
    /// # Arguments
    /// * `course_id` - The course identifier
    ///
    /// # Returns
    /// `u32` - Count of dropped enrollments
    pub fn get_dropped_count(env: Env, course_id: Symbol) -> u32 {
        let count_key = EnrollmentCountKey::DroppedCount(course_id);
        env.storage().instance().get(&count_key).unwrap_or(0)
    }

    /// Gets the total enrollment count for a course (all states).
    ///
    /// # Arguments
    /// * `course_id` - The course identifier
    ///
    /// # Returns
    /// `u32` - Total enrollments (active + completed + dropped)
    pub fn get_total_enrollment_count(env: Env, course_id: Symbol) -> u32 {
        let active = Self::get_active_count(env.clone(), course_id.clone());
        let completed = Self::get_completed_count(env.clone(), course_id.clone());
        let dropped = Self::get_dropped_count(env, course_id);
        active + completed + dropped
    }

    /// Gets all course IDs a student is enrolled in.
    ///
    /// # Arguments
    /// * `student` - The student address
    ///
    /// # Returns
    /// `Vec<Symbol>` - List of course symbols
    pub fn get_student_courses(env: Env, student: Address) -> soroban_sdk::Vec<Symbol> {
        let courses_key = EnrollmentKey::StudentCourses(student);
        env.storage()
            .persistent()
            .get(&courses_key)
            .unwrap_or_else(|| soroban_sdk::Vec::new(&env))
    }

    /// Gets all students enrolled in a course.
    ///
    /// # Arguments
    /// * `course_id` - The course identifier
    ///
    /// # Returns
    /// `Vec<Address>` - List of student addresses
    pub fn get_course_students(env: Env, course_id: Symbol) -> soroban_sdk::Vec<Address> {
        let students_key = EnrollmentKey::CourseStudents(course_id);
        env.storage()
            .persistent()
            .get(&students_key)
            .unwrap_or_else(|| soroban_sdk::Vec::new(&env))
    }

    /// Gets the current version/invalidation counter for a course's enrollment data.
    /// Useful for detecting when enrollment counts have changed.
    ///
    /// # Arguments
    /// * `course_id` - The course identifier
    ///
    /// # Returns
    /// `u64` - Version counter (increments on enrollment changes)
    pub fn get_enrollment_version(env: Env, course_id: Symbol) -> u64 {
        let version_key = EnrollmentCountKey::EnrollmentVersion(course_id);
        env.storage().instance().get(&version_key).unwrap_or(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    extern crate std;
    use soroban_sdk::{testutils::Address as _, Address, Env, Symbol};

    #[test]
    fn test_enroll_student_success() {
        let env = Env::default();
        env.mock_all_auths();
        let student = Address::generate(&env);
        let instructor = Address::generate(&env);
        let course_id = Symbol::new(&env, "RUST101");

        let contract_id = env.register_contract(None, EnrollmentContract);
        let client = EnrollmentContractClient::new(&env, &contract_id);

        // Enroll student
        client.enroll_student(&student, &course_id, &instructor);

        // Verify active count is 1
        let active_count = client.get_active_count(&course_id);
        assert_eq!(active_count, 1);

        // Verify enrollment status
        let status = client.get_enrollment_status(&student, &course_id);
        assert_eq!(status, Some(EnrollmentState::Active));
    }

    #[test]
    fn test_cannot_enroll_twice() {
        let env = Env::default();
        env.mock_all_auths();
        let student = Address::generate(&env);
        let instructor = Address::generate(&env);
        let course_id = Symbol::new(&env, "RUST101");

        let contract_id = env.register_contract(None, EnrollmentContract);
        let client = EnrollmentContractClient::new(&env, &contract_id);

        // Enroll student
        client.enroll_student(&student, &course_id, &instructor);

        // Try to enroll again - should fail
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.enroll_student(&student, &course_id, &instructor);
        }));

        assert!(result.is_err());
    }

    #[test]
    fn test_complete_enrollment() {
        let env = Env::default();
        env.mock_all_auths();
        let student = Address::generate(&env);
        let instructor = Address::generate(&env);
        let course_id = Symbol::new(&env, "RUST101");

        let contract_id = env.register_contract(None, EnrollmentContract);
        let client = EnrollmentContractClient::new(&env, &contract_id);

        // Enroll student
        client.enroll_student(&student, &course_id, &instructor);
        assert_eq!(client.get_active_count(&course_id), 1);
        assert_eq!(client.get_completed_count(&course_id), 0);

        // Complete enrollment
        client.complete_enrollment(&student, &course_id, &instructor);

        // Verify counts updated
        assert_eq!(client.get_active_count(&course_id), 0);
        assert_eq!(client.get_completed_count(&course_id), 1);
        assert_eq!(
            client.get_enrollment_status(&student, &course_id),
            Some(EnrollmentState::Completed)
        );
    }

    #[test]
    fn test_drop_enrollment() {
        let env = Env::default();
        env.mock_all_auths();
        let student = Address::generate(&env);
        let instructor = Address::generate(&env);
        let course_id = Symbol::new(&env, "RUST101");

        let contract_id = env.register_contract(None, EnrollmentContract);
        let client = EnrollmentContractClient::new(&env, &contract_id);

        // Enroll and then drop
        client.enroll_student(&student, &course_id, &instructor);
        assert_eq!(client.get_active_count(&course_id), 1);

        client.drop_enrollment(&student, &course_id, &instructor);

        // Verify counts updated
        assert_eq!(client.get_active_count(&course_id), 0);
        assert_eq!(client.get_dropped_count(&course_id), 1);
        assert_eq!(
            client.get_enrollment_status(&student, &course_id),
            Some(EnrollmentState::Dropped)
        );
    }

    #[test]
    fn test_total_enrollment_count() {
        let env = Env::default();
        env.mock_all_auths();
        let instructor = Address::generate(&env);
        let course_id = Symbol::new(&env, "RUST101");

        let contract_id = env.register_contract(None, EnrollmentContract);
        let client = EnrollmentContractClient::new(&env, &contract_id);

        // Create multiple students in different states
        let student1 = Address::generate(&env);
        let student2 = Address::generate(&env);
        let student3 = Address::generate(&env);

        // Enroll all three
        client.enroll_student(&student1, &course_id, &instructor);
        client.enroll_student(&student2, &course_id, &instructor);
        client.enroll_student(&student3, &course_id, &instructor);

        // Complete student1
        client.complete_enrollment(&student1, &course_id, &instructor);

        // Drop student3
        client.drop_enrollment(&student3, &course_id, &instructor);

        // Verify total (should still include all three)
        let total = client.get_total_enrollment_count(&course_id);
        assert_eq!(total, 3);

        // Verify individual counts
        assert_eq!(client.get_active_count(&course_id), 1); // student2
        assert_eq!(client.get_completed_count(&course_id), 1); // student1
        assert_eq!(client.get_dropped_count(&course_id), 1); // student3
    }

    #[test]
    fn test_student_courses_tracking() {
        let env = Env::default();
        env.mock_all_auths();
        let student = Address::generate(&env);
        let instructor = Address::generate(&env);
        let course1 = Symbol::new(&env, "RUST101");
        let course2 = Symbol::new(&env, "RUST201");

        let contract_id = env.register_contract(None, EnrollmentContract);
        let client = EnrollmentContractClient::new(&env, &contract_id);

        // Enroll in two courses
        client.enroll_student(&student, &course1, &instructor);
        client.enroll_student(&student, &course2, &instructor);

        // Verify student courses list
        let courses = client.get_student_courses(&student);
        assert_eq!(courses.len(), 2);
        assert!(courses.contains(&course1));
        assert!(courses.contains(&course2));
    }

    #[test]
    fn test_course_students_tracking() {
        let env = Env::default();
        env.mock_all_auths();
        let instructor = Address::generate(&env);
        let course_id = Symbol::new(&env, "RUST101");

        let contract_id = env.register_contract(None, EnrollmentContract);
        let client = EnrollmentContractClient::new(&env, &contract_id);

        // Enroll multiple students
        let student1 = Address::generate(&env);
        let student2 = Address::generate(&env);
        let student3 = Address::generate(&env);

        client.enroll_student(&student1, &course_id, &instructor);
        client.enroll_student(&student2, &course_id, &instructor);
        client.enroll_student(&student3, &course_id, &instructor);

        // Verify course students list
        let students = client.get_course_students(&course_id);
        assert_eq!(students.len(), 3);
        assert!(students.contains(&student1));
        assert!(students.contains(&student2));
        assert!(students.contains(&student3));
    }

    #[test]
    fn test_enrollment_timestamp() {
        let env = Env::default();
        env.mock_all_auths();
        let student = Address::generate(&env);
        let instructor = Address::generate(&env);
        let course_id = Symbol::new(&env, "RUST101");

        let contract_id = env.register_contract(None, EnrollmentContract);
        let client = EnrollmentContractClient::new(&env, &contract_id);

        // Get timestamp before enrollment
        let timestamp_before = env.ledger().timestamp();

        // Enroll student
        client.enroll_student(&student, &course_id, &instructor);

        // Get enrollment timestamp
        let enrollment_timestamp = client.get_enrollment_timestamp(&student, &course_id);
        assert!(enrollment_timestamp.is_some());
        assert!(enrollment_timestamp.unwrap() >= timestamp_before);
    }

    #[test]
    fn test_version_counter_increments() {
        let env = Env::default();
        env.mock_all_auths();
        let student = Address::generate(&env);
        let instructor = Address::generate(&env);
        let course_id = Symbol::new(&env, "RUST101");

        let contract_id = env.register_contract(None, EnrollmentContract);
        let client = EnrollmentContractClient::new(&env, &contract_id);

        // Get initial version
        let v0 = client.get_enrollment_version(&course_id);
        assert_eq!(v0, 0);

        // Enroll - version should increment
        client.enroll_student(&student, &course_id, &instructor);
        let v1 = client.get_enrollment_version(&course_id);
        assert_eq!(v1, 1);

        // Complete - version should increment again
        client.complete_enrollment(&student, &course_id, &instructor);
        let v2 = client.get_enrollment_version(&course_id);
        assert_eq!(v2, 2);
    }

    #[test]
    fn test_cannot_complete_non_active_enrollment() {
        let env = Env::default();
        env.mock_all_auths();
        let student = Address::generate(&env);
        let instructor = Address::generate(&env);
        let course_id = Symbol::new(&env, "RUST101");

        let contract_id = env.register_contract(None, EnrollmentContract);
        let client = EnrollmentContractClient::new(&env, &contract_id);

        // Enroll, complete, then try to complete again
        client.enroll_student(&student, &course_id, &instructor);
        client.complete_enrollment(&student, &course_id, &instructor);

        // Try to complete again - should fail
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.complete_enrollment(&student, &course_id, &instructor);
        }));

        assert!(result.is_err());
    }

    #[test]
    fn test_cannot_drop_completed_enrollment() {
        let env = Env::default();
        env.mock_all_auths();
        let student = Address::generate(&env);
        let instructor = Address::generate(&env);
        let course_id = Symbol::new(&env, "RUST101");

        let contract_id = env.register_contract(None, EnrollmentContract);
        let client = EnrollmentContractClient::new(&env, &contract_id);

        // Enroll and complete
        client.enroll_student(&student, &course_id, &instructor);
        client.complete_enrollment(&student, &course_id, &instructor);

        // Try to drop completed enrollment - should fail
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.drop_enrollment(&student, &course_id, &instructor);
        }));

        assert!(result.is_err());
    }

    #[test]
    fn test_reenroll_after_drop() {
        let env = Env::default();
        env.mock_all_auths();
        let student = Address::generate(&env);
        let instructor = Address::generate(&env);
        let course_id = Symbol::new(&env, "RUST101");

        let contract_id = env.register_contract(None, EnrollmentContract);
        let client = EnrollmentContractClient::new(&env, &contract_id);

        // Enroll
        client.enroll_student(&student, &course_id, &instructor);
        assert_eq!(client.get_active_count(&course_id), 1);

        // Drop
        client.drop_enrollment(&student, &course_id, &instructor);
        assert_eq!(client.get_active_count(&course_id), 0);
        assert_eq!(client.get_dropped_count(&course_id), 1);

        // Re-enroll - should work since status is now Dropped (not Active)
        // This would update the existing record
        client.enroll_student(&student, &course_id, &instructor);
        assert_eq!(client.get_active_count(&course_id), 1);
        assert_eq!(
            client.get_enrollment_status(&student, &course_id),
            Some(EnrollmentState::Active)
        );
    }

    #[test]
    fn test_multiple_courses_independence() {
        let env = Env::default();
        env.mock_all_auths();
        let student = Address::generate(&env);
        let instructor = Address::generate(&env);
        let course1 = Symbol::new(&env, "RUST101");
        let course2 = Symbol::new(&env, "RUST201");

        let contract_id = env.register_contract(None, EnrollmentContract);
        let client = EnrollmentContractClient::new(&env, &contract_id);

        // Enroll in course1
        client.enroll_student(&student, &course1, &instructor);

        // Enroll in course2
        client.enroll_student(&student, &course2, &instructor);

        // Complete in course1
        client.complete_enrollment(&student, &course1, &instructor);

        // Verify course1 state
        assert_eq!(
            client.get_enrollment_status(&student, &course1),
            Some(EnrollmentState::Completed)
        );

        // Verify course2 state is still Active
        assert_eq!(
            client.get_enrollment_status(&student, &course2),
            Some(EnrollmentState::Active)
        );

        // Verify counts are independent
        assert_eq!(client.get_active_count(&course1), 0);
        assert_eq!(client.get_completed_count(&course1), 1);
        assert_eq!(client.get_active_count(&course2), 1);
        assert_eq!(client.get_completed_count(&course2), 0);
    }
}
