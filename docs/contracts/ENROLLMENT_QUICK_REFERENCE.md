# Enrollment Module - Quick Reference

## File Location

```
contracts/src/enrollment.rs
```

## Core Types

```rust
// Enrollment status
pub enum EnrollmentState {
    Active = 0,
    Completed = 1,
    Dropped = 2,
}

// Error types
pub enum EnrollmentError {
    NotAuthorized = 1,
    AlreadyEnrolled = 2,
    NotEnrolled = 3,
    InvalidStateTransition = 4,
    CourseNotFound = 5,
    InvalidStudent = 6,
    EnrollmentCapReached = 7,
}
```

## Essential Functions

### Manage Enrollment

| Function | Cost | Purpose |
|----------|------|---------|
| `enroll_student()` | 2-3 units | Add student to course (Active) |
| `complete_enrollment()` | ~1 unit | Mark course as completed |
| `drop_enrollment()` | ~1 unit | Withdraw from course |

### Query (Fast)

| Function | Cost | Purpose |
|----------|------|---------|
| `get_active_count()` | **~0.1 unit** ⚡ | Active students in course |
| `get_completed_count()` | **~0.1 unit** ⚡ | Completed students in course |
| `get_dropped_count()` | **~0.1 unit** ⚡ | Dropped students in course |
| `get_total_enrollment_count()` | **~0.3 units** ⚡ | Sum of all states |

### Query (Persistent)

| Function | Cost | Purpose |
|----------|------|---------|
| `get_enrollment_status()` | O(1) read | Get student's status in course |
| `get_enrollment_timestamp()` | O(1) read | When did student enroll? |
| `get_student_courses()` | O(n) read | All courses for student |
| `get_course_students()` | O(n) read | All students in course |
| `get_enrollment_version()` | O(1) read | Cache invalidation counter |

## Two-Tier Storage

### Persistent Storage (Long-term)
- **What**: Individual enrollment records, timestamps, lists
- **Why**: Need to maintain complete history
- **Trade-off**: Higher gas cost per operation

### Instance Storage (Ephemeral)
- **What**: Enrollment counts per course
- **Why**: Ultra-fast lookups, recomputed each block
- **Trade-off**: Resets after contract call (by design)

## Common Patterns

### Pattern 1: Enroll and Track

```rust
// Instructor initiates enrollment
enrollment_client.enroll_student(&student_addr, &course_symbol, &instructor_addr);

// Later: Get enrollment status
let status = enrollment_client.get_enrollment_status(&student_addr, &course_symbol);
```

### Pattern 2: Dashboard Statistics

```rust
// Get course enrollment overview (extremely cheap)
let active = enrollment_client.get_active_count(&course_id);
let completed = enrollment_client.get_completed_count(&course_id);
let dropped = enrollment_client.get_dropped_count(&course_id);

// Calculate rates
let total = active + completed + dropped;
let completion_rate = (completed * 100) / (total.max(1));
```

### Pattern 3: Batch Operations

```rust
// Get all students (persistent read)
let all_students = enrollment_client.get_course_students(&course_id);

// Process only active students
for student in all_students {
    if let Some(state) = enrollment_client.get_enrollment_status(&student, &course_id) {
        if state == EnrollmentState::Active {
            process_active_student(&student);
        }
    }
}
```

### Pattern 4: Complete and Verify

```rust
// Mark as complete
enrollment_client.complete_enrollment(&student, &course_id, &instructor);

// Verify
let final_status = enrollment_client.get_enrollment_status(&student, &course_id);
assert_eq!(final_status, Some(EnrollmentState::Completed));
```

## State Transitions

```
┌─────────┐
│ Not Set │────────────────┐
└────┬────┘                │
     │ enroll              │
     ▼                      │
┌─────────┐                │
│ Active  │────────────────┤
└────┬────┘                │
     │ complete  drop      │
     │◄──────────►          │
     ▼                      │
┌───────────┐  ┌────────┐  │
│ Completed │  │ Dropped│  │
└───────────┘  └────────┘  │
     ▲            ▲         │
     │ Can't transition back ◄─┘
     └──────────────────────┘
```

**Valid transitions**:
- Not Set → Active (new enrollment)
- Active → Completed (course completion)
- Active → Dropped (withdrawal)
- Not Set → Dropped (immediate drop)

**Invalid transitions**:
- Completed → Any (blocked)
- Dropped → Completed (blocked)
- Any → Active (if already Active, use existing)

## Testing Checklist

Before submitting PR:

- [ ] Test enrollment creation
- [ ] Test duplicate enrollment prevention
- [ ] Test completion flow
- [ ] Test drop flow
- [ ] Test state transition validation
- [ ] Test student courses list update
- [ ] Test course students list update
- [ ] Test timestamp tracking
- [ ] Test version counter
- [ ] Test multiple courses don't interfere
- [ ] Run: `cargo test enrollment`

## Integration Checklist

To integrate into main contract:

- [ ] Import `enrollment` module in `lib.rs`
- [ ] Add `enrollment_client` initialization
- [ ] Call `enroll_student()` when issuing certificates
- [ ] Call `complete_enrollment()` on course completion
- [ ] Call `drop_enrollment()` on withdrawal
- [ ] Use count functions for dashboards
- [ ] Update documentation with new flows

## Performance Notes

**Fast operations** (use freely):
- Count lookups: `get_*_count()` — 100x+ faster than iteration

**Medium operations** (cache when possible):
- Status queries: `get_enrollment_status()` — O(1) but persistent

**Slower operations** (paginate for large courses):
- List retrieval: `get_course_students()` — O(n) by design

## Errors You May See

| Error | Cause | Solution |
|-------|-------|----------|
| `AlreadyEnrolled` | Tried to enroll already-Active student | Check status first, or drop/re-enroll |
| `NotEnrolled` | No enrollment exists | Create enrollment first |
| `InvalidStateTransition` | Status change not allowed | Check current state, follow transition rules |
| `NotAuthorized` | Caller not authenticated | Ensure `instructor.require_auth()` is called |

## Debugging

Enable event logging:
```rust
// All operations publish events
env.events().publish((Symbol::new(&env, "student_enrolled"), student, course_id), ());
env.events().publish((Symbol::new(&env, "enrollment_completed"), student, course_id), ());
env.events().publish((Symbol::new(&env, "enrollment_dropped"), student, course_id), ());
```

Trace enrollment state:
```rust
let status = enrollment_client.get_enrollment_status(&student, &course);
let timestamp = enrollment_client.get_enrollment_timestamp(&student, &course);
let version = enrollment_client.get_enrollment_version(&course);

println!("Status: {:?}, Enrolled at: {}, Version: {}", status, timestamp, version);
```

## Gas Budget Examples

### Low-cost operation (~0.5 units)
```rust
// Just check how many active students
let count = enrollment_client.get_active_count(&course_id);
```

### Medium-cost operation (~2 units)
```rust
// Enroll a student
enrollment_client.enroll_student(&student, &course_id, &instructor);
```

### Higher-cost operation (~10+ units)
```rust
// Get all students and check each one
let students = enrollment_client.get_course_students(&course_id);
for student in students { /* ... */ }
```

## See Also

- Full docs: [ENROLLMENT_TRACKING.md](ENROLLMENT_TRACKING.md)
- Contract code: [enrollment.rs](../contracts/src/enrollment.rs)
- Test suite: [enrollment.rs test module](../contracts/src/enrollment.rs#L459)

---

**Last updated**: March 2026
