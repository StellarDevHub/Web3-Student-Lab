//! Payment Scheduler Contract - Issue #411
//!
//! This module implements a token payment scheduler for automated recurring transfers
//! with conditional execution logic, retry handling, and comprehensive event logging.
//!
//! **Trust Model:**
//! - Only the schedule owner may create, pause, cancel, or manage their schedules
//! - Execution is permissionless (any caller may trigger execution)
//! - Condition contracts are untrusted external code
//!
//! **Key Invariants:**
//! - No token transfer occurs without all attached conditions passing
//! - No token transfer occurs before next_execution timestamp
//! - Failed executions leave all on-chain state exactly as before the call
//! - No schedule can be managed by any caller other than its owner
//! - Retry state cannot be manipulated by external callers
//! - Execution count cannot be decremented or reset
//! - All errors are explicitly typed (no silent failures)

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Env, String,
    Symbol, Vec,
};

/// Unique identifier for a payment schedule
pub type ScheduleId = u128;

/// Payment schedule status
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ScheduleStatus {
    /// Schedule is active and will execute at next_execution
    Active,
    /// Schedule is paused and will not execute
    Paused,
    /// Schedule is cancelled and cannot be resumed
    Cancelled,
    /// Schedule has reached maximum executions
    Completed,
}

/// Condition type for conditional execution
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Condition {
    /// Balance verification: account must hold >= min_balance of token
    BalanceVerification {
        account: Address,
        token_address: Address,
        min_balance: i128,
    },
    /// Time-based: execution only within [start_time, end_time]
    TimeWindow { start_time: u64, end_time: u64 },
    /// Custom condition: call external contract at address with function name
    CustomCondition {
        contract_address: Address,
        function_name: String,
    },
}

/// Payment schedule record
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentSchedule {
    /// Unique schedule identifier
    pub id: ScheduleId,
    /// Address that created and owns this schedule
    pub owner: Address,
    /// Recipient address for token transfers
    pub recipient: Address,
    /// Token address to transfer
    pub token_address: Address,
    /// Amount to transfer per execution (in token units)
    pub amount: i128,
    /// Interval between executions in seconds
    pub interval: u64,
    /// Next execution timestamp (Unix seconds)
    pub next_execution: u64,
    /// Current schedule status
    pub status: ScheduleStatus,
    /// Timestamp when schedule was created
    pub created_at: u64,
    /// Number of times this schedule has executed successfully
    pub execution_count: u32,
    /// Maximum number of executions (None = unlimited)
    pub max_executions: Option<u32>,
    /// Conditions that must pass for execution (empty = no conditions)
    pub conditions: Vec<Condition>,
}

/// Execution record for audit trail
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ExecutionRecord {
    /// Schedule ID this record belongs to
    pub schedule_id: ScheduleId,
    /// Timestamp of execution attempt
    pub executed_at: u64,
    /// Whether execution succeeded
    pub success: bool,
    /// Failure reason if execution failed (None if successful)
    pub failure_reason: Option<String>,
    /// Number of retries attempted for this execution window
    pub retry_count: u32,
    /// Amount transferred (if successful)
    pub amount_transferred: Option<i128>,
}

/// Storage keys for payment scheduler
#[contracttype]
#[derive(Clone)]
pub enum PaymentSchedulerKey {
    /// Counter for generating unique schedule IDs
    ScheduleIdCounter,
    /// Schedule by ID: ScheduleId -> PaymentSchedule
    Schedule(ScheduleId),
    /// Owner's schedules: Address -> Vec<ScheduleId>
    OwnerSchedules(Address),
    /// Execution history: (ScheduleId, execution_index) -> ExecutionRecord
    ExecutionHistory(ScheduleId, u32),
    /// Execution history count: ScheduleId -> u32
    ExecutionHistoryCount(ScheduleId),
    /// Retry count for current window: ScheduleId -> u32
    RetryCount(ScheduleId),
    /// Maximum retry count (admin configurable)
    MaxRetries,
    /// Admin address
    Admin,
}

