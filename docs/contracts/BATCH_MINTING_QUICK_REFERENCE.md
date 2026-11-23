# Batch Minting Quick Reference

## Quick Start

### Import Required Types
```rust
use soroban_certificate_contract::{
    Certificate,
    RecipientData,
    CertificateContractClient,
};
```

## Function Signatures

### 1. batch_issue (Enhanced)
Simple batch minting with same course for all students.

```rust
pub fn batch_issue(
    env: Env,
    instructor: Address,
    symbols: Vec<Symbol>,      // One per student
    students: Vec<Address>,     // One per symbol
    course: String,             // Shared course name
) -> Vec<Certificate>
```

**Limits:**
- Max 100 certificates
- symbols.len() must equal students.len()
- Requires Instructor role

### 2. mint_batch_certificates (New)
Advanced batch minting with individual metadata per student.

```rust
pub fn mint_batch_certificates(
    env: Env,
    instructor: Address,
    recipients: Vec<RecipientData>,  // Individual metadata
    course_name: String,              // Shared course name
) -> Vec<Certificate>
```

**Limits:**
- Max 100 certificates
- Requires Instructor role
- Grade max 10 characters

## Data Structures

### RecipientData
```rust
pub struct RecipientData {
    pub address: Address,           // Student address
    pub course_symbol: Symbol,      // Individual course symbol
    pub grade: Option<String>,      // Optional grade (max 10 chars)
}
```

### Certificate (Updated)
```rust
pub struct Certificate {
    pub course_symbol: Symbol,
    pub student: Address,
    pub course_name: String,
    pub issue_date: u64,
    pub did: Option<String>,
    pub revoked: bool,
    pub grade: Option<String>,      // NEW: Optional grade
}
```

## Error Codes

| Error | Code | Description |
|-------|------|-------------|
| EmptyBatch | 22 | No recipients provided |
| BatchTooLarge | 21 | More than 100 certificates |
| MintCapExceeded | 5 | Exceeds mint cap limit |
| NotInstructor | 10 | Caller lacks Instructor role |
| ContractPaused | 9 | Contract is paused |
| InvalidAmount | 17 | Mismatched array lengths |
| StringTooLong | 18 | String exceeds max length |

## Usage Examples

### Example 1: Simple Batch (batch_issue)
```rust
let symbols = vec![
    &env,
    symbol_short!("WEB3"),
    symbol_short!("RUST"),
    symbol_short!("SMART"),
];

let students = vec![
    &env,
    student1_address,
    student2_address,
    student3_address,
];

let course = String::from_str(&env, "Blockchain Basics");

let certs = client.batch_issue(
    &instructor,
    &symbols,
    &students,
    &course
);
```

### Example 2: With Grades (mint_batch_certificates)
```rust
let recipients = vec![
    &env,
    RecipientData {
        address: student1,
        course_symbol: symbol_short!("WEB3"),
        grade: Some(String::from_str(&env, "A+")),
    },
    RecipientData {
        address: student2,
        course_symbol: symbol_short!("RUST"),
        grade: Some(String::from_str(&env, "A")),
    },
    RecipientData {
        address: student3,
        course_symbol: symbol_short!("SMART"),
        grade: None,  // No grade
    },
];

let course = String::from_str(&env, "Advanced Blockchain");

let certs = client.mint_batch_certificates(
    &instructor,
    &recipients,
    &course
);
```

### Example 3: Large Cohort (50 students)
```rust
let mut recipients = Vec::new(&env);

for i in 0..50 {
    recipients.push_back(RecipientData {
        address: students[i].clone(),
        course_symbol: Symbol::new(&env, &format!("CERT{}", i)),
        grade: Some(String::from_str(&env, "B+")),
    });
}

let certs = client.mint_batch_certificates(
    &instructor,
    &recipients,
    &String::from_str(&env, "Large Cohort")
);
```

## Gas Cost Comparison

| Batch Size | Single Mint Total | Batch Mint Total | Savings |
|------------|-------------------|------------------|---------|
| 1 | 150k | 150k | 0% |
| 10 | 1.5M | 500k | 66% |
| 50 | 7.5M | 2.25M | 70% |
| 100 | 15M | 4M | 73% |

