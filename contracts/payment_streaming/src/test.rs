//! Tests for SC-HARD-10 — Real-Time Payment Streaming & Clawback Mechanism.
//!
//! Covers:
//! - Stream creation and state initialisation
//! - Per-second vesting arithmetic (exact vested amounts based on elapsed time)
//! - Partial withdrawals at various timestamps
//! - Full withdrawal exhausts stream
//! - Sender cancellation with correct clawback calculation
//! - Duplicate withdrawal on cancelled stream rejected
//! - Multiple independent streams

use crate::{PaymentStreaming, PaymentStreamingClient, Stream, StreamStatus};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Deploy and return (env, contract_id, sender, recipient).
fn deploy() -> (Env, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(PaymentStreaming, ());
    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);
    (env, contract_id, sender, recipient)
}

/// Create a stream: 1000 tokens over 1000 seconds (1 token/second).
/// start=100, stop=1100. Returns stream_id.
fn create_default_stream(
    env: &Env,
    client: &PaymentStreamingClient,
    sender: &Address,
    recipient: &Address,
) -> u32 {
    // start_time must be >= ledger timestamp; ledger starts at 0.
    client.create_stream(sender, recipient, &1000, &100, &1100)
}

// ── Creation ──────────────────────────────────────────────────────────────────

#[test]
fn test_create_stream_stores_state() {
    let (env, contract_id, sender, recipient) = deploy();
    let client = PaymentStreamingClient::new(&env, &contract_id);
    let id = create_default_stream(&env, &client, &sender, &recipient);

    let stream = client.get_stream(&id).unwrap();
    assert_eq!(stream.deposit, 1000);
    assert_eq!(stream.withdrawn, 0);
    assert_eq!(stream.status, StreamStatus::Active);
    assert_eq!(stream.start_time, 100);
    assert_eq!(stream.stop_time, 1100);
}

#[test]
fn test_multiple_streams_get_distinct_ids() {
    let (env, contract_id, sender, recipient) = deploy();
    let client = PaymentStreamingClient::new(&env, &contract_id);

    let id0 = create_default_stream(&env, &client, &sender, &recipient);
    let id1 = client.create_stream(&sender, &recipient, &500, &100, &600);

    assert_ne!(id0, id1);
    assert!(client.get_stream(&id0).is_some());
    assert!(client.get_stream(&id1).is_some());
}

// ── Vested amount arithmetic ──────────────────────────────────────────────────

#[test]
fn test_vested_zero_before_start() {
    let (env, contract_id, sender, recipient) = deploy();
    let client = PaymentStreamingClient::new(&env, &contract_id);
    let id = create_default_stream(&env, &client, &sender, &recipient);

    // Ledger still at 0 — before start_time=100
    assert_eq!(client.vested(&id), 0);
    assert_eq!(client.claimable(&id), 0);
}

#[test]
fn test_vested_halfway() {
    let (env, contract_id, sender, recipient) = deploy();
    let client = PaymentStreamingClient::new(&env, &contract_id);
    let id = create_default_stream(&env, &client, &sender, &recipient);

    // Advance to t=600: 500 seconds elapsed out of 1000 → 500 tokens vested
    env.ledger().with_mut(|l| l.timestamp = 600);
    assert_eq!(client.vested(&id), 500);
    assert_eq!(client.claimable(&id), 500);
}

#[test]
fn test_vested_fully_at_stop_time() {
    let (env, contract_id, sender, recipient) = deploy();
    let client = PaymentStreamingClient::new(&env, &contract_id);
    let id = create_default_stream(&env, &client, &sender, &recipient);

    // Advance past stop_time
    env.ledger().with_mut(|l| l.timestamp = 2000);
    assert_eq!(client.vested(&id), 1000);
    assert_eq!(client.claimable(&id), 1000);
}

#[test]
fn test_vested_exact_per_second() {
    let (env, contract_id, sender, recipient) = deploy();
    let client = PaymentStreamingClient::new(&env, &contract_id);
    // 600 tokens, 60 seconds → 10 tokens/second
    let id = client.create_stream(&sender, &recipient, &600, &0, &60);

    env.ledger().with_mut(|l| l.timestamp = 30); // half elapsed
    assert_eq!(client.vested(&id), 300);

    env.ledger().with_mut(|l| l.timestamp = 10);
    assert_eq!(client.vested(&id), 100);
}

// ── Partial withdrawals ───────────────────────────────────────────────────────

#[test]
fn test_partial_withdrawal_updates_withdrawn() {
    let (env, contract_id, sender, recipient) = deploy();
    let client = PaymentStreamingClient::new(&env, &contract_id);
    let id = create_default_stream(&env, &client, &sender, &recipient);

    env.ledger().with_mut(|l| l.timestamp = 600); // 500 vested
    let amount = client.withdraw(&recipient, &id);
    assert_eq!(amount, 500);

    let stream = client.get_stream(&id).unwrap();
    assert_eq!(stream.withdrawn, 500);
    assert_eq!(stream.status, StreamStatus::Active);

    // claimable should be ~0 immediately after (no time advance)
    assert_eq!(client.claimable(&id), 0);
}

