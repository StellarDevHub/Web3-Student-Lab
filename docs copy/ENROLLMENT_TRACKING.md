# Gas-Efficient Student Enrollment Tracking

## Overview

The Student Enrollment Tracking module provides a gas-efficient way to manage student enrollments in courses using Soroban smart contracts. It implements a two-tier storage strategy that optimizes for both quick lookups and complete historical record-keeping.

**Implementation Level**: Intermediate
**ETA**: 1-2 days for integration into main contract flows

## Key Features

### 1. **EnrollmentState Enum**

Tracks the status of a student's enrollment in a course:

```rust
pub enum EnrollmentState {
    Active = 0,      // Student is actively taking the course
    Completed = 1,   // Student has successfully completed the course
    Dropped = 2,     // Student has withdrawn from the course
}
```

### 2. **Two-Tier Storage Strategy**

#### Persistent Storage (Long-term)
- **Purpose**: Maintain complete enrollment history and individual student status
- **Keys**:
  - `EnrollmentStatus(student, course_id)` → `EnrollmentState`
  - `EnrollmentTimestamp(student, course_id)` → `u64` (ledger timestamp)
  - `StudentCourses(student)` → `Vec<Symbol>` (all courses a student is in)
  - `CourseStudents(course_id)` → `Vec<Address>` (all students in a course)

#### Instance Storage (Fast lookups)
- **Purpose**: Quick access to enrollment counts within contract execution
- **Keys**:
  - `ActiveCount(course_id)` → `u32`
  - `CompletedCount(course_id)` → `u32`
  - `DroppedCount(course_id)` → `u32`
  - `EnrollmentVersion(course_id)` → `u64` (cache invalidation counter)

### 3. **Gas Optimization**

The design minimizes gas costs through:

- **Instance Storage**: Enrollment count lookups are O(1) and don't persist across contract calls, saving storage costs
- **Selective Persistence**: Only necessary data (status, timestamps, lists) is stored persistently
- **Version Counter**: Enables efficient caching on client-side by tracking when counts change
- **Atomic Updates**: Count updates happen immediately during enrollment operations, avoiding cascading computations

## API Reference

### Enrollment Management

#### `enroll_student(student, course_id, instructor)`

Enrolls a student in a course with Active status.

```rust
pub fn enroll_student(env: Env, student: Address, course_id: Symbol, instructor: Address)
```

**Parameters**:
- `student`: The student address to enroll
- `course_id`: The course symbol identifier
- `instructor`: The instructor authorizing enrollment (must authenticate)

**Errors**:
- `AlreadyEnrolled`: Student is already in Active status in this course
- `NotAuthorized`: Instructor must authenticate

**Side Effects**:
- Sets enrollment status to Active
- Records enrollment timestamp
- Updates student's course list
- Updates course's student list
- **Increments** active count (instance)
- **Increments** version counter
- Publishes `student_enrolled` event

**Gas Cost**: ~2-3 Soroban units
- 1 persistent read (check existing enrollment)
- 4 persistent writes (status, timestamp, student courses, course students)
- 2 instance writes (active count, version)

#### `complete_enrollment(student, course_id, instructor)`

Marks a student's enrollment as Completed.

```rust
pub fn complete_enrollment(env: Env, student: Address, course_id: Symbol, instructor: Address)
```

**Parameters**:
- `student`: The student whose enrollment is being completed
- `course_id`: The course identifier
- `instructor`: The instructor authorizing completion (must authenticate)

**Errors**:
- `NotAuthorized`: Instructor must authenticate
- `NotEnrolled`: Student is not enrolled in the course
- `InvalidStateTransition`: Student must be in Active state

**Side Effects**:
- Updates enrollment status from Active to Completed
- **Decrements** active count
- **Increments** completed count
- **Increments** version counter
- Publishes `enrollment_completed` event

**Gas Cost**: ~1 Soroban unit
- 1 persistent read (get status)
- 1 persistent write (update status)
- 2 instance writes (decrement active, increment completed)
- 1 instance write (version)

#### `drop_enrollment(student, course_id, instructor)`

Marks a student's enrollment as Dropped.

```rust
pub fn drop_enrollment(env: Env, student: Address, course_id: Symbol, instructor: Address)
```

**Parameters**:
- `student`: The student who is dropping
- `course_id`: The course identifier
- `instructor`: The instructor authorizing the drop (may be the student)

**Errors**:
- `NotAuthorized`: Instructor must authenticate
- `NotEnrolled`: Student is not enrolled in the course
- `InvalidStateTransition`: Student cannot be already Dropped or Completed

**Side Effects**:
- Updates enrollment status from Active to Dropped
- **Decrements** active count
- **Increments** dropped count
- **Increments** version counter
- Publishes `enrollment_dropped` event

**Gas Cost**: ~1 Soroban unit (same as complete_enrollment)

### State Queries

#### `get_enrollment_status(student, course_id) → Option<EnrollmentState>`

