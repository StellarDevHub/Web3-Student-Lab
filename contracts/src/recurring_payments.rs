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
