#![no_std]

//! # contract-events
//!
//! Standardized on-chain event schemas shared across the Web3-Student-Lab
//! Soroban contracts (see [`docs/contracts/EVENTS.md`] for the full schema
//! reference).
//!
//! Every state-modifying function in the platform contracts emits events
//! using the canonical topic `Symbol`s defined in [`topic`], so indexers,
//! auditors, and frontend subscription streams can consume a single,
//! predictable event vocabulary.
//!
//! This crate provides:
//!
//! * [`topic`] — the canonical indexed topic symbols (first topic element).
//! * `publish_*` — thin helpers that publish an event with the canonical
//!   topics and payload layout.
//! * `decode_*` — typed decoders that convert raw `(topics, data)` pairs
//!   (as returned by `env.events().all()`) back into structured values, for
//!   indexers and integration tests.

use soroban_sdk::{Address, BytesN, Env, Symbol, TryFromVal, Val, Vec};

#[cfg(test)]
extern crate std;

/// Canonical indexed topic symbols.
///
/// The first element of every event's topics tuple is one of these symbols;
/// the remaining topic elements are the indexed keys (addresses, ids) that
/// make the event searchable in real-time indexers.
pub mod topic {
    use soroban_sdk::{symbol_short, Symbol};

    // ---- market / continuous bonding curve ----
    /// A buy or sell executed on a bonding curve.
    pub const TRADE: Symbol = symbol_short!("trade");
    /// Emergency pause (or unpause) of a pool.
    pub const PAUSE: Symbol = symbol_short!("paused");
    /// Protocol fee withdrawal to a treasury.
    pub const FEE_WITHDRAW: Symbol = symbol_short!("fee_wd");

    // ---- fractional NFT vault ----
    /// An NFT was locked into / unlocked from the vault.
    pub const VAULT_LOCK: Symbol = symbol_short!("vault");
    /// Fractional shares were minted to a stakeholder.
    pub const SHARES_MINTED: Symbol = symbol_short!("shares");
    /// A buyout bid was placed (or refunded after being outbid).
    pub const BID: Symbol = symbol_short!("bid");
    /// A buyout auction was finalized or cancelled.
    pub const AUCTION: Symbol = symbol_short!("auction");
    /// A fractional holder claimed their pro-rata payout.
    pub const PAYOUT: Symbol = symbol_short!("payout");

    // ---- peer review / stake slashing ----
    /// A submission was created with a reward pool.
    pub const SUBMISSION: Symbol = symbol_short!("submit");
    /// A reviewer deposited or withdrew stake.
    pub const STAKE: Symbol = symbol_short!("stake");
    /// A reviewer committed a blind review hash.
    pub const COMMIT: Symbol = symbol_short!("commit");
    /// A reviewer revealed their review.
    pub const REVEAL: Symbol = symbol_short!("reveal");
    /// A submission was finalized (median consensus + rewards/slashing).
    pub const REVIEW_DONE: Symbol = symbol_short!("rview");
    /// A dishonest reviewer's stake was slashed.
    pub const SLASH: Symbol = symbol_short!("slash");

    // ---- platform-wide (enrollment / milestones / certificates / transfers) ----
    /// A student enrolled in (or was revoked from) a course / content item.
    pub const ENROLL: Symbol = symbol_short!("enroll");
    /// A student achieved a milestone.
    pub const MILESTONE: Symbol = symbol_short!("milestn");
    /// A certificate was minted to a student.
    pub const CERT_MINT: Symbol = symbol_short!("cert");
    /// A fungible token transfer executed by a platform contract.
    pub const TRANSFER: Symbol = symbol_short!("xfer");
}

// ---------------------------------------------------------------------------
// Publish helpers
// ---------------------------------------------------------------------------

/// Publish a trade event.
///
/// Topics: `(TRADE, trader)`
/// Data: `(action, tokens, reserve, supply_after, reserve_after, fee, ts)`
pub fn publish_trade(
    env: &Env,
    trader: &Address,
    action: Symbol,
    tokens: i128,
    reserve: i128,
    supply_after: i128,
    reserve_after: i128,
    fee: i128,
) {
    env.events().publish(
        (topic::TRADE, trader.clone()),
        (
            action,
            tokens,
            reserve,
            supply_after,
            reserve_after,
            fee,
            env.ledger().timestamp(),
        ),
    );
}

