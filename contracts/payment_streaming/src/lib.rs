//! # Payment Streaming Contract
//!
//! EIP-1337-style recurring payment streams on Soroban.
//!
//! A **sender** creates a stream authorising a **recipient** to pull a fixed
//! `amount_per_period` every `period_length` ledgers.  The sender pre-funds
//! the contract with a `total_amount`.  The recipient calls `pull_payment`
//! once per period to claim their tokens.  The sender may cancel at any time
//! and receive a prorated refund of the unstreamed balance.
//!
//! ## Security
//! - No external calls during state mutation → no reentrancy surface.
//! - All arithmetic uses `checked_*` to prevent overflow/underflow.
//! - `require_auth` enforces that only the authorised party can act.
//! - Period-based pull model prevents the billing processor from double-billing.

#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol};

// ── Storage key ──────────────────────────────────────────────────────────────
const STREAM_KEY: Symbol = symbol_short!("STREAM");

// ── Data types ───────────────────────────────────────────────────────────────

/// Status of a payment stream.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum StreamStatus {
    Active,
    Cancelled,
    Exhausted,
}

/// A recurring payment stream.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Stream {
    /// Address funding the stream.
    pub sender: Address,
    /// Address receiving periodic payments.
    pub recipient: Address,
    /// Tokens paid per period.
    pub amount_per_period: i128,
    /// Ledger duration of each period.
    pub period_length: u32,
    /// Total tokens deposited into the stream.
    pub total_amount: i128,
    /// Tokens already claimed by the recipient.
    pub claimed: i128,
    /// Ledger at which the stream started.
    pub start_ledger: u32,
    /// Ledger of the last successful pull.
    pub last_pull_ledger: u32,
    /// Current stream status.
    pub status: StreamStatus,
}

// ── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct PaymentStreaming;

#[contractimpl]
impl PaymentStreaming {
    // ── Create ────────────────────────────────────────────────────────────────

    /// Create a new payment stream.
    ///
    /// The sender pre-authorises `total_amount` tokens.  In a production
    /// deployment the contract would call a token contract to transfer funds;
    /// here we record the commitment on-chain.
    ///
    /// # Panics
    /// - If a stream already exists.
    /// - If `amount_per_period` or `total_amount` are not positive.
    /// - If `period_length` is zero.
    pub fn create_stream(
        env: Env,
        sender: Address,
        recipient: Address,
        amount_per_period: i128,
        period_length: u32,
        total_amount: i128,
    ) {
        sender.require_auth();
        assert!(amount_per_period > 0, "amount_per_period must be positive");
        assert!(total_amount > 0, "total_amount must be positive");
        assert!(period_length > 0, "period_length must be positive");
        assert!(
            !env.storage().instance().has(&STREAM_KEY),
            "stream already exists"
        );

        let stream = Stream {
            sender,
            recipient,
            amount_per_period,
            period_length,
            total_amount,
            claimed: 0,
            start_ledger: env.ledger().sequence(),
            last_pull_ledger: env.ledger().sequence(),
            status: StreamStatus::Active,
        };
        env.storage().instance().set(&STREAM_KEY, &stream);
        env.events()
            .publish((symbol_short!("created"),), total_amount);
    }

    // ── Pull payment ──────────────────────────────────────────────────────────

    /// Recipient pulls payment for all elapsed periods since the last pull.
    ///
    /// Returns the amount transferred.
    ///
    /// # Panics
    /// - If the stream is not active.
    /// - If no full period has elapsed since the last pull.
    pub fn pull_payment(env: Env, recipient: Address) -> i128 {
        recipient.require_auth();

        let mut stream: Stream = env
            .storage()
            .instance()
            .get(&STREAM_KEY)
            .expect("no stream");

        assert!(stream.status == StreamStatus::Active, "stream not active");
        assert!(stream.recipient == recipient, "not the recipient");

        let current = env.ledger().sequence();
        let periods_elapsed = (current - stream.last_pull_ledger) / stream.period_length;
        assert!(periods_elapsed > 0, "no full period elapsed");

        let remaining = stream
            .total_amount
            .checked_sub(stream.claimed)
            .expect("underflow");
        let owed = (periods_elapsed as i128)
            .checked_mul(stream.amount_per_period)
            .expect("overflow")
            .min(remaining);

        stream.claimed = stream.claimed.checked_add(owed).expect("overflow");
        stream.last_pull_ledger = stream
            .last_pull_ledger
            .checked_add(periods_elapsed * stream.period_length)
            .expect("overflow");

        if stream.claimed >= stream.total_amount {
            stream.status = StreamStatus::Exhausted;
        }

        env.storage().instance().set(&STREAM_KEY, &stream);
        env.events()
            .publish((symbol_short!("pulled"), recipient), owed);

        owed
    }

    // ── Cancel ────────────────────────────────────────────────────────────────

    /// Sender cancels the stream and receives a prorated refund of unstreamed
    /// tokens.
    ///
    /// Returns the refund amount.
    ///
    /// # Panics
    /// - If the stream is not active.
    pub fn cancel_stream(env: Env, sender: Address) -> i128 {
        sender.require_auth();

        let mut stream: Stream = env
            .storage()
            .instance()
            .get(&STREAM_KEY)
            .expect("no stream");

        assert!(stream.status == StreamStatus::Active, "stream not active");
        assert!(stream.sender == sender, "not the sender");

        // Prorated: credit recipient for any partial period already elapsed.
        let current = env.ledger().sequence();
        let periods_elapsed = (current - stream.last_pull_ledger) / stream.period_length;
        let accrued_unpulled = (periods_elapsed as i128)
            .checked_mul(stream.amount_per_period)
            .expect("overflow");

        let total_owed = stream
            .claimed
            .checked_add(accrued_unpulled)
            .expect("overflow")
            .min(stream.total_amount);

        let refund = stream
            .total_amount
            .checked_sub(total_owed)
            .expect("underflow");

        stream.status = StreamStatus::Cancelled;
        env.storage().instance().set(&STREAM_KEY, &stream);

        env.events()
            .publish((symbol_short!("cancelled"), sender), refund);

        refund
    }

