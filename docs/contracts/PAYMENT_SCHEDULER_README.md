# Payment Scheduler Contract - Issue #411

## Overview

The Payment Scheduler is a Soroban smart contract that enables automated recurring token transfers with conditional execution logic, retry handling, and comprehensive event logging.

### Key Features

- **Recurring Transfers**: Schedule token transfers at regular intervals (daily, weekly, monthly, or custom)
- **Conditional Execution**: Execute transfers only when specified conditions are met
- **Retry Logic**: Automatic retry mechanism with configurable maximum retries
- **Execution History**: Complete audit trail of all execution attempts
- **Owner Management**: Only schedule owners can manage their schedules
- **Permissionless Execution**: Any caller can trigger schedule execution
- **Event Logging**: Comprehensive event emission for all operations

## Architecture

### Core Modules

#### `payment_scheduler.rs`
Implements schedule creation, management, and storage:
- `PaymentSchedule` struct: Represents a payment schedule
- `ScheduleStatus` enum: Active, Paused, Cancelled, Completed
- `Condition` enum: Balance verification, time windows, custom conditions
- Schedule CRUD operations
- Owner-based schedule management

#### `execution_engine.rs`
Implements execution logic and retry handling:
- `execute_schedule()`: Main execution function
- Condition evaluation
- Token transfer execution
- Retry state management
- Execution history recording

### Storage Design

**For 50,000+ Schedules:**

```
Instance Storage (fast, ~5KB):
- Admin address
- Max retries configuration

Persistent Storage (unlimited):
- Schedule by ID: ScheduleId -> PaymentSchedule
- Owner's schedules: Address -> Vec<ScheduleId>
- Execution history: (ScheduleId, index) -> ExecutionRecord
- Retry count: ScheduleId -> u32
```

**Key Design Decisions:**
- Per-owner indexing avoids full enumeration
- Execution history stored separately for efficient queries
- Retry count stored per schedule for quick access
- TTL management for persistent storage

## Data Types

### PaymentSchedule

```rust
pub struct PaymentSchedule {
    pub id: ScheduleId,                    // u128
    pub owner: Address,                    // Schedule owner
    pub recipient: Address,                // Transfer recipient
    pub token_address: Address,            // Token to transfer
    pub amount: i128,                      // Amount per execution
    pub interval: u64,                     // Interval in seconds
    pub next_execution: u64,               // Next execution timestamp
    pub status: ScheduleStatus,            // Active/Paused/Cancelled/Completed
    pub created_at: u64,                   // Creation timestamp
    pub execution_count: u32,              // Number of successful executions
    pub max_executions: Option<u32>,       // Optional execution limit
    pub conditions: Vec<Condition>,        // Execution conditions
}
```

### Condition Types

```rust
pub enum Condition {
    BalanceVerification {
        account: Address,
        token_address: Address,
        min_balance: i128,
    },
    TimeWindow {
        start_time: u64,
        end_time: u64,
    },
    CustomCondition {
        contract_address: Address,
        function_name: String,
    },
}
```

### ExecutionRecord

```rust
pub struct ExecutionRecord {
    pub schedule_id: ScheduleId,
    pub executed_at: u64,
    pub success: bool,
    pub failure_reason: Option<String>,
    pub retry_count: u32,
    pub amount_transferred: Option<i128>,
}
```

## API Reference

### Schedule Management

#### `create_schedule()`
Create a new payment schedule.

**Parameters:**
- `owner`: Schedule owner (must call this function)
- `recipient`: Recipient address
- `token_address`: Token to transfer
- `amount`: Amount per execution (must be positive)
- `interval`: Interval in seconds (must be positive)
- `max_executions`: Optional maximum execution count
- `conditions`: Optional execution conditions

**Returns:** Schedule ID (u128)

**Events:** `payment_scheduled`

#### `pause_schedule()`
Pause an active schedule.

**Parameters:**
- `owner`: Schedule owner (must call this function)
- `schedule_id`: Schedule to pause

**Events:** `schedule_paused`

#### `resume_schedule()`
Resume a paused schedule.

**Parameters:**
- `owner`: Schedule owner (must call this function)
- `schedule_id`: Schedule to resume

**Events:** `schedule_resumed`

#### `cancel_schedule()`
Cancel a schedule permanently.

**Parameters:**
- `owner`: Schedule owner (must call this function)
- `schedule_id`: Schedule to cancel

**Events:** `schedule_cancelled`

#### `get_schedule()`
Retrieve a schedule by ID.

**Parameters:**
- `schedule_id`: Schedule ID

**Returns:** PaymentSchedule

#### `get_owner_schedules()`
Get all schedules for an owner.

**Parameters:**
- `owner`: Owner address

**Returns:** Vec<ScheduleId>

#### `get_execution_history()`
Get execution history for a schedule.

**Parameters:**
- `schedule_id`: Schedule ID
- `limit`: Maximum records to return

**Returns:** Vec<ExecutionRecord>

### Execution

#### `execute_schedule()`
Execute a payment schedule.

**Parameters:**
- `schedule_id`: Schedule to execute

**Returns:** bool (true if successful, false if retryable failure)

**Behavior:**
1. Verify schedule exists and is active
2. Check if current time >= next_execution
3. Evaluate all conditions
4. Execute token transfer if conditions pass
5. Update schedule state and record execution
6. Handle retries on failure