/// Publish a pool pause / unpause event.
///
/// Topics: `(PAUSE, admin)`
/// Data: `(paused, ts)`
pub fn publish_pause(env: &Env, admin: &Address, paused: bool) {
    env.events().publish(
        (topic::PAUSE, admin.clone()),
        (paused, env.ledger().timestamp()),
    );
}

/// Publish a fee withdrawal event.
///
/// Topics: `(FEE_WITHDRAW, admin)`
/// Data: `(treasury, amount, ts)`
pub fn publish_fee_withdraw(env: &Env, admin: &Address, treasury: &Address, amount: i128) {
    env.events().publish(
        (topic::FEE_WITHDRAW, admin.clone()),
        (treasury.clone(), amount, env.ledger().timestamp()),
    );
}

/// Publish an NFT lock / unlock event.
///
/// Topics: `(VAULT_LOCK, party)`
/// Data: `(nft_contract, token_id, locked, ts)`
pub fn publish_vault_lock(
    env: &Env,
    party: &Address,
    nft_contract: &Address,
    token_id: &BytesN<32>,
    locked: bool,
) {
    env.events().publish(
        (topic::VAULT_LOCK, party.clone()),
        (
            nft_contract.clone(),
            token_id.clone(),
            locked,
            env.ledger().timestamp(),
        ),
    );
}

/// Publish a fractional shares mint event.
///
/// Topics: `(SHARES_MINTED, recipient)`
/// Data: `(amount, total_shares, ts)`
pub fn publish_shares_minted(env: &Env, recipient: &Address, amount: i128, total_shares: i128) {
    env.events().publish(
        (topic::SHARES_MINTED, recipient.clone()),
        (amount, total_shares, env.ledger().timestamp()),
    );
}

/// Publish a buyout bid event.
///
/// Topics: `(BID, bidder)`
/// Data: `(amount, refunded, ts)` — `refunded` is the amount returned to a
/// previously-leading bidder who was outbid.
pub fn publish_bid(env: &Env, bidder: &Address, amount: i128, refunded: i128) {
    env.events().publish(
        (topic::BID, bidder.clone()),
        (amount, refunded, env.ledger().timestamp()),
    );
}

/// Publish an auction finalize / cancel event.
///
/// Topics: `(AUCTION, winner)` — when cancelling, callers pass their own
/// contract address as a no-winner marker and set `finalized = false`.
/// Data: `(offer, total_shares, finalized, ts)`
pub fn publish_auction(
    env: &Env,
    winner: &Address,
    offer: i128,
    total_shares: i128,
    finalized: bool,
) {
    env.events().publish(
        (topic::AUCTION, winner.clone()),
        (offer, total_shares, finalized, env.ledger().timestamp()),
    );
}

/// Publish a payout claim event.
///
/// Topics: `(PAYOUT, holder)`
/// Data: `(amount, ts)`
pub fn publish_payout(env: &Env, holder: &Address, amount: i128) {
    env.events().publish(
        (topic::PAYOUT, holder.clone()),
        (amount, env.ledger().timestamp()),
    );
}

/// Publish a submission creation event.
///
/// Topics: `(SUBMISSION, creator)`
/// Data: `(submission_id, reward_pool, commit_deadline, reveal_deadline, ts)`
pub fn publish_submission(
    env: &Env,
    creator: &Address,
    submission_id: u64,
    reward_pool: i128,
    commit_deadline: u64,
    reveal_deadline: u64,
) {
    env.events().publish(
        (topic::SUBMISSION, creator.clone()),
        (
            submission_id,
            reward_pool,
            commit_deadline,
            reveal_deadline,
            env.ledger().timestamp(),
        ),
    );
}

/// Publish a stake deposit / withdrawal event.
///
/// Topics: `(STAKE, reviewer)`
/// Data: `(amount, total_stake, deposit, ts)`
pub fn publish_stake(env: &Env, reviewer: &Address, amount: i128, total_stake: i128, deposit: bool) {
    env.events().publish(
        (topic::STAKE, reviewer.clone()),
        (amount, total_stake, deposit, env.ledger().timestamp()),
    );
}

