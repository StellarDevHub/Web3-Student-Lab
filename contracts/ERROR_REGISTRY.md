# Standardized Smart Contract Error Code Registry

This document is automatically generated from `#[contracterror]` annotations across the workspace.

## Namespace Allocations

| Range | Category | Purpose |
| :--- | :--- | :--- |
| `100–199` | Authentication & Access Control | Signatures, permissions, session expiration, soulbound checks |
| `200–299` | Storage & State Lifecycle | Initialization, entity lookups, versioning, capacity |
| `300–399` | Arithmetic & Numerical Bounds | Overflow/underflow, zero checks, balance assertions, slippage |
| `400–499` | Governance, DAO & Proposals | Quorum, voting, proposal lifecycles, voice credits |
| `500+`    | Protocol-Specific & Oracles | AMM, TWAP, staking vaults, custom features |

## Contract Error Tables

### `AcError` (`access_control/src/lib.rs`)

| Code | Variant Name | Description |
| :---: | :--- | :--- |
| `300` | `Unauthorized` | Caller does not hold the required role or is not the proposed admin. |
| `301` | `ContractPaused` | `301` — The contract is in circuit-breaker pause mode. |
| `302` | `TimelockNotExpired` | The 48-hour admin handover delay has not elapsed. |
| `303` | `NoPendingTransfer` | No admin handover is pending. |
| `304` | `AlreadyHasRole` | The address already holds the requested role. |
| `305` | `Overflow` | Arithmetic overflow while calculating the admin handover unlock time. |
| `306` | `RoleNotGranted` | The address does not hold the role being revoked. |
| `307` | `InvalidRole` | Admin cannot be granted or revoked through the direct role API. |
| `308` | `InvalidAdminProposal` | The current admin cannot propose itself as the next admin. |

### `AmmError` (`amm/src/lib.rs`)

| Code | Variant Name | Description |
| :---: | :--- | :--- |
| `400` | `AlreadyInitialized` | `400` — Contract has already been initialised. |
| `401` | `InvalidAmount` | `401` — Amounts provided must be positive. |
| `402` | `InvalidFee` | `402` — Fee is outside the allowed range. |
| `403` | `SlippageExceeded` | `403` — Slippage tolerance exceeded. |
| `404` | `NotInitialized` | `404` — Contract has not been initialised. |
| `405` | `ContractPaused` | `405` — AMM operations are paused by the circuit breaker. |
| `406` | `Unauthorized` | `406` — Caller is not authorized to manage the circuit breaker. |
| `407` | `WithdrawalLimitExceeded` | `407` — The 24-hour token outflow budget has been exceeded. |
| `408` | `Overflow` | `408` — Arithmetic overflow. |

### `AuthError` (`auth_checker/src/lib.rs`)

| Code | Variant Name | Description |
| :---: | :--- | :--- |
| `1` | `AlreadyInitialized` | No description provided |
| `2` | `NotInitialized` | No description provided |
| `3` | `Unauthorized` | No description provided |

### `Error` (`automated_testing_suite/src/lib.rs`)

| Code | Variant Name | Description |
| :---: | :--- | :--- |
| `1` | `TestNotFound` | No description provided |

### `CertificateError` (`certificate/src/errors.rs`)

| Code | Variant Name | Description |
| :---: | :--- | :--- |
| `101` | `Unauthorized` | 101 — Caller is not the authorized issuer or administrator. |
| `106` | `SoulboundNonTransferable` | 106 — Soulbound certificate cannot be transferred or delegated. |
| `201` | `NotFound` | 201 — Certificate record was not found in persistent storage. |
| `202` | `AlreadyRevoked` | 202 — Certificate has already been revoked. |
| `203` | `NotRevoked` | 203 — Certificate is not in a revoked state; reissuance denied. |
| `204` | `CohortNotFound` | 204 — Cohort merkle root was not found. |
| `305` | `RoyaltyTooHigh` | 305 — Configured royalty basis points exceeds allowable ceiling (MAX_ROYALTY_BPS). |

### `CertError` (`certificate_nft/src/lib.rs`)

