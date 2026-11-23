# [Contract] Restricted Transfer Logic

## Summary

Implemented a "Whitelisted Transfer" system for RS-Tokens that allows transfers only between
verified students with active student profiles/enrollments, ensuring tokens remain within the
educational ecosystem.

## Implementation Details

### 🔄 Core Transfer Functionality

- **`transfer(from, to, token_id, amount)`** - Transfers RS-Tokens between verified students only
- **Student Verification**: Both sender and recipient must have `Role::Student` in the certificate
  contract
- **Authorization**: Only token owner can initiate transfers
- **Balance Validation**: Proper balance checking and zero-balance cleanup

### 📢 Event Emission

- **Transferred Event**: Emitted on successful transfers with:
  - `from`: Address of the sender
  - `to`: Address of the recipient
  - `token_id`: ID of the token type transferred
  - `amount`: Amount of tokens transferred

### 🛡️ Security & Validation

- `NotStudent`: When either sender or recipient is not a verified student
- `InvalidAmount`: When transfer amount is zero or negative
- `InsufficientBalance`: When sender lacks sufficient tokens
- `TransferFailed`: General transfer failure protection

### 🔗 Integration with Certificate Contract

- **Cross-Contract Calls**: Uses `CertificateContractClient` to verify student roles
- **Role-Based Access**: Leverages existing RBAC system for student verification
- **Seamless Integration**: Works with existing certificate and token minting system

## Technical Changes

### New Error Types

```rust
NotStudent = 6,        // Either party not a verified student
TransferFailed = 7,     // General transfer failure
```

### Student Verification Helper

```rust
fn require_both_students(env: &Env, from: &Address, to: &Address) {
    // Verifies both addresses have Role::Student in certificate contract
    // Prevents transfers to non-student addresses
}
```

### Event Structure

```rust
env.events().publish(
    ("Transferred", "from", "to", "token_id", "amount"),
    (from, to, token_id, amount),
);
```

## Usage Examples

### Successful Student-to-Student Transfer

```rust
// Both students must have Role::Student in certificate contract
contract.transfer(&student_a, &student_b, &1, &50);
```

### Failed Transfer - Non-Student Recipient

```rust
// This will fail with NotStudent error
contract.transfer(&student_a, &non_student, &1, &50);
```

## Security Considerations

### 🔒 **Whitelisted System**

- Only verified students can participate in transfers
- Prevents tokens from leaving the educational ecosystem
- Maintains token value within intended user base

### 🛡️ **Cross-Contract Security**

- Secure integration with certificate contract's role system
- Proper error handling for cross-contract calls
- No single point of failure in verification process

### 💾 **Storage Optimization**

- Removes zero-balance entries to save gas
- Efficient balance updates with minimal storage operations
- Follows existing token contract patterns

## Testing Coverage

### ✅ **Comprehensive Test Suite**

- Transfer between verified students succeeds
- Insufficient balance transfers fail appropriately
- Zero amount transfers are rejected
- Balance updates work correctly
- Zero-balance entries are properly cleaned up

### 🧪 **Test Results**

```bash
cargo test token
# 17 tests passed, 0 failed
```

## Integration Benefits

### 🎓 **Educational Ecosystem**

- Ensures tokens remain within student community
- Supports token-based educational incentives
- Maintains ecosystem integrity

### 🔄 **Backward Compatibility**

- Fully compatible with existing minting and burning
- No changes to current token structure
- Seamless upgrade path

### 📈 **Scalability**

- Efficient verification process
- Minimal gas overhead for transfers
- Scales with growing student base

## Level: Intermediate ✅

This implementation provides a secure, efficient, and well-integrated whitelisted transfer system
suitable for production educational token ecosystems.

## Next Steps

1. **PR Review**: Visit
   https://github.com/success-OG/Web3-Student-Lab/pull/new/feat/restricted-transfer
2. **Integration Testing**: Test with live certificate contract
3. **Documentation**: Update user guides for transfer functionality
