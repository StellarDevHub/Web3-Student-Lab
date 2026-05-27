//! Tests for the State Channel Dispute Resolution Engine.
//!
//! Uses real Ed25519 keypairs (ed25519-dalek) to produce valid signatures,
//! mirroring the pattern in `cross_chain_messaging_test.rs`.
//!
//! Coverage:
//! - initialize (ok, double-init)
//! - open_channel (ok, negative deposit)
//! - submit_state (valid sigs, bad sig, balance invariant, stale nonce, non-participant)
//! - challenge (higher nonce overrides, stale nonce rejected)
//! - settle (after expiry, before expiry, wrong status)
//! - cooperative_close (ok, bad sig, balance invariant)
//! - compute_state_hash view

#![cfg(test)]

extern crate std;

use ed25519_dalek::{Signer, SigningKey};
use soroban_sdk::{
    testutils::{Address as _, Ledger, LedgerInfo},
    token, Address, Bytes, BytesN, Env,
};

use crate::state_channel::{ChannelStatus, StateChannelClient};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

struct Party {
    address: Address,
    signing_key: SigningKey,
}

impl Party {
    fn new(env: &Env) -> Self {
        let secret: [u8; 32] = rand::random();
        Party {
            address: Address::generate(env),
            signing_key: SigningKey::from_bytes(&secret),
        }
    }

    fn pubkey(&self, env: &Env) -> BytesN<32> {
        BytesN::from_array(env, self.signing_key.verifying_key().as_bytes())
    }

    fn sign(&self, hash: &BytesN<32>) -> BytesN<64> {
        let mut h = [0u8; 32];
        for (i, b) in hash.iter().enumerate() {
            h[i] = b;
        }
        let sig = self.signing_key.sign(&h);
        // We need an Env reference to build BytesN — caller must pass it.
        // Return raw bytes; caller wraps.
        let _ = sig; // placeholder — see sign_with_env below
        unreachable!()
    }

    fn sign_with_env(&self, env: &Env, hash: &BytesN<32>) -> BytesN<64> {
        let mut h = [0u8; 32];
        for (i, b) in hash.iter().enumerate() {
            h[i] = b;
        }
        let sig = self.signing_key.sign(&h);
        BytesN::from_array(env, &sig.to_bytes())
    }
}

/// Compute the canonical state hash off-chain (mirrors the contract's `state_hash`).
fn state_hash(env: &Env, channel_id: u32, nonce: u64, bal_a: i128, bal_b: i128) -> BytesN<32> {
    let mut buf = [0u8; 44];
    buf[0..4].copy_from_slice(&channel_id.to_be_bytes());
    buf[4..12].copy_from_slice(&nonce.to_be_bytes());
    buf[12..28].copy_from_slice(&bal_a.to_be_bytes());
    buf[28..44].copy_from_slice(&bal_b.to_be_bytes());
    env.crypto().sha256(&Bytes::from_array(env, &buf)).into()
}

fn sign_state(
    env: &Env,
    a: &Party,
    b: &Party,
    channel_id: u32,
    nonce: u64,
    bal_a: i128,
    bal_b: i128,
) -> (BytesN<64>, BytesN<64>) {
    let hash = state_hash(env, channel_id, nonce, bal_a, bal_b);
    (a.sign_with_env(env, &hash), b.sign_with_env(env, &hash))
}

struct Setup<'a> {
    env: Env,
    sc: StateChannelClient<'a>,
    token: Address,
    admin: Address,
    a: Party,
    b: Party,
}

impl<'a> Setup<'a> {
    fn new() -> Self {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let a = Party::new(&env);
        let b = Party::new(&env);

        let token_id = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        token::StellarAssetClient::new(&env, &token_id).mint(&a.address, &50_000);
        token::StellarAssetClient::new(&env, &token_id).mint(&b.address, &50_000);

        let sc_id = env.register(crate::state_channel::StateChannelContract, ());
        let sc = StateChannelClient::new(&env, &sc_id);
        sc.initialize(&admin);

        Setup { env, sc, token: token_id, admin, a, b }
    }