| Code | Variant Name | Description |
| :---: | :--- | :--- |
| `400` | `AlreadyMinted` | `400` — A certificate has already been minted for this student and course. |
| `401` | `Unauthorized` | `401` — Caller is not the admin. |
| `402` | `SoulboundNonTransferable` | `402` — Badge is soulbound and cannot be transferred. |
| `403` | `InvalidTierUpgrade` | `403` — Requested tier upgrade is invalid or prerequisites unmet. |
| `404` | `BadgeNotFound` | `404` — Requested badge ID was not found. |
| `405` | `InsufficientMilestones` | `405` — Insufficient completed milestones for this tier. |

### `Error` (`content_management_system/src/errors.rs`)

| Code | Variant Name | Description |
| :---: | :--- | :--- |
| `1` | `AlreadyInitialized` | No description provided |
| `2` | `NotInitialized` | No description provided |
| `3` | `Unauthorized` | No description provided |
| `4` | `NotInstructor` | No description provided |
| `5` | `AlreadyInstructor` | No description provided |
| `6` | `ContentNotFound` | No description provided |
| `7` | `VersionNotFound` | No description provided |
| `8` | `TitleTooLong` | No description provided |
| `9` | `DescriptionTooLong` | No description provided |
| `10` | `InvalidContentHash` | No description provided |
| `11` | `InvalidStatusTransition` | No description provided |
| `12` | `ContentArchived` | No description provided |
| `13` | `AlreadyArchived` | No description provided |
| `14` | `AccessDenied` | No description provided |
| `15` | `EnrollmentNotAllowed` | No description provided |
| `16` | `AlreadyEnrolled` | No description provided |
| `17` | `NotEnrolled` | No description provided |

### `CurveError` (`continuous_bonding_curve/src/data.rs`)

| Code | Variant Name | Description |
| :---: | :--- | :--- |
| `1` | `AlreadyInitialized` | No description provided |
| `2` | `NotInitialized` | No description provided |
| `3` | `InvalidAmount` | No description provided |
| `4` | `SlippageExceeded` | No description provided |
| `5` | `DeadlinePassed` | No description provided |
| `6` | `Unauthorized` | No description provided |
| `7` | `InsufficientSupply` | No description provided |
| `8` | `Paused` | No description provided |
| `9` | `Overflow` | No description provided |
| `10` | `InvalidFee` | No description provided |

### `CurveError` (`continuous_bonding_curve/src/lib.rs`)

| Code | Variant Name | Description |
| :---: | :--- | :--- |
| `200` | `AlreadyInitialized` | `200` — Contract has already been initialised. |
| `201` | `NotInitialized` | `201` — Contract has not been initialised. |
| `202` | `InvalidAmount` | `202` — Amount is invalid (zero or negative). |
| `203` | `SlippageExceeded` | `203` — Trade would exceed slippage tolerance. |
| `204` | `DeadlinePassed` | `204` — Transaction deadline has passed. |
| `205` | `Unauthorized` | `205` — Caller is not the admin. |
| `206` | `InsufficientSupply` | `206` — Token supply is insufficient for the requested sell. |
| `207` | `Paused` | `207` — Contract is paused. |
| `208` | `Overflow` | `208` — Fixed-point arithmetic overflow. |
| `209` | `InvalidFee` | `209` — Fee is outside the allowed range. |
| `210` | `Underflow` | `210` — Fixed-point arithmetic underflow. |
| `211` | `DivisionByZero` | `211` — Division by zero in fixed-point math. |
| `212` | `ContractPaused` | `212` — Contract is paused by the circuit-breaker (SC-HARD-19). |

### `ProxyError` (`course_proxy/src/lib.rs`)

| Code | Variant Name | Description |
| :---: | :--- | :--- |
| `1` | `AlreadyInitialized` | No description provided |
| `2` | `NotInitialized` | No description provided |
| `3` | `Unauthorized` | No description provided |
| `4` | `TimelockNotExpired` | No description provided |
| `5` | `ProposalNotFound` | No description provided |
| `6` | `ProposalExpired` | No description provided |

### `ClientError` (`cross_chain_client/src/lib.rs`)

| Code | Variant Name | Description |
| :---: | :--- | :--- |
| `1` | `AlreadyInitialized` | No description provided |
| `2` | `NotInitialized` | No description provided |
| `3` | `Unauthorized` | No description provided |
| `4` | `UnknownRelayer` | No description provided |
| `5` | `NonceReplayed` | No description provided |
| `6` | `InvalidSignature` | No description provided |
| `7` | `MessageNotFound` | No description provided |
| `8` | `UnknownValidator` | No description provided |
| `9` | `InvalidThreshold` | No description provided |
| `10` | `InvalidHeader` | No description provided |
| `11` | `InvalidProof` | No description provided |
| `12` | `ReplayDetected` | No description provided |
| `13` | `EmptyProof` | No description provided |