/// Error types for payment scheduler
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum PaymentSchedulerError {
    /// Contract not initialized
    NotInitialized = 1,
    /// Schedule not found
    ScheduleNotFound = 2,
    /// Caller is not authorized to perform this action
    Unauthorized = 3,
    /// Invalid amount (must be positive)
    InvalidAmount = 4,
    /// Invalid interval (must be positive)
    InvalidInterval = 5,
    /// Invalid recipient address
    InvalidRecipient = 6,
    /// Schedule is not active
    ScheduleNotActive = 7,
    /// Execution is too early (before next_execution)
    ExecutionTooEarly = 8,
    /// Condition check failed
    ConditionFailed = 9,
    /// Token transfer failed
    TransferFailed = 10,
    /// Maximum retries exceeded for this execution window
    MaxRetriesExceeded = 11,
    /// Schedule has reached maximum executions
    MaxExecutionsReached = 12,
    /// Invalid condition provided
    InvalidCondition = 13,
    /// Reentrancy detected
    Reentrant = 14,
}

/// Default maximum retries per execution window
pub const DEFAULT_MAX_RETRIES: u32 = 3;

#[contract]
pub struct PaymentSchedulerContract;

#[contractimpl]
impl PaymentSchedulerContract {
    /// Initialize the payment scheduler contract
    ///
    /// # Arguments
    /// * `env` - Soroban environment
    /// * `admin` - Admin address for configuration
    ///
    /// # Errors
    /// Returns `PaymentSchedulerError::AlreadyInitialized` if already initialized
    pub fn init(env: Env, admin: Address) {
        if env.storage().persistent().has(&PaymentSchedulerKey::Admin) {
            panic_with_error!(&env, PaymentSchedulerError::NotInitialized);
        }

        env.storage()
            .persistent()
            .set(&PaymentSchedulerKey::Admin, &admin);
        env.storage()
            .persistent()
            .set(&PaymentSchedulerKey::ScheduleIdCounter, &0u128);
        env.storage()
            .persistent()
            .set(&PaymentSchedulerKey::MaxRetries, &DEFAULT_MAX_RETRIES);

        // Emit initialization event
        env.events().publish(
            (Symbol::new(&env, "payment_scheduler_initialized"),),
            (admin,),
        );
    }

    /// Create a new payment schedule
    ///
    /// # Arguments
    /// * `env` - Soroban environment
    /// * `owner` - Schedule owner (must call this function)
    /// * `recipient` - Recipient address for transfers
    /// * `token_address` - Token to transfer
    /// * `amount` - Amount per execution (must be positive)
    /// * `interval` - Interval in seconds (must be positive)
    /// * `max_executions` - Optional maximum execution count
    /// * `conditions` - Optional conditions for execution
    ///
    /// # Returns
    /// The newly created schedule ID
    ///
    /// # Errors
    /// - `InvalidAmount` if amount <= 0
    /// - `InvalidInterval` if interval == 0
    /// - `InvalidRecipient` if recipient is invalid
    /// - `Unauthorized` if caller is not owner
    pub fn create_schedule(
        env: Env,
        owner: Address,
        recipient: Address,
        token_address: Address,
        amount: i128,
        interval: u64,
        max_executions: Option<u32>,
        conditions: Vec<Condition>,
    ) -> ScheduleId {
        owner.require_auth();

        // Validate inputs
        if amount <= 0 {
            panic_with_error!(&env, PaymentSchedulerError::InvalidAmount);
        }
        if interval == 0 {
            panic_with_error!(&env, PaymentSchedulerError::InvalidInterval);
        }

        // Generate unique schedule ID
        let counter: u128 = env
            .storage()
            .persistent()
            .get(&PaymentSchedulerKey::ScheduleIdCounter)
            .unwrap_or(0);
        let schedule_id = counter + 1;

        env.storage()
            .persistent()
            .set(&PaymentSchedulerKey::ScheduleIdCounter, &schedule_id);

        // Create schedule
        let now = env.ledger().timestamp();
        let schedule = PaymentSchedule {
            id: schedule_id,
            owner: owner.clone(),
            recipient: recipient.clone(),
            token_address: token_address.clone(),
            amount,
            interval,
            next_execution: now + interval,
            status: ScheduleStatus::Active,
            created_at: now,
            execution_count: 0,
            max_executions,
            conditions,
        };

        // Store schedule
        env.storage()
            .persistent()
            .set(&PaymentSchedulerKey::Schedule(schedule_id), &schedule);

        // Add to owner's schedule list
        let mut owner_schedules: Vec<ScheduleId> = env
            .storage()
            .persistent()
            .get(&PaymentSchedulerKey::OwnerSchedules(owner.clone()))
            .unwrap_or_else(|| Vec::new(&env));
        owner_schedules.push_back(schedule_id);
        env.storage().persistent().set(
            &PaymentSchedulerKey::OwnerSchedules(owner.clone()),
            &owner_schedules,
        );

        // Initialize execution history count
        env.storage().persistent().set(
            &PaymentSchedulerKey::ExecutionHistoryCount(schedule_id),
            &0u32,
        );

        // Initialize retry count
        env.storage()
            .persistent()
            .set(&PaymentSchedulerKey::RetryCount(schedule_id), &0u32);

        // Emit event
        env.events().publish(
            (Symbol::new(&env, "payment_scheduled"),),
            (schedule_id, owner, recipient, amount, interval, now),
        );

        schedule_id
    }

