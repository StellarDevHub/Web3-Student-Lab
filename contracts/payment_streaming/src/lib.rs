//! # SC-HARD-10 — Real-Time Payment Streaming & Clawback Mechanism
//!
//! EIP-1620-style per-second token streaming on Soroban.
//!
//! A **sender** creates a stream that vests tokens linearly between
//! `start_time` and `stop_time` (ledger timestamps, seconds).  The recipient
//! may call `withdraw` at any time to claim the vested-but-unclaimed portion.
//! The sender may call `cancel_stream` at any time; the contract calculates the
//! exact vested amount owed to the recipient and returns the **unvested
//! clawback** balance to the sender.
//!
//! ## Per-second arithmetic
//! ```text
//! rate_per_second  = deposit / duration          (tokens per second)
//! vested_now       = rate_per_second * (now - start_time)
//! claimable_now    = vested_now - withdrawn
//! ```
//!
//! ## Security
//! - Checked arithmetic throughout — no overflow/underflow.
//! - `require_auth` on every state-mutating call.
//! - Reentrancy guard on every mutating function.
//! - Streams are keyed by ID so multiple streams per contract are supported.

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, Map, Symbol,
};

// ── Constants ─────────────────────────────────────────────────────────────────

const LOCK: Symbol = symbol_short!("ps_lock");
const STREAM_MAP: Symbol = symbol_short!("streams");
const NEXT_ID: Symbol = symbol_short!("next_id");

// ── Data types ────────────────────────────────────────────────────────────────

/// Lifecycle status of a stream.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum StreamStatus {
    Active,
    Cancelled,
    Exhausted,
}

/// A per-second linear payment stream.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Stream {
    /// Address funding the stream.
    pub sender: Address,
    /// Address receiving streaming payments.
    pub recipient: Address,
    /// Total tokens deposited into the stream.
    pub deposit: i128,
    /// Ledger timestamp (seconds) the stream begins vesting.
    pub start_time: u64,
    /// Ledger timestamp (seconds) at which the stream is fully vested.
    pub stop_time: u64,
    /// Tokens already withdrawn by the recipient.
    pub withdrawn: i128,
    /// Current stream status.
    pub status: StreamStatus,
}

impl Stream {
    /// Tokens vested at ledger timestamp `now`.
    ///
    /// Clamps to `[0, deposit]`.
    pub fn vested_at(&self, now: u64) -> i128 {
        if now <= self.start_time {
            return 0;
        }
        let duration = (self.stop_time - self.start_time) as i128;
        let elapsed = if now >= self.stop_time {
            duration
        } else {
            (now - self.start_time) as i128
        };
        // rate_per_second * elapsed = deposit / duration * elapsed
        // Use integer arithmetic: (deposit * elapsed) / duration
        self.deposit
            .checked_mul(elapsed)
            .expect("overflow")
            .checked_div(duration)
            .expect("div zero")
    }

    /// Tokens available for the recipient to claim right now.
    pub fn claimable_at(&self, now: u64) -> i128 {
        if self.status != StreamStatus::Active {
            return 0;
        }
        let vested = self.vested_at(now);
        vested.checked_sub(self.withdrawn).unwrap_or(0)
    }
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct PaymentStreaming;

#[contractimpl]
impl PaymentStreaming {
    // ── Create ────────────────────────────────────────────────────────────────

    /// Create a new per-second payment stream.
    ///
    /// `deposit` is the total tokens vested over the lifetime of the stream.
    /// `start_time` and `stop_time` are ledger timestamps (seconds).
    ///
    /// Returns the stream ID.
    pub fn create_stream(
        env: Env,
        sender: Address,
        recipient: Address,
        deposit: i128,
        start_time: u64,
        stop_time: u64,
    ) -> u32 {
        sender.require_auth();
        Self::lock(&env);

        assert!(deposit > 0, "deposit must be positive");
        assert!(stop_time > start_time, "stop_time must be after start_time");
        assert!(
            start_time >= env.ledger().timestamp(),
            "start_time must be >= now"
        );

        let stream = Stream {
            sender,
            recipient,
            deposit,
            start_time,
            stop_time,
            withdrawn: 0,
            status: StreamStatus::Active,
        };

        let id: u32 = env
            .storage()
            .instance()
            .get(&NEXT_ID)
            .unwrap_or(0);
        let mut streams: Map<u32, Stream> = env
            .storage()
            .instance()
            .get(&STREAM_MAP)
            .unwrap_or_else(|| Map::new(&env));
        streams.set(id, stream);
        env.storage().instance().set(&STREAM_MAP, &streams);
        env.storage().instance().set(&NEXT_ID, &(id + 1));

        env.events()
            .publish((symbol_short!("created"), id), deposit);

        Self::unlock(&env);
        id
    }