### `DaoError` (`dao_governance/src/errors.rs`)

| Code | Variant Name | Description |
| :---: | :--- | :--- |
| `401` | `AlreadyInitialized` | 401 — Contract has already been initialized. |
| `402` | `NotInitialized` | 402 — Contract has not been initialized. |
| `403` | `Unauthorized` | 403 — Caller is not authorized for governance operation. |
| `404` | `ProposalNotFound` | 404 — Proposal was not found with specified identifier. |
| `405` | `ProposalClosed` | 405 — Proposal is closed and not open for voting or execution. |
| `406` | `VotingDeadlineLive` | 406 — Voting deadline is still live; premature finalization rejected. |
| `407` | `AlreadyVoted` | 407 — Voter has already cast votes on this proposal. |
| `408` | `InsufficientCredits` | 408 — Insufficient voice credits available to cast the requested votes. |
| `409` | `ZeroVotes` | 409 — Number of votes must be strictly positive. |
| `410` | `InvalidDeadline` | 410 — Proposal deadline is invalid or not in the future. |

### `VaultError` (`fractional_nft_vault/src/lib.rs`)

| Code | Variant Name | Description |
| :---: | :--- | :--- |
| `1` | `AlreadyInitialized` | No description provided |
| `2` | `NotInitialized` | No description provided |
| `3` | `Unauthorized` | No description provided |
| `4` | `InvalidAmount` | No description provided |
| `5` | `AuctionMissing` | No description provided |
| `6` | `AuctionActive` | No description provided |
| `7` | `BidTooLow` | No description provided |
| `8` | `NoBids` | No description provided |
| `9` | `AlreadyFinalized` | No description provided |
| `10` | `AlreadyClaimed` | No description provided |
| `11` | `NoShares` | No description provided |
| `12` | `ShareMismatch` | No description provided |
| `13` | `NftNotLocked` | No description provided |
| `14` | `RoyaltyTooHigh` | No description provided |
| `15` | `SoulboundNonTransferable` | No description provided |
| `16` | `AlreadyCommitted` | No description provided |
| `17` | `InvalidCommitment` | No description provided |

### `FreelanceError` (`freelance-platform/src/lib.rs`)

| Code | Variant Name | Description |
| :---: | :--- | :--- |
| `1` | `NotInitialized` | No description provided |
| `2` | `AlreadyInitialized` | No description provided |
| `3` | `Unauthorized` | No description provided |
| `4` | `JobNotFound` | No description provided |
| `5` | `InvalidMilestone` | No description provided |
| `6` | `MilestoneAlreadyApproved` | No description provided |
| `7` | `MilestoneNotCompleted` | No description provided |
| `8` | `NotWorker` | No description provided |
| `9` | `NotFreelancer` | No description provided |
| `10` | `NotDisputed` | No description provided |
| `11` | `BudgetMismatch` | No description provided |
| `12` | `AlreadyAssigned` | No description provided |
| `13` | `NotApplied` | No description provided |

### `FreelanceRepError` (`freelance-platform/src/reputation_system.rs`)

| Code | Variant Name | Description |
| :---: | :--- | :--- |
| `520` | `InvalidRating` | `520` — Rating value is out of the 1–5 range. |

### `MatchingError` (`hackathon-team-matching/src/lib.rs`)

| Code | Variant Name | Description |
| :---: | :--- | :--- |
| `1` | `NotInitialized` | No description provided |
| `2` | `AlreadyInitialized` | No description provided |
| `3` | `Unauthorized` | No description provided |
| `4` | `DeveloperNotFound` | No description provided |
| `5` | `TeamNotFound` | No description provided |
| `6` | `AlreadyInTeam` | No description provided |
| `7` | `TeamFull` | No description provided |
| `8` | `TeamClosed` | No description provided |
| `9` | `NoActiveRequest` | No description provided |
| `10` | `NoActiveInvitation` | No description provided |
| `11` | `InvalidSkillVerificationContract` | No description provided |
| `12` | `AlreadyRegistered` | No description provided |

### `FpError` (`hello_world/src/freelance_platform.rs`)

