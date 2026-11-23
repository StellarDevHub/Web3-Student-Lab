//! # Standardized Cross-Contract Error Namespaces
//!
//! Provides canonical `#[contracterror]` definitions with strict, non-overlapping
//! numeric ranges across contract domains:
//! - `100..199`: Authentication & Access Control
//! - `200..299`: Storage, State & Data Validity
//! - `300..399`: Arithmetic & Numerical Bounds
//! - `400..499`: Governance, Proposals & Voting

use soroban_sdk::contracterror;

/// Authentication & Authorization error namespace (100–199).
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum AuthError {
    /// 100: Caller is not authorized to perform this operation.
    Unauthorized = 100,
    /// 101: Caller is not the registered administrator.
    NotAdmin = 101,
    /// 102: Cryptographic signature verification failed.
    InvalidSignature = 102,
    /// 103: Authorization session or credential has expired.
    SessionExpired = 103,
    /// 104: Contract pause guard active; state-mutating operation blocked.
    ContractPaused = 104,
    /// 105: Reentrancy guard triggered on nested invocation.
    ReentrancyGuard = 105,
    /// 106: Soulbound asset cannot be transferred or delegated.
    SoulboundNonTransferable = 106,
}

/// Storage, Lifecycle & State error namespace (200–299).
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum StorageError {
    /// 200: Contract has already been initialized.
    AlreadyInitialized = 200,
    /// 201: Contract has not been initialized.
    NotInitialized = 201,
    /// 202: Requested record or entity was not found in storage.
    NotFound = 202,
    /// 203: Entity already exists in storage; duplicate creation rejected.
    AlreadyExists = 203,
    /// 204: Data state is expired or TTL has lapsed.
    Expired = 204,
    /// 205: Storage schema version mismatch or migration in progress.
    VersionMismatch = 205,
    /// 206: Maximum capacity or collection size limit exceeded.
    CapacityExceeded = 206,
}

/// Arithmetic, Bounds & Balance error namespace (300–399).
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum ArithmeticError {
    /// 300: Numerical overflow occurred during checked arithmetic.
    Overflow = 300,
    /// 301: Numerical underflow occurred during checked arithmetic.
    Underflow = 301,
    /// 302: Division or modulo by zero attempted.
    DivisionByZero = 302,
    /// 303: Amount must be strictly greater than zero.
    ZeroAmount = 303,
    /// 304: Insufficient token or asset balance for operation.
    InsufficientBalance = 304,
    /// 305: Slippage tolerance exceeded; output below minimum expected.
    SlippageExceeded = 305,
    /// 306: Invariant verification failed.
    InvariantViolated = 306,
}

/// Governance, Proposals & Voting error namespace (400–499).
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum GovernanceError {
    /// 400: Proposal not found with specified identifier.
    ProposalNotFound = 400,
    /// 401: Proposal is closed and no longer accepting votes or actions.
    ProposalClosed = 401,
    /// 402: Voting deadline is still live; early execution rejected.
    VotingDeadlineLive = 402,
    /// 403: Signer or voter has already cast their ballot.
    AlreadyVoted = 403,
    /// 404: Insufficient voice credits or voting power for allocation.
    InsufficientCredits = 404,
    /// 405: Vote weight or credit amount must be greater than zero.
    ZeroVotes = 405,
    /// 406: Proposal voting deadline is invalid or in the past.
    InvalidDeadline = 406,
    /// 407: Timelock delay period has not elapsed.
    TimelockActive = 407,
    /// 408: Insufficient guardian or quorum approvals.
    NotEnoughApprovals = 408,
}
