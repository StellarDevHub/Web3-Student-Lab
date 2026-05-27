# Batch Minting Deployment Checklist

## Pre-Deployment

### Code Review
- [x] Contract compiles successfully
- [x] All new functions implemented
- [x] Error handling comprehensive
- [x] Security measures in place
- [x] Documentation complete

### Testing
- [x] Unit tests written
- [x] Edge cases covered
- [x] Gas efficiency tests
- [ ] Integration tests on testnet
- [ ] Load testing with 100 certificates
- [ ] Security audit (recommended)

### Documentation
- [x] Implementation guide created
- [x] Quick reference guide created
- [x] Gas benchmarks documented
- [x] API documentation complete
- [x] Usage examples provided

## Deployment Steps

### 1. Build Contract
```bash
cd Web3-Student-Lab/contracts
cargo build --release --target wasm32-unknown-unknown
```

### 2. Optimize WASM
```bash
soroban contract optimize \
  --wasm target/wasm32-unknown-unknown/release/soroban_certificate_contract.wasm
```

### 3. Deploy to Testnet
```bash
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/soroban_certificate_contract.wasm \
  --source <ADMIN_SECRET_KEY> \
  --rpc-url https://soroban-testnet.stellar.org:443 \
  --network-passphrase "Test SDF Network ; September 2015"
```

### 4. Initialize Contract
```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --source <ADMIN_SECRET_KEY> \
  --rpc-url https://soroban-testnet.stellar.org:443 \
  --network-passphrase "Test SDF Network ; September 2015" \
  -- \
  init \
  --admin_a <ADMIN_A_ADDRESS> \
  --admin_b <ADMIN_B_ADDRESS> \
  --admin_c <ADMIN_C_ADDRESS>
```

### 5. Grant Instructor Role
```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --source <ADMIN_SECRET_KEY> \
  -- \
  grant_role \
  --caller <ADMIN_ADDRESS> \
  --account <INSTRUCTOR_ADDRESS> \
  --role Instructor
```

## Testing on Testnet

### Test 1: Single Certificate
```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --source <INSTRUCTOR_SECRET_KEY> \
  -- \
  issue \
  --instructor <INSTRUCTOR_ADDRESS> \
  --course_symbol "TEST" \
  --students '["<STUDENT_ADDRESS>"]' \
  --course_name "Test Course"
```

### Test 2: Small Batch (10 certificates)
```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --source <INSTRUCTOR_SECRET_KEY> \
  -- \
  batch_issue \
  --instructor <INSTRUCTOR_ADDRESS> \
  --symbols '["SYM1", "SYM2", ..., "SYM10"]' \
  --students '["<ADDR1>", "<ADDR2>", ..., "<ADDR10>"]' \
  --course "Batch Test"
```

### Test 3: Large Batch (50 certificates)
```bash
# Prepare recipients JSON file
soroban contract invoke \
  --id <CONTRACT_ID> \
  --source <INSTRUCTOR_SECRET_KEY> \
  -- \
  mint_batch_certificates \
  --instructor <INSTRUCTOR_ADDRESS> \
  --recipients @recipients_50.json \
  --course_name "Large Batch Test"
```

### Test 4: Maximum Batch (100 certificates)
```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --source <INSTRUCTOR_SECRET_KEY> \
  -- \
  mint_batch_certificates \
  --instructor <INSTRUCTOR_ADDRESS> \
  --recipients @recipients_100.json \
  --course_name "Max Batch Test"
```

### Test 5: Error Cases
- [ ] Test empty batch (should fail)
- [ ] Test batch > 100 (should fail)
- [ ] Test without instructor role (should fail)
- [ ] Test when paused (should fail)
- [ ] Test exceeding mint cap (should fail)

## Gas Benchmarking

### Measure Gas Costs
```bash
# For each test, record:
# - Transaction hash
# - Gas used
# - Number of certificates
# - Gas per certificate

# Calculate:
# - Average gas per certificate
# - Total gas for batch
# - Savings vs single minting
```

### Expected Results
| Batch Size | Expected Gas | Max Gas | Status |
|------------|--------------|---------|--------|
| 1 | ~150k | 200k | [ ] |
| 10 | ~500k | 600k | [ ] |
| 50 | ~2.25M | 2.5M | [ ] |
| 100 | ~4M | 4.5M | [ ] |

## Performance Validation

### Metrics to Collect
- [ ] Transaction confirmation time
- [ ] Gas used per transaction
- [ ] Success rate
- [ ] Error rate
- [ ] Average gas per certificate

### Performance Targets
- [ ] 100 certificates in < 5 seconds
- [ ] Gas per certificate < 50k (for batches > 10)
- [ ] Success rate > 99%
- [ ] No transaction failures due to gas limits

## Security Validation

### Authorization Tests
- [ ] Only instructors can mint
- [ ] Admins can pause/unpause
- [ ] Role-based access control works
- [ ] Unauthorized access is blocked