| Code | Variant Name | Description |
| :---: | :--- | :--- |
| `510` | `AlreadyInitialized` | `510` — Contract has already been initialised. |
| `511` | `JobNotOpen` | `511` — Job is not open for applications. |
| `512` | `NotClient` | `512` — Only the job client can perform this action. |
| `513` | `NotFreelancer` | `513` — Only the assigned freelancer can perform this action. |
| `514` | `MilestoneNotCompleted` | `514` — Milestone has not been completed yet. |
| `515` | `JobNotFound` | `515` — Job was not found. |
| `516` | `MilestoneNotFound` | `516` — Milestone was not found. |

### `RepError` (`hello_world/src/reputation_system.rs`)

| Code | Variant Name | Description |
| :---: | :--- | :--- |
| `500` | `AlreadyInitialized` | `500` — Contract has already been initialised. |
| `501` | `InvalidRating` | `501` — Rating value is out of the 1–5 range. |

### `ImplError` (`implementation_v1/src/lib.rs`)

| Code | Variant Name | Description |
| :---: | :--- | :--- |
| `1` | `NotInitialized` | No description provided |
| `2` | `Unauthorized` | No description provided |
| `3` | `ScoreOverflow` | No description provided |

### `ImplError` (`implementation_v2/src/lib.rs`)

| Code | Variant Name | Description |
| :---: | :--- | :--- |
| `1` | `NotInitialized` | No description provided |
| `2` | `Unauthorized` | No description provided |
| `3` | `ScoreOverflow` | No description provided |

### `LPError` (`lending_pool/src/lib.rs`)

| Code | Variant Name | Description |
| :---: | :--- | :--- |
| `1` | `AlreadyInitialized` | `1` — Contract has already been initialised. |
| `2` | `NotInitialized` | `2` — Contract has not been initialised. |
| `3` | `Unauthorized` | `3` — Caller is not the admin. |
| `4` | `ZeroAmount` | `4` — Amount must be strictly positive. |
| `5` | `UnsupportedToken` | `5` — Token is not registered as an accepted asset. |
| `6` | `BelowMinCollRatio` | `6` — Position would fall below the minimum collateralisation ratio. |
| `7` | `InsufficientBal` | `7` — Insufficient balance for the requested operation. |
| `8` | `PositionHealthy` | `8` — Cannot liquidate a healthy position. |
| `9` | `OracleBadPrice` | `9` — Oracle returned a non-positive price. |
| `10` | `ReentrancyGuardTriggered` | `10` — A reentrant call was detected and blocked. |
| `11` | `Overflow` | `11` — Arithmetic overflow. |
| `12` | `Underflow` | `12` — Arithmetic underflow. |
| `13` | `DivisionByZero` | `13` — Division by zero. |
| `14` | `ContractPaused` | `14` — Contract is paused by the circuit breaker. |

### `Error` (`multisig_wallet_timelock/src/lib.rs`)

| Code | Variant Name | Description |
| :---: | :--- | :--- |
| `1` | `Reentrancy` | No description provided |

### `OracleError` (`oracle_aggregator/src/lib.rs`)

| Code | Variant Name | Description |
| :---: | :--- | :--- |
| `420` | `AlreadyInitialized` | `420` — Contract has already been initialised. |
| `421` | `Unauthorized` | `421` — Caller is not the admin. |
| `422` | `InvalidStake` | `422` — Stake must be a positive value. |
| `423` | `InvalidPrice` | `423` — Price must be a positive value. |
| `424` | `NotWhitelisted` | `424` — Reporter is not on the whitelist. |
| `425` | `NoFreshReports` | `425` — No fresh price reports are available. |
| `426` | `AllOutliers` | `426` — All submitted reports were flagged as outliers. |
| `427` | `PriceStale` | `427` — The latest aggregated price is stale. |
| `428` | `NotInitialized` | `428` — Contract has not been initialised. |

### `InsuranceError` (`parametric_insurance/src/lib.rs`)

| Code | Variant Name | Description |
| :---: | :--- | :--- |
| `1` | `AlreadyInitialized` | No description provided |
| `2` | `NotInitialized` | No description provided |
| `3` | `Unauthorized` | No description provided |
| `4` | `InvalidAmount` | No description provided |
| `5` | `Insolvent` | No description provided |
| `6` | `PolicyMissing` | No description provided |
| `7` | `TriggerNotMet` | No description provided |
| `8` | `Expired` | No description provided |
| `9` | `AlreadyClaimed` | No description provided |

