//! State Channel Dispute Resolution Engine
//!
//! On-chain settlement and dispute layer for a two-party payment channel.
//! Parties transact off-chain by exchanging signed state updates. Either
//! party can close the channel by submitting the latest mutually-signed
//! state. The counterparty has a challenge window to submit a higher-nonce
//! state if the submitted one is stale. After the challenge period the
//! final balances are settled on-chain.
//!
//! ## Lifecycle
//! ```text
//! open_channel(A, B, deposit_a, deposit_b)
//!       │
//!       ▼  [off-chain: exchange signed states]
//! submit_state(party, channel_id, nonce, bal_a, bal_b, sig_a, sig_b)
//!       │
//!       ▼  [challenge window open]
//! challenge(party, channel_id, higher_nonce_state, sig_a, sig_b)  ← optional
//!       │
//!       ▼  [challenge_expiry passed]
//! settle(channel_id)  → pays out final balances, closes channel
//! ```
//!
//! ## Signature scheme
//! The canonical state message is:
//!   `sha256( channel_id ‖ nonce ‖ balance_a ‖ balance_b )`
//! Both parties must sign this hash with their Ed25519 keys.
//! `env.crypto().ed25519_verify` is used — the same primitive used by the
//! cross-chain messaging module in this codebase.
//!
//! ## Security properties
//! - **Replay protection**: nonce must strictly increase on each challenge.
//! - **Signature verification**: both party signatures required; invalid sig panics.
//! - **Reentrancy**: `nonreentrant_acquire/release` wraps every token transfer.
//! - **Overflow**: `safe_add` / `safe_sub` from `security_primitives`.
//! - **Balance invariant**: `bal_a + bal_b == total_deposit` enforced on every
//!   state submission to prevent fund creation/destruction.
//! - **Challenge timer**: settlement blocked until `challenge_expiry` passes.

#![allow(dead_code)]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, token,
    Address, Bytes, BytesN, Env,
};

use crate::security_primitives::{nonreentrant_acquire, nonreentrant_release, safe_add, safe_sub};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOCK: soroban_sdk::Symbol = symbol_short!("sc_lk");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Lifecycle state of a channel.
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum ChannelStatus {
    /// Channel is open; off-chain transactions are in progress.
    Open,
    /// A state has been submitted; challenge window is running.
    Closing,
    /// Challenge period expired; balances have been paid out.
    Settled,
}

/// On-chain record for a single state channel.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Channel {
    pub id: u32,
    pub party_a: Address,
    pub party_b: Address,
    /// Ed25519 public key of party A (32 bytes).
    pub pubkey_a: BytesN<32>,
    /// Ed25519 public key of party B (32 bytes).
    pub pubkey_b: BytesN<32>,
    /// Reward token.
    pub token: Address,
    /// Total tokens locked in escrow (deposit_a + deposit_b).
    pub total_deposit: i128,
    /// Latest agreed balance for party A.
    pub balance_a: i128,
    /// Latest agreed balance for party B.
    pub balance_b: i128,
    /// Nonce of the last submitted state (higher = more recent).
    pub nonce: u64,
    /// Ledger timestamp after which `settle` may be called.
    pub challenge_expiry: u64,
    /// Duration of the challenge window in seconds.
    pub challenge_period: u64,
    pub status: ChannelStatus,
}

#[contracttype]
#[derive(Clone)]
pub enum SCKey {
    /// Global admin.
    Admin,
    /// Auto-increment counter.
    NextId,
    /// Channel record: id → Channel.
    Channel(u32),
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum SCError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    NotFound = 4,
    InvalidStatus = 5,
    InvalidSignature = 6,
    /// Submitted nonce is not higher than the current best.
    StaleNonce = 7,
    /// bal_a + bal_b ≠ total_deposit.
    BalanceInvariant = 8,
    /// Challenge period has not yet expired.
    ChallengeActive = 9,
    ZeroAmount = 10,
    Overflow = 11,
    /// Caller is not a participant of this channel.
    NotParticipant = 12,
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct StateChannelContract;

#[contractimpl]
impl StateChannelContract {
    // -----------------------------------------------------------------------
    // Initialisation
    // -----------------------------------------------------------------------

    /// Initialise the contract. Must be called once.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&SCKey::Admin) {
            panic_with_error!(&env, SCError::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&SCKey::Admin, &admin);
        env.storage().instance().set(&SCKey::NextId, &1_u32);
        env.events().publish((symbol_short!("sc_init"),), admin);
    }

    // -----------------------------------------------------------------------
    // Open channel
    // -----------------------------------------------------------------------