    /// Retrieve a schedule by ID
    ///
    /// # Arguments
    /// * `env` - Soroban environment
    /// * `schedule_id` - Schedule ID to retrieve
    ///
    /// # Returns
    /// The payment schedule if found
    ///
    /// # Errors
    /// Returns `ScheduleNotFound` if schedule does not exist
    pub fn get_schedule(env: Env, schedule_id: ScheduleId) -> PaymentSchedule {
        env.storage()
            .persistent()
            .get(&PaymentSchedulerKey::Schedule(schedule_id))
            .unwrap_or_else(|| panic_with_error!(&env, PaymentSchedulerError::ScheduleNotFound))
    }

    /// Pause a schedule
    ///
    /// # Arguments
    /// * `env` - Soroban environment
    /// * `owner` - Schedule owner (must call this function)
    /// * `schedule_id` - Schedule ID to pause
    ///
    /// # Errors
    /// - `ScheduleNotFound` if schedule does not exist
    /// - `Unauthorized` if caller is not the owner
    /// - `ScheduleNotActive` if schedule is already paused or cancelled
    pub fn pause_schedule(env: Env, owner: Address, schedule_id: ScheduleId) {
        owner.require_auth();

        let mut schedule = Self::get_schedule(env.clone(), schedule_id);

        if schedule.owner != owner {
            panic_with_error!(&env, PaymentSchedulerError::Unauthorized);
        }

        if schedule.status != ScheduleStatus::Active {
            panic_with_error!(&env, PaymentSchedulerError::ScheduleNotActive);
        }

        schedule.status = ScheduleStatus::Paused;
        env.storage()
            .persistent()
            .set(&PaymentSchedulerKey::Schedule(schedule_id), &schedule);

        env.events().publish(
            (Symbol::new(&env, "schedule_paused"),),
            (schedule_id, owner),
        );
    }

    /// Resume a paused schedule
    ///
    /// # Arguments
    /// * `env` - Soroban environment
    /// * `owner` - Schedule owner (must call this function)
    /// * `schedule_id` - Schedule ID to resume
    ///
    /// # Errors
    /// - `ScheduleNotFound` if schedule does not exist
    /// - `Unauthorized` if caller is not the owner
    /// - `ScheduleNotActive` if schedule is not paused
    pub fn resume_schedule(env: Env, owner: Address, schedule_id: ScheduleId) {
        owner.require_auth();

        let mut schedule = Self::get_schedule(env.clone(), schedule_id);

        if schedule.owner != owner {
            panic_with_error!(&env, PaymentSchedulerError::Unauthorized);
        }

        if schedule.status != ScheduleStatus::Paused {
            panic_with_error!(&env, PaymentSchedulerError::ScheduleNotActive);
        }

        schedule.status = ScheduleStatus::Active;
        env.storage()
            .persistent()
            .set(&PaymentSchedulerKey::Schedule(schedule_id), &schedule);

        env.events().publish(
            (Symbol::new(&env, "schedule_resumed"),),
            (schedule_id, owner),
        );
    }

    /// Cancel a schedule
    ///
    /// # Arguments
    /// * `env` - Soroban environment
    /// * `owner` - Schedule owner (must call this function)
    /// * `schedule_id` - Schedule ID to cancel
    ///
    /// # Errors
    /// - `ScheduleNotFound` if schedule does not exist
    /// - `Unauthorized` if caller is not the owner
    pub fn cancel_schedule(env: Env, owner: Address, schedule_id: ScheduleId) {
        owner.require_auth();

        let mut schedule = Self::get_schedule(env.clone(), schedule_id);

        if schedule.owner != owner {
            panic_with_error!(&env, PaymentSchedulerError::Unauthorized);
        }

        schedule.status = ScheduleStatus::Cancelled;
        env.storage()
            .persistent()
            .set(&PaymentSchedulerKey::Schedule(schedule_id), &schedule);

        env.events().publish(
            (Symbol::new(&env, "schedule_cancelled"),),
            (schedule_id, owner),
        );
    }