/// Publish a review commit event.
///
/// Topics: `(COMMIT, reviewer)`
/// Data: `(submission_id, commitment, ts)`
pub fn publish_commit(
    env: &Env,
    reviewer: &Address,
    submission_id: u64,
    commitment: &BytesN<32>,
) {
    env.events().publish(
        (topic::COMMIT, reviewer.clone()),
        (
            submission_id,
            commitment.clone(),
            env.ledger().timestamp(),
        ),
    );
}

/// Publish a review reveal event.
///
/// Topics: `(REVEAL, reviewer)`
/// Data: `(submission_id, grade, ts)`
pub fn publish_reveal(env: &Env, reviewer: &Address, submission_id: u64, grade: i128) {
    env.events().publish(
        (topic::REVEAL, reviewer.clone()),
        (submission_id, grade, env.ledger().timestamp()),
    );
}

/// Publish a submission finalize event.
///
/// Topics: `(REVIEW_DONE, submission_id)`
/// Data: `(median, rewarded, slashed, ts)`
pub fn publish_review_done(
    env: &Env,
    submission_id: u64,
    median: i128,
    rewarded: u32,
    slashed: u32,
) {
    env.events().publish(
        (topic::REVIEW_DONE, submission_id),
        (median, rewarded, slashed, env.ledger().timestamp()),
    );
}

/// Publish a stake slash event.
///
/// Topics: `(SLASH, reviewer)`
/// Data: `(submission_id, amount, ts)`
pub fn publish_slash(env: &Env, reviewer: &Address, submission_id: u64, amount: i128) {
    env.events().publish(
        (topic::SLASH, reviewer.clone()),
        (submission_id, amount, env.ledger().timestamp()),
    );
}

/// Publish a platform enrollment event (canonical schema for the platform
/// course/content contracts).
///
/// Topics: `(ENROLL, student)`
/// Data: `(content_id, revoked, ts)`
pub fn publish_enrollment(env: &Env, student: &Address, content_id: u64, revoked: bool) {
    env.events().publish(
        (topic::ENROLL, student.clone()),
        (content_id, revoked, env.ledger().timestamp()),
    );
}

/// Publish a milestone achievement event.
///
/// Topics: `(MILESTONE, student)`
/// Data: `(content_id, milestone, ts)`
pub fn publish_milestone(
    env: &Env,
    student: &Address,
    content_id: u64,
    milestone: Symbol,
) {
    env.events().publish(
        (topic::MILESTONE, student.clone()),
        (content_id, milestone, env.ledger().timestamp()),
    );
}

/// Publish a certificate mint event.
///
/// Topics: `(CERT_MINT, student)`
/// Data: `(course_id, ts)`
pub fn publish_certificate_mint(env: &Env, student: &Address, course_id: Symbol) {
    env.events().publish(
        (topic::CERT_MINT, student.clone()),
        (course_id, env.ledger().timestamp()),
    );
}

/// Publish a platform token transfer event.
///
/// Topics: `(TRANSFER, from)`
/// Data: `(to, amount, ts)`
pub fn publish_transfer(env: &Env, from: &Address, to: &Address, amount: i128) {
    env.events().publish(
        (topic::TRANSFER, from.clone()),
        (to.clone(), amount, env.ledger().timestamp()),
    );
}

// ---------------------------------------------------------------------------
// Typed decode helpers
// ---------------------------------------------------------------------------

/// Decoded [`topic::TRADE`] event.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TradeEvent {
    pub trader: Address,
    pub action: Symbol,
    pub tokens: i128,
    pub reserve: i128,
    pub supply_after: i128,
    pub reserve_after: i128,
    pub fee: i128,
    pub ts: u64,
}

/// Decoded [`topic::PAUSE`] event.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PauseEvent {
    pub admin: Address,
    pub paused: bool,
    pub ts: u64,
}

/// Decoded [`topic::FEE_WITHDRAW`] event.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FeeWithdrawEvent {
    pub admin: Address,
    pub treasury: Address,
    pub amount: i128,
    pub ts: u64,
}

/// Decoded [`topic::VAULT_LOCK`] event.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VaultLockEvent {
    pub party: Address,
    pub nft_contract: Address,
    pub token_id: BytesN<32>,
    pub locked: bool,
    pub ts: u64,
}

/// Decoded [`topic::SHARES_MINTED`] event.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SharesMintedEvent {
    pub recipient: Address,
    pub amount: i128,
    pub total_shares: i128,
    pub ts: u64,
}