Retrieves the current enrollment status of a student in a course.

```rust
pub fn get_enrollment_status(env: Env, student: Address, course_id: Symbol) -> Option<EnrollmentState>
```

**Gas Cost**: O(1) persistent read

#### `get_enrollment_timestamp(student, course_id) → Option<u64>`

Retrieves the ledger timestamp when a student enrolled in a course.

```rust
pub fn get_enrollment_timestamp(env: Env, student: Address, course_id: Symbol) -> Option<u64>
```

**Gas Cost**: O(1) persistent read

### Count Queries (Optimized)

#### `get_active_count(course_id) → u32`

Gets the number of actively enrolled students in a course. **This is the gas-optimized count lookup.**

```rust
pub fn get_active_count(env: Env, course_id: Symbol) -> u32
```

**Gas Cost**: O(1) instance read ⚡ **Much cheaper than iterating persistent lists**

#### `get_completed_count(course_id) → u32`

Gets the number of students who completed a course.

```rust
pub fn get_completed_count(env: Env, course_id: Symbol) -> u32
```

**Gas Cost**: O(1) instance read ⚡

#### `get_dropped_count(course_id) → u32`

Gets the number of students who dropped a course.

```rust
pub fn get_dropped_count(env: Env, course_id: Symbol) -> u32
```

**Gas Cost**: O(1) instance read ⚡

#### `get_total_enrollment_count(course_id) → u32`

Gets the total enrollment count across all states.

```rust
pub fn get_total_enrollment_count(env: Env, course_id: Symbol) -> u32
```

**Returns**: `active + completed + dropped`

**Gas Cost**: 3x O(1) instance reads

### List Queries

#### `get_student_courses(student) → Vec<Symbol>`

Gets all course IDs a student is enrolled in (any state).

```rust
pub fn get_student_courses(env: Env, student: Address) -> soroban_sdk::Vec<Symbol>
```

**Gas Cost**: O(n) persistent read (n = number of courses)

#### `get_course_students(course_id) → Vec<Address>`

Gets all student addresses in a course (any state).

```rust
pub fn get_course_students(env: Env, course_id: Symbol) -> soroban_sdk::Vec<Address>
```

**Gas Cost**: O(n) persistent read (n = number of students)

### Cache Management

#### `get_enrollment_version(course_id) → u64`

Gets the current version counter for a course's enrollment data.

```rust
pub fn get_enrollment_version(env: Env, course_id: Symbol) -> u64
```

**Purpose**: Enables client-side caching strategies. When this value changes, cached counts should be invalidated.

**Gas Cost**: O(1) instance read

## Use Cases

### 1. Dashboard Analytics

```rust
// Get enrollment statistics for a course dashboard
let active = client.get_active_count(&course_id);      // Fast!
let completed = client.get_completed_count(&course_id);
let dropped = client.get_dropped_count(&course_id);

display_stats(active, completed, dropped);
```

### 2. Student Transcript

```rust
// Get all courses a student has taken
let courses = client.get_student_courses(&student_address);
for course_id in courses {
    let status = client.get_enrollment_status(&student_address, &course_id);
    let timestamp = client.get_enrollment_timestamp(&student_address, &course_id);
    display_transcript_entry(course_id, status, timestamp);
}
```

### 3. Bulk Drop Processing

```rust
// Instructor dropping multiple students from a course
let students = client.get_course_students(&course_id);
for student in students {
    // Selective drop based on some condition
    if should_drop(&student) {
        client.drop_enrollment(&student, &course_id, &instructor);
    }
}
```

### 4. Course Capacity Management

```rust
// Check if course can accept more students (with cap of 100)
let active = client.get_active_count(&course_id);
if active < 100 {
    client.enroll_student(&new_student, &course_id, &instructor);
} else {
    reject_enrollment("Course is at capacity");
}
```

## Error Handling

The module defines these error types:

```rust
#[contracterror]
pub enum EnrollmentError {
    NotAuthorized = 1,           // Action not authorized
    AlreadyEnrolled = 2,          // Student already in Active status
    NotEnrolled = 3,              // No enrollment found
    InvalidStateTransition = 4,   // Status change not allowed
    CourseNotFound = 5,           // Course doesn't exist (informational)
    InvalidStudent = 6,           // Invalid student address
    EnrollmentCapReached = 7,     // Maximum enrollments exceeded
}
```

## Events

The module publishes these events:

```rust
// When a student enrolls
env.events().publish((Symbol::new(&env, "student_enrolled"), student, course_id), ());

// When enrollment is completed
env.events().publish((Symbol::new(&env, "enrollment_completed"), student, course_id), ());

// When enrollment is dropped
env.events().publish((Symbol::new(&env, "enrollment_dropped"), student, course_id), ());
```

## Workflow Examples

### Example 1: Enroll → Complete → Issue Certificate

