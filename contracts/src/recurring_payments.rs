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
#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype,
    Address, Env, BytesN, Vec, Map, Symbol, panic_with_error, log,
};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    PaymentHistory,
    FailedPayments,
    MaxRetries,
    Admin,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentRecord {
    pub id: BytesN<32>,
    pub subscription_id: BytesN<32>,
    pub subscriber: Address,
    pub merchant: Address,
    pub amount: i128,
    pub token: Address,
    pub timestamp: u64,
    pub status: PaymentStatus,
    pub retry_count: u32,
    pub tx_hash: BytesN<32>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PaymentStatus {
    Success,
    Failed,
    Retried,
    Refunded,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FailedPayment {
    pub subscription_id: BytesN<32>,
    pub retry_count: u32,
    pub last_attempt: u64,
    pub next_retry: u64,
    pub reason: String,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum PaymentError {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    Unauthorized = 3,
    SubscriptionNotFound = 4,
    InsufficientBalance = 5,
    TransferFailed = 6,
    MaxRetriesExceeded = 7,
    PaymentNotFound = 8,
    InvalidAmount = 9,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentExecutedEvent {
    pub payment_id: BytesN<32>,
    pub subscription_id: BytesN<32>,
    pub amount: i128,
    pub status: PaymentStatus,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentRetriedEvent {
    pub payment_id: BytesN<32>,
    pub subscription_id: BytesN<32>,
    pub retry_count: u32,
    pub success: bool,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentHistoryEvent {
    pub subscription_id: BytesN<32>,
    pub total_payments: u32,
    pub total_amount: i128,
}

pub struct RecurringPayments;

#[contractimpl]
impl RecurringPayments {
    pub fn init(env: Env, admin: Address, max_retries: u32) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, PaymentError::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::MaxRetries, &max_retries);
        env.storage().instance().set(&DataKey::PaymentHistory, &Vec::<PaymentRecord>::new(&env));
        env.storage().instance().set(&DataKey::FailedPayments, &Vec::<FailedPayment>::new(&env));
    }

    pub fn execute_payment(
        env: Env,
        subscription_id: BytesN<32>,
        subscription_contract: Address,
    ) -> BytesN<32> {
        let subscription: super::subscription_service::Subscription = 
            env.invoke_contract(
                &subscription_contract,
                &Symbol::new(&env, "get_subscription"),
                Vec::from_array(&env, [subscription_id.clone().into_val(&env)]),
            );

        if subscription.status != super::subscription_service::SubscriptionStatus::Active {
            panic_with_error!(&env, PaymentError::SubscriptionNotFound);
        }

        let now = env.ledger().timestamp();
        if now < subscription.next_payment {
            panic_with_error!(&env, PaymentError::InvalidAmount);
        }

        if !Self::check_balance(&env, &subscription) {
            Self::record_failed_payment(&env, &subscription, "Insufficient balance");
            panic_with_error!(&env, PaymentError::InsufficientBalance);
        }

        let payment_id = Self::generate_payment_id(&env, &subscription);
        
        match Self::transfer_payment(&env, &subscription) {
            Ok(tx_hash) => {
                let record = PaymentRecord {
                    id: payment_id.clone(),
                    subscription_id: subscription.id.clone(),
                    subscriber: subscription.subscriber.clone(),
                    merchant: subscription.merchant.clone(),
                    amount: subscription.amount,
                    token: subscription.token.clone(),
                    timestamp: now,
                    status: PaymentStatus::Success,
                    retry_count: 0,
                    tx_hash,
                };

                Self::save_payment_record(&env, &record);
                Self::clear_failed_payment(&env, &subscription.id);
                Self::update_subscription_payment(&env, &subscription, &subscription_contract);

                env.events().publish(
                    (Symbol::new(&env, "payment_executed"), Symbol::new(&env, "v1")),
                    PaymentExecutedEvent {
                        payment_id: payment_id.clone(),
                        subscription_id: subscription.id.clone(),
                        amount: subscription.amount,
                        status: PaymentStatus::Success,
                    },
                );

                payment_id
            }
            Err(_) => {
                Self::record_failed_payment(&env, &subscription, "Transfer failed");
                panic_with_error!(&env, PaymentError::TransferFailed);
            }
        }
    }

    pub fn retry_failed_payment(
        env: Env,
        subscription_id: BytesN<32>,
        subscription_contract: Address,
    ) -> Option<BytesN<32>> {
        let failed_payments: Vec<FailedPayment> = env.storage().instance().get(&DataKey::FailedPayments).unwrap();
        let failed_idx = failed_payments.iter().position(|f| f.subscription_id == subscription_id);

        if failed_idx.is_none() {
            return None;
        }

        let failed_payment = failed_payments.get(failed_idx.unwrap()).unwrap();
        let max_retries: u32 = env.storage().instance().get(&DataKey::MaxRetries).unwrap();

        if failed_payment.retry_count >= max_retries {
            panic_with_error!(&env, PaymentError::MaxRetriesExceeded);
        }

        let subscription: super::subscription_service::Subscription = 
            env.invoke_contract(
                &subscription_contract,
                &Symbol::new(&env, "get_subscription"),
                Vec::from_array(&env, [subscription_id.clone().into_val(&env)]),
            );

        if subscription.status != super::subscription_service::SubscriptionStatus::Active {
            return None;
        }

        let now = env.ledger().timestamp();
        if !Self::check_balance(&env, &subscription) {
            return None;
        }

        let payment_id = Self::generate_payment_id(&env, &subscription);

        match Self::transfer_payment(&env, &subscription) {
            Ok(tx_hash) => {
                let record = PaymentRecord {
                    id: payment_id.clone(),
                    subscription_id: subscription.id.clone(),
                    subscriber: subscription.subscriber.clone(),
                    merchant: subscription.merchant.clone(),
                    amount: subscription.amount,
                    token: subscription.token.clone(),
                    timestamp: now,
                    status: PaymentStatus::Success,
                    retry_count: failed_payment.retry_count + 1,
                    tx_hash,
                };

                Self::save_payment_record(&env, &record);
                
                let mut updated_failed = failed_payments;
                updated_failed.remove(failed_idx.unwrap() as u32);
                env.storage().instance().set(&DataKey::FailedPayments, &updated_failed);

                Self::update_subscription_payment(&env, &subscription, &subscription_contract);

                env.events().publish(
                    (Symbol::new(&env, "payment_retried"), Symbol::new(&env, "v1")),
                    PaymentRetriedEvent {
                        payment_id: payment_id.clone(),
                        subscription_id: subscription.id.clone(),
                        retry_count: record.retry_count,
                        success: true,
                    },
                );

                Some(payment_id)
            }
            Err(_) => {
                let mut updated_failed = failed_payments;
                let mut failed = updated_failed.get(failed_idx.unwrap()).unwrap();
                failed.retry_count += 1;
                failed.last_attempt = now;
                failed.next_retry = now + 86400;
                updated_failed.set(failed_idx.unwrap(), failed);
                env.storage().instance().set(&DataKey::FailedPayments, &updated_failed);

                env.events().publish(
                    (Symbol::new(&env, "payment_retried"), Symbol::new(&env, "v1")),
                    PaymentRetriedEvent {
                        payment_id: payment_id.clone(),
                        subscription_id: subscription.id.clone(),
                        retry_count: failed.retry_count,
                        success: false,
                    },
                );

                None
            }
        }
    }

    pub fn get_payment_history(
        env: Env,
        subscription_id: BytesN<32>,
    ) -> Vec<PaymentRecord> {
        let history: Vec<PaymentRecord> = env.storage().instance().get(&DataKey::PaymentHistory).unwrap();
        history.iter().filter(|p| p.subscription_id == subscription_id).collect()
    }

    pub fn get_failed_payments(env: Env) -> Vec<FailedPayment> {
        env.storage().instance().get(&DataKey::FailedPayments).unwrap()
    }

    pub fn get_subscription_total_paid(
        env: Env,
        subscription_id: BytesN<32>,
    ) -> i128 {
        let history: Vec<PaymentRecord> = env.storage().instance().get(&DataKey::PaymentHistory).unwrap();
        history.iter()
            .filter(|p| p.subscription_id == subscription_id && p.status == PaymentStatus::Success)
            .map(|p| p.amount)
            .sum()
    }

    fn check_balance(env: &Env, subscription: &super::subscription_service::Subscription) -> bool {
        use soroban_sdk::token::Client as TokenClient;
        let token_client = TokenClient::new(env, &subscription.token);
        let balance = token_client.balance(&subscription.subscriber);
        balance >= subscription.amount
    }

    fn transfer_payment(
        env: &Env,
        subscription: &super::subscription_service::Subscription,
    ) -> Result<BytesN<32>, ()> {
        use soroban_sdk::token::Client as TokenClient;
        let token_client = TokenClient::new(env, &subscription.token);
        
        let contract_address = env.current_contract_address();
        
        token_client.transfer(&subscription.subscriber, &contract_address, &subscription.amount);
        token_client.transfer(&contract_address, &subscription.merchant, &subscription.amount);
        
        let mut tx_bytes = [0u8; 32];
        let timestamp = env.ledger().timestamp();
        let ts_bytes = timestamp.to_be_bytes();
        tx_bytes[..8].copy_from_slice(&ts_bytes);
        let sub_bytes = subscription.subscriber.to_string().to_bytes();
        for (i, &byte) in sub_bytes.iter().take(24).enumerate() {
            tx_bytes[8 + i] = byte;
        }
        
        Ok(BytesN::from_array(env, &tx_bytes))
    }

    fn record_failed_payment(
        env: &Env,
        subscription: &super::subscription_service::Subscription,
        reason: &str,
    ) {
        let mut failed_payments: Vec<FailedPayment> = env.storage().instance().get(&DataKey::FailedPayments).unwrap();
        
        let existing_idx = failed_payments.iter().position(|f| f.subscription_id == subscription.id);
        
        if let Some(idx) = existing_idx {
            let mut failed = failed_payments.get(idx).unwrap();
            failed.retry_count += 1;
            failed.last_attempt = env.ledger().timestamp();
            failed.next_retry = env.ledger().timestamp() + 86400;
            failed.reason = String::from_str(env, reason);
            failed_payments.set(idx, failed);
        } else {
            let failed = FailedPayment {
                subscription_id: subscription.id.clone(),
                retry_count: 1,
                last_attempt: env.ledger().timestamp(),
                next_retry: env.ledger().timestamp() + 86400,
                reason: String::from_str(env, reason),
            };
            failed_payments.push_back(failed);
        }
        
        env.storage().instance().set(&DataKey::FailedPayments, &failed_payments);
    }

    fn save_payment_record(env: &Env, record: &PaymentRecord) {
        let mut history: Vec<PaymentRecord> = env.storage().instance().get(&DataKey::PaymentHistory).unwrap();
        history.push_back(record.clone());
        env.storage().instance().set(&DataKey::PaymentHistory, &history);
    }

    fn clear_failed_payment(env: &Env, subscription_id: &BytesN<32>) {
        let failed_payments: Vec<FailedPayment> = env.storage().instance().get(&DataKey::FailedPayments).unwrap();
        let idx = failed_payments.iter().position(|f| f.subscription_id == *subscription_id);
        
        if let Some(idx) = idx {
            let mut updated = failed_payments;
            updated.remove(idx as u32);
            env.storage().instance().set(&DataKey::FailedPayments, &updated);
        }
    }

    fn update_subscription_payment(
        env: &Env,
        subscription: &super::subscription_service::Subscription,
        subscription_contract: &Address,
    ) {
        let now = env.ledger().timestamp();
        env.invoke_contract(
            subscription_contract,
            &Symbol::new(env, "update_payment_info"),
            Vec::from_array(env, [
                subscription.id.clone().into_val(env),
                now.into_val(env),
                (now + subscription.frequency).into_val(env),
                (subscription.total_paid + subscription.amount).into_val(env),
            ]),
        );
    }

    fn generate_payment_id(env: &Env, subscription: &super::subscription_service::Subscription) -> BytesN<32> {
        let mut id_bytes = [0u8; 32];
        let timestamp = env.ledger().timestamp();
        let ts_bytes = timestamp.to_be_bytes();
        id_bytes[..8].copy_from_slice(&ts_bytes);
        let sub_bytes = subscription.subscriber.to_string().to_bytes();
        for (i, &byte) in sub_bytes.iter().take(24).enumerate() {
            id_bytes[8 + i] = byte;
        }
        BytesN::from_array(env, &id_bytes)
    }

    fn require_admin(env: &Env, address: &Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if *address != admin {
            panic_with_error!(env, PaymentError::Unauthorized);
        }
    }
}