/// Decoded [`topic::BID`] event.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BidEvent {
    pub bidder: Address,
    pub amount: i128,
    pub refunded: i128,
    pub ts: u64,
}

/// Decoded [`topic::AUCTION`] event.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AuctionEvent {
    pub winner: Address,
    pub offer: i128,
    pub total_shares: i128,
    pub finalized: bool,
    pub ts: u64,
}

/// Decoded [`topic::PAYOUT`] event.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PayoutEvent {
    pub holder: Address,
    pub amount: i128,
    pub ts: u64,
}

/// Decoded [`topic::SUBMISSION`] event.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SubmissionEvent {
    pub creator: Address,
    pub submission_id: u64,
    pub reward_pool: i128,
    pub commit_deadline: u64,
    pub reveal_deadline: u64,
    pub ts: u64,
}

/// Decoded [`topic::STAKE`] event.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StakeEvent {
    pub reviewer: Address,
    pub amount: i128,
    pub total_stake: i128,
    pub deposit: bool,
    pub ts: u64,
}

/// Decoded [`topic::COMMIT`] event.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CommitEvent {
    pub reviewer: Address,
    pub submission_id: u64,
    pub commitment: BytesN<32>,
    pub ts: u64,
}

/// Decoded [`topic::REVEAL`] event.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RevealEvent {
    pub reviewer: Address,
    pub submission_id: u64,
    pub grade: i128,
    pub ts: u64,
}

/// Decoded [`topic::REVIEW_DONE`] event.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReviewDoneEvent {
    pub submission_id: u64,
    pub median: i128,
    pub rewarded: u32,
    pub slashed: u32,
    pub ts: u64,
}

/// Decoded [`topic::SLASH`] event.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SlashEvent {
    pub reviewer: Address,
    pub submission_id: u64,
    pub amount: i128,
    pub ts: u64,
}

/// Decoded [`topic::ENROLL`] event.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EnrollmentEvent {
    pub student: Address,
    pub content_id: u64,
    pub revoked: bool,
    pub ts: u64,
}

/// Decoded [`topic::MILESTONE`] event.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MilestoneEvent {
    pub student: Address,
    pub content_id: u64,
    pub milestone: Symbol,
    pub ts: u64,
}

/// Decoded [`topic::CERT_MINT`] event.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CertificateMintEvent {
    pub student: Address,
    pub course_id: Symbol,
    pub ts: u64,
}

/// Decoded [`topic::TRANSFER`] event.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TransferEvent {
    pub from: Address,
    pub to: Address,
    pub amount: i128,
    pub ts: u64,
}

/// Unpack an event payload `Val` into its component values.
///
/// Event payloads published by this crate are tuples packed into a single
/// `Vec` value by the Soroban host, so this is the first step both the typed
/// decoders and off-chain indexers perform when consuming an event.
pub fn event_data(env: &Env, data: &Val) -> Vec<Val> {
    match Vec::<Val>::try_from_val(env, data) {
        Ok(v) => {
            let mut out = Vec::new(env);
            let mut i = 0u32;
            while i < v.len() {
                out.push_back(v.get(i).unwrap());
                i += 1;
            }
            out
        }
        Err(_) => {
            let mut out = Vec::new(env);
            out.push_back(data.clone());
            out
        }
    }
}

fn decode_address(env: &Env, v: &Val) -> Address {
    Address::try_from_val(env, v).expect("contract-events: expected Address in event")
}

fn decode_symbol(env: &Env, v: &Val) -> Symbol {
    Symbol::try_from_val(env, v).expect("contract-events: expected Symbol in event")
}

fn decode_i128(env: &Env, v: &Val) -> i128 {
    i128::try_from_val(env, v).expect("contract-events: expected i128 in event")
}

fn decode_u64(env: &Env, v: &Val) -> u64 {
    u64::try_from_val(env, v).expect("contract-events: expected u64 in event")
}

fn decode_u32(env: &Env, v: &Val) -> u32 {
    u32::try_from_val(env, v).expect("contract-events: expected u32 in event")
}

fn decode_bool(env: &Env, v: &Val) -> bool {
    bool::try_from_val(env, v).expect("contract-events: expected bool in event")
}

