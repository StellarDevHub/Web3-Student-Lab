# Backend Integration Guide - Certificate Revocation & Verification

## Quick Start

The certificate revocation and verification system provides three main operations:

1. **Revoke** - Admin operation to revoke certificates
2. **Verify** - Public operation to check certificate status
3. **Query History** - Public operation to view revocation audit trail

## Contract Functions

### 1. Revoke Certificate

**Function**: `revoke_certificate(caller, token_id, reason, notes)`

**Authorization**: Requires caller to be governance admin

**Parameters**:
```typescript
interface RevokeRequest {
  caller: Address;           // Must be governance admin
  token_id: u128;           // Certificate to revoke
  reason: RevocationReason; // See reason types below
  notes: String;            // Context (max 512 bytes)
}
```

**Revocation Reasons**:
```typescript
type RevocationReason =
  | "AcademicDishonesty"      // Student plagiarism/cheating
  | "IssuedInError"           // Administrative error
  | "StudentRequest"          // Student-initiated revocation
  | "CourseInvalidated"       // Course no longer accredited
  | "FraudulentActivity"      // Credential misuse
  | { Other: string };        // Custom reason
```

**Example - TypeScript**:
```typescript
// Revoke for academic dishonesty
const result = await contract.revoke_certificate({
  caller: adminAddress,
  token_id: 12345,
  reason: "AcademicDishonesty",
  notes: "Plagiarism detected in final project submission"
});

// Custom reason
const result = await contract.revoke_certificate({
  caller: adminAddress,
  token_id: 12346,
  reason: { Other: "Certificate holder deceased" },
  notes: "Family notified on 2024-01-15"
});
```

**Example - Node.js**:
```javascript
const xdr = require('js-xdr');
const { ContractAbi, ContractClient } = require('@stellar/js-stellar-sdk');

async function revokeCertificate(contractId, adminKey, tokenId, reason, notes) {
  const contract = new ContractClient(contractId, networkPassphrase);

  const transaction = contract.tx.revoke_certificate({
    caller: adminKey.publicKey(),
    token_id: tokenId,
    reason: reason,
    notes: notes
  });

  const result = await transaction.signAndSend(adminKey);
  return result;
}
```

**Events Emitted**:
```typescript
// Event: v2_certificate_revoked
{
  token_id: u128,
  revoked_by: Address,
  reason: String
}
```

**Errors**:
- `Unauthorized` - Caller is not admin
- `CertificateNotFound` - Certificate doesn't exist
- `AlreadyRevoked` - Certificate already revoked
- `StringTooLong` - Notes exceed 512 bytes

---

### 2. Verify Certificate (Public)

**Function**: `verify_certificate(token_id)`

**Authorization**: None (public function)

**Returns**:
```typescript
interface VerificationResult {
  is_valid: boolean;                    // Valid and active
  status: CertificateStatus;            // Current state
  owner: Address;                       // Certificate holder
  metadata: CertificateMetadata;        // Course details
  revocation_info: RevocationRecord | null;  // If revoked
  verification_timestamp: u64;          // When verified
}

type CertificateStatus =
  | "Active"
  | "Revoked"
  | "Reissued"
  | "Superseded";

interface CertificateMetadata {
  student: Address;
  course_symbol: String;
  course_name: String;
  issue_date: u64;
  did: String | null;  // W3C Decentralized Identifier
}

interface RevocationRecord {
  token_id: u128;
  revoked_at: u64;
  revoked_by: Address;
  reason: RevocationReason;
  notes: String;
  original_mint_date: u64;
}
```

**Example - TypeScript**:
```typescript
// Verify certificate
const verification = await contract.verify_certificate(12345);

if (verification.is_valid) {
  console.log('✓ Certificate is VALID');
  console.log(`  Owner: ${verification.owner}`);
  console.log(`  Course: ${verification.metadata.course_name}`);
  console.log(`  Issued: ${new Date(verification.metadata.issue_date * 1000)}`);
} else if (verification.status === 'Revoked') {
  console.log('✗ Certificate is REVOKED');
  console.log(`  Reason: ${verification.revocation_info.reason}`);
  console.log(`  Revoked: ${new Date(verification.revocation_info.revoked_at * 1000)}`);
  console.log(`  By: ${verification.revocation_info.revoked_by}`);
  console.log(`  Details: ${verification.revocation_info.notes}`);
}
```

