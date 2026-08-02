# Migration Guide: Upgrading to Upgradeable Contract

## Overview

This guide helps you migrate from the original certificate contract to the new upgradeable version. The migration preserves all existing certificates and adds powerful upgrade capabilities.

## Pre-Migration Checklist

- [ ] Backup all contract data
- [ ] Document current contract address
- [ ] List all governance admin addresses
- [ ] Export certificate data for verification
- [ ] Test migration on testnet first
- [ ] Notify all stakeholders
- [ ] Schedule maintenance window

## Migration Strategy

### Option 1: Fresh Deployment (Recommended for New Projects)

Deploy the new upgradeable contract from scratch.

**Pros:**
- Clean start with all new features
- No migration complexity
- Full upgrade capabilities from day one

**Cons:**
- Existing certificates not automatically migrated
- Need to re-issue certificates or migrate data

**Steps:**
1. Deploy new contract
2. Initialize with governance admins
3. Migrate certificate data (if needed)
4. Update frontend/backend to use new contract

### Option 2: Upgrade Existing Contract

Use the existing `upgrade()` function to upgrade to the new version.

**Pros:**
- All existing certificates preserved
- Seamless transition
- No data migration needed

**Cons:**
- Requires existing contract to have upgrade function
- One-time upgrade process

**Steps:**
1. Build new WASM
2. Upload to network
3. Call upgrade with 2-of-3 admins
4. Verify upgrade successful

## Detailed Migration Steps

### Step 1: Preparation

#### 1.1 Build New Contract
```bash
cd contracts
cargo build --target wasm32-unknown-unknown --release
```

#### 1.2 Optimize WASM
```bash
soroban contract optimize \
  --wasm target/wasm32-unknown-unknown/release/soroban_certificate_contract.wasm
```

#### 1.3 Upload to Network
```bash
soroban contract upload \
  --wasm target/wasm32-unknown-unknown/release/soroban_certificate_contract.wasm \
  --network testnet \
  --source <ADMIN_SECRET_KEY>
```

Save the returned WASM hash.

### Step 2: Upgrade Execution

#### Option A: Using Existing upgrade() Function

```bash
# Call upgrade with 2 different admin signatures
soroban contract invoke \
  --id <EXISTING_CONTRACT_ID> \
  --network testnet \
  -- upgrade \
  --signer_a <ADMIN_A_ADDRESS> \
  --signer_b <ADMIN_B_ADDRESS> \
  --new_wasm_hash <NEW_WASM_HASH>
```

#### Option B: Using New Proposal System (After First Upgrade)

```bash
# 1. Propose upgrade with time-lock
soroban contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- propose_upgrade_with_timelock \
  --caller <ADMIN_A> \
  --new_wasm_hash <NEW_WASM_HASH> \
  --changelog "Upgrade to v2.0.0"

# 2. Approve upgrade
soroban contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- approve_pending_upgrade \
  --caller <ADMIN_B>

# 3. Wait 24 hours...

# 4. Execute upgrade
soroban contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- execute_pending_upgrade \
  --caller <ADMIN_A>
```

### Step 3: Verification

#### 3.1 Verify Contract Version
```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- get_current_version
```

Expected output: `1` (or higher)

#### 3.2 Verify Existing Certificates
```bash
# Test reading an existing certificate
soroban contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- get_certificate \
  --course_symbol <COURSE_SYMBOL> \
  --student <STUDENT_ADDRESS>
```

Verify the certificate data is intact.

#### 3.3 Test New Functions
```bash
# Test version history
soroban contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- get_version_history

# Test admin functions
soroban contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- get_admin_policy \
  --address <ADMIN_ADDRESS>
```

### Step 4: Post-Migration Setup

#### 4.1 Initialize Admin Roles (Optional)
```bash
# Add additional admins with specific roles
soroban contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- add_admin_with_role \
  --caller <OWNER> \
  --new_admin <NEW_ADMIN_ADDRESS> \
  --role Admin
```