fn decode_bytesn32(env: &Env, v: &Val) -> BytesN<32> {
    BytesN::<32>::try_from_val(env, v).expect("contract-events: expected BytesN<32> in event")
}

/// Decode a `(topics, data)` pair into a [`TradeEvent`].
pub fn decode_trade(env: &Env, topics: &[Val], data: &[Val]) -> TradeEvent {
    TradeEvent {
        trader: decode_address(env, &topics[1]),
        action: decode_symbol(env, &data[0]),
        tokens: decode_i128(env, &data[1]),
        reserve: decode_i128(env, &data[2]),
        supply_after: decode_i128(env, &data[3]),
        reserve_after: decode_i128(env, &data[4]),
        fee: decode_i128(env, &data[5]),
        ts: decode_u64(env, &data[6]),
    }
}

/// Decode a `(topics, data)` pair into a [`PauseEvent`].
pub fn decode_pause(env: &Env, topics: &[Val], data: &[Val]) -> PauseEvent {
    PauseEvent {
        admin: decode_address(env, &topics[1]),
        paused: decode_bool(env, &data[0]),
        ts: decode_u64(env, &data[1]),
    }
}

/// Decode a `(topics, data)` pair into a [`FeeWithdrawEvent`].
pub fn decode_fee_withdraw(env: &Env, topics: &[Val], data: &[Val]) -> FeeWithdrawEvent {
    FeeWithdrawEvent {
        admin: decode_address(env, &topics[1]),
        treasury: decode_address(env, &data[0]),
        amount: decode_i128(env, &data[1]),
        ts: decode_u64(env, &data[2]),
    }
}

/// Decode a `(topics, data)` pair into a [`VaultLockEvent`].
pub fn decode_vault_lock(env: &Env, topics: &[Val], data: &[Val]) -> VaultLockEvent {
    VaultLockEvent {
        party: decode_address(env, &topics[1]),
        nft_contract: decode_address(env, &data[0]),
        token_id: decode_bytesn32(env, &data[1]),
        locked: decode_bool(env, &data[2]),
        ts: decode_u64(env, &data[3]),
    }
}

/// Decode a `(topics, data)` pair into a [`SharesMintedEvent`].
pub fn decode_shares_minted(env: &Env, topics: &[Val], data: &[Val]) -> SharesMintedEvent {
    SharesMintedEvent {
        recipient: decode_address(env, &topics[1]),
        amount: decode_i128(env, &data[0]),
        total_shares: decode_i128(env, &data[1]),
        ts: decode_u64(env, &data[2]),
    }
}

/// Decode a `(topics, data)` pair into a [`BidEvent`].
pub fn decode_bid(env: &Env, topics: &[Val], data: &[Val]) -> BidEvent {
    BidEvent {
        bidder: decode_address(env, &topics[1]),
        amount: decode_i128(env, &data[0]),
        refunded: decode_i128(env, &data[1]),
        ts: decode_u64(env, &data[2]),
    }
}

/// Decode a `(topics, data)` pair into an [`AuctionEvent`].
pub fn decode_auction(env: &Env, topics: &[Val], data: &[Val]) -> AuctionEvent {
    AuctionEvent {
        winner: decode_address(env, &topics[1]),
        offer: decode_i128(env, &data[0]),
        total_shares: decode_i128(env, &data[1]),
        finalized: decode_bool(env, &data[2]),
        ts: decode_u64(env, &data[3]),
    }
}

/// Decode a `(topics, data)` pair into a [`PayoutEvent`].
pub fn decode_payout(env: &Env, topics: &[Val], data: &[Val]) -> PayoutEvent {
    PayoutEvent {
        holder: decode_address(env, &topics[1]),
        amount: decode_i128(env, &data[0]),
        ts: decode_u64(env, &data[1]),
    }
}

/// Decode a `(topics, data)` pair into a [`SubmissionEvent`].
pub fn decode_submission(env: &Env, topics: &[Val], data: &[Val]) -> SubmissionEvent {
    SubmissionEvent {
        creator: decode_address(env, &topics[1]),
        submission_id: decode_u64(env, &data[0]),
        reward_pool: decode_i128(env, &data[1]),
        commit_deadline: decode_u64(env, &data[2]),
        reveal_deadline: decode_u64(env, &data[3]),
        ts: decode_u64(env, &data[4]),
    }
}