```rust
// Step 1: Student enrolls
contract.enroll_student(student, course_id, instructor);

// Step 2: Student completes course
// ... (course work happens off-chain)
contract.complete_enrollment(student, course_id, instructor);

// Step 3: Check status
let status = contract.get_enrollment_status(student, course_id);
assert_eq!(status, Some(EnrollmentState::Completed));

// Step 4: Issue certificate (in main contract)
// ... certificate issuance logic
```

### Example 2: Batch Action - Count Active Students

```rust
// Get count efficiently without iteration
let active = contract.get_active_count(&course_id);

if active >= 10 {
    // Send completion reminder email to all active students
    let all_students = contract.get_course_students(&course_id);
    for student in all_students {
        if contract.get_enrollment_status(&student, &course_id) == Some(EnrollmentState::Active) {
            send_reminder_email(student, course_id);
        }
    }
}
```

### Example 3: Course Completion Report

```rust
// Generate completion statistics
let total = contract.get_total_enrollment_count(&course_id);
let active = contract.get_active_count(&course_id);
let completed = contract.get_completed_count(&course_id);
let dropped = contract.get_dropped_count(&course_id);

let completion_rate = (completed as f64 / total as f64) * 100.0;

println!("Course {} Statistics:", course_id);
println!("  Total Enrollments: {}", total);
println!("  Active: {}", active);
println!("  Completed: {}", completed);
println!("  Dropped: {}", dropped);
println!("  Completion Rate: {:.1}%", completion_rate);
```

## Gas Cost Comparison

### Traditional Approach (No Instance Counts)

Getting active enrollment count:
```
Cost = PERSISTENT_READ_PRICE × number_of_students_in_course
Cost grows linearly with course size
```

### Optimized Approach (With Instance Counts)

Getting active enrollment count:
```
Cost = INSTANCE_READ_PRICE (fixed, ~0.1 units)
Cost independent of course size ⚡
```

**Impact**: For a course with 100 students:
- Traditional: ~100 read operations
- Optimized: 1 read operation
- **100x gas savings for count lookups**

## Testing

The module includes comprehensive tests covering:

- ✅ Successful enrollment
- ✅ Duplicate enrollment prevention
- ✅ Enrollment completion
- ✅ Enrollment drop
- ✅ State transitions and validation
- ✅ Student course tracking
- ✅ Course student tracking
- ✅ Enrollment timestamps
- ✅ Version counter increments
- ✅ Multiple courses independence
- ✅ Re-enrollment after drop

Run tests with:
```bash
cd contracts
cargo test enrollment
```

## Integration Guide

### 1. Add to Certificate Contract

```rust
// In certificate main contract
pub mod enrollment;

// Use enrollment service
use enrollment::{EnrollmentContractClient, EnrollmentState};
```

### 2. Create Enrollment when Issuing Certificate

```rust
// When issuing a certificate, enroll student
enrollment_client.enroll_student(&student, &course_id, &env.current_contract_address());
```

### 3. Update Enrollment Status on Course Events

```rust
// When student completes assessment
if assessment_passed {
    enrollment_client.complete_enrollment(&student, &course_id, &env.current_contract_address());
}

// When student withdraws
if withdrawal_request {
    enrollment_client.drop_enrollment(&student, &course_id, &env.current_contract_address());
}
```

### 4. Query Analytics and Reports

```rust
// Dashboard or reporting endpoint
pub fn get_course_analytics(course_id: Symbol) -> CourseAnalytics {
    CourseAnalytics {
        active_students: enrollment_client.get_active_count(&course_id),
        completed_students: enrollment_client.get_completed_count(&course_id),
        dropped_students: enrollment_client.get_dropped_count(&course_id),
        total: enrollment_client.get_total_enrollment_count(&course_id),
    }
}
```

## Future Enhancements

1. **Enrollment Soft Cap**: Configurable maximum enrollments per course
2. **Waitlist Management**: Queue students when course is full
3. **Enrollment Deadlines**: Track and enforce registration deadlines
4. **Pre-requisites**: Validate student has completed prerequisites
5. **Batch Operations**: Enroll/drop multiple students in one transaction
6. **Audit Trail**: Enhanced logging of all enrollment changes
7. **Refund Logic**: Handle refunds when students drop
8. **Progress Tracking**: Monitor completion percentage per student

## References

- [Soroban Storage Documentation](https://developers.stellar.org/docs/learn/storing-data)
- [Contract Storage Best Practices](https://developers.stellar.org/docs/smart-contracts/storing-data)
- [Smart Contract Gas Management](https://developers.stellar.org/docs/learn/resource-limits)

## Contributing

When contributing to the enrollment module:

1. Maintain the two-tier storage strategy
2. Keep instance count operations O(1)
3. Add tests for new functionality
4. Update this documentation
5. Consider gas impact of changes
6. Follow existing error handling patterns

---

**Implementation Date**: March 2026
**Status**: Complete with tests
**Maintainers**: Web3-Student-Lab Contributors