#### 4.2 Update Frontend
Update your frontend code to use new functions:

```typescript
// Before
const version = await contract.get_event_version();

// After - New functions available
const currentVersion = await contract.get_current_version();
const history = await contract.get_version_history();
const pending = await contract.get_pending_upgrade();
```

#### 4.3 Update Backend
Update backend services to monitor new events:

```typescript
// Subscribe to new upgrade events
const events = [
  'v1_upgrade_proposed',
  'v1_upgrade_approved',
  'v1_upgrade_executed',
  'v1_emergency_rollback',
  'v1_admin_added',
  'v1_admin_removed',
];

// Monitor and alert on upgrade activities
```

## Data Migration (If Needed)

If deploying a fresh contract and need to migrate certificates:

### Export Existing Certificates

```bash
# Create export script
cat > export_certificates.sh << 'EOF'
#!/bin/bash

CONTRACT_ID="<OLD_CONTRACT_ID>"
OUTPUT_FILE="certificates_export.json"

# Get all students (you'll need to maintain this list)
STUDENTS=(
  "STUDENT_ADDRESS_1"
  "STUDENT_ADDRESS_2"
  # ... more students
)

echo "[" > $OUTPUT_FILE

for student in "${STUDENTS[@]}"; do
  # Get certificates for each student
  soroban contract invoke \
    --id $CONTRACT_ID \
    --network testnet \
    -- get_certificates_by_student \
    --student $student >> $OUTPUT_FILE
done

echo "]" >> $OUTPUT_FILE
EOF

chmod +x export_certificates.sh
./export_certificates.sh
```

### Import to New Contract

```bash
# Create import script
cat > import_certificates.sh << 'EOF'
#!/bin/bash

CONTRACT_ID="<NEW_CONTRACT_ID>"
ADMIN="<ADMIN_ADDRESS>"

# Read exported certificates
while IFS= read -r cert; do
  # Parse certificate data
  COURSE_SYMBOL=$(echo $cert | jq -r '.course_symbol')
  STUDENT=$(echo $cert | jq -r '.student')
  COURSE_NAME=$(echo $cert | jq -r '.course_name')
  
  # Re-issue certificate
  soroban contract invoke \
    --id $CONTRACT_ID \
    --network testnet \
    -- issue \
    --instructor $ADMIN \
    --course_symbol $COURSE_SYMBOL \
    --students "[$STUDENT]" \
    --course_name "$COURSE_NAME"
done < certificates_export.json
EOF

chmod +x import_certificates.sh
./import_certificates.sh
```

## Rollback Plan

If issues occur during migration:

### Immediate Rollback (Within 24 hours)

```bash
# Cancel pending upgrade
soroban contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- cancel_pending_upgrade \
  --caller <ADMIN>
```

### Emergency Rollback (After Upgrade)

```bash
# Rollback to previous version
soroban contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- emergency_rollback \
  --signer_a <ADMIN_A> \
  --signer_b <ADMIN_B> \
  --target_version <PREVIOUS_VERSION>
```

## Testing Checklist

Before production migration:

### Testnet Testing
- [ ] Deploy to testnet
- [ ] Upgrade existing testnet contract
- [ ] Verify all certificates preserved
- [ ] Test new upgrade functions
- [ ] Test admin management
- [ ] Test rollback capability
- [ ] Verify event emission
- [ ] Load test with multiple operations

### Integration Testing
- [ ] Frontend integration
- [ ] Backend integration
- [ ] Event monitoring
- [ ] Error handling
- [ ] User workflows
- [ ] Admin workflows

### Security Testing
- [ ] Multi-sig validation
- [ ] Time-lock enforcement
- [ ] Permission checks
- [ ] Unauthorized access attempts
- [ ] Edge cases
- [ ] Attack scenarios

## Common Issues and Solutions

### Issue: Upgrade Fails with "Unauthorized"

**Cause:** Caller is not a governance admin