### Reentrancy Tests
- [ ] Lock prevents concurrent operations
- [ ] Lock is released on success
- [ ] Lock is released on error
- [ ] No deadlock scenarios

### Input Validation Tests
- [ ] Batch size limits enforced
- [ ] String length limits enforced
- [ ] Grade validation works
- [ ] Course name validation works

## Integration Testing

### Frontend Integration
- [ ] Batch minting UI works
- [ ] Grade input fields work
- [ ] Progress indicators work
- [ ] Error messages display correctly
- [ ] Success confirmations work

### Backend Integration
- [ ] API endpoints updated
- [ ] Database schema updated
- [ ] Event listeners configured
- [ ] Webhook notifications work

## Monitoring Setup

### Event Monitoring
```bash
# Subscribe to batch minting events
soroban events \
  --id <CONTRACT_ID> \
  --start-ledger <LEDGER> \
  --rpc-url https://soroban-testnet.stellar.org:443
```

### Metrics to Monitor
- [ ] Batch minting frequency
- [ ] Average batch size
- [ ] Gas consumption trends
- [ ] Error rates
- [ ] Transaction success rates

## Rollback Plan

### If Issues Arise
1. Pause contract immediately
   ```bash
   soroban contract invoke \
     --id <CONTRACT_ID> \
     --source <ADMIN_SECRET_KEY> \
     -- \
     set_paused \
     --caller <ADMIN_ADDRESS> \
     --paused true
   ```

2. Investigate issue
   - Check transaction logs
   - Review error messages
   - Analyze gas usage
   - Check contract state

3. Fix and redeploy if needed
   - Update contract code
   - Test on testnet
   - Deploy new version
   - Migrate data if necessary

## Post-Deployment

### Verification
- [ ] Contract deployed successfully
- [ ] All functions accessible
- [ ] Events emitting correctly
- [ ] Gas costs as expected
- [ ] No security issues

### Documentation Updates
- [ ] Update contract address in docs
- [ ] Update API documentation
- [ ] Update integration guides
- [ ] Publish gas benchmarks
- [ ] Update changelog

### Communication
- [ ] Notify development team
- [ ] Update frontend team
- [ ] Inform stakeholders
- [ ] Publish release notes
- [ ] Update user documentation

## Mainnet Deployment

### Prerequisites
- [ ] All testnet tests passed
- [ ] Security audit completed (recommended)
- [ ] Gas costs validated
- [ ] Performance validated
- [ ] Documentation complete

### Mainnet Steps
1. [ ] Build optimized WASM
2. [ ] Deploy to mainnet
3. [ ] Initialize contract
4. [ ] Grant roles
5. [ ] Test with small batch
6. [ ] Monitor for 24 hours
7. [ ] Enable for production use

### Mainnet Monitoring
- [ ] Set up alerts for errors
- [ ] Monitor gas usage
- [ ] Track transaction success rate
- [ ] Monitor event emissions
- [ ] Set up logging

## Success Criteria

### Deployment Success
- [x] Contract compiles without errors
- [ ] Deploys to testnet successfully
- [ ] All functions work as expected
- [ ] Gas costs within limits
- [ ] No security vulnerabilities

### Performance Success
- [ ] 70%+ gas savings achieved
- [ ] 100 certificates mint successfully
- [ ] Transaction time < 5 seconds
- [ ] No gas limit failures
- [ ] Success rate > 99%

### Integration Success
- [ ] Frontend integration complete
- [ ] Backend integration complete
- [ ] Event monitoring working
- [ ] Documentation complete
- [ ] Team trained on new features

## Sign-off

### Technical Review
- [ ] Lead Developer: _______________
- [ ] Security Reviewer: _______________
- [ ] QA Lead: _______________

### Business Review
- [ ] Product Manager: _______________
- [ ] Stakeholder: _______________

### Deployment Approval
- [ ] Technical Lead: _______________
- [ ] Project Manager: _______________

Date: _______________

## Notes

### Known Issues
- Enrollment.rs tests have pre-existing failures (unrelated to batch minting)
- MAX_GAS_PER_BATCH constant unused (kept for documentation)

### Future Enhancements
- Progressive batch processing for > 100 certificates
- Gas estimation API
- Batch revocation support
- Enhanced metadata templates

## Resources

- Implementation Guide: `BATCH_MINTING_IMPLEMENTATION.md`
- Quick Reference: `BATCH_MINTING_QUICK_REFERENCE.md`
- Gas Benchmarks: `GAS_BENCHMARKS.md`
- Summary: `BATCH_MINTING_SUMMARY.md`
- Contract Source: `src/lib.rs`
- Tests: `src/tests.rs`

## Support Contacts

- Technical Issues: [Development Team]
- Security Concerns: [Security Team]
- Deployment Questions: [DevOps Team]
- Business Questions: [Product Team]