/// Decode a `(topics, data)` pair into a [`StakeEvent`].
pub fn decode_stake(env: &Env, topics: &[Val], data: &[Val]) -> StakeEvent {
    StakeEvent {
        reviewer: decode_address(env, &topics[1]),
        amount: decode_i128(env, &data[0]),
        total_stake: decode_i128(env, &data[1]),
        deposit: decode_bool(env, &data[2]),
        ts: decode_u64(env, &data[3]),
    }
}

/// Decode a `(topics, data)` pair into a [`CommitEvent`].
pub fn decode_commit(env: &Env, topics: &[Val], data: &[Val]) -> CommitEvent {
    CommitEvent {
        reviewer: decode_address(env, &topics[1]),
        submission_id: decode_u64(env, &data[0]),
        commitment: decode_bytesn32(env, &data[1]),
        ts: decode_u64(env, &data[2]),
    }
}

/// Decode a `(topics, data)` pair into a [`RevealEvent`].
pub fn decode_reveal(env: &Env, topics: &[Val], data: &[Val]) -> RevealEvent {
    RevealEvent {
        reviewer: decode_address(env, &topics[1]),
        submission_id: decode_u64(env, &data[0]),
        grade: decode_i128(env, &data[1]),
        ts: decode_u64(env, &data[2]),
    }
}

/// Decode a `(topics, data)` pair into a [`ReviewDoneEvent`].
pub fn decode_review_done(env: &Env, topics: &[Val], data: &[Val]) -> ReviewDoneEvent {
    ReviewDoneEvent {
        submission_id: decode_u64(env, &topics[1]),
        median: decode_i128(env, &data[0]),
        rewarded: decode_u32(env, &data[1]),
        slashed: decode_u32(env, &data[2]),
        ts: decode_u64(env, &data[3]),
    }
}

/// Decode a `(topics, data)` pair into a [`SlashEvent`].
pub fn decode_slash(env: &Env, topics: &[Val], data: &[Val]) -> SlashEvent {
    SlashEvent {
        reviewer: decode_address(env, &topics[1]),
        submission_id: decode_u64(env, &data[0]),
        amount: decode_i128(env, &data[1]),
        ts: decode_u64(env, &data[2]),
    }
}

/// Decode a `(topics, data)` pair into an [`EnrollmentEvent`].
pub fn decode_enrollment(env: &Env, topics: &[Val], data: &[Val]) -> EnrollmentEvent {
    EnrollmentEvent {
        student: decode_address(env, &topics[1]),
        content_id: decode_u64(env, &data[0]),
        revoked: decode_bool(env, &data[1]),
        ts: decode_u64(env, &data[2]),
    }
}

/// Decode a `(topics, data)` pair into a [`MilestoneEvent`].
pub fn decode_milestone(env: &Env, topics: &[Val], data: &[Val]) -> MilestoneEvent {
    MilestoneEvent {
        student: decode_address(env, &topics[1]),
        content_id: decode_u64(env, &data[0]),
        milestone: decode_symbol(env, &data[1]),
        ts: decode_u64(env, &data[2]),
    }
}

/// Decode a `(topics, data)` pair into a [`CertificateMintEvent`].
pub fn decode_certificate_mint(env: &Env, topics: &[Val], data: &[Val]) -> CertificateMintEvent {
    CertificateMintEvent {
        student: decode_address(env, &topics[1]),
        course_id: decode_symbol(env, &data[0]),
        ts: decode_u64(env, &data[1]),
    }
}