### `Error` (`payment_gateway/src/lib.rs`)

| Code | Variant Name | Description |
| :---: | :--- | :--- |
| `1` | `Unauthorized` | No description provided |
| `2` | `Paused` | No description provided |
| `3` | `InvalidAmount` | No description provided |
| `4` | `InsufficientBalance` | No description provided |
| `5` | `InvalidPayee` | No description provided |
| `6` | `RecordNotFound` | No description provided |
| `7` | `RefundWindowClosed` | No description provided |
| `8` | `ArithmeticOverflow` | No description provided |
| `9` | `InvalidShares` | No description provided |
| `10` | `EscrowNotFound` | No description provided |
| `11` | `EscrowAlreadyDistributed` | No description provided |
| `12` | `DuplicateStakeholder` | No description provided |
| `13` | `EscrowAlreadyExists` | No description provided |

### `ReviewError` (`peer_review/src/lib.rs`)

| Code | Variant Name | Description |
| :---: | :--- | :--- |
| `1` | `AlreadyInitialized` | No description provided |
| `2` | `NotInitialized` | No description provided |
| `3` | `Unauthorized` | No description provided |
| `4` | `InvalidAmount` | No description provided |
| `5` | `SubmissionExists` | No description provided |
| `6` | `SubmissionMissing` | No description provided |
| `7` | `SubmissionFinalized` | No description provided |
| `8` | `CommitWindowClosed` | No description provided |
| `9` | `RevealWindowClosed` | No description provided |
| `10` | `AlreadyCommitted` | No description provided |
| `11` | `NotCommitted` | No description provided |
| `12` | `CommitmentMismatch` | No description provided |
| `13` | `NotStaked` | No description provided |
| `14` | `StakeLocked` | No description provided |
| `15` | `NoReviews` | No description provided |
| `16` | `InvalidConfig` | No description provided |

### `PrSimError` (`pr_simulation/src/lib.rs`)

| Code | Variant Name | Description |
| :---: | :--- | :--- |
| `1` | `AlreadyInitialised` | No description provided |
| `2` | `NotInitialised` | No description provided |
| `3` | `Unauthorised` | No description provided |
| `4` | `SimulationNotFound` | No description provided |
| `5` | `AlreadyFinalised` | No description provided |
| `6` | `EmptyTitle` | No description provided |
| `7` | `EmptyChanges` | No description provided |
| `8` | `InvalidWasm` | No description provided |

### `ProxyError` (`proxy/src/lib.rs`)

| Code | Variant Name | Description |
| :---: | :--- | :--- |
| `1` | `AlreadyInitialized` | No description provided |
| `2` | `NotInitialized` | No description provided |
| `3` | `Unauthorized` | No description provided |
| `4` | `InvalidAdmin` | No description provided |
| `5` | `UnregisteredWasm` | No description provided |
| `6` | `InvalidStorageVersion` | No description provided |
| `7` | `PendingAdminMismatch` | No description provided |
| `8` | `TimelockNotExpired` | No description provided |
| `9` | `ProposalNotFound` | No description provided |
| `10` | `AlreadyApproved` | No description provided |
| `11` | `InsufficientApprovals` | No description provided |
| `12` | `ProposalExpired` | No description provided |

### `QVError` (`quadratic_voting/src/lib.rs`)

| Code | Variant Name | Description |
| :---: | :--- | :--- |
| `440` | `AlreadyInitialized` | `440` — Contract has already been initialised. |
| `441` | `Unauthorized` | `441` — Caller is not the admin. |
| `442` | `ZeroVotes` | `442` — Must cast at least one vote. |
| `443` | `ProposalAlreadyExecuted` | `443` — Proposal has already been executed. |
| `444` | `InsufficientCredits` | `444` — Insufficient voting credits for this operation. |
| `445` | `NotSybilVerified` | `445` — User has not passed Sybil resistance verification. |
| `446` | `ProposalNotFound` | `446` — Proposal was not found. |

### `VaultError` (`smart_vault/src/lib.rs`)

