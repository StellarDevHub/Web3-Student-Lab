//! # Reentrancy Audit Report for Soroban Contracts
//!
//! Generated: 2026-07-27
//! Audit scope: All workspace member contracts in `contracts/`
//! Severity classifications follow [SWC Registry](https://swcregistry.io/).
//!
//! ## Executive Summary
//!
//! This report records reentrancy protections for the audited Soroban contract
//! entry points that perform cross-contract calls, including token callbacks.
//!
//! **Result:** the audited external-call paths in `lending_pool`, `smart_vault`,
//! and `amm` are guarded. The guard rejects reentry across public entry points.
//!
//! Re-factoring (2026-08): reentrancy guards were hardened with a dedicated
//! `ReentrancyGuardActive` contract error on both `lending_pool` and
//! `smart_vault`, the reentrancy lock was extended to `smart_vault::harvest`
//! and `smart_vault::compound`, and `smart_vault` gained a post-condition
//! state invariant asserting conservation of total deposited assets
//! (`TOTAL_ASSETS == RESERVES`) on vault accounting entry points. SC-024 adds
//! a shared temporary-storage guard module, protects the vault's airdrop token
//! transfers, guards AMM token interactions, and validates reserve accounting
//! after each liquidity or swap operation.
//!
//! ## Contracts Audited
//!
//! | Contract | Cross-Contract Calls | Reentrancy Guard | Status |
//! |---|---|---|---|
//! | `lending_pool` | ✅ (oracle price feed) | ✅ (LOCK mutex) | Protected |
//! | `payment_streaming` | ❌ None | ✅ (LOCK mutex) | Protected |
//! | `smart_vault` | ✅ (airdrop token transfers) | ✅ (temporary-storage lock) | Protected |
//! | `amm` | ✅ (token transfers and pool-share mint/burn) | ✅ (temporary-storage lock) | Protected |
//! | `multisig_wallet_timelock` | ❌ None | ✅ (LOCK mutex) | Protected |
//! | `payment_gateway` | ❌ None | N/A | No risk |
//! | `commit_reveal_rng` | ❌ None | N/A | No risk |
//! | `quadratic_funding` | ❌ None | N/A | No risk |
//! | `course_proxy` (upgradeable) | ❌ None | N/A | No risk |
//! | `auth_checker` | ❌ None | N/A | No risk |
//! | `cross_chain_client` | ❌ None | N/A | No risk |
//! | `freelance-platform` | ❌ None | N/A | No risk |
//! | `pr_simulation` | ❌ None | N/A | No risk |
//! | `hackathon-team-matching` | ❌ None | N/A | No risk |
//! | `content_management_system` | ❌ None | N/A | No risk |
//! | `testnet_faucet_integration` | ❌ None | N/A | No risk |
//! | `automated_testing_suite` | ❌ None | N/A | No risk |
//! | `cicd_pipeline` | ❌ None | N/A | No risk |
//!
//! ## Detailed Findings
//!
//! ### Finding #1: lending_pool — External Oracle Call After State Mutation (INFORMATIONAL)
//!
//! **Severity:** Informational
//! **File:** `contracts/lending_pool/src/lib.rs`
//! **Function:** `borrow()`, `withdraw_collateral()`, `liquidate()`
//!
//! **Description:**
//! The `LendingPool` contract calls `env.invoke_contract()` on the oracle
//! contract to fetch asset prices via the internal `price()` function. This
//! external call is made during `borrow()`, `withdraw_collateral()`, and
//! `liquidate()` which modify persistent storage state.
//!
//! In `borrow()`, the sequence is:
//! 1. Lock acquired ✅
//! 2. Interest accrued (state mutation)
//! 3. Debt updated (state mutation)
//! 4. Health check via `assert_healthy()` → `price()` → `env.invoke_contract()`
//! 5. Token transfer
//! 6. Lock released
//!
//! Technically, the external call (step 4) occurs after state mutations
//! (steps 2-3), which would normally be a checks-effects-interactions
//! violation. However, the reentrancy lock acquired in step 1 prevents
//! any reentrant call from succeeding — the lock is still held during
//! the external call, and a reentrant attempt would hit the `panic_with_error!`
//! on re-entry.
//!
//! **Mitigation:**
//! The existing `LOCK` / `unlock` mutex pattern (lines 493-505) provides
//! effective reentrancy protection. The external call to the oracle is
//! sandboxed within a locked region, and any attempt to re-enter would
//! be rejected with `LPError::ReentrancyGuardActive`.
//!
//! **Recommendation:**
//! While the current protection is adequate, the ideal pattern would be to
//! move the health check (and thus the external oracle call) before the
//! debt state update. This is a defense-in-depth recommendation only.
//!
//! ### Finding #2: lending_pool — Reentrancy Guard Implementation (CONFIRMED SAFE)
//!
//! **Severity:** None (confirmed safe)
//! **File:** `contracts/lending_pool/src/lib.rs`
//!
//! The reentrancy guard is implemented using a boolean flag stored in
//! instance storage:
//!
//! ```rust
//! fn lock(env: &Env) {
//!     let locked: bool = env.storage().instance().get(&LOCK).unwrap_or(false);
//!     if locked {
//!         panic_with_error!(env, LPError::ReentrancyGuardActive);
//!     }
//!     env.storage().instance().set(&LOCK, &true);
//! }
//! ```
//!
//! This pattern is effective in Soroban's single-threaded execution model
//! because:
//! - Soroban executes contracts atomically within a single host thread
//! - Cross-contract calls happen synchronously within the same execution context
//! - A reentrant call would see the LOCK flag still set to `true`
//!
//! ### Finding #3: smart_vault and AMM — Token Callback Reentry (MITIGATED)
//!
//! **Severity:** None after mitigation
//!
//! `smart_vault::claim_airdrop` and `clawback_airdrop` make token transfers
//! through `MerkleDistributor`. They now acquire the shared temporary-storage
//! guard before invoking the distributor and release it after the transfer.
//! A token callback attempting any guarded vault operation is rejected.
//!
//! The AMM's add/remove-liquidity and swap entry points call token contracts
//! (including pool-share mint/burn). Each holds a temporary-storage guard
//! throughout those calls, then checks that nonnegative accounted balances do
//! not exceed their corresponding reserves before returning.
//!
//! Regression tests use a callback token that attempts to call back into the
//! AMM during `add_liquidity`; the outer operation reverts when the nested
//! swap encounters the active guard. A separate test confirms that inconsistent
//! balance/reserve state fails the invariant check.
//!
//! ## Methodology
//!
//! 1. **Static Analysis:** Grep-ed all contracts for `env.invoke_contract()` usage
//! 2. **Control Flow Analysis:** Traced the call graph from every public function
//! 3. **Pattern Matching:** Compared against known reentrancy patterns:
//!    - Cross-function reentrancy (attacker calls a different function)
//!    - Single-function reentrancy (attacker calls the same function recursively)
//!    - Cross-contract reentrancy (attacker's contract re-enters during callback)
//! 4. **Soroban-Specific Considerations:** Verified understanding of Soroban's
//!    single-threaded, synchronous execution model
//!
//! ## Fuzz Testing
//!
//! Tests in `contracts/lending_pool/src/lib.rs` and
//! `contracts/amm/src/test.rs` verify that reentrant call patterns do not
//! corrupt contract state. These tests:
//! - Attempt to call `deposit_collateral()` from within a mock oracle callback
//! - Attempt an AMM swap from a token transfer callback during liquidity addition
//! - Verify that the reentrancy guard correctly rejects the attempt
//! - Confirm that state remains consistent after the rejection
//!
//! ## Conclusion
//!
//! The audited external-call paths in `lending_pool`, `smart_vault`, and `amm`
//! are guarded and covered by targeted reentrancy tests. AMM liquidity and swap
//! operations also validate internal balance/reserve invariants after external
//! calls. Contracts without external-call paths listed above retain their
//! existing protections as defense in depth.
//!
//! See the findings above for the covered entry points and limitations.
//!
//! ## Signatures
//!
//! - **Auditor:** sandrawillow001-afk
//! - **Review Date:** 2026-07-27
//! - **Scope:** Commit on `main` branch
