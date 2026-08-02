# Web3-Student-Lab: Deployed Contracts Documentation

This document provides a comprehensive overview of the successfully deployed Soroban smart contracts in the `Web3-Student-Lab` workspace. Each contract is deployed on the **Stellar Testnet**.

---

## 1. Payment Scheduler (`payment_scheduler.rs`)
**Testnet Contract ID:** `CBLEQCZ3ORYPD2WTUC5UEMSO4TDJXNZ3KG44AFLB2K7R5J7J3QHNXLUE`

### Overview
The Payment Scheduler is a robust contract designed for automated recurring token transfers with conditional execution logic and retry handling.

### Key Features & Invariants
- **Trustless Execution**: Any caller can trigger the execution, but no transfer occurs unless all attached conditions pass.
- **Conditional Rules**: Supports balance verification, time windows, and custom cross-contract conditional calls.
- **Strict State Management**: Failed executions revert state exactly to before the call. No schedule can be managed by anyone other than its owner.

### Core Functions
- `init_scheduler(env, admin)`: Initializes the contract with an admin.
- `create_schedule(...)`: Creates a new recurring payment schedule.
- `pause_schedule(env, owner, schedule_id)` / `resume_schedule(...)`: Allows owners to pause and resume their schedules.
- `cancel_schedule(...)`: Permanently cancels an active schedule.

---

## 2. Commit-Reveal RNG (`commit_reveal_rng`)
**Testnet Contract ID:** `CCMAB52GY3WPXWHS5QI42URMRTLAIOVW7CLLOIBGC6R2YDEEBPIO6O65`

### Overview
A secure, bias-resistant random number generator utilizing a two-phase commit-reveal cryptographic scheme. This contract derives entropy purely from the XOR-hash of all participant secrets, eliminating validator manipulation.

### Key Features
- **Phase 1 (Commit)**: Participants submit a `SHA256` hash of their secret.
- **Phase 2 (Reveal)**: Participants reveal their secrets. The contract verifies the hash matches the commitment.
- **Slashing Mechanism**: Participants who commit but fail to reveal are flagged for slashing to disincentivize network griefing.

---

## 3. Payment Streaming (`payment_streaming`)
**Testnet Contract ID:** `CAOM7BXAMWNCL6ZMGYDC3XZSTKS5GQK5Q5TUAMO7CUTNHF4CF4ZK4EXE`

### Overview
This contract allows for the continuous streaming of tokens over a specified period. It is ideal for payroll, token vesting, or continuous subscriptions. Tokens unlock linearly as time progresses.

---

## 4. Quadratic Funding (`quadratic_funding`)
**Testnet Contract ID:** `CA2XT5OG4VUMHG773OQ5LHV57ZW3HZZNNZNBGOOOKMEYNXWXMNHXLWLJ`

### Overview
Implements a democratic quadratic funding matching pool. Donations are matched algorithmically based on the *number* of unique contributors rather than just the amount of funds raised, heavily favoring projects with broad community support.

---

## 5. Smart Vault (`smart_vault`)
**Testnet Contract ID:** `CCKEFMHSHA2BWHSXOBPWUBXSF3FYXZDTUVTK66WTQCS3WCNCPOW5AK6T`

### Overview
A secure asset-holding contract designed for long-term storage or programmatic release. It implements strict locking and withdrawal rules, ensuring that deposited assets cannot be moved without satisfying pre-defined criteria.

---

## 6. Upgradeable Proxy Architecture
Soroban smart contracts are immutable by default, but upgradeability can be achieved by separating state and logic. This workspace utilizes a proxy pattern consisting of three contracts:

### A. Transparent Proxy (`proxy`)
**Testnet Contract ID:** `CCYSHW6C3B5RMKCUMO65P56RNPZVRBMPHDNBRJHZZV36CP67I7QCU3IS`
- Acts as the main entry point for users. It stores the state and delegates all calls to the implementation contract.

### B. Implementation V1 (`implementation_v1`)
**Testnet Contract ID:** `CBJVEORDIVEB2IDVEBXXD7LN3SSULJ3U5RLTPP4VQTIUNFUNBTYT5GOI`
- The initial logic contract that the Proxy routes user transactions to.

### C. Implementation V2 (`implementation_v2`)
**Testnet Contract ID:** `CAYZUYBRWIP2RJRKRM4LL7S3R2NRCUUS5HA64CVIK2G44ZQ6P46QYG3I`
- A demonstration of how logic can be swapped. An admin can upgrade the proxy to point to `V2` without losing the user state stored in the Proxy contract.

---

### Verifying on the Explorer
To verify these contracts or interact with them natively, copy the **Contract ID** and search for it on the [Stellar Lab Explorer (Testnet)](https://lab.stellar.org/r/testnet).