#[test]
fn test_sequential_partial_withdrawals() {
    let (env, contract_id, sender, recipient) = deploy();
    let client = PaymentStreamingClient::new(&env, &contract_id);
    let id = create_default_stream(&env, &client, &sender, &recipient);

    // First pull at t=300: 200 vested
    env.ledger().with_mut(|l| l.timestamp = 300);
    let first = client.withdraw(&recipient, &id);
    assert_eq!(first, 200);

    // Second pull at t=700: 600 vested total, 200 already withdrawn → 400 more
    env.ledger().with_mut(|l| l.timestamp = 700);
    let second = client.withdraw(&recipient, &id);
    assert_eq!(second, 400);

    let stream = client.get_stream(&id).unwrap();
    assert_eq!(stream.withdrawn, 600);
}

#[test]
fn test_full_withdrawal_exhausts_stream() {
    let (env, contract_id, sender, recipient) = deploy();
    let client = PaymentStreamingClient::new(&env, &contract_id);
    let id = create_default_stream(&env, &client, &sender, &recipient);

    env.ledger().with_mut(|l| l.timestamp = 2000); // past stop
    client.withdraw(&recipient, &id);

    assert_eq!(client.get_stream(&id).unwrap().status, StreamStatus::Exhausted);
}

// ── Nothing to withdraw ───────────────────────────────────────────────────────

#[test]
#[should_panic(expected = "nothing to withdraw")]
fn test_withdraw_before_any_vesting_panics() {
    let (env, contract_id, sender, recipient) = deploy();
    let client = PaymentStreamingClient::new(&env, &contract_id);
    let id = create_default_stream(&env, &client, &sender, &recipient);
    // ledger = 0, before start_time = 100
    client.withdraw(&recipient, &id);
}

// ── Cancellation / clawback ───────────────────────────────────────────────────

#[test]
fn test_cancel_at_halfway_splits_correctly() {
    let (env, contract_id, sender, recipient) = deploy();
    let client = PaymentStreamingClient::new(&env, &contract_id);
    let id = create_default_stream(&env, &client, &sender, &recipient);

    // t=600 → 500 vested; nothing withdrawn yet
    env.ledger().with_mut(|l| l.timestamp = 600);
    let (recipient_owed, clawback) = client.cancel_stream(&sender, &id);

    assert_eq!(recipient_owed, 500, "recipient should receive vested portion");
    assert_eq!(clawback, 500, "sender should clawback unvested portion");

    assert_eq!(client.get_stream(&id).unwrap().status, StreamStatus::Cancelled);
}

#[test]
fn test_cancel_after_partial_withdrawal() {
    let (env, contract_id, sender, recipient) = deploy();
    let client = PaymentStreamingClient::new(&env, &contract_id);
    let id = create_default_stream(&env, &client, &sender, &recipient);

    // Recipient withdraws 200 at t=300
    env.ledger().with_mut(|l| l.timestamp = 300);
    client.withdraw(&recipient, &id);

    // Sender cancels at t=600: 500 vested total, 200 already taken → 300 owed, 500 clawback
    env.ledger().with_mut(|l| l.timestamp = 600);
    let (owed, clawback) = client.cancel_stream(&sender, &id);
    assert_eq!(owed, 300);
    assert_eq!(clawback, 500);
}

#[test]
fn test_cancel_at_full_vesting_no_clawback() {
    let (env, contract_id, sender, recipient) = deploy();
    let client = PaymentStreamingClient::new(&env, &contract_id);
    let id = create_default_stream(&env, &client, &sender, &recipient);

    // Cancel after full vesting — nothing left to clawback
    env.ledger().with_mut(|l| l.timestamp = 2000);
    let (owed, clawback) = client.cancel_stream(&sender, &id);
    assert_eq!(owed, 1000);
    assert_eq!(clawback, 0);
}

// ── Post-cancel guard ─────────────────────────────────────────────────────────

#[test]
#[should_panic(expected = "stream not active")]
fn test_withdraw_on_cancelled_stream_panics() {
    let (env, contract_id, sender, recipient) = deploy();
    let client = PaymentStreamingClient::new(&env, &contract_id);
    let id = create_default_stream(&env, &client, &sender, &recipient);

    env.ledger().with_mut(|l| l.timestamp = 600);
    client.cancel_stream(&sender, &id);
    client.withdraw(&recipient, &id);
}

#[test]
#[should_panic(expected = "stream not active")]
fn test_cancel_already_cancelled_stream_panics() {
    let (env, contract_id, sender, recipient) = deploy();
    let client = PaymentStreamingClient::new(&env, &contract_id);
    let id = create_default_stream(&env, &client, &sender, &recipient);

    env.ledger().with_mut(|l| l.timestamp = 600);
    client.cancel_stream(&sender, &id);
    client.cancel_stream(&sender, &id);
}
