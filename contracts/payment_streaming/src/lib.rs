//! # Payment Streaming Contract
//!
//! Per-second token streams on Soroban.
//!
//! A **sender** creates a stream that moves `rate_per_second * (stop_time - start_time)`
//! tokens of a Soroban token contract into this contract. The **recipient** accrues
//! tokens linearly per second: `V = rate_per_second * (now - start_time)`, clamped to
//! `[0, deposit]`, and withdraws accrued tokens at any time.
//!
//! The sender may cancel an active stream. In the same call the accrued but
//! unwithdrawn amount is paid to the recipient (it vests on cancellation) and the
//! unvested remainder is refunded to the sender.
//!
//! ## Invariant
//! The contract's balance of each stream token equals the sum of `deposit - withdrawn`
//! over all streams with status `Active`. Cancelled and exhausted streams hold no
//! balance. `stream_count` and `get_stream` let callers verify this.
//!
//! ## Security
//! - State is written before any token transfer, and a reentrancy lock guards every
//!   state-changing entry point.
//! - All arithmetic is checked; an overflow aborts the call.
//! - `require_auth` is called for the acting party, and cancel/withdraw also compare
//!   the caller with the stored sender/recipient.

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token::TokenClient, Address, Env, Symbol,
};

// ── Storage ──────────────────────────────────────────────────────────────────

const LOCK: Symbol = symbol_short!("ps_lock");

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    /// Stream record, keyed by stream id.
    Stream(u32),
    /// Id that the next created stream will receive. Also the number of streams.
    NextId,
}

// ── Data types ───────────────────────────────────────────────────────────────

/// Status of a payment stream.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum StreamStatus {
    Active,
    Cancelled,
    Exhausted,
}

/// A per-second payment stream.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Stream {
    /// Address that funded the stream and may cancel it.
    pub sender: Address,
    /// Address that accrues and withdraws the tokens.
    pub recipient: Address,
    /// Token contract in which the stream is denominated.
    pub token: Address,
    /// Base units vested per second.
    pub rate_per_second: i128,
    /// Unix time (seconds) at which vesting begins.
    pub start_time: u64,
    /// Unix time (seconds) at which vesting ends.
    pub stop_time: u64,
    /// Total tokens escrowed for this stream: `rate_per_second * (stop_time - start_time)`.
    pub deposit: i128,
    /// Tokens already paid out to the recipient (by withdrawal or cancellation).
    pub withdrawn: i128,
    /// Current stream status.
    pub status: StreamStatus,
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/// Unwraps a checked-arithmetic result, aborting the call on overflow or underflow.
fn checked_or_abort(value: Option<i128>) -> i128 {
    value.unwrap_or_else(|| panic!("overflow"))
}

/// Loads a stream record, aborting if the id is unknown.
fn load_stream(env: &Env, stream_id: u32) -> Stream {
    let stream: Option<Stream> = env
        .storage()
        .instance()
        .get(&DataKey::Stream(stream_id));
    stream.unwrap_or_else(|| panic!("no stream"))
}

/// Total amount vested at time `now`: `rate_per_second * elapsed`, where `elapsed`
/// is `now - start_time` clamped to `[0, stop_time - start_time]`.
///
/// Rounding: none. The rate is an integer count of base units per second, so the
/// product is exact and no division is performed. The clamp happens before the
/// multiplication, so the result is at most `rate_per_second * duration`, which is
/// the `deposit` fixed at creation. If fractional rates are ever introduced, floor
/// division would round down, which favours the sender.
fn vested_at(stream: &Stream, now: u64) -> i128 {
    if now <= stream.start_time {
        return 0;
    }
    let end = if now < stream.stop_time {
        now
    } else {
        stream.stop_time
    };
    let elapsed = i128::from(end - stream.start_time);
    checked_or_abort(stream.rate_per_second.checked_mul(elapsed))
}

// ── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct PaymentStreaming;

#[contractimpl]
impl PaymentStreaming {
    // ── Create ────────────────────────────────────────────────────────────────

    /// Create a stream and escrow its full deposit from `sender` into this contract.
    ///
    /// Returns the new stream id.
    ///
    /// # Panics
    /// - If `rate_per_second` is not positive.
    /// - If `stop_time` is not after `start_time`.
    /// - If `rate_per_second * (stop_time - start_time)` overflows.
    /// - If the token transfer from `sender` fails.
    pub fn create_stream(
        env: Env,
        sender: Address,
        recipient: Address,
        token: Address,
        rate_per_second: i128,
        start_time: u64,
        stop_time: u64,
    ) -> u32 {
        sender.require_auth();
        Self::lock(&env);
        assert!(rate_per_second > 0, "rate must be positive");
        assert!(stop_time > start_time, "stop must be after start");

        let duration = i128::from(stop_time - start_time);
        let deposit = checked_or_abort(rate_per_second.checked_mul(duration));

        let stream_id: u32 = env.storage().instance().get(&DataKey::NextId).unwrap_or(0);
        let next_id = stream_id.checked_add(1).unwrap_or_else(|| panic!("overflow"));

        TokenClient::new(&env, &token).transfer(
            &sender,
            &env.current_contract_address(),
            &deposit,
        );

        let stream = Stream {
            sender,
            recipient,
            token,
            rate_per_second,
            start_time,
            stop_time,
            deposit,
            withdrawn: 0,
            status: StreamStatus::Active,
        };
        env.storage()
            .instance()
            .set(&DataKey::Stream(stream_id), &stream);
        env.storage().instance().set(&DataKey::NextId, &next_id);
        env.events()
            .publish((symbol_short!("created"), stream_id), deposit);

        Self::unlock(&env);
        stream_id
    }

