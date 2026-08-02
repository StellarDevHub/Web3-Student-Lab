# Soroban Contract Fuzzing Guide

This document describes the fuzzing setup implemented for the Web3 Student Lab Soroban contracts.

## Overview

The fuzzing module (`contracts/src/fuzz.rs`) implements property-based testing to find edge cases in
the Certificate and Token contract logic. Since Soroban-SDK doesn't have native cargo-fuzz
integration, we use structured property-based testing with deterministic pseudo-random inputs.

## Target Edge Cases

### 1. Overflow/Underflow

- **Mint cap arithmetic**: Boundary conditions when adding certificates
- **Ledger period division**: Handling of high ledger sequence numbers
- **Token amount overflow**: Large i128 values in token minting

### 2. Storage Collisions

- **Composite keys**: Different (course_symbol, student) pairs should not collide
- **Revocation isolation**: Revoking one certificate shouldn't affect others
- **Cross-course uniqueness**: Certificates for different courses should be independent

### 3. Boundary Conditions

- **Mint cap limits**: Exact cap, cap + 1, zero cap
- **Period boundaries**: Mint tracking should reset correctly at period boundaries
- **Empty inputs**: Issue with 0 students, single student edge cases

### 4. Authorization

- **Non-admin access**: Verifying authorization checks work correctly
- **Cross-contract calls**: Token minting authorization
- **Double initialization**: Preventing contract re-initialization

## Running the Fuzzer

### Prerequisites

Ensure you have the Rust toolchain installed with Soroban-SDK dependencies:

```bash
# Verify Rust installation
rustc --version
cargo --version

# Add WASM target (required for Soroban)
rustup target add wasm32-unknown-unknown
```

### Running All Fuzz Tests

From the `contracts` directory, run all fuzz tests:

```bash
cd contracts
cargo test --lib fuzz
```

### Running Specific Fuzz Modules

Run specific fuzz test categories:

```bash
# Mint cap boundary fuzzing
cargo test --lib fuzz::mint_cap_fuzzing

# Storage collision fuzzing
cargo test --lib fuzz::storage_collision_fuzzing

# Period boundary fuzzing
cargo test --lib fuzz::period_boundary_fuzzing

# Token fuzzing
cargo test --lib fuzz::token_fuzzing

# Event emission fuzzing
cargo test --lib fuzz::event_emission_fuzzing

# Stress fuzzing
cargo test --lib fuzz::stress_fuzzing

# Regression tests
cargo test --lib fuzz::regression_tests
```

### Running with Detailed Output

For verbose output showing test details:

```bash
cargo test --lib fuzz -- --nocapture
```

### Running with Test Filtering

Use test filtering with cargo:

```bash
# Run tests containing "boundary" in their name
cargo test --lib fuzz boundary

# Run tests containing "overflow"
cargo test --lib fuzz overflow

# Run tests containing "collision"
cargo test --lib fuzz collision
```

## Understanding Fuzz Test Output

### Successful Run Example

```
running 12 tests
test fuzz::mint_cap_fuzzing::fuzz_mint_cap_edge_cases ... ok
test fuzz::mint_cap_fuzzing::fuzz_multiple_issues_cumulative ... ok
test fuzz::storage_collision_fuzzing::fuzz_different_courses_no_collision ... ok
test fuzz::storage_collision_fuzzing::fuzz_different_students_no_collision ... ok
test fuzz::storage_collision_fuzzing::fuzz_composite_key_uniqueness ... ok
test fuzz::storage_collision_fuzzing::fuzz_revocation_isolation ... ok
test fuzz::period_boundary_fuzzing::fuzz_period_boundary_reset ... ok
test fuzz::period_boundary_fuzzing::fuzz_multiple_period_advances ... ok
test fuzz::period_boundary_fuzzing::fuzz_ledger_sequence_overflow_edge ... ok
test fuzz::token_fuzzing::fuzz_token_authorization ... ok
test fuzz::token_fuzzing::fuzz_token_amounts ... ok
test fuzz::token_fuzzing::fuzz_token_cumulative_mint ... ok
test fuzz::token_fuzzing::fuzz_token_multiple_students ... ok
test fuzz::event_emission_fuzzing::fuzz_cert_issued_event_count ... ok
test fuzz::event_emission_fuzzing::fuzz_revoke_event ... ok
test fuzz::stress_fuzzing::fuzz_large_batch_sizes ... ok
test fuzz::stress_fuzzing::fuzz_concurrent_mint_and_revoke ... ok
test fuzz::stress_fuzzing::fuzz_empty_and_single_student ... ok
test fuzz::regression_tests::regression_mint_cap_zero_check ... ok
test fuzz::regression_tests::regression_double_init ... ok
test fuzz::regression_tests::regression_unauthorized_revoke ... ok
test fuzz::regression_tests::regression_nonexistent_certificate ... ok

test result: ok. 22 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```