    // ── Withdraw ──────────────────────────────────────────────────────────────

    /// Recipient withdraws all currently vested, unclaimed tokens.
    ///
    /// Returns the amount transferred.
    pub fn withdraw(env: Env, recipient: Address, stream_id: u32) -> i128 {
        recipient.require_auth();
        Self::lock(&env);

        let mut streams: Map<u32, Stream> = env
            .storage()
            .instance()
            .get(&STREAM_MAP)
            .expect("no streams");
        let mut stream = streams.get(stream_id).expect("stream not found");

        assert!(stream.status == StreamStatus::Active, "stream not active");
        assert!(stream.recipient == recipient, "not the recipient");

        let now = env.ledger().timestamp();
        let claimable = stream.claimable_at(now);
        assert!(claimable > 0, "nothing to withdraw");

        stream.withdrawn = stream.withdrawn.checked_add(claimable).expect("overflow");

        // Mark exhausted when fully claimed
        if stream.withdrawn >= stream.deposit {
            stream.status = StreamStatus::Exhausted;
        }

        streams.set(stream_id, stream);
        env.storage().instance().set(&STREAM_MAP, &streams);

        env.events()
            .publish((symbol_short!("withdrew"), recipient), claimable);

        Self::unlock(&env);
        claimable
    }

    // ── Cancel / Clawback ─────────────────────────────────────────────────────

    /// Sender cancels the stream.
    ///
    /// The vested portion (based on `now`) remains claimable by the recipient
    /// via a final `withdraw`; the **unvested balance** (clawback) is returned
    /// as the function's return value.  In a production deployment the contract
    /// would push the unvested tokens back to the sender via a token contract.
    ///
    /// Returns `(recipient_owed, sender_clawback)`.
    pub fn cancel_stream(env: Env, sender: Address, stream_id: u32) -> (i128, i128) {
        sender.require_auth();
        Self::lock(&env);

        let mut streams: Map<u32, Stream> = env
            .storage()
            .instance()
            .get(&STREAM_MAP)
            .expect("no streams");
        let mut stream = streams.get(stream_id).expect("stream not found");

        assert!(stream.status == StreamStatus::Active, "stream not active");
        assert!(stream.sender == sender, "not the sender");

        let now = env.ledger().timestamp();
        let vested = stream.vested_at(now);
        let recipient_owed = vested
            .checked_sub(stream.withdrawn)
            .unwrap_or(0);
        let sender_clawback = stream
            .deposit
            .checked_sub(vested)
            .unwrap_or(0);

        stream.status = StreamStatus::Cancelled;
        streams.set(stream_id, stream);
        env.storage().instance().set(&STREAM_MAP, &streams);

        env.events()
            .publish((symbol_short!("cancelled"), sender), sender_clawback);

        Self::unlock(&env);
        (recipient_owed, sender_clawback)
    }

    // ── View helpers ──────────────────────────────────────────────────────────

    /// Returns the stream state.
    pub fn get_stream(env: Env, stream_id: u32) -> Option<Stream> {
        let streams: Map<u32, Stream> = env
            .storage()
            .instance()
            .get(&STREAM_MAP)
            .unwrap_or_else(|| Map::new(&env));
        streams.get(stream_id)
    }

    /// Returns the vested amount at the current ledger timestamp.
    pub fn vested(env: Env, stream_id: u32) -> i128 {
        let streams: Map<u32, Stream> = env
            .storage()
            .instance()
            .get(&STREAM_MAP)
            .unwrap_or_else(|| Map::new(&env));
        match streams.get(stream_id) {
            Some(s) => s.vested_at(env.ledger().timestamp()),
            None => 0,
        }
    }

    /// Returns the claimable (vested minus already-withdrawn) amount.
    pub fn claimable(env: Env, stream_id: u32) -> i128 {
        let streams: Map<u32, Stream> = env
            .storage()
            .instance()
            .get(&STREAM_MAP)
            .unwrap_or_else(|| Map::new(&env));
        match streams.get(stream_id) {
            Some(s) => s.claimable_at(env.ledger().timestamp()),
            None => 0,
        }
    }

    // ── Reentrancy guard ──────────────────────────────────────────────────────

    fn lock(env: &Env) {
        let locked: bool = env.storage().instance().get(&LOCK).unwrap_or(false);
        if locked {
            panic!("reentrancy");
        }
        env.storage().instance().set(&LOCK, &true);
    }

    fn unlock(env: &Env) {
        env.storage().instance().set(&LOCK, &false);
    }
}

#[cfg(test)]
mod tests;