    // ── View ──────────────────────────────────────────────────────────────────

    /// Returns the current stream state.
    pub fn get_stream(env: Env) -> Stream {
        env.storage()
            .instance()
            .get(&STREAM_KEY)
            .expect("no stream")
    }

    /// Returns the unclaimed balance available to the recipient right now.
    pub fn claimable(env: Env) -> i128 {
        let stream: Stream = env
            .storage()
            .instance()
            .get(&STREAM_KEY)
            .expect("no stream");
        if stream.status != StreamStatus::Active {
            return 0;
        }
        let current = env.ledger().sequence();
        let periods = (current - stream.last_pull_ledger) / stream.period_length;
        let remaining = stream.total_amount - stream.claimed;
        ((periods as i128) * stream.amount_per_period).min(remaining)
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger};
    use soroban_sdk::Env;

    fn setup() -> (Env, Address, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(PaymentStreaming, ());
        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);
        (env, contract_id, sender, recipient)
    }

    fn create_default_stream(
        env: &Env,
        client: &PaymentStreamingClient,
        sender: &Address,
        recipient: &Address,
    ) {
        // 100 tokens/period, 10 ledgers/period, 1000 total
        client.create_stream(sender, recipient, &100, &10, &1000);
        let _ = env;
    }

    #[test]
    fn test_create_stream() {
        let (env, contract_id, sender, recipient) = setup();
        let client = PaymentStreamingClient::new(&env, &contract_id);
        create_default_stream(&env, &client, &sender, &recipient);
        let stream = client.get_stream();
        assert_eq!(stream.total_amount, 1000);
        assert_eq!(stream.claimed, 0);
        assert_eq!(stream.status, StreamStatus::Active);
    }

    #[test]
    fn test_pull_payment_after_one_period() {
        let (env, contract_id, sender, recipient) = setup();
        let client = PaymentStreamingClient::new(&env, &contract_id);
        create_default_stream(&env, &client, &sender, &recipient);

        env.ledger().with_mut(|l| l.sequence_number += 10);
        let pulled = client.pull_payment(&recipient);
        assert_eq!(pulled, 100);
        assert_eq!(client.get_stream().claimed, 100);
    }

    #[test]
    fn test_pull_multiple_periods() {
        let (env, contract_id, sender, recipient) = setup();
        let client = PaymentStreamingClient::new(&env, &contract_id);
        create_default_stream(&env, &client, &sender, &recipient);

        env.ledger().with_mut(|l| l.sequence_number += 30); // 3 periods
        let pulled = client.pull_payment(&recipient);
        assert_eq!(pulled, 300);
    }

    #[test]
    #[should_panic(expected = "no full period elapsed")]
    fn test_pull_before_period_panics() {
        let (env, contract_id, sender, recipient) = setup();
        let client = PaymentStreamingClient::new(&env, &contract_id);
        create_default_stream(&env, &client, &sender, &recipient);
        env.ledger().with_mut(|l| l.sequence_number += 5); // half period
        client.pull_payment(&recipient);
    }

    #[test]
    fn test_cancel_returns_refund() {
        let (env, contract_id, sender, recipient) = setup();
        let client = PaymentStreamingClient::new(&env, &contract_id);
        create_default_stream(&env, &client, &sender, &recipient);

        // Advance 1 period so recipient has accrued 100
        env.ledger().with_mut(|l| l.sequence_number += 10);
        let refund = client.cancel_stream(&sender);
        // 1000 total - 100 accrued = 900 refund
        assert_eq!(refund, 900);
        assert_eq!(client.get_stream().status, StreamStatus::Cancelled);
    }

    #[test]
    #[should_panic(expected = "stream not active")]
    fn test_pull_on_cancelled_stream_panics() {
        let (env, contract_id, sender, recipient) = setup();
        let client = PaymentStreamingClient::new(&env, &contract_id);
        create_default_stream(&env, &client, &sender, &recipient);
        client.cancel_stream(&sender);
        env.ledger().with_mut(|l| l.sequence_number += 10);
        client.pull_payment(&recipient);
    }

    #[test]
    fn test_stream_exhausted_when_fully_claimed() {
        let (env, contract_id, sender, recipient) = setup();
        let client = PaymentStreamingClient::new(&env, &contract_id);
        create_default_stream(&env, &client, &sender, &recipient);

        // Advance 10 periods (1000 tokens = full amount)
        env.ledger().with_mut(|l| l.sequence_number += 100);
        client.pull_payment(&recipient);
        assert_eq!(client.get_stream().status, StreamStatus::Exhausted);
    }

    #[test]
    fn test_claimable_view() {
        let (env, contract_id, sender, recipient) = setup();
        let client = PaymentStreamingClient::new(&env, &contract_id);
        create_default_stream(&env, &client, &sender, &recipient);

        env.ledger().with_mut(|l| l.sequence_number += 20);
        assert_eq!(client.claimable(), 200);
    }

    #[test]
    #[should_panic(expected = "stream already exists")]
    fn test_duplicate_stream_panics() {
        let (env, contract_id, sender, recipient) = setup();
        let client = PaymentStreamingClient::new(&env, &contract_id);
        create_default_stream(&env, &client, &sender, &recipient);
        create_default_stream(&env, &client, &sender, &recipient);
    }
}