    /// Open a new state channel between `party_a` and `party_b`.
    ///
    /// Both parties must authorise. Their deposits are transferred into escrow.
    ///
    /// # Arguments
    /// * `party_a / party_b`   – Channel participants (Stellar addresses).
    /// * `pubkey_a / pubkey_b` – Ed25519 public keys used to verify off-chain signatures.
    /// * `token`               – Token used for deposits and settlement.
    /// * `deposit_a / deposit_b` – Initial deposits from each party.
    /// * `challenge_period`    – Seconds the challenge window stays open after a state submission.
    ///
    /// Returns the new channel ID.
    pub fn open_channel(
        env: Env,
        party_a: Address,
        party_b: Address,
        pubkey_a: BytesN<32>,
        pubkey_b: BytesN<32>,
        token: Address,
        deposit_a: i128,
        deposit_b: i128,
        challenge_period: u64,
    ) -> u32 {
        party_a.require_auth();
        party_b.require_auth();

        if deposit_a < 0 || deposit_b < 0 {
            panic_with_error!(&env, SCError::ZeroAmount);
        }

        nonreentrant_acquire(&env, LOCK);

        let total = safe_add(&env, deposit_a, deposit_b);
        let token_client = token::Client::new(&env, &token);
        if deposit_a > 0 {
            token_client.transfer(&party_a, &env.current_contract_address(), &deposit_a);
        }
        if deposit_b > 0 {
            token_client.transfer(&party_b, &env.current_contract_address(), &deposit_b);
        }

        let id: u32 = env.storage().instance().get(&SCKey::NextId).unwrap_or(1);
        env.storage().instance().set(&SCKey::NextId, &(id + 1));

        let channel = Channel {
            id,
            party_a: party_a.clone(),
            party_b: party_b.clone(),
            pubkey_a,
            pubkey_b,
            token,
            total_deposit: total,
            balance_a: deposit_a,
            balance_b: deposit_b,
            nonce: 0,
            challenge_expiry: 0,
            challenge_period,
            status: ChannelStatus::Open,
        };
        env.storage().persistent().set(&SCKey::Channel(id), &channel);

        nonreentrant_release(&env, LOCK);
        env.events().publish((symbol_short!("sc_open"),), (id, party_a, party_b, total));
        id
    }

    // -----------------------------------------------------------------------
    // Submit state (initiates closing)
    // -----------------------------------------------------------------------

    /// Submit a mutually-signed off-chain state to begin the closing process.
    ///
    /// Either party may call this. The state must carry both Ed25519 signatures
    /// over `sha256(channel_id ‖ nonce ‖ balance_a ‖ balance_b)`.
    ///
    /// If the channel is already `Closing`, this acts as a challenge: the new
    /// nonce must be strictly higher than the current best.
    pub fn submit_state(
        env: Env,
        caller: Address,
        channel_id: u32,
        nonce: u64,
        balance_a: i128,
        balance_b: i128,
        sig_a: BytesN<64>,
        sig_b: BytesN<64>,
    ) {
        caller.require_auth();

        let mut channel = Self::load_channel(&env, channel_id);

        // Only participants may submit.
        Self::assert_participant(&env, &caller, &channel);

        // Channel must be Open or Closing (not already Settled).
        if channel.status == ChannelStatus::Settled {
            panic_with_error!(&env, SCError::InvalidStatus);
        }

        // When challenging, nonce must be strictly higher.
        if channel.status == ChannelStatus::Closing && nonce <= channel.nonce {
            panic_with_error!(&env, SCError::StaleNonce);
        }

        // Balance invariant: no funds created or destroyed.
        let sum = safe_add(&env, balance_a, balance_b);
        if sum != channel.total_deposit {
            panic_with_error!(&env, SCError::BalanceInvariant);
        }

        // Verify both signatures over the canonical state hash.
        let state_hash = Self::state_hash(&env, channel_id, nonce, balance_a, balance_b);
        env.crypto().ed25519_verify(&channel.pubkey_a, &state_hash.clone().into(), &sig_a);
        env.crypto().ed25519_verify(&channel.pubkey_b, &state_hash.into(), &sig_b);

        // Update channel state.
        channel.nonce = nonce;
        channel.balance_a = balance_a;
        channel.balance_b = balance_b;
        channel.challenge_expiry = env.ledger().timestamp() + channel.challenge_period;
        channel.status = ChannelStatus::Closing;
        env.storage().persistent().set(&SCKey::Channel(channel_id), &channel);

        env.events().publish(
            (symbol_short!("sc_state"),),
            (channel_id, nonce, balance_a, balance_b),
        );
    }

    // -----------------------------------------------------------------------
    // Challenge (alias: submit_state with higher nonce while Closing)
    // -----------------------------------------------------------------------

    /// Explicit challenge entry point — identical to `submit_state` but
    /// documents intent: the counterparty submits a higher-nonce state to
    /// override a stale submission.
    ///
    /// Delegates entirely to `submit_state`; kept as a named entry point for
    /// clarity in the ABI and educational context.
    pub fn challenge(
        env: Env,
        caller: Address,
        channel_id: u32,
        nonce: u64,
        balance_a: i128,
        balance_b: i128,
        sig_a: BytesN<64>,
        sig_b: BytesN<64>,
    ) {
        // Reuse submit_state — it already handles the Closing + higher-nonce path.
        Self::submit_state(env, caller, channel_id, nonce, balance_a, balance_b, sig_a, sig_b);
    }

    // -----------------------------------------------------------------------
    // Settle
    // -----------------------------------------------------------------------