| Code | Variant Name | Description |
| :---: | :--- | :--- |
| `100` | `ReentrancyGuardTriggered` | `100` — A reentrant call was detected and blocked. |
| `101` | `NotInitialized` | `101` — Contract has not been initialised. |
| `102` | `Unauthorized` | `102` — Caller is not authorised. |
| `103` | `NotFound` | `103` — Requested entity was not found. |
| `104` | `AlreadyApproved` | `104` — Signer has already approved this proposal. |
| `105` | `NotEnoughApprovals` | `105` — Insufficient approvals to proceed. |
| `106` | `TimelockActive` | `106` — Timelock is still active; cannot execute yet. |
| `107` | `AlreadyExecuted` | `107` — Proposal has already been executed. |
| `108` | `AlreadyCancelled` | `108` — Proposal has already been cancelled. |
| `109` | `VaultFrozen` | `109` — Vault is frozen; deposits and withdrawals are blocked. |
| `110` | `BelowMinCollateralRatio` | `110` — Collateral ratio falls below the minimum required. |
| `111` | `InsufficientCollateral` | `111` — Insufficient collateral for the requested operation. |
| `112` | `NoDebt` | `112` — No debt exists for this position. |
| `113` | `ZeroAmount` | `113` — Amount must be strictly positive. |
| `114` | `InsufficientShares` | `114` — Shares requested exceed balance. |
| `115` | `Overflow` | `115` — Arithmetic overflow. |
| `116` | `Underflow` | `116` — Arithmetic underflow. |
| `117` | `DivisionByZero` | `117` — Division by zero. |
| `118` | `ContractPaused` | `118` — Contract is paused by the circuit breaker. |
| `119` | `HarvestCooldownActive` | `119` — Harvest cooldown has not elapsed yet. |
| `120` | `InvalidThreshold` | `120` — Threshold must be positive. |
| `121` | `TimelockNotElapsed` | `121` — Timelock has not elapsed; proposal is not ready. |
| `122` | `InvariantViolated` | `122` — Reserve conservation invariant violated. |
| `123` | `WithdrawalLimitExceeded` | `123` — 24-hour withdrawal allowance has been exceeded. |

### `AuthError` (`src/errors.rs`)

| Code | Variant Name | Description |
| :---: | :--- | :--- |
| `100` | `Unauthorized` | 100: Caller is not authorized to perform this operation. |
| `101` | `NotAdmin` | 101: Caller is not the registered administrator. |
| `102` | `InvalidSignature` | 102: Cryptographic signature verification failed. |
| `103` | `SessionExpired` | 103: Authorization session or credential has expired. |
| `104` | `ContractPaused` | 104: Contract pause guard active; state-mutating operation blocked. |
| `105` | `ReentrancyGuard` | 105: Reentrancy guard triggered on nested invocation. |
| `106` | `SoulboundNonTransferable` | 106: Soulbound asset cannot be transferred or delegated. |

### `StorageError` (`src/errors.rs`)

| Code | Variant Name | Description |
| :---: | :--- | :--- |
| `200` | `AlreadyInitialized` | 200: Contract has already been initialized. |
| `201` | `NotInitialized` | 201: Contract has not been initialized. |
| `202` | `NotFound` | 202: Requested record or entity was not found in storage. |
| `203` | `AlreadyExists` | 203: Entity already exists in storage; duplicate creation rejected. |
| `204` | `Expired` | 204: Data state is expired or TTL has lapsed. |
| `205` | `VersionMismatch` | 205: Storage schema version mismatch or migration in progress. |
| `206` | `CapacityExceeded` | 206: Maximum capacity or collection size limit exceeded. |

### `ArithmeticError` (`src/errors.rs`)

| Code | Variant Name | Description |
| :---: | :--- | :--- |
| `300` | `Overflow` | 300: Numerical overflow occurred during checked arithmetic. |
| `301` | `Underflow` | 301: Numerical underflow occurred during checked arithmetic. |
| `302` | `DivisionByZero` | 302: Division or modulo by zero attempted. |
| `303` | `ZeroAmount` | 303: Amount must be strictly greater than zero. |
| `304` | `InsufficientBalance` | 304: Insufficient token or asset balance for operation. |
| `305` | `SlippageExceeded` | 305: Slippage tolerance exceeded; output below minimum expected. |
| `306` | `InvariantViolated` | 306: Invariant verification failed. |

### `GovernanceError` (`src/errors.rs`)