### Failure Output

If a fuzz test finds an edge case that triggers a bug, it will show:

```
test fuzz::...::test_name ... FAILED
thread '...' panicked at '...'
```

## Test Categories

### Mint Cap Boundary Fuzzing (`mint_cap_fuzzing`)

- Tests exact cap boundary conditions
- Tests cumulative mint counting across multiple issues
- Tests edge cases like zero batch, exact cap, cap + 1

### Storage Collision Fuzzing (`storage_collision_fuzzing`)

- Verifies different (course, student) pairs don't collide
- Tests composite key uniqueness
- Verifies revocation isolation between students

### Period Boundary Fuzzing (`period_boundary_fuzzing`)

- Tests mint counter reset at period boundaries
- Tests multiple period advances
- Tests handling of high ledger sequence numbers

### Token Fuzzing (`token_fuzzing`)

- Tests authorization requirements
- Tests various token amounts
- Tests cumulative minting
- Tests multiple student handling

### Event Emission Fuzzing (`event_emission_fuzzing`)

- Verifies correct number of events emitted
- Tests cert_issued, cert_revoked, mint_period_update events

### Stress Fuzzing (`stress_fuzzing`)

- Large batch sizes
- Concurrent mint and revoke operations
- Empty and single student edge cases

### Regression Tests (`regression_tests`)

- Double initialization prevention
- Zero mint cap rejection
- Unauthorized revoke prevention
- Non-existent certificate handling

## Extending the Fuzzer

### Adding New Fuzz Tests

To add a new fuzz test:

1. Add the test function to the appropriate module in `contracts/src/fuzz.rs`
2. Use the `SimpleRng` struct for deterministic random inputs
3. Use `std::panic::catch_unwind` to catch expected panics
4. Include assertions that verify the property being tested

Example:

```rust
#[test]
fn fuzz_my_new_case() {
    let env = Env::default();
    env.mock_all_auths();

    // ... test setup ...

    // Test logic with assertions
    assert!(condition, "Property description");
}
```

### Using the RNG

The `SimpleRng` provides deterministic random values:

```rust
let mut rng = SimpleRng::new(seed); // Use fixed seed for reproducibility
let random_u32 = rng.next_u32(max);
let random_bool = rng.next_bool(probability);
```

## Continuous Fuzzing

For continuous fuzzing, consider:

1. **LibAFL**: Advanced fuzzing framework with Soroban integration potential
2. **cargo-fuzz**: Native Rust fuzzing (requires additional setup)
3. **Property-based testing**: Using proptest or similar for more sophisticated input generation

## Known Limitations

1. **Deterministic inputs**: Current implementation uses pseudo-random, not true fuzzing
2. **Coverage**: Tests are limited to defined property categories
3. **Contract limits**: Doesn't test against actual network resource limits

## Contributing

When contributing new fuzz tests:

1. Follow the existing module structure
2. Include documentation explaining the edge case being tested
3. Use descriptive test names
4. Ensure tests are deterministic
5. Add corresponding documentation to this guide

## References

- [Soroban SDK Documentation](https://soroban.stellar.org/)
- [Soroban Test Documentation](https://soroban.stellar.org/docs/getting-started/hello-world#testing-the-contract)
- [Property-Based Testing Principles](https://www.propertesting.com/)