**Example - REST API Wrapper**:
```typescript
// Express endpoint for verification
app.get('/api/certificates/:tokenId/verify', async (req, res) => {
  try {
    const verification = await contract.verify_certificate(
      parseInt(req.params.tokenId)
    );

    res.json({
      tokenId: req.params.tokenId,
      isValid: verification.is_valid,
      status: verification.status,
      owner: verification.owner,
      course: verification.metadata.course_name,
      issuedAt: verification.metadata.issue_date,
      ...(verification.revocation_info && {
        revokedAt: verification.revocation_info.revoked_at,
        revokedBy: verification.revocation_info.revoked_by,
        revocationReason: verification.revocation_info.reason,
        revocationNotes: verification.revocation_info.notes
      })
    });
  } catch (error) {
    res.status(404).json({ error: 'Certificate not found' });
  }
});
```

**Events Emitted**:
```typescript
// Event: v2_certificate_verified
{
  token_id: u128,
  is_valid: boolean,
  status: String  // "Active", "Revoked", "Reissued", or "Superseded"
}
```

**Errors**:
- `CertificateNotFound` - Token ID doesn't exist

---

### 3. Get Revocation History (Public)

**Function**: `get_revocation_history(token_id)`

**Authorization**: None (public function)

**Returns**: Array of `RevocationRecord`

**Example - TypeScript**:
```typescript
// Get full audit trail
const history = await contract.get_revocation_history(12345);

if (history.length === 0) {
  console.log('No revocations on record');
} else {
  console.log(`Certificate has ${history.length} revocation event(s):`);
  history.forEach((record, index) => {
    console.log(`\n${index + 1}. ${new Date(record.revoked_at * 1000).toISOString()}`);
    console.log(`   Revoked by: ${record.revoked_by}`);
    console.log(`   Reason: ${record.reason}`);
    console.log(`   Notes: ${record.notes}`);
  });
}
```

**Example - Audit Report Generator**:
```typescript
async function generateAuditReport(tokenId) {
  const state = await contract.get_certificate_state(tokenId);
  const history = await contract.get_revocation_history(tokenId);

  return {
    certificateId: tokenId,
    currentStatus: state?.status || 'Unknown',
    minted: new Date((state?.minted_at || 0) * 1000),
    revocationCount: history.length,
    revocations: history.map(r => ({
      timestamp: new Date(r.revoked_at * 1000),
      revokedBy: r.revoked_by,
      reason: r.reason,
      notes: r.notes
    }))
  };
}
```

---

### 4. Get Certificate State (Public)

**Function**: `get_certificate_state(token_id)`

**Authorization**: None (public function)

**Returns**:
```typescript
interface CertificateState {
  status: CertificateStatus;
  minted_at: u64;
  revoked_at: u64 | null;
  reissued_token_id: u128 | null;
  superseded_by: u128 | null;
}
```

---

### 5. Reissue Certificate

**Function**: `reissue_certificate(caller, old_token_id, new_recipient, reason)`

**Authorization**: Requires caller to be governance admin

**Parameters**:
```typescript
interface ReissueRequest {
  caller: Address;      // Must be governance admin
  old_token_id: u128;   // Certificate to replace
  new_recipient: Address; // New certificate holder
  reason: String;       // Why reissuing (max 256 bytes)
}
```

**Returns**: New certificate token ID (u128)

**Example**:
```typescript
// Reissue for name correction
const newTokenId = await contract.reissue_certificate({
  caller: adminAddress,
  old_token_id: 12345,
  new_recipient: studentAddress,
  reason: "Student name corrected from 'John Smith' to 'Jon Smythe'"
});

console.log(`New certificate issued: ${newTokenId}`);
// Old certificate now marked as Reissued
// New certificate marked as Active
```

**Events Emitted**:
```typescript
// Event: v2_certificate_reissued
{
  old_token_id: u128,
  new_token_id: u128,
  reason: String
}
```

---

## Common Use Cases

### Use Case 1: Employer Verification

