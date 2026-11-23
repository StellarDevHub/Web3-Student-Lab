# Upgrade System - Quick Reference

## Quick Commands

### Check Current Version
```rust
let version = contract.get_current_version();
```

### Propose Upgrade
```rust
let proposal_id = contract.propose_upgrade_with_timelock(
    &admin,
    &new_wasm_hash,
    &String::from_str(&env, "Changelog here")
);
```

### Approve Upgrade
```rust
contract.approve_pending_upgrade(&admin);
```

### Execute Upgrade (after 24h)
```rust
contract.execute_pending_upgrade(&admin);
```

### Emergency Rollback
```rust
contract.emergency_rollback(&admin_a, &admin_b, &target_version);
```

### Cancel Upgrade
```rust
contract.cancel_pending_upgrade(&admin);
```

## Admin Management

### Add Admin
```rust
contract.add_admin_with_role(&owner, &new_admin, &AdminRole::Admin);
```

### Remove Admin
```rust
contract.remove_admin_role(&owner, &admin);
```

### Check Permission
```rust
let has_perm = contract.check_permission(&address, &Permission::Upgrade);
```

### Transfer Ownership
```rust
contract.transfer_ownership(&owner, &new_owner);
```

## Query Functions

### Get Version History
```rust
let history = contract.get_version_history();
```

### Get Specific Version
```rust
let version = contract.get_version(&1u32);
```

### Get Pending Upgrade
```rust
let pending = contract.get_pending_upgrade();
```

### Get Admin Policy
```rust
let policy = contract.get_admin_policy(&address);
```

## Admin Roles

| Role | Permissions |
|------|-------------|
| **Owner** | All permissions including upgrade, rollback, ownership transfer |
| **Admin** | Mint, revoke, update metadata, pause |
| **Operator** | Read-only access |

## Permissions

- `Upgrade` - Propose and execute upgrades
- `Pause` - Pause/unpause contract
- `Mint` - Issue certificates
- `Revoke` - Revoke certificates
- `UpdateMetadata` - Update certificate metadata
- `GrantRole` - Add new admins
- `RevokeRole` - Remove admins
- `TransferOwnership` - Transfer contract ownership
- `EmergencyPause` - Emergency pause
- `Rollback` - Emergency rollback

## Time-Locks

- **Upgrade Time-Lock:** 24 hours (86400 seconds)
- **Emergency Rollback:** No time-lock (immediate)

## Multi-Signature Requirements

- **Standard Upgrade:** 2-of-3 governance admins
- **Emergency Rollback:** 2-of-3 governance admins
- **Ownership Transfer:** 1 governance admin
- **Mint Cap Change:** 2-of-3 governance admins (via proposal)

## Events

| Event | When Emitted |
|-------|--------------|
| `v1_upgrade_proposed` | Upgrade proposed |
| `v1_upgrade_approved` | Admin approves upgrade |
| `v1_upgrade_executed` | Upgrade executed |
| `v1_upgrade_cancelled` | Upgrade cancelled |
| `v1_emergency_rollback` | Emergency rollback performed |
| `v1_admin_added` | New admin added |
| `v1_admin_removed` | Admin removed |
| `v1_ownership_transferred` | Ownership transferred |

## Error Codes

| Error | Code | Description |
|-------|------|-------------|
| `AlreadyInitialized` | 1 | Contract already initialized |
| `NotInitialized` | 2 | Contract not initialized |
| `Unauthorized` | 3 | Caller not authorized |
| `InvalidProposal` | 11 | Invalid proposal ID |
| `AlreadyApproved` | 12 | Admin already approved |

## Deployment Steps

### 1. Build Contract
```bash
cd contracts
cargo build --target wasm32-unknown-unknown --release
```

### 2. Optimize WASM
```bash
soroban contract optimize \
  --wasm target/wasm32-unknown-unknown/release/soroban_certificate_contract.wasm
```

### 3. Upload to Network
```bash
soroban contract upload \
  --wasm target/wasm32-unknown-unknown/release/soroban_certificate_contract.wasm \
  --network testnet
```

### 4. Deploy Contract
```bash
soroban contract deploy \
  --wasm-hash <WASM_HASH> \
  --network testnet
```

### 5. Initialize
```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- init \
  --admin_a <ADMIN_A_ADDRESS> \
  --admin_b <ADMIN_B_ADDRESS> \
  --admin_c <ADMIN_C_ADDRESS>
```

## Upgrade Steps

### 1. Build New Version
```bash
cargo build --target wasm32-unknown-unknown --release
```

### 2. Upload New WASM
```bash
soroban contract upload \
  --wasm target/wasm32-unknown-unknown/release/soroban_certificate_contract.wasm \
  --network testnet
```
Record the returned WASM hash.

### 3. Propose Upgrade
```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- propose_upgrade_with_timelock \
  --caller <ADMIN_A> \
  --new_wasm_hash <NEW_WASM_HASH> \
  --changelog "Bug fixes and improvements"
```

### 4. Approve Upgrade
```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- approve_pending_upgrade \
  --caller <ADMIN_B>
```

### 5. Wait 24 Hours

### 6. Execute Upgrade
```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- execute_pending_upgrade \
  --caller <ADMIN_A>
```

## Testing Commands

### Run All Tests
```bash
cargo test
```

### Run Upgrade Tests
```bash
cargo test upgrade_tests
```

### Run Admin Tests
```bash
cargo test admin_tests
```

### Run with Output
```bash
cargo test -- --nocapture
```

## Monitoring

### Check Version
```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- get_current_version
```

### Check Pending Upgrade
```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- get_pending_upgrade
```

### Check Version History
```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- get_version_history
```

## Emergency Procedures

### Rollback to Previous Version

1. **Identify target version:**
```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- get_version_history
```

2. **Execute rollback:**
```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- emergency_rollback \
  --signer_a <ADMIN_A> \
  --signer_b <ADMIN_B> \
  --target_version <VERSION_NUMBER>
```

### Cancel Pending Upgrade
```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- cancel_pending_upgrade \
  --caller <ADMIN>
```

## Best Practices

✅ **DO:**
- Test on testnet first
- Use hardware wallets for admin keys
- Keep detailed changelogs
- Monitor events after upgrades
- Coordinate with team before upgrades

❌ **DON'T:**
- Skip the time-lock period
- Upgrade without testing
- Share admin private keys
- Ignore community feedback
- Deploy without audit

## Support

For detailed documentation, see:
- `UPGRADE_IMPLEMENTATION.md` - Full implementation guide
- `CONTRACT_UPGRADE.md` - Security considerations
- Test files in `contracts/src/tests/` - Usage examples
