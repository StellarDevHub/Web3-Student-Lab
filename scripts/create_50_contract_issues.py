#!/usr/bin/env python3
import subprocess

issues_batch_1 = [
    {
        "title": "[Frontend/Contract] Implement Multi-Signature Wallet with Threshold Signing and Time-Locked Transactions",
        "body": """## 📋 Overview
**Labels**: `smart-contract` `complexity: hard` `eta-2-days` `multi-signature` `security`  
**Contributor Persona**: Blockchain Architect (Requires expertise in Soroban smart contracts, cryptographic signatures, and access control patterns)

## 🎯 Problem Statement
The platform lacks a secure multi-signature wallet implementation for organizational treasury management. Users need threshold-based signing with time-locked transaction capabilities for enhanced security.

## 📍 Current State
- Single-signature wallets only
- No threshold signing mechanism
- Missing time-lock functionality
- No organizational treasury support

## ✨ Desired State
- Multi-signature wallet with configurable threshold (M-of-N)
- Time-locked transactions with configurable delay
- Role-based access control for signers
- Emergency pause and recovery mechanisms

## 🛠 Technical Requirements
- Soroban smart contract development
- Cryptographic signature verification
- Time-lock mechanism using ledger sequences
- Event emission for transaction lifecycle

## 📝 Task Breakdown

### Phase 1: Core Multi-Sig Logic (0.5 days)
- [ ] Implement signer registration and management
- [ ] Create threshold configuration (M-of-N)
- [ ] Build signature collection mechanism
- [ ] Add signature validation logic

### Phase 2: Transaction Lifecycle (0.5 days)
- [ ] Implement transaction proposal system
- [ ] Create signature aggregation
- [ ] Add threshold verification
- [ ] Build transaction execution logic

### Phase 3: Time-Lock Feature (0.5 days)
- [ ] Implement configurable time-lock delay
- [ ] Create time-lock expiration handling
- [ ] Add early execution prevention
- [ ] Build time-lock cancellation

### Phase 4: Security & Frontend (0.5 days)
- [ ] Add emergency pause functionality
- [ ] Implement signer recovery mechanism
- [ ] Create comprehensive event emissions
- [ ] Build frontend UI for multi-sig operations

## ✅ Acceptance Criteria
- [ ] M-of-N threshold signing works correctly
- [ ] Time-lock prevents execution before delay expires
- [ ] All signers can be added/removed securely
- [ ] Emergency pause stops all transactions
- [ ] Events emitted for all state changes
- [ ] Frontend can interact with all contract functions

## 📁 Files to Create
- `contracts/src/multi_sig_wallet.rs`
- `contracts/src/tests/multi_sig_wallet_tests.rs`
- Frontend integration components

## 📚 Resources
- [Soroban Smart Contract Documentation](https://soroban.stellar.org/docs/)
- [Multi-Signature Best Practices](https://github.com/ethereum/EIPs/issues/2)
- [Time-Lock Patterns](https://blog.openzeppelin.com/timelocks/)

## 🎯 Success Metrics
- Signature verification <100ms
- Support for up to 10 signers
- Zero security vulnerabilities
- Time-lock accuracy 100%"""
    },
    {
        "title": "[Frontend/Contract] Build Decentralized Token Vesting Schedule with Cliff and Milestone-Based Release",
        "body": """## 📋 Overview
**Labels**: `smart-contract` `complexity: hard` `eta-2-days` `token-vesting` `DeFi`  
**Contributor Persona**: Blockchain Developer (Requires expertise in token contracts, vesting schedules, and Soroban token wrapper)

## 🎯 Problem Statement
Token distribution lacks automated vesting mechanisms. Projects cannot implement cliff periods, milestone-based releases, or gradual token unlocking for team members and investors.

## 📍 Current State
- Manual token distribution only
- No automated vesting schedules
- Missing cliff period support
- No milestone-based release triggers

## ✨ Desired State
- Automated vesting with configurable schedules
- Cliff period before any tokens unlock
- Linear or milestone-based release mechanisms
- Frontend dashboard for vesting tracking

## 🛠 Technical Requirements
- Soroban token contract integration
- Time-based release logic
- Milestone verification system
- Claim mechanism with partial withdrawals

## 📝 Task Breakdown

### Phase 1: Vesting Schedule Creation (0.5 days)
- [ ] Implement vesting schedule initialization
- [ ] Add cliff period configuration
- [ ] Create total vesting duration setting
- [ ] Build beneficiary assignment

### Phase 2: Release Logic (0.5 days)
- [ ] Implement linear vesting calculation
- [ ] Add milestone-based release triggers
- [ ] Create vested amount computation
- [ ] Build claimable amount tracking

### Phase 3: Token Distribution (0.5 days)
- [ ] Implement token claim function
- [ ] Add partial claim support
- [ ] Create automatic balance updates
- [ ] Build claim history tracking

### Phase 4: Frontend Dashboard (0.5 days)
- [ ] Create vesting dashboard component
- [ ] Add real-time vesting progress visualization
- [ ] Implement claim button with status
- [ ] Build vesting schedule timeline UI

## ✅ Acceptance Criteria
- [ ] Cliff period prevents claims before expiration
- [ ] Linear vesting calculates correct amounts
- [ ] Milestone releases trigger correctly
- [ ] Partial claims work without errors
- [ ] Frontend displays accurate vesting progress
- [ ] All token transfers emit proper events

## 📁 Files to Create
- `contracts/src/token_vesting.rs`
- `contracts/src/tests/vesting_tests.rs`
- `frontend/src/components/vesting/VestingDashboard.tsx`

## 📚 Resources
- [Soroban Token Contract](https://soroban.stellar.org/docs/token/)
- [Vesting Schedule Patterns](https://www.vestingcontract.com/)

## �� Success Metrics
- Vesting calculation accuracy 100%
- Claim processing <2 seconds
- Support for 1000+ beneficiaries
- Zero token loss incidents"""
    },
]

# Create first 2 issues to test
for i, issue in enumerate(issues_batch_1, 1):
    print(f"Creating issue {i}/50...")
    cmd = ["gh", "issue", "create", "--title", issue["title"], "--body", issue["body"]]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode == 0:
        print(f"✓ Issue {i} created: {issue['title'][:60]}...")
    else:
        print(f"✗ Issue {i} failed: {result.stderr[:100]}")

print("\\n✅ Batch 1 complete!")
