//! Tests for the payment streaming contract (SC-070).
//!
//! Covers:
//! - Escrow on creation and the per-second vesting formula `V = rate * (now - start)`
//! - Withdrawals at several timestamps, and exhaustion
//! - Cancellation: accrued amount paid to the recipient, unvested amount refunded
//! - The token balance invariant across a multi-step, multi-stream scenario
//! - Failure paths: withdraw before start, non-recipient withdraw, non-sender cancel,
//!   withdraw after cancel, double cancel, and arithmetic overflow

use crate::{PaymentStreaming, PaymentStreamingClient, StreamStatus};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    Address, Env,
};

const SENDER_FUNDS: i128 = 1_000_000;

// ── Helpers ───────────────────────────────────────────────────────────────────

struct Fixture {
    env: Env,
    contract_id: Address,
    token_id: Address,
    sender: Address,
    recipient: Address,
}

/// Deploy the streaming contract and a Stellar asset token, and fund the sender.
fn setup() -> Fixture {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(PaymentStreaming, ());
    let token_admin = Address::generate(&env);
    let token_id = env
        .register_stellar_asset_contract_v2(token_admin)
        .address();
    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);
    StellarAssetClient::new(&env, &token_id).mint(&sender, &SENDER_FUNDS);
    Fixture {
        env,
        contract_id,
        token_id,
        sender,
        recipient,
    }
}

fn client(fx: &Fixture) -> PaymentStreamingClient<'_> {
    PaymentStreamingClient::new(&fx.env, &fx.contract_id)
}

fn token_client(fx: &Fixture) -> TokenClient<'_> {
    TokenClient::new(&fx.env, &fx.token_id)
}

fn set_time(fx: &Fixture, t: u64) {
    fx.env.ledger().with_mut(|l| l.timestamp = t);
}

/// Create a stream from the fixture's sender to `recipient`.
fn create_with(fx: &Fixture, recipient: &Address, rate: i128, start: u64, stop: u64) -> u32 {
    client(fx).create_stream(&fx.sender, recipient, &fx.token_id, &rate, &start, &stop)
}

/// 10 base units per second over [100, 200): deposit 1000.
fn default_stream(fx: &Fixture) -> u32 {
    create_with(fx, &fx.recipient, 10, 100, 200)
}

/// Asserts that the contract's token balance equals the sum of `deposit - withdrawn`
/// over all Active streams.
fn assert_invariant(fx: &Fixture) {
    let c = client(fx);
    let mut active_sum: i128 = 0;
    for id in 0..c.stream_count() {
        let stream = c.get_stream(&id).unwrap();
        if stream.status == StreamStatus::Active {
            active_sum += stream.deposit - stream.withdrawn;
        }
    }
    assert_eq!(token_client(fx).balance(&fx.contract_id), active_sum);
}

// ── Creation and escrow ───────────────────────────────────────────────────────

#[test]
fn test_create_escrows_deposit() {
    let fx = setup();
    let id = default_stream(&fx);

    let stream = client(&fx).get_stream(&id).unwrap();
    assert_eq!(stream.sender, fx.sender);
    assert_eq!(stream.recipient, fx.recipient);
    assert_eq!(stream.token, fx.token_id);
    assert_eq!(stream.rate_per_second, 10);
    assert_eq!(stream.start_time, 100);
    assert_eq!(stream.stop_time, 200);
    assert_eq!(stream.deposit, 1000);
    assert_eq!(stream.withdrawn, 0);
    assert_eq!(stream.status, StreamStatus::Active);

    assert_eq!(client(&fx).stream_count(), 1);
    assert_eq!(token_client(&fx).balance(&fx.contract_id), 1000);
    assert_eq!(token_client(&fx).balance(&fx.sender), SENDER_FUNDS - 1000);
}

#[test]
fn test_stream_ids_are_distinct() {
    let fx = setup();
    let id0 = default_stream(&fx);
    let id1 = create_with(&fx, &fx.recipient, 3, 150, 250);
    assert_ne!(id0, id1);
    assert_eq!(client(&fx).stream_count(), 2);
}

// ── Per-second vesting: V = rate * (now - start) ──────────────────────────────

#[test]
fn test_vesting_is_linear_per_second() {
    let fx = setup();
    let id = default_stream(&fx);
    let c = client(&fx);

    set_time(&fx, 50);
    assert_eq!(c.vested(&id), 0);
    set_time(&fx, 100);
    assert_eq!(c.vested(&id), 0);
    set_time(&fx, 101);
    assert_eq!(c.vested(&id), 10);
    set_time(&fx, 137);
    assert_eq!(c.vested(&id), 370);
    set_time(&fx, 200);
    assert_eq!(c.vested(&id), 1000);
    set_time(&fx, 5000);
    assert_eq!(c.vested(&id), 1000, "vesting is clamped at the deposit");
}