/// Decode a `(topics, data)` pair into a [`TransferEvent`].
pub fn decode_transfer(env: &Env, topics: &[Val], data: &[Val]) -> TransferEvent {
    TransferEvent {
        from: decode_address(env, &topics[1]),
        to: decode_address(env, &data[0]),
        amount: decode_i128(env, &data[1]),
        ts: decode_u64(env, &data[2]),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        contract, contractimpl, symbol_short,
        testutils::{Address as _, Events as _},
        xdr, Address, BytesN, Env, Symbol, Val,
    };

    /// Mock contract used to emit events from a contract context (the host
    /// only records events that carry a contract id).
    #[contract]
    pub struct EventEmitter;

    #[contractimpl]
    impl EventEmitter {
        pub fn emit_all(
            env: Env,
            admin: Address,
            user: Address,
            nft: Address,
            token_id: BytesN<32>,
        ) {
            publish_trade(&env, &admin, symbol_short!("buy"), 100, 500, 110, 600, 5);
            publish_pause(&env, &admin, true);
            publish_fee_withdraw(&env, &admin, &user, 42);
            publish_vault_lock(&env, &admin, &nft, &token_id, true);
            publish_shares_minted(&env, &admin, 500, 1_000);
            publish_bid(&env, &admin, 10_000, 0);
            publish_auction(&env, &admin, 10_000, 1_000, true);
            publish_payout(&env, &admin, 5_000);
            publish_submission(&env, &admin, 42, 1_000, 100, 200);
            publish_stake(&env, &admin, 250, 250, true);
            publish_commit(&env, &admin, 42, &token_id);
            publish_reveal(&env, &admin, 42, 87);
            publish_review_done(&env, 42, 87, 3, 1);
            publish_slash(&env, &admin, 42, 100);
            publish_enrollment(&env, &admin, 7, false);
            publish_milestone(&env, &admin, 7, symbol_short!("unit2"));
            publish_certificate_mint(&env, &admin, symbol_short!("cs101"));
            publish_transfer(&env, &admin, &user, 123);
        }
    }

    fn addr(env: &Env) -> Address {
        Address::generate(env)
    }

    /// Convert `env.events().all()` into `(topics, payload)` pairs where the
    /// payload `ScVal` has been unpacked into its component values.
    fn raw_events(
        env: &Env,
    ) -> std::vec::Vec<(std::vec::Vec<Val>, std::vec::Vec<Val>)> {
        let mut out = std::vec::Vec::new();
        for e in env.events().all().events() {
            if let xdr::ContractEventBody::V0(v0) = &e.body {
                let topics: Vec<Val> = Vec::try_from_val(env, &v0.topics).unwrap();
                let payload: Vec<Val> = Vec::try_from_val(env, &v0.data)
                    .unwrap_or_else(|_| {
                        let mut v = Vec::new(env);
                        v.push_back(Val::try_from_val(env, &v0.data).unwrap());
                        v
                    });
                let mut t = std::vec::Vec::new();
                let mut i = 0u32;
                while i < topics.len() {
                    t.push(topics.get(i).unwrap());
                    i += 1;
                }
                let mut p = std::vec::Vec::new();
                let mut j = 0u32;
                while j < payload.len() {
                    p.push(payload.get(j).unwrap());
                    j += 1;
                }
                out.push((t, p));
            }
        }
        out
    }

    #[test]
    fn all_event_families_round_trip_through_decode() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = addr(&env);
        let user = addr(&env);
        let nft = addr(&env);
        let token_id = BytesN::from_array(&env, &[3u8; 32]);

        let id = env.register(EventEmitter, ());
        let emitter = EventEmitterClient::new(&env, &id);
        emitter.emit_all(&admin, &user, &nft, &token_id);

        let events = raw_events(&env);
        assert_eq!(events.len(), 18);

        // trade
        let (topics, data) = &events[0];
        assert_eq!(Symbol::try_from_val(&env, &topics[0]).unwrap(), topic::TRADE);
        let trade = decode_trade(&env, topics, data);
        assert_eq!(trade.trader, admin);
        assert_eq!(trade.action, symbol_short!("buy"));
        assert_eq!(trade.tokens, 100);
        assert_eq!(trade.reserve, 500);
        assert_eq!(trade.supply_after, 110);
        assert_eq!(trade.reserve_after, 600);
        assert_eq!(trade.fee, 5);
        assert_eq!(trade.ts, env.ledger().timestamp());

        // pause
        let (topics, data) = &events[1];
        assert_eq!(Symbol::try_from_val(&env, &topics[0]).unwrap(), topic::PAUSE);
        let pause = decode_pause(&env, topics, data);
        assert!(pause.paused);

        // fee withdrawal
        let (topics, data) = &events[2];
        assert_eq!(Symbol::try_from_val(&env, &topics[0]).unwrap(), topic::FEE_WITHDRAW);
        let fee = decode_fee_withdraw(&env, topics, data);
        assert_eq!(fee.amount, 42);

        // vault lock
        let (topics, data) = &events[3];
        assert_eq!(Symbol::try_from_val(&env, &topics[0]).unwrap(), topic::VAULT_LOCK);
        let lock = decode_vault_lock(&env, topics, data);
        assert!(lock.locked);
        assert_eq!(lock.token_id, token_id);

        // shares minted
        let (topics, data) = &events[4];
        assert_eq!(Symbol::try_from_val(&env, &topics[0]).unwrap(), topic::SHARES_MINTED);
        let shares = decode_shares_minted(&env, topics, data);
        assert_eq!(shares.amount, 500);

        // bid
        let (topics, data) = &events[5];
        assert_eq!(Symbol::try_from_val(&env, &topics[0]).unwrap(), topic::BID);
        let bid = decode_bid(&env, topics, data);
        assert_eq!(bid.amount, 10_000);

        // auction
        let (topics, data) = &events[6];
        assert_eq!(Symbol::try_from_val(&env, &topics[0]).unwrap(), topic::AUCTION);
        let auction = decode_auction(&env, topics, data);
        assert!(auction.finalized);
        assert_eq!(auction.winner, admin);

        // payout
        let (topics, data) = &events[7];
        assert_eq!(Symbol::try_from_val(&env, &topics[0]).unwrap(), topic::PAYOUT);
        let payout = decode_payout(&env, topics, data);
        assert_eq!(payout.amount, 5_000);

        // submission
        let (topics, data) = &events[8];
        assert_eq!(Symbol::try_from_val(&env, &topics[0]).unwrap(), topic::SUBMISSION);
        let sub = decode_submission(&env, topics, data);
        assert_eq!(sub.submission_id, 42);
        assert_eq!(sub.reward_pool, 1_000);

        // stake
        let (topics, data) = &events[9];
        assert_eq!(Symbol::try_from_val(&env, &topics[0]).unwrap(), topic::STAKE);
        let stake = decode_stake(&env, topics, data);
        assert!(stake.deposit);
        assert_eq!(stake.total_stake, 250);

        // commit
        let (topics, data) = &events[10];
        assert_eq!(Symbol::try_from_val(&env, &topics[0]).unwrap(), topic::COMMIT);
        let commit = decode_commit(&env, topics, data);
        assert_eq!(commit.submission_id, 42);
        assert_eq!(commit.commitment, token_id);

        // reveal
        let (topics, data) = &events[11];
        assert_eq!(Symbol::try_from_val(&env, &topics[0]).unwrap(), topic::REVEAL);
        let reveal = decode_reveal(&env, topics, data);
        assert_eq!(reveal.grade, 87);

        // review done
        let (topics, data) = &events[12];
        assert_eq!(Symbol::try_from_val(&env, &topics[0]).unwrap(), topic::REVIEW_DONE);
        let done = decode_review_done(&env, topics, data);
        assert_eq!(done.median, 87);
        assert_eq!(done.rewarded, 3);
        assert_eq!(done.slashed, 1);

        // slash
        let (topics, data) = &events[13];
        assert_eq!(Symbol::try_from_val(&env, &topics[0]).unwrap(), topic::SLASH);
        let slash = decode_slash(&env, topics, data);
        assert_eq!(slash.amount, 100);

        // enrollment
        let (topics, data) = &events[14];
        assert_eq!(Symbol::try_from_val(&env, &topics[0]).unwrap(), topic::ENROLL);
        let enroll = decode_enrollment(&env, topics, data);
        assert_eq!(enroll.content_id, 7);
        assert!(!enroll.revoked);

        // milestone
        let (topics, data) = &events[15];
        assert_eq!(Symbol::try_from_val(&env, &topics[0]).unwrap(), topic::MILESTONE);
        let milestone = decode_milestone(&env, topics, data);
        assert_eq!(milestone.milestone, symbol_short!("unit2"));

        // certificate mint
        let (topics, data) = &events[16];
        assert_eq!(Symbol::try_from_val(&env, &topics[0]).unwrap(), topic::CERT_MINT);
        let cert = decode_certificate_mint(&env, topics, data);
        assert_eq!(cert.course_id, symbol_short!("cs101"));

        // transfer
        let (topics, data) = &events[17];
        assert_eq!(Symbol::try_from_val(&env, &topics[0]).unwrap(), topic::TRANSFER);
        let xfer = decode_transfer(&env, topics, data);
        assert_eq!(xfer.amount, 123);
    }
}