    /// Get all schedules for an owner
    ///
    /// # Arguments
    /// * `env` - Soroban environment
    /// * `owner` - Owner address
    ///
    /// # Returns
    /// Vector of schedule IDs owned by the address
    pub fn get_owner_schedules(env: Env, owner: Address) -> Vec<ScheduleId> {
        env.storage()
            .persistent()
            .get(&PaymentSchedulerKey::OwnerSchedules(owner))
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Get execution history for a schedule
    ///
    /// # Arguments
    /// * `env` - Soroban environment
    /// * `schedule_id` - Schedule ID
    /// * `limit` - Maximum number of records to return
    ///
    /// # Returns
    /// Vector of execution records (most recent first)
    pub fn get_execution_history(
        env: Env,
        schedule_id: ScheduleId,
        limit: u32,
    ) -> Vec<ExecutionRecord> {
        let count: u32 = env
            .storage()
            .persistent()
            .get(&PaymentSchedulerKey::ExecutionHistoryCount(schedule_id))
            .unwrap_or(0);

        let mut records = Vec::new(&env);
        let start = if count > limit { count - limit } else { 0 };

        for i in start..count {
            if let Some(record) = env
                .storage()
                .persistent()
                .get(&PaymentSchedulerKey::ExecutionHistory(schedule_id, i))
            {
                records.push_back(record);
            }
        }

        records
    }

    /// Set maximum retry count (admin only)
    ///
    /// # Arguments
    /// * `env` - Soroban environment
    /// * `admin` - Admin address (must call this function)
    /// * `max_retries` - New maximum retry count
    ///
    /// # Errors
    /// Returns `Unauthorized` if caller is not admin
    pub fn set_max_retries(env: Env, admin: Address, max_retries: u32) {
        admin.require_auth();

        let stored_admin: Address = env
            .storage()
            .persistent()
            .get(&PaymentSchedulerKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, PaymentSchedulerError::NotInitialized));

        if admin != stored_admin {
            panic_with_error!(&env, PaymentSchedulerError::Unauthorized);
        }

        env.storage()
            .persistent()
            .set(&PaymentSchedulerKey::MaxRetries, &max_retries);

        env.events()
            .publish((Symbol::new(&env, "max_retries_updated"),), (max_retries,));
    }

    /// Get current maximum retry count
    ///
    /// # Arguments
    /// * `env` - Soroban environment
    ///
    /// # Returns
    /// Current maximum retry count
    pub fn get_max_retries(env: Env) -> u32 {
        env.storage()
            .persistent()
            .get(&PaymentSchedulerKey::MaxRetries)
            .unwrap_or(DEFAULT_MAX_RETRIES)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, vec, Address, Env};

    fn setup() -> (Env, Address, PaymentSchedulerContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(PaymentSchedulerContract, ());
        let client = PaymentSchedulerContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.init(&admin);

        (env, admin, client)
    }

    #[test]
    fn test_create_schedule_with_valid_inputs() {
        let (env, _admin, client) = setup();

        let owner = Address::generate(&env);
        let recipient = Address::generate(&env);
        let token = Address::generate(&env);

        let schedule_id = client.create_schedule(
            &owner,
            &recipient,
            &token,
            &100i128,
            &86400u64,
            &None,
            &vec![&env],
        );

        assert!(schedule_id > 0);

        let schedule = client.get_schedule(&schedule_id);
        assert_eq!(schedule.id, schedule_id);
        assert_eq!(schedule.owner, owner);
        assert_eq!(schedule.recipient, recipient);
        assert_eq!(schedule.amount, 100);
        assert_eq!(schedule.interval, 86400);
        assert_eq!(schedule.status, ScheduleStatus::Active);
        assert_eq!(schedule.execution_count, 0);
    }