#[test]
fn test_withdraw_pays_accrued_amount() {
    let fx = setup();
    let id = default_stream(&fx);

    set_time(&fx, 130);
    assert_eq!(client(&fx).claimable(&id), 300);
    let first = client(&fx).withdraw(&fx.recipient, &id);
    assert_eq!(first, 300);
    assert_eq!(token_client(&fx).balance(&fx.recipient), 300);
    assert_eq!(client(&fx).claimable(&id), 0);

    set_time(&fx, 145);
    let second = client(&fx).withdraw(&fx.recipient, &id);
    assert_eq!(second, 150);

    let stream = client(&fx).get_stream(&id).unwrap();
    assert_eq!(stream.withdrawn, 450);
    assert_eq!(stream.status, StreamStatus::Active);
    assert_invariant(&fx);
}

#[test]
fn test_full_withdrawal_exhausts_stream() {
    let fx = setup();
    let id = default_stream(&fx);

    set_time(&fx, 300);
    assert_eq!(client(&fx).withdraw(&fx.recipient, &id), 1000);
    assert_eq!(
        client(&fx).get_stream(&id).unwrap().status,
        StreamStatus::Exhausted
    );
    assert_eq!(token_client(&fx).balance(&fx.contract_id), 0);
    assert_invariant(&fx);
}

// ── Cancellation ──────────────────────────────────────────────────────────────

#[test]
fn test_cancel_mid_stream_vests_accrued_and_refunds_unvested() {
    let fx = setup();
    let id = default_stream(&fx);

    set_time(&fx, 150);
    let refund = client(&fx).cancel_stream(&fx.sender, &id);

    assert_eq!(refund, 500, "unvested 500 goes back to the sender");
    assert_eq!(token_client(&fx).balance(&fx.recipient), 500, "accrued 500 vests to recipient");
    assert_eq!(token_client(&fx).balance(&fx.sender), SENDER_FUNDS - 1000 + 500);
    assert_eq!(token_client(&fx).balance(&fx.contract_id), 0);

    let stream = client(&fx).get_stream(&id).unwrap();
    assert_eq!(stream.status, StreamStatus::Cancelled);
    assert_invariant(&fx);
}

#[test]
fn test_cancel_after_partial_withdrawal_pays_remaining_accrued() {
    let fx = setup();
    let id = default_stream(&fx);

    set_time(&fx, 120);
    assert_eq!(client(&fx).withdraw(&fx.recipient, &id), 200);

    set_time(&fx, 150);
    let refund = client(&fx).cancel_stream(&fx.sender, &id);

    assert_eq!(refund, 500);
    // 500 vested in total: 200 already withdrawn, 300 settled at cancel.
    assert_eq!(token_client(&fx).balance(&fx.recipient), 500);
    assert_eq!(token_client(&fx).balance(&fx.contract_id), 0);
    assert_invariant(&fx);
}

#[test]
fn test_cancel_before_start_refunds_everything() {
    let fx = setup();
    let id = default_stream(&fx);

    set_time(&fx, 50);
    assert_eq!(client(&fx).cancel_stream(&fx.sender, &id), 1000);
    assert_eq!(token_client(&fx).balance(&fx.recipient), 0);
    assert_eq!(token_client(&fx).balance(&fx.sender), SENDER_FUNDS);
    assert_invariant(&fx);
}

#[test]
fn test_cancel_after_full_vesting_refunds_nothing() {
    let fx = setup();
    let id = default_stream(&fx);

    set_time(&fx, 500);
    assert_eq!(client(&fx).cancel_stream(&fx.sender, &id), 0);
    assert_eq!(token_client(&fx).balance(&fx.recipient), 1000);
    assert_invariant(&fx);
}

// ── Token balance invariant across a multi-step scenario ──────────────────────

