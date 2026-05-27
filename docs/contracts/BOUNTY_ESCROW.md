# Decentralized Bounty & Hackathon Escrow

Instructors post token bounties for coding challenges. Multiple funders pool
rewards into a single escrow. A trusted oracle verifies off-chain completion
(e.g. a GitHub PR merge). Disputed submissions are resolved by a registered
arbiter set using M-of-N voting.

## Lifecycle

```
create_bounty ──► fund_bounty (any funder, multiple times)
                      │
                      ▼
              submit_work (solver)
                      │
             ┌────────┴────────┐
             │                 │
        oracle_verify      dispute (funder / creator)
             │                 │
        [approved]      arbiter_vote × threshold
             │                 │
        release_reward   [approved]   [rejected]
             │                 │           │
          Solver ◄─────────────┘     refund_funders
```

A bounty that remains `Open` past its deadline can be reclaimed by funders
via `reclaim_expired`.

## Entry Points

### `initialize(admin, oracle, arbiters, arbiter_threshold)`
One-time setup. Registers the admin, oracle address, arbiter set, and default
dispute threshold.

### `create_bounty(creator, token, deadline, arbiter_threshold) → u32`
Creates a new bounty with status `Open`. Returns the auto-incremented ID.
Panics if `deadline` is in the past.

### `fund_bounty(funder, id, amount)`
Transfers `amount` tokens from `funder` into escrow and records the
contribution. Multiple funders may call this; contributions accumulate.
Only valid while status is `Open` and before the deadline.

### `submit_work(solver, id)`
Solver signals completion. Transitions `Open → UnderReview`.

### `oracle_verify(oracle, id, approved)`
Called by the registered oracle only (oracle manipulation guard).
- `approved = true` → pays full reward pool to solver (`Completed`).
- `approved = false` → refunds each funder their contribution (`Refunded`).

### `dispute(caller, id)`
Creator or any funder raises a dispute. Transitions `UnderReview → Disputed`.

### `arbiter_vote(arbiter, id, approve)`
Registered arbiter casts a vote. Each arbiter may vote once per bounty.
Once `votes_for` or `votes_against` reaches `arbiter_threshold`, the bounty
is resolved automatically (pay solver or refund funders).

### `reclaim_expired(funder, id)`
Funder reclaims their contribution from an `Open` bounty after the deadline.

### View functions
- `get_bounty(id) → Bounty`
- `contribution_of(id, funder) → i128`

## Security Properties

| Threat | Mitigation |
|---|---|
| Reentrancy | `nonreentrant_acquire/release` wraps every token-moving function |
| Integer overflow | `safe_add` / `safe_sub` from `security_primitives` |
| Oracle manipulation | Only the registered oracle address may call `oracle_verify`; result is boolean (no numeric price surface) |
| Rogue oracle call | `oracle != registered` check before any state change |
| Duplicate arbiter vote | `ArbiterVoted(id, arbiter)` flag checked before recording vote |
| Non-participant dispute | Caller must be creator or have a non-zero contribution |
| Stale state transitions | `BountyStatus` enum enforced at every entry point |
| Replay across bounties | Each bounty has a unique auto-incremented ID |

## File Locations

| File | Purpose |
|---|---|
| `contracts/src/bounty_escrow.rs` | Contract implementation |
| `contracts/src/bounty_escrow_tests.rs` | 26 unit/integration tests |
| `docs/contracts/BOUNTY_ESCROW.md` | This document |

## Running Tests

```bash
cd contracts
cargo test bounty_escrow
```