**Events:**
- `payment_executed` (on success)
- `payment_failed` (on failure)
- `max_retries_exceeded` (when retry limit reached)
- `schedule_completed` (when max executions reached)

### Configuration

#### `set_max_retries()`
Set maximum retry count (admin only).

**Parameters:**
- `admin`: Admin address (must call this function)
- `max_retries`: New maximum retry count

**Events:** `max_retries_updated`

#### `get_max_retries()`
Get current maximum retry count.

**Returns:** u32

## Retry Logic

### Behavior

1. **Condition Failure**: If a condition fails, increment retry count and record failure
2. **Transfer Failure**: If transfer fails, increment retry count and record failure
3. **Max Retries Exceeded**: After max retries, mark execution window as failed and advance to next interval
4. **Retry Window**: Retries occur within the same execution window (before next_execution)
5. **Reset**: Retry count resets to 0 when execution succeeds or max retries exceeded

### Configuration

- **Default Max Retries**: 3 per execution window
- **Configurable**: Admin can set via `set_max_retries()`
- **Per Schedule**: Retry count tracked per schedule

## Conditions

### Balance Verification

Ensures an account holds minimum balance of a token.

```rust
Condition::BalanceVerification {
    account: Address,
    token_address: Address,
    min_balance: i128,
}
```

### Time Window

Restricts execution to a specific time range.

```rust
Condition::TimeWindow {
    start_time: u64,  // Unix seconds
    end_time: u64,    // Unix seconds
}
```

### Custom Condition

Calls an external contract to determine if execution should proceed.

```rust
Condition::CustomCondition {
    contract_address: Address,
    function_name: String,
}
```

## Events

### Schedule Events

- `payment_scheduled`: Schedule created
- `schedule_paused`: Schedule paused
- `schedule_resumed`: Schedule resumed
- `schedule_cancelled`: Schedule cancelled
- `schedule_completed`: Max executions reached

### Execution Events

- `payment_executed`: Payment executed successfully
- `payment_failed`: Payment execution failed
- `max_retries_exceeded`: Retry limit reached

### Configuration Events

- `max_retries_updated`: Max retries configuration changed

## Security Considerations

### Trust Model

- **Schedule Owner**: Only the owner can manage (pause, cancel) their schedules
- **Execution**: Permissionless - any caller can trigger execution
- **Conditions**: External condition contracts are untrusted

### Invariants

1. **No Silent Failures**: All errors are explicitly typed
2. **Atomicity**: Failed executions leave all state unchanged
3. **Condition Enforcement**: No transfer without all conditions passing
4. **Timing**: No transfer before next_execution
5. **Immutability**: Retry state cannot be manipulated externally
6. **Monotonicity**: Execution count never decreases

### Authorization

- `owner.require_auth()` for schedule management
- `admin.require_auth()` for configuration changes
- No authorization required for execution (permissionless)

## Gas Optimization

### Storage Design

- **Minimal Reads**: Execution path loads only necessary data
- **Per-Owner Indexing**: Avoids full schedule enumeration
- **Separate History**: Execution history stored separately for efficient queries
- **TTL Management**: Persistent storage TTL extended only when necessary

### Execution Path

1. Load schedule (1 read)
2. Check conditions (0-3 reads depending on condition types)
3. Execute transfer (1 write)
4. Update schedule (1 write)
5. Record execution (1 write)

**Total: ~3-5 storage operations per execution**

## Testing

### Test Coverage

- Schedule creation with valid/invalid inputs
- Schedule management (pause, resume, cancel)
- Execution timing and conditions
- Retry logic and max retries
- Execution history tracking
- Multi-schedule operations
- 50,000+ schedule feasibility

### Test Framework

- Soroban testutils
- `Env::default()` with `env.mock_all_auths()`
- Time advancement via `env.ledger().with_mut()`
- Standard Rust assertions

### Running Tests

```bash
cargo test --lib payment_scheduler
cargo test --lib execution_engine
```

## Deployment

### Prerequisites

- Soroban SDK 22.0.0
- Rust 1.70+
- Stellar testnet account with XLM

### Build

```bash
cargo build --target wasm32-unknown-unknown --release
```

### Deploy

```bash
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/soroban_certificate_contract.wasm \
  --source <account> \
  --network testnet
```

### Initialize

```bash
soroban contract invoke \
  --id <contract-id> \
  --source <account> \
  --network testnet \
  -- init \
  --admin <admin-address>
```

## Frontend Integration

### React Hook

```typescript
const {
  schedules,
  isLoading,
  error,
  createSchedule,
  pauseSchedule,
  resumeSchedule,
  cancelSchedule,
  getExecutionHistory,
} = usePaymentScheduler();
```

### Component

```typescript
<SchedulerDashboard />
```

## Limitations & Future Work

### Current Limitations

1. **Custom Conditions**: Cross-contract calls require careful error handling
2. **Batch Operations**: Single schedule execution per call
3. **Time Precision**: Ledger timestamp precision (5-second blocks)

### Future Enhancements

1. Batch execution for multiple schedules
2. Advanced condition types (price feeds, oracle data)
3. Execution scheduling via external triggers
4. Multi-token transfers per schedule
5. Conditional recipient selection

## References

- [Soroban Documentation](https://developers.stellar.org/docs/learn/soroban)
- [Stellar Asset Interface](https://developers.stellar.org/docs/learn/soroban/tokens)
- [Issue #411](https://github.com/Web3-Student-Lab/Web3-Student-Lab/issues/411)