    // ── Withdraw ──────────────────────────────────────────────────────────────

    /// Recipient withdraws everything vested and not yet withdrawn.
    ///
    /// Returns the amount transferred.
    ///
    /// # Panics
    /// - If the stream is not active.
    /// - If `recipient` is not the stream's recipient.
    /// - If nothing is vested beyond what was already withdrawn (including before start).
    pub fn withdraw(env: Env, recipient: Address, stream_id: u32) -> i128 {
        recipient.require_auth();
        Self::lock(&env);

        let mut stream = load_stream(&env, stream_id);
        assert!(stream.status == StreamStatus::Active, "stream not active");
        assert!(stream.recipient == recipient, "not the recipient");

        let vested = vested_at(&stream, env.ledger().timestamp());
        let amount = checked_or_abort(vested.checked_sub(stream.withdrawn));
        assert!(amount > 0, "nothing to withdraw");

        stream.withdrawn = checked_or_abort(stream.withdrawn.checked_add(amount));
        if stream.withdrawn == stream.deposit {
            stream.status = StreamStatus::Exhausted;
        }
        env.storage()
            .instance()
            .set(&DataKey::Stream(stream_id), &stream);

        TokenClient::new(&env, &stream.token).transfer(
            &env.current_contract_address(),
            &recipient,
            &amount,
        );
        env.events()
            .publish((symbol_short!("withdrew"), stream_id), amount);

        Self::unlock(&env);
        amount
    }

    // ── Cancel ────────────────────────────────────────────────────────────────

    /// Sender cancels an active stream.
    ///
    /// The accrued, unwithdrawn amount is transferred to the recipient (it vests on
    /// cancellation). The unvested remainder, `deposit - vested`, is refunded to the
    /// sender. The stream holds no balance afterwards.
    ///
    /// Returns the refunded (unvested) amount.
    ///
    /// # Panics
    /// - If the stream is not active (including a second cancel).
    /// - If `sender` is not the stream's sender.
    pub fn cancel_stream(env: Env, sender: Address, stream_id: u32) -> i128 {
        sender.require_auth();
        Self::lock(&env);

        let mut stream = load_stream(&env, stream_id);
        assert!(stream.status == StreamStatus::Active, "stream not active");
        assert!(stream.sender == sender, "not the sender");

        let vested = vested_at(&stream, env.ledger().timestamp());
        let to_recipient = checked_or_abort(vested.checked_sub(stream.withdrawn));
        let refund = checked_or_abort(stream.deposit.checked_sub(vested));

        // Settle the stream before transferring: all vested tokens are now paid out.
        stream.withdrawn = vested;
        stream.status = StreamStatus::Cancelled;
        env.storage()
            .instance()
            .set(&DataKey::Stream(stream_id), &stream);

        let token = TokenClient::new(&env, &stream.token);
        let contract = env.current_contract_address();
        if to_recipient > 0 {
            token.transfer(&contract, &stream.recipient, &to_recipient);
        }
        if refund > 0 {
            token.transfer(&contract, &stream.sender, &refund);
        }

        env.events()
            .publish((symbol_short!("cancelled"), stream_id), refund);

        Self::unlock(&env);
        refund
    }

    // ── View ──────────────────────────────────────────────────────────────────

    /// Returns the stream record, or `None` if the id is unknown.
    pub fn get_stream(env: Env, stream_id: u32) -> Option<Stream> {
        env.storage()
            .instance()
            .get(&DataKey::Stream(stream_id))
    }

    /// Returns the number of streams created so far. Valid ids are `0..stream_count()`.
    pub fn stream_count(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::NextId).unwrap_or(0)
    }

    /// Returns the total amount vested at the current ledger time.
    pub fn vested(env: Env, stream_id: u32) -> i128 {
        let stream = load_stream(&env, stream_id);
        vested_at(&stream, env.ledger().timestamp())
    }

    /// Returns the amount the recipient could withdraw right now (0 if not active).
    pub fn claimable(env: Env, stream_id: u32) -> i128 {
        let stream = load_stream(&env, stream_id);
        if stream.status != StreamStatus::Active {
            return 0;
        }
        let vested = vested_at(&stream, env.ledger().timestamp());
        checked_or_abort(vested.checked_sub(stream.withdrawn))
    }

    // ── Reentrancy guards ─────────────────────────────────────────────────

    fn lock(env: &Env) {
        let locked: bool = env.storage().instance().get(&LOCK).unwrap_or(false);
        if locked {
            soroban_sdk::panic_with_error!(env, soroban_sdk::Error::from_contract_error(10));
        }
        env.storage().instance().set(&LOCK, &true);
    }

    fn unlock(env: &Env) {
        env.storage().instance().set(&LOCK, &false);
    }
}

#[cfg(test)]
mod test;