    /// Open a channel with 10_000 each, 60-second challenge period. Returns channel ID.
    fn open(&self) -> u32 {
        self.sc.open_channel(
            &self.a.address,
            &self.b.address,
            &self.a.pubkey(&self.env),
            &self.b.pubkey(&self.env),
            &self.token,
            &10_000_i128,
            &10_000_i128,
            &60_u64,
        )
    }
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

#[test]
fn test_initialize_ok() {
    let s = Setup::new();
    let _ = s;
}

#[test]
#[should_panic]
fn test_initialize_twice_panics() {
    let s = Setup::new();
    s.sc.initialize(&s.admin);
}

// ---------------------------------------------------------------------------
// open_channel
// ---------------------------------------------------------------------------

#[test]
fn test_open_channel_records_deposits() {
    let s = Setup::new();
    let id = s.open();
    let ch = s.sc.get_channel(&id);
    assert_eq!(ch.total_deposit, 20_000);
    assert_eq!(ch.balance_a, 10_000);
    assert_eq!(ch.balance_b, 10_000);
    assert_eq!(ch.status, ChannelStatus::Open);
}

#[test]
fn test_open_channel_increments_ids() {
    let s = Setup::new();
    let id1 = s.open();
    let id2 = s.open();
    assert_eq!(id1, 1);
    assert_eq!(id2, 2);
}

#[test]
#[should_panic]
fn test_open_channel_negative_deposit_panics() {
    let s = Setup::new();
    s.sc.open_channel(
        &s.a.address, &s.b.address,
        &s.a.pubkey(&s.env), &s.b.pubkey(&s.env),
        &s.token, &-1_i128, &10_000_i128, &60_u64,
    );
}

// ---------------------------------------------------------------------------
// submit_state
// ---------------------------------------------------------------------------

#[test]
fn test_submit_state_valid_transitions_to_closing() {
    let s = Setup::new();
    let id = s.open();
    let (sig_a, sig_b) = sign_state(&s.env, &s.a, &s.b, id, 1, 12_000, 8_000);
    s.sc.submit_state(&s.a.address, &id, &1_u64, &12_000_i128, &8_000_i128, &sig_a, &sig_b);
    let ch = s.sc.get_channel(&id);
    assert_eq!(ch.status, ChannelStatus::Closing);
    assert_eq!(ch.nonce, 1);
    assert_eq!(ch.balance_a, 12_000);
    assert_eq!(ch.balance_b, 8_000);
}

#[test]
#[should_panic]
fn test_submit_state_bad_signature_panics() {
    let s = Setup::new();
    let id = s.open();
    // Sign with wrong nonce so sig is invalid for the submitted state.
    let (sig_a, sig_b) = sign_state(&s.env, &s.a, &s.b, id, 99, 12_000, 8_000);
    s.sc.submit_state(&s.a.address, &id, &1_u64, &12_000_i128, &8_000_i128, &sig_a, &sig_b);
}

#[test]
#[should_panic]
fn test_submit_state_balance_invariant_panics() {
    let s = Setup::new();
    let id = s.open();
    // bal_a + bal_b = 21_000 ≠ 20_000
    let (sig_a, sig_b) = sign_state(&s.env, &s.a, &s.b, id, 1, 12_000, 9_000);
    s.sc.submit_state(&s.a.address, &id, &1_u64, &12_000_i128, &9_000_i128, &sig_a, &sig_b);
}

#[test]
#[should_panic]
fn test_submit_state_non_participant_panics() {
    let s = Setup::new();
    let id = s.open();
    let (sig_a, sig_b) = sign_state(&s.env, &s.a, &s.b, id, 1, 10_000, 10_000);
    let rogue = Address::generate(&s.env);
    s.sc.submit_state(&rogue, &id, &1_u64, &10_000_i128, &10_000_i128, &sig_a, &sig_b);
}

#[test]
#[should_panic]
fn test_submit_state_on_settled_channel_panics() {
    let s = Setup::new();
    let id = s.open();
    let (sig_a, sig_b) = sign_state(&s.env, &s.a, &s.b, id, 1, 10_000, 10_000);
    s.sc.submit_state(&s.a.address, &id, &1_u64, &10_000_i128, &10_000_i128, &sig_a, &sig_b);
    // Advance past challenge period and settle.
    s.env.ledger().set(LedgerInfo {
        timestamp: s.env.ledger().timestamp() + 120,
        protocol_version: 22,
        sequence_number: s.env.ledger().sequence() + 1,
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: 1,
        min_persistent_entry_ttl: 1,
        max_entry_ttl: 6_312_000,
    });
    s.sc.settle(&id);
    // Now try to submit again — must panic.
    let (sig_a2, sig_b2) = sign_state(&s.env, &s.a, &s.b, id, 2, 10_000, 10_000);
    s.sc.submit_state(&s.a.address, &id, &2_u64, &10_000_i128, &10_000_i128, &sig_a2, &sig_b2);
}

// ---------------------------------------------------------------------------
// Challenge (stale nonce protection)
// ---------------------------------------------------------------------------

#[test]
fn test_challenge_with_higher_nonce_overrides() {
    let s = Setup::new();
    let id = s.open();

    // Party A submits nonce=1 (possibly stale).
    let (sig_a1, sig_b1) = sign_state(&s.env, &s.a, &s.b, id, 1, 15_000, 5_000);
    s.sc.submit_state(&s.a.address, &id, &1_u64, &15_000_i128, &5_000_i128, &sig_a1, &sig_b1);

    // Party B challenges with nonce=2 (the real latest state).
    let (sig_a2, sig_b2) = sign_state(&s.env, &s.a, &s.b, id, 2, 12_000, 8_000);
    s.sc.challenge(&s.b.address, &id, &2_u64, &12_000_i128, &8_000_i128, &sig_a2, &sig_b2);

    let ch = s.sc.get_channel(&id);
    assert_eq!(ch.nonce, 2);
    assert_eq!(ch.balance_a, 12_000);
    assert_eq!(ch.balance_b, 8_000);
}

#[test]
#[should_panic]
fn test_challenge_with_same_nonce_panics() {
    let s = Setup::new();
    let id = s.open();
    let (sig_a, sig_b) = sign_state(&s.env, &s.a, &s.b, id, 1, 10_000, 10_000);
    s.sc.submit_state(&s.a.address, &id, &1_u64, &10_000_i128, &10_000_i128, &sig_a, &sig_b);
    // Same nonce — must be rejected.
    let (sig_a2, sig_b2) = sign_state(&s.env, &s.a, &s.b, id, 1, 10_000, 10_000);
    s.sc.challenge(&s.b.address, &id, &1_u64, &10_000_i128, &10_000_i128, &sig_a2, &sig_b2);
}

#[test]
#[should_panic]
fn test_challenge_with_lower_nonce_panics() {
    let s = Setup::new();
    let id = s.open();
    let (sig_a, sig_b) = sign_state(&s.env, &s.a, &s.b, id, 5, 10_000, 10_000);
    s.sc.submit_state(&s.a.address, &id, &5_u64, &10_000_i128, &10_000_i128, &sig_a, &sig_b);
    let (sig_a2, sig_b2) = sign_state(&s.env, &s.a, &s.b, id, 3, 10_000, 10_000);
    s.sc.challenge(&s.b.address, &id, &3_u64, &10_000_i128, &10_000_i128, &sig_a2, &sig_b2);
}

// ---------------------------------------------------------------------------
// Settle
// ---------------------------------------------------------------------------

#[test]
fn test_settle_after_challenge_period_pays_balances() {
    let s = Setup::new();
    let id = s.open();
    let (sig_a, sig_b) = sign_state(&s.env, &s.a, &s.b, id, 1, 14_000, 6_000);
    s.sc.submit_state(&s.a.address, &id, &1_u64, &14_000_i128, &6_000_i128, &sig_a, &sig_b);

    s.env.ledger().set(LedgerInfo {
        timestamp: s.env.ledger().timestamp() + 120,
        protocol_version: 22,
        sequence_number: s.env.ledger().sequence() + 1,
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: 1,
        min_persistent_entry_ttl: 1,
        max_entry_ttl: 6_312_000,
    });

    s.sc.settle(&id);
    assert_eq!(s.sc.get_channel(&id).status, ChannelStatus::Settled);
    assert_eq!(token::Client::new(&s.env, &s.token).balance(&s.a.address), 54_000); // 50_000 - 10_000 + 14_000
    assert_eq!(token::Client::new(&s.env, &s.token).balance(&s.b.address), 46_000); // 50_000 - 10_000 + 6_000
}

#[test]
#[should_panic]
fn test_settle_before_challenge_expiry_panics() {
    let s = Setup::new();
    let id = s.open();
    let (sig_a, sig_b) = sign_state(&s.env, &s.a, &s.b, id, 1, 10_000, 10_000);
    s.sc.submit_state(&s.a.address, &id, &1_u64, &10_000_i128, &10_000_i128, &sig_a, &sig_b);
    s.sc.settle(&id); // challenge period not expired
}

#[test]
#[should_panic]
fn test_settle_on_open_channel_panics() {
    let s = Setup::new();
    let id = s.open();
    s.sc.settle(&id);
}

// ---------------------------------------------------------------------------
// Cooperative close
// ---------------------------------------------------------------------------

#[test]
fn test_cooperative_close_settles_immediately() {
    let s = Setup::new();
    let id = s.open();
    let (sig_a, sig_b) = sign_state(&s.env, &s.a, &s.b, id, 7, 11_000, 9_000);
    s.sc.cooperative_close(&id, &7_u64, &11_000_i128, &9_000_i128, &sig_a, &sig_b);
    assert_eq!(s.sc.get_channel(&id).status, ChannelStatus::Settled);
    assert_eq!(token::Client::new(&s.env, &s.token).balance(&s.a.address), 51_000);
    assert_eq!(token::Client::new(&s.env, &s.token).balance(&s.b.address), 49_000);
}

#[test]
#[should_panic]
fn test_cooperative_close_bad_sig_panics() {
    let s = Setup::new();
    let id = s.open();
    // Sign with wrong balances.
    let (sig_a, sig_b) = sign_state(&s.env, &s.a, &s.b, id, 7, 5_000, 15_000);
    s.sc.cooperative_close(&id, &7_u64, &11_000_i128, &9_000_i128, &sig_a, &sig_b);
}

#[test]
#[should_panic]
fn test_cooperative_close_balance_invariant_panics() {
    let s = Setup::new();
    let id = s.open();
    let (sig_a, sig_b) = sign_state(&s.env, &s.a, &s.b, id, 1, 11_000, 10_000); // sum = 21_000
    s.sc.cooperative_close(&id, &1_u64, &11_000_i128, &10_000_i128, &sig_a, &sig_b);
}

// ---------------------------------------------------------------------------
// compute_state_hash view
// ---------------------------------------------------------------------------

#[test]
fn test_compute_state_hash_matches_off_chain() {
    let s = Setup::new();
    let on_chain = s.sc.compute_state_hash(&1_u32, &5_u64, &12_000_i128, &8_000_i128);
    let off_chain = state_hash(&s.env, 1, 5, 12_000, 8_000);
    assert_eq!(on_chain, off_chain);
}