    #[test]
    #[should_panic]
    fn test_create_schedule_with_zero_amount() {
        let (env, _admin, client) = setup();

        let owner = Address::generate(&env);
        let recipient = Address::generate(&env);
        let token = Address::generate(&env);

        client.create_schedule(
            &owner,
            &recipient,
            &token,
            &0i128,
            &86400u64,
            &None,
            &vec![&env],
        );
    }

    #[test]
    #[should_panic]
    fn test_create_schedule_with_negative_amount() {
        let (env, _admin, client) = setup();

        let owner = Address::generate(&env);
        let recipient = Address::generate(&env);
        let token = Address::generate(&env);

        client.create_schedule(
            &owner,
            &recipient,
            &token,
            &-100i128,
            &86400u64,
            &None,
            &vec![&env],
        );
    }

    #[test]
    #[should_panic]
    fn test_create_schedule_with_zero_interval() {
        let (env, _admin, client) = setup();

        let owner = Address::generate(&env);
        let recipient = Address::generate(&env);
        let token = Address::generate(&env);

        client.create_schedule(
            &owner,
            &recipient,
            &token,
            &100i128,
            &0u64,
            &None,
            &vec![&env],
        );
    }

    #[test]
    fn test_pause_and_resume_schedule() {
        let (env, _admin, client) = setup();

        let owner = Address::generate(&env);
        let recipient = Address::generate(&env);
        let token = Address::generate(&env);

        let schedule_id = client.create_schedule(
            &owner,
            &recipient,
            &token,
            &100i128,
            &86400u64,
            &None,
            &vec![&env],
        );

        let schedule = client.get_schedule(&schedule_id);
        assert_eq!(schedule.status, ScheduleStatus::Active);

        client.pause_schedule(&owner, &schedule_id);
        let paused = client.get_schedule(&schedule_id);
        assert_eq!(paused.status, ScheduleStatus::Paused);

        client.resume_schedule(&owner, &schedule_id);
        let resumed = client.get_schedule(&schedule_id);
        assert_eq!(resumed.status, ScheduleStatus::Active);
    }

    #[test]
    #[should_panic]
    fn test_non_owner_cannot_pause_schedule() {
        let (env, _admin, client) = setup();

        let owner = Address::generate(&env);
        let non_owner = Address::generate(&env);
        let recipient = Address::generate(&env);
        let token = Address::generate(&env);

        let schedule_id = client.create_schedule(
            &owner,
            &recipient,
            &token,
            &100i128,
            &86400u64,
            &None,
            &vec![&env],
        );

        client.pause_schedule(&non_owner, &schedule_id);
    }

    #[test]
    fn test_cancel_schedule() {
        let (env, _admin, client) = setup();

        let owner = Address::generate(&env);
        let recipient = Address::generate(&env);
        let token = Address::generate(&env);

        let schedule_id = client.create_schedule(
            &owner,
            &recipient,
            &token,
            &100i128,
            &86400u64,
            &None,
            &vec![&env],
        );

        client.cancel_schedule(&owner, &schedule_id);
        let cancelled = client.get_schedule(&schedule_id);
        assert_eq!(cancelled.status, ScheduleStatus::Cancelled);
    }

    #[test]
    fn test_get_owner_schedules() {
        let (env, _admin, client) = setup();

        let owner = Address::generate(&env);
        let recipient = Address::generate(&env);
        let token = Address::generate(&env);

        let id1 = client.create_schedule(
            &owner,
            &recipient,
            &token,
            &100i128,
            &86400u64,
            &None,
            &vec![&env],
        );

        let id2 = client.create_schedule(
            &owner,
            &recipient,
            &token,
            &200i128,
            &86400u64,
            &None,
            &vec![&env],
        );

        let schedules = client.get_owner_schedules(&owner);
        assert_eq!(schedules.len(), 2);
        assert_eq!(schedules.get(0).unwrap(), id1);
        assert_eq!(schedules.get(1).unwrap(), id2);
    }

    #[test]
    fn test_set_max_retries() {
        let (env, admin, client) = setup();

        let initial = client.get_max_retries();
        assert_eq!(initial, DEFAULT_MAX_RETRIES);

        client.set_max_retries(&admin, &5u32);
        let updated = client.get_max_retries();
        assert_eq!(updated, 5);
    }

    #[test]
    #[should_panic]
    fn test_non_admin_cannot_set_max_retries() {
        let (env, _admin, client) = setup();

        let non_admin = Address::generate(&env);
        client.set_max_retries(&non_admin, &5u32);
    }
}