| Code | Variant Name | Description |
| :---: | :--- | :--- |
| `400` | `ProposalNotFound` | 400: Proposal not found with specified identifier. |
| `401` | `ProposalClosed` | 401: Proposal is closed and no longer accepting votes or actions. |
| `402` | `VotingDeadlineLive` | 402: Voting deadline is still live; early execution rejected. |
| `403` | `AlreadyVoted` | 403: Signer or voter has already cast their ballot. |
| `404` | `InsufficientCredits` | 404: Insufficient voice credits or voting power for allocation. |
| `405` | `ZeroVotes` | 405: Vote weight or credit amount must be greater than zero. |
| `406` | `InvalidDeadline` | 406: Proposal voting deadline is invalid or in the past. |
| `407` | `TimelockActive` | 407: Timelock delay period has not elapsed. |
| `408` | `NotEnoughApprovals` | 408: Insufficient guardian or quorum approvals. |

### `PasskeyWalletError` (`src/passkey_wallet.rs`)

| Code | Variant Name | Description |
| :---: | :--- | :--- |
| `1` | `AlreadyInitialized` | No description provided |
| `2` | `NotInitialized` | No description provided |
| `3` | `NotOwner` | No description provided |
| `4` | `InvalidSignature` | No description provided |
| `5` | `ChallengeExpired` | No description provided |
| `6` | `ChallengeMismatch` | No description provided |
| `7` | `OriginMismatch` | No description provided |
| `8` | `RPIDMismatch` | No description provided |
| `9` | `InvalidAuthenticatorData` | No description provided |
| `10` | `InvalidClientData` | No description provided |
| `11` | `CredentialAlreadyRegistered` | No description provided |
| `12` | `CredentialNotFound` | No description provided |
| `13` | `GuardianLimitReached` | No description provided |
| `14` | `GuardianNotMember` | No description provided |
| `15` | `GuardianAlreadyVoted` | No description provided |
| `16` | `GuardianAlreadyMember` | No description provided |
| `17` | `RecoveryNotInProgress` | No description provided |
| `18` | `RecoveryAlreadyInProgress` | No description provided |
| `19` | `InsufficientGuardianVotes` | No description provided |
| `20` | `InvalidThreshold` | No description provided |
| `21` | `WalletLocked` | No description provided |
| `22` | `AlreadyGuardian` | No description provided |
| `23` | `InvalidCredentialId` | No description provided |
| `24` | `SignatureVerificationFailed` | No description provided |
| `25` | `ReplayAttack` | No description provided |

### `SybilError` (`sybil_resistance/src/lib.rs`)

| Code | Variant Name | Description |
| :---: | :--- | :--- |
| `460` | `AlreadyInitialized` | `460` — Contract has already been initialised. |
| `461` | `Unauthorized` | `461` — Caller is not the admin. |
| `462` | `NotVerified` | `462` — The target user is not currently verified. |
| `463` | `NotInitialized` | `463` — Contract has not been initialised. |

### `Error` (`testnet_faucet_integration/src/lib.rs`)

| Code | Variant Name | Description |
| :---: | :--- | :--- |
| `1` | `AmountExceedsLimit` | No description provided |
| `2` | `RequestTooSoon` | No description provided |
| `3` | `ProjectNotFound` | No description provided |

### `MigError` (`token_migration/src/lib.rs`)

| Code | Variant Name | Description |
| :---: | :--- | :--- |
| `480` | `AlreadyInitialized` | `480` — Contract has already been initialised. |
| `481` | `MigrationPeriodEnded` | `481` — The migration period has ended. |
| `482` | `ZeroAmount` | `482` — Amount must be strictly positive. |
| `483` | `Overflow` | `483` — Arithmetic overflow in amount computation. |
| `484` | `DeadlineNotReached` | `484` — Cannot withdraw before the deadline has passed. |
| `485` | `Unauthorized` | `485` — Caller is not the admin. |
| `486` | `NotInitialized` | `486` — Contract has not been initialised. |

### `VerifierError` (`zk_proof_verifier/src/lib.rs`)

| Code | Variant Name | Description |
| :---: | :--- | :--- |
| `1` | `AlreadyInitialized` | No description provided |
| `2` | `NotInitialized` | No description provided |
| `3` | `InvalidProof` | The Groth16 pairing equation does not hold for the proof and public inputs. |
| `4` | `NullifierAlreadyUsed` | This nullifier has already been consumed; replay detected. |
| `5` | `Unauthorized` | Caller is not the verifier administrator. |
| `6` | `InvalidPublicInput` | Public input count or canonical BN254 scalar encoding is invalid. |
| `7` | `InvalidVerifyingKey` | Verifying-key point encoding or public-input arity is invalid. |