```typescript
async function verifyEmployeeCertificate(tokenId) {
  try {
    const result = await contract.verify_certificate(tokenId);

    return {
      isValid: result.is_valid,
      holderAddress: result.owner,
      courseName: result.metadata.course_name,
      issuedDate: new Date(result.metadata.issue_date * 1000),
      status: result.status,
      verifiedAt: new Date(result.verification_timestamp * 1000)
    };
  } catch (error) {
    return { error: 'Certificate verification failed' };
  }
}
```

### Use Case 2: Admin Revocation Workflow

```typescript
async function revokeCertificateForAcademicDishonesty(
  adminAddress,
  tokenId,
  detailedNotes
) {
  // Log the action
  console.log(`Revoking certificate ${tokenId} for academic dishonesty`);

  // Execute revocation
  const result = await contract.revoke_certificate({
    caller: adminAddress,
    token_id: tokenId,
    reason: "AcademicDishonesty",
    notes: detailedNotes
  });

  // Emit system notification
  await notificationService.sendEmail({
    to: adminAddress,
    subject: 'Certificate Revoked',
    body: `Certificate ${tokenId} has been revoked for academic dishonesty`
  });

  return result;
}
```

### Use Case 3: Compliance Audit

```typescript
async function performComplianceAudit() {
  const certificateIds = await getCertificateList();
  const auditResults = [];

  for (const tokenId of certificateIds) {
    const verification = await contract.verify_certificate(tokenId);
    const history = await contract.get_revocation_history(tokenId);

    auditResults.push({
      tokenId,
      status: verification.status,
      isValid: verification.is_valid,
      revokedCount: history.length,
      latestRevocation: history[history.length - 1] || null
    });
  }

  return auditResults;
}
```

### Use Case 4: Student Portal - Check Status

```typescript
async function studentCheckCertificateStatus(studentAddress, tokenId) {
  const verification = await contract.verify_certificate(tokenId);

  if (verification.owner !== studentAddress) {
    throw new Error('Not authorized to view this certificate');
  }

  return {
    status: verification.status,
    isActive: verification.is_valid,
    course: verification.metadata.course_name,
    issuedDate: verification.metadata.issue_date,
    revokedReason: verification.revocation_info?.reason || null
  };
}
```

---

## Error Handling

```typescript
async function safeVerify(tokenId) {
  try {
    return await contract.verify_certificate(tokenId);
  } catch (error) {
    if (error.message.includes('CertificateNotFound')) {
      return { error: 'Certificate does not exist' };
    } else if (error.message.includes('InvalidOperation')) {
      return { error: 'Invalid operation' };
    } else {
      return { error: 'Unknown error verifying certificate' };
    }
  }
}
```

---

## Gas Considerations

- **Verify**: ~40-50k gas (efficient for public queries)
- **Revoke**: ~80-100k gas (admin operations)
- **History Query**: Varies with revocation count (O(n))
- **Reissue**: ~130-150k gas (creates new state)

Suitable for:
- ✅ High-volume verification requests
- ✅ Real-time employer queries
- ✅ Dashboard displays
- ❌ Heavy batch operations (consider caching)

---

## Testing

```typescript
// Test revocation flow
const adminAddress = 'G...'; // Governance admin
const studentAddress = 'G...';
const tokenId = 12345n;

// Verify initially active
let result = await contract.verify_certificate(tokenId);
assert(result.is_valid === true);

// Admin revokes
await contract.revoke_certificate({
  caller: adminAddress,
  token_id: tokenId,
  reason: "IssuedInError",
  notes: "Testing revocation"
});

// Verify now shows as revoked
result = await contract.verify_certificate(tokenId);
assert(result.is_valid === false);
assert(result.status === "Revoked");
assert(result.revocation_info !== null);

// Get history
const history = await contract.get_revocation_history(tokenId);
assert(history.length === 1);
```

---

## Production Considerations

1. **Caching**: Cache verification results for 1-5 minutes
2. **Rate Limiting**: Implement rate limits on revocation operations
3. **Monitoring**: Log all revocation events to analytics
4. **Webhooks**: Notify systems when certificates are revoked
5. **Backup**: Archive revocation records for compliance
6. **Audit Trail**: Maintain detailed logs of all operations

---

## API Documentation

For auto-generated API docs, see:
- [Soroban Contract ABI](./abi.json)
- [Contract Specification](./CONTRACT_SPEC.md)