## Best Practices

### 1. Choose the Right Function
- Use `batch_issue` for simple batches with same course
- Use `mint_batch_certificates` for individual metadata

### 2. Optimize Batch Size
- Recommended: 50-75 certificates per batch
- Maximum: 100 certificates
- Consider gas costs vs transaction count

### 3. Error Handling
```rust
match client.try_mint_batch_certificates(&instructor, &recipients, &course) {
    Ok(certs) => {
        // Success - process certificates
    },
    Err(e) => {
        // Handle error
        match e {
            CertError::BatchTooLarge => { /* Split into smaller batches */ },
            CertError::MintCapExceeded => { /* Request cap increase */ },
            _ => { /* Handle other errors */ }
        }
    }
}
```

### 4. Validation Before Submission
```rust
// Validate batch size
assert!(recipients.len() <= 100, "Batch too large");
assert!(recipients.len() > 0, "Empty batch");

// Validate grades
for recipient in recipients.iter() {
    if let Some(grade) = &recipient.grade {
        assert!(grade.len() <= 10, "Grade too long");
    }
}

// Validate course name
assert!(course_name.len() <= 128, "Course name too long");
```

## Events to Monitor

### Individual Certificate Events
```rust
Topic: ("v1_batch_cert_issued", "batch_cert_issued", course_symbol)
Data: (student_address, course_name)
```

### Batch Completion Events
```rust
// For mint_batch_certificates
Topic: ("v1_batch_mint_completed")
Data: (instructor, batch_size, course_name)

// For batch_issue
Topic: ("v1_batch_issue_completed")
Data: (instructor, total_certificates, course_name)
```

## Testing Your Integration

### Unit Test Template
```rust
#[test]
fn test_batch_minting() {
    let env = Env::default();
    env.mock_all_auths();
    
    let client = CertificateContractClient::new(&env, &contract_id);
    let instructor = Address::generate(&env);
    
    // Grant instructor role
    client.grant_role(&admin, &instructor, &Role::Instructor);
    
    // Create recipients
    let recipients = vec![
        &env,
        RecipientData {
            address: Address::generate(&env),
            course_symbol: symbol_short!("TEST"),
            grade: Some(String::from_str(&env, "A")),
        },
    ];
    
    // Mint certificates
    let certs = client.mint_batch_certificates(
        &instructor,
        &recipients,
        &String::from_str(&env, "Test Course")
    );
    
    // Verify
    assert_eq!(certs.len(), 1);
    assert_eq!(certs.get(0).unwrap().grade, Some(String::from_str(&env, "A")));
}
```

## Common Issues

### Issue 1: BatchTooLarge Error
**Solution:** Split into multiple batches of ≤100 certificates

```rust
const BATCH_SIZE: usize = 100;
for chunk in recipients.chunks(BATCH_SIZE) {
    client.mint_batch_certificates(&instructor, &chunk.to_vec(), &course);
}
```

### Issue 2: MintCapExceeded
**Solution:** Request mint cap increase via governance

```rust
// Propose new cap
let proposal_id = client.propose_action(
    &admin,
    &PendingAdminAction::SetMintCap(new_cap)
);

// Get approval from second admin
client.approve_action(&admin2, &proposal_id);
```

### Issue 3: Gas Estimation
**Solution:** Estimate gas before submission

```rust
// Rough estimation
let estimated_gas = batch_size * 45_000; // ~45k per cert
assert!(estimated_gas < 10_000_000, "May exceed gas limit");
```

## Performance Tips

1. **Batch Size**: Use 50-75 for optimal gas/transaction balance
2. **Pre-validation**: Validate all inputs before calling contract
3. **Parallel Processing**: Process multiple batches in parallel if needed
4. **Event Monitoring**: Subscribe to batch completion events
5. **Error Recovery**: Implement retry logic for failed batches

## Support

For issues or questions:
- Check the full implementation guide: `BATCH_MINTING_IMPLEMENTATION.md`
- Review test cases in `src/tests.rs`
- Consult the main README for project setup

## Version

- Contract Version: 0.0.0
- Soroban SDK: 22.0.0
- Last Updated: 2024