**Solution:**
```bash
# Verify admin status
soroban contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- has_role \
  --account <ADMIN_ADDRESS> \
  --role Admin
```

### Issue: "Time-lock has not expired"

**Cause:** Trying to execute upgrade before 24-hour delay

**Solution:**
```bash
# Check pending upgrade
soroban contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- get_pending_upgrade

# Wait until executable_after timestamp
```

### Issue: Certificates Not Found After Upgrade

**Cause:** Storage keys changed (shouldn't happen with this implementation)

**Solution:**
1. Verify contract address is correct
2. Check if upgrade actually completed
3. Use emergency rollback if needed

### Issue: "Insufficient approvals"

**Cause:** Need 2-of-3 governance admin approval

**Solution:**
```bash
# Get pending upgrade to check approval_mask
soroban contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- get_pending_upgrade

# Have second admin approve
soroban contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- approve_pending_upgrade \
  --caller <ADMIN_B>
```

## Monitoring After Migration

### Key Metrics to Monitor

1. **Contract Version**
   - Current version number
   - Version history
   - Pending upgrades

2. **Certificate Operations**
   - Issue success rate
   - Revoke operations
   - Query performance

3. **Admin Activities**
   - Upgrade proposals
   - Admin changes
   - Permission modifications

4. **Events**
   - All upgrade events
   - Admin events
   - Certificate events

### Monitoring Script

```bash
#!/bin/bash

CONTRACT_ID="<CONTRACT_ID>"

while true; do
  echo "=== Contract Status ==="
  echo "Version: $(soroban contract invoke --id $CONTRACT_ID --network testnet -- get_current_version)"
  echo "Pending Upgrade: $(soroban contract invoke --id $CONTRACT_ID --network testnet -- get_pending_upgrade)"
  echo ""
  
  sleep 300  # Check every 5 minutes
done
```

## Communication Plan

### Before Migration
- [ ] Announce migration schedule
- [ ] Explain new features
- [ ] Provide documentation links
- [ ] Set up support channels
- [ ] Schedule Q&A session

### During Migration
- [ ] Real-time status updates
- [ ] Progress notifications
- [ ] Issue reporting channel
- [ ] Emergency contacts

### After Migration
- [ ] Confirm successful migration
- [ ] Share new documentation
- [ ] Provide usage examples
- [ ] Collect feedback
- [ ] Address issues

## Support Resources

### Documentation
- `UPGRADE_IMPLEMENTATION.md` - Complete guide
- `UPGRADE_QUICK_REFERENCE.md` - Quick commands
- `CONTRACT_UPGRADE.md` - Security considerations

### Testing
- `contracts/src/tests/upgrade_test.rs` - Upgrade tests
- `contracts/src/tests/admin_test.rs` - Admin tests

### Community
- GitHub Issues - Bug reports
- Discord/Telegram - Real-time support
- Documentation - Self-service help

## Timeline Recommendation

### Week 1: Preparation
- Build and test on testnet
- Document current state
- Prepare rollback plan
- Train team

### Week 2: Testnet Migration
- Deploy to testnet
- Run comprehensive tests
- Fix any issues
- Verify all features

### Week 3: Staging
- Deploy to staging environment
- Integration testing
- Performance testing
- Security review

### Week 4: Production
- Schedule maintenance window
- Execute migration
- Monitor closely
- Verify success

## Success Criteria

Migration is successful when:

✅ All existing certificates are accessible
✅ New upgrade functions work correctly
✅ Admin management functions operational
✅ Events are emitted properly
✅ Frontend/backend integrated
✅ No data loss or corruption
✅ Performance is acceptable
✅ Security measures verified

## Conclusion

This migration guide provides a comprehensive path to upgrade your certificate contract. Always test thoroughly on testnet before production migration, and maintain a rollback plan for emergencies.

For questions or issues during migration, refer to the documentation or contact support.

---

**Last Updated:** 2024
**Contract Version:** 1.0.0
**Status:** Ready for Migration
