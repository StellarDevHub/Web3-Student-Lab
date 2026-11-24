//! # DAO Governance Error Definitions
//!
//! Standardized, typed, and documented contract errors for DAO governance,
//! voting, proposals, timelock, and voice credit operations.
//! Namespace: 400-499 (Governance). This is the single `DaoError` for the crate.

use soroban_sdk::contracterror;

/// Typed, documented contract errors for the DAO governance contract.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum DaoError {
    /// 401 - Contract has already been initialized.
    AlreadyInitialized = 401,
    /// 402 - Contract has not been initialized.
    NotInitialized = 402,
    /// 403 - Caller is not authorized for governance operation.
    Unauthorized = 403,
    /// 404 - Proposal was not found with specified identifier.
    ProposalNotFound = 404,
    /// 405 - Proposal is not in the status required by the operation.
    ProposalClosed = 405,
    /// 406 - Voting deadline is still live; premature finalization rejected.
    VotingDeadlineLive = 406,
    /// 407 - Voter has already cast votes on this proposal (or replayed a nonce).
    AlreadyVoted = 407,
    /// 408 - Insufficient spendable voice credits for the requested votes.
    InsufficientCredits = 408,
    /// 409 - Number of votes must be non-zero.
    ZeroVotes = 409,
    /// 410 - Invalid deadline (reserved; zero duration now selects the default period).
    InvalidDeadline = 410,
    /// 411 - Ragequit requested with zero shares.
    ZeroShares = 411,
    /// 412 - Proposal is not in Passed (queued) status.
    ProposalNotPassed = 412,
    /// 413 - Voter cast a positive (Yes) vote and may not ragequit.
    YesVoterCannotRagequit = 413,
    /// 414 - Voter does not hold enough treasury shares.
    InsufficientShares = 414,
    /// 415 - Treasury has no reserves to pay out.
    InsufficientReserves = 415,
    /// 416 - Creator holds fewer credits than the proposal threshold.
    BelowProposalThreshold = 416,
    /// 417 - Voting period is outside the allowed bounds (1 to 30 days).
    InvalidVotingPeriod = 417,
    /// 418 - Timelock delay (48 hours) has not elapsed since the proposal was queued.
    TimelockNotElapsed = 418,
}