#[test]
fn test_invariant_holds_across_multi_stream_scenario() {
    let fx = setup();
    let recipient2 = Address::generate(&fx.env);

    // s0: 10/s over [100, 200) -> 1000. s1: 3/s over [150, 250) -> 300.
    let s0 = default_stream(&fx);
    assert_invariant(&fx);
    let s1 = create_with(&fx, &recipient2, 3, 150, 250);
    assert_eq!(token_client(&fx).balance(&fx.contract_id), 1300);
    assert_invariant(&fx);

    // t=120: recipient 1 withdraws 200 from s0.
    set_time(&fx, 120);
    assert_eq!(client(&fx).withdraw(&fx.recipient, &s0), 200);
    assert_eq!(token_client(&fx).balance(&fx.contract_id), 1100);
    assert_invariant(&fx);

    // t=180: recipient 2 withdraws 90 from s1.
    set_time(&fx, 180);
    assert_eq!(client(&fx).withdraw(&recipient2, &s1), 90);
    assert_eq!(token_client(&fx).balance(&fx.contract_id), 1010);
    assert_invariant(&fx);

    // t=190: sender cancels s0. Recipient 1 receives 700 (900 vested - 200), sender 100.
    set_time(&fx, 190);
    assert_eq!(client(&fx).cancel_stream(&fx.sender, &s0), 100);
    assert_eq!(token_client(&fx).balance(&fx.contract_id), 210);
    assert_invariant(&fx);

    // t=250: recipient 2 drains the rest of s1 and the stream is exhausted.
    set_time(&fx, 250);
    assert_eq!(client(&fx).withdraw(&recipient2, &s1), 210);
    assert_eq!(token_client(&fx).balance(&fx.contract_id), 0);
    assert_invariant(&fx);

    // A third stream created after the others have settled.
    let s2 = create_with(&fx, &fx.recipient, 1, 250, 300);
    assert_eq!(token_client(&fx).balance(&fx.contract_id), 50);
    assert_invariant(&fx);

    set_time(&fx, 275);
    assert_eq!(client(&fx).withdraw(&fx.recipient, &s2), 25);
    assert_eq!(token_client(&fx).balance(&fx.contract_id), 25);
    assert_invariant(&fx);
}

// ── Failure paths ─────────────────────────────────────────────────────────────

#[test]
fn test_withdraw_before_start_fails() {
    let fx = setup();
    let id = default_stream(&fx);

    set_time(&fx, 50);
    assert!(client(&fx).try_withdraw(&fx.recipient, &id).is_err());
    assert_eq!(token_client(&fx).balance(&fx.recipient), 0);
    assert_eq!(client(&fx).get_stream(&id).unwrap().withdrawn, 0);
    assert_invariant(&fx);
}

#[test]
fn test_non_recipient_cannot_withdraw() {
    let fx = setup();
    let id = default_stream(&fx);

    set_time(&fx, 150);
    assert!(client(&fx).try_withdraw(&fx.sender, &id).is_err());
    assert_eq!(client(&fx).get_stream(&id).unwrap().withdrawn, 0);
    assert_invariant(&fx);
}

#[test]
fn test_non_sender_cannot_cancel() {
    let fx = setup();
    let id = default_stream(&fx);

    set_time(&fx, 150);
    assert!(client(&fx).try_cancel_stream(&fx.recipient, &id).is_err());
    let stream = client(&fx).get_stream(&id).unwrap();
    assert_eq!(stream.status, StreamStatus::Active);
    assert_invariant(&fx);
}

#[test]
fn test_withdraw_after_cancel_fails() {
    let fx = setup();
    let id = default_stream(&fx);

    set_time(&fx, 150);
    client(&fx).cancel_stream(&fx.sender, &id);
    set_time(&fx, 200);
    assert!(client(&fx).try_withdraw(&fx.recipient, &id).is_err());
    assert_eq!(token_client(&fx).balance(&fx.recipient), 500);
    assert_invariant(&fx);
}

#[test]
fn test_double_cancel_fails_and_pays_nothing_twice() {
    let fx = setup();
    let id = default_stream(&fx);

    set_time(&fx, 150);
    assert_eq!(client(&fx).cancel_stream(&fx.sender, &id), 500);
    let sender_after_first = token_client(&fx).balance(&fx.sender);

    assert!(client(&fx).try_cancel_stream(&fx.sender, &id).is_err());
    assert_eq!(token_client(&fx).balance(&fx.sender), sender_after_first);
    assert_eq!(token_client(&fx).balance(&fx.recipient), 500);
    assert_invariant(&fx);
}

#[test]
fn test_overflow_in_deposit_is_rejected() {
    let fx = setup();
    // rate * duration = 3 * i128::MAX / 2 overflows i128.
    let result = client(&fx).try_create_stream(
        &fx.sender,
        &fx.recipient,
        &fx.token_id,
        &(i128::MAX / 2),
        &0,
        &3,
    );
    assert!(result.is_err());
    assert_eq!(client(&fx).stream_count(), 0);
    assert_eq!(token_client(&fx).balance(&fx.contract_id), 0);
}

#[test]
fn test_non_positive_rate_is_rejected() {
    let fx = setup();
    let result = client(&fx).try_create_stream(
        &fx.sender,
        &fx.recipient,
        &fx.token_id,
        &0,
        &100,
        &200,
    );
    assert!(result.is_err());
    assert_eq!(client(&fx).stream_count(), 0);
}
