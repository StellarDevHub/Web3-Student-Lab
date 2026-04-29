use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Env, Symbol,
    Vec,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum PaymentStatus {
    Success = 0,
    Failed = 1,
    Retrying = 2,
}

/// A record of one payment attempt for a subscription.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentRecord {
    pub payment_id: u32,
    pub sub_id: u32,
    pub amount: i128,
    pub payer: Address,
    pub payee: Address,
    pub status: PaymentStatus,
    pub timestamp: u64,
    pub retry_count: u32,
}

// ---------------------------------------------------------------------------
// Storage Keys
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    PaymentCounter,
    Payment(u32),
    /// sub_id -> Vec<u32> payment history
    SubPayments(u32),
    MaxRetries,
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum PayError {
    NotAuthorized = 1,
    PaymentNotFound = 2,
    MaxRetriesExceeded = 3,
    InvalidAmount = 4,
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

const DEFAULT_MAX_RETRIES: u32 = 3;

#[contract]
pub struct RecurringPaymentsContract;

#[contractimpl]
impl RecurringPaymentsContract {
    // -----------------------------------------------------------------------
    // Admin
    // -----------------------------------------------------------------------

    pub fn init(env: Env, admin: Address, max_retries: u32) {
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::PaymentCounter, &0u32);
        env.storage()
            .instance()
            .set(&DataKey::MaxRetries, &max_retries);
    }

    // -----------------------------------------------------------------------
    // Phase 2 – Payment Automation
    // -----------------------------------------------------------------------

    /// Execute a recurring payment for a subscription cycle.
    /// In production this would call a SAI/token contract; here we record state
    /// and emit events that an off-chain keeper or XCM automation can act on.
    pub fn execute_payment(
        env: Env,
        caller: Address,
        sub_id: u32,
        payer: Address,
        payee: Address,
        amount: i128,
    ) -> u32 {
        caller.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, PayError::InvalidAmount);
        }

        let mut counter: u32 = env
            .storage()
            .instance()
            .get(&DataKey::PaymentCounter)
            .unwrap_or(0);
        counter += 1;

        let record = PaymentRecord {
            payment_id: counter,
            sub_id,
            amount,
            payer: payer.clone(),
            payee: payee.clone(),
            status: PaymentStatus::Success,
            timestamp: env.ledger().timestamp(),
            retry_count: 0,
        };

        Self::persist_payment(&env, counter, &record, sub_id);

        env.events().publish(
            (Symbol::new(&env, "PaymentExecuted"),),
            (counter, sub_id, payer, payee, amount),
        );

        counter
    }

    /// Mark a payment as failed and schedule a retry (up to max_retries).
    pub fn record_failure_and_retry(
        env: Env,
        caller: Address,
        payment_id: u32,
    ) -> PaymentStatus {
        caller.require_auth();

        let mut record: PaymentRecord = env
            .storage()
            .instance()
            .get(&DataKey::Payment(payment_id))
            .unwrap_or_else(|| panic_with_error!(&env, PayError::PaymentNotFound));

        let max: u32 = env
            .storage()
            .instance()
            .get(&DataKey::MaxRetries)
            .unwrap_or(DEFAULT_MAX_RETRIES);

        record.retry_count += 1;

        if record.retry_count > max {
            record.status = PaymentStatus::Failed;
            env.storage()
                .instance()
                .set(&DataKey::Payment(payment_id), &record);

            env.events().publish(
                (Symbol::new(&env, "PaymentFailed"),),
                (payment_id, record.sub_id, record.retry_count),
            );

            return PaymentStatus::Failed;
        }

        record.status = PaymentStatus::Retrying;
        env.storage()
            .instance()
            .set(&DataKey::Payment(payment_id), &record);

        env.events().publish(
            (Symbol::new(&env, "PaymentRetry"),),
            (payment_id, record.sub_id, record.retry_count),
        );

        PaymentStatus::Retrying
    }

    /// Confirm a previously retrying payment as successful.
    pub fn confirm_retry_success(env: Env, caller: Address, payment_id: u32) {
        caller.require_auth();

        let mut record: PaymentRecord = env
            .storage()
            .instance()
            .get(&DataKey::Payment(payment_id))
            .unwrap_or_else(|| panic_with_error!(&env, PayError::PaymentNotFound));

        record.status = PaymentStatus::Success;
        record.timestamp = env.ledger().timestamp();
        env.storage()
            .instance()
            .set(&DataKey::Payment(payment_id), &record);

        env.events().publish(
            (Symbol::new(&env, "PaymentConfirmed"),),
            (payment_id, record.sub_id),
        );
    }

    // -----------------------------------------------------------------------
    // Getters
    // -----------------------------------------------------------------------

    pub fn get_payment(env: Env, payment_id: u32) -> PaymentRecord {
        env.storage()
            .instance()
            .get(&DataKey::Payment(payment_id))
            .unwrap_or_else(|| panic_with_error!(&env, PayError::PaymentNotFound))
    }

    /// Return all payment IDs for a given subscription (history).
    pub fn get_sub_payment_history(env: Env, sub_id: u32) -> Vec<u32> {
        env.storage()
            .instance()
            .get(&DataKey::SubPayments(sub_id))
            .unwrap_or(Vec::new(&env))
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    fn persist_payment(env: &Env, payment_id: u32, record: &PaymentRecord, sub_id: u32) {
        env.storage()
            .instance()
            .set(&DataKey::Payment(payment_id), record);
        env.storage()
            .instance()
            .set(&DataKey::PaymentCounter, &payment_id);

        let mut history: Vec<u32> = env
            .storage()
            .instance()
            .get(&DataKey::SubPayments(sub_id))
            .unwrap_or(Vec::new(env));
        history.push_back(payment_id);
        env.storage()
            .instance()
            .set(&DataKey::SubPayments(sub_id), &history);
    }
}