    /// Finalise the channel after the challenge period has expired.
    ///
    /// Pays `balance_a` to `party_a` and `balance_b` to `party_b`, then marks
    /// the channel `Settled`. Anyone may call this once the timer has elapsed.
    pub fn settle(env: Env, channel_id: u32) {
        let mut channel = Self::load_channel(&env, channel_id);

        if channel.status != ChannelStatus::Closing {
            panic_with_error!(&env, SCError::InvalidStatus);
        }
        if env.ledger().timestamp() < channel.challenge_expiry {
            panic_with_error!(&env, SCError::ChallengeActive);
        }

        nonreentrant_acquire(&env, LOCK);

        let token_client = token::Client::new(&env, &channel.token);
        if channel.balance_a > 0 {
            token_client.transfer(
                &env.current_contract_address(),
                &channel.party_a,
                &channel.balance_a,
            );
        }
        if channel.balance_b > 0 {
            token_client.transfer(
                &env.current_contract_address(),
                &channel.party_b,
                &channel.balance_b,
            );
        }

        channel.status = ChannelStatus::Settled;
        channel.balance_a = 0;
        channel.balance_b = 0;
        env.storage().persistent().set(&SCKey::Channel(channel_id), &channel);

        nonreentrant_release(&env, LOCK);
        env.events().publish((symbol_short!("sc_settle"),), channel_id);
    }

    // -----------------------------------------------------------------------
    // Cooperative close (no challenge period)
    // -----------------------------------------------------------------------

    /// Both parties agree to close immediately with a final signed state,
    /// bypassing the challenge window. Useful for cooperative exits.
    pub fn cooperative_close(
        env: Env,
        channel_id: u32,
        nonce: u64,
        balance_a: i128,
        balance_b: i128,
        sig_a: BytesN<64>,
        sig_b: BytesN<64>,
    ) {
        let mut channel = Self::load_channel(&env, channel_id);

        if channel.status == ChannelStatus::Settled {
            panic_with_error!(&env, SCError::InvalidStatus);
        }

        let sum = safe_add(&env, balance_a, balance_b);
        if sum != channel.total_deposit {
            panic_with_error!(&env, SCError::BalanceInvariant);
        }

        let state_hash = Self::state_hash(&env, channel_id, nonce, balance_a, balance_b);
        env.crypto().ed25519_verify(&channel.pubkey_a, &state_hash.clone().into(), &sig_a);
        env.crypto().ed25519_verify(&channel.pubkey_b, &state_hash.into(), &sig_b);

        nonreentrant_acquire(&env, LOCK);

        let token_client = token::Client::new(&env, &channel.token);
        if balance_a > 0 {
            token_client.transfer(&env.current_contract_address(), &channel.party_a, &balance_a);
        }
        if balance_b > 0 {
            token_client.transfer(&env.current_contract_address(), &channel.party_b, &balance_b);
        }

        channel.status = ChannelStatus::Settled;
        channel.balance_a = 0;
        channel.balance_b = 0;
        env.storage().persistent().set(&SCKey::Channel(channel_id), &channel);

        nonreentrant_release(&env, LOCK);
        env.events().publish((symbol_short!("sc_coop"),), (channel_id, nonce));
    }

    // -----------------------------------------------------------------------
    // View helpers
    // -----------------------------------------------------------------------

    /// Returns the channel record.
    pub fn get_channel(env: Env, channel_id: u32) -> Channel {
        Self::load_channel(&env, channel_id)
    }

    /// Returns the canonical state hash for a given set of parameters.
    /// Useful for off-chain signing tools.
    pub fn compute_state_hash(
        env: Env,
        channel_id: u32,
        nonce: u64,
        balance_a: i128,
        balance_b: i128,
    ) -> BytesN<32> {
        Self::state_hash(&env, channel_id, nonce, balance_a, balance_b)
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    /// Canonical state hash: sha256(channel_id ‖ nonce ‖ balance_a ‖ balance_b).
    ///
    /// All fields are encoded as big-endian fixed-width bytes to prevent
    /// length-extension / ambiguity attacks.
    fn state_hash(
        env: &Env,
        channel_id: u32,
        nonce: u64,
        balance_a: i128,
        balance_b: i128,
    ) -> BytesN<32> {
        // 4 + 8 + 16 + 16 = 44 bytes
        let mut buf = [0u8; 44];
        buf[0..4].copy_from_slice(&channel_id.to_be_bytes());
        buf[4..12].copy_from_slice(&nonce.to_be_bytes());
        buf[12..28].copy_from_slice(&balance_a.to_be_bytes());
        buf[28..44].copy_from_slice(&balance_b.to_be_bytes());
        env.crypto().sha256(&Bytes::from_array(env, &buf)).into()
    }

    fn load_channel(env: &Env, id: u32) -> Channel {
        env.storage()
            .persistent()
            .get(&SCKey::Channel(id))
            .unwrap_or_else(|| panic_with_error!(env, SCError::NotFound))
    }

    fn assert_participant(env: &Env, caller: &Address, channel: &Channel) {
        if *caller != channel.party_a && *caller != channel.party_b {
            panic_with_error!(env, SCError::NotParticipant);
        }
    }
}
