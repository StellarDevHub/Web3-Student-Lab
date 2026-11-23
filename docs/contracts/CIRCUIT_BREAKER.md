# Smart Contract Pause and Emergency Circuit Breaker

A global pausable state machine for the Web3 Student Lab protocol. Any module
can import `assert_not_paused` to apply a `whenNotPaused` guard to its
state-mutating functions. Resuming normal operation requires M-of-N multi-sig
approval from a pre-registered guardian set.

## State Machine

```
 Active ──pause(admin)──────────────────────────────► Paused
 Paused ──approve_unpause(guardian) × M──────────────► Paused (collecting sigs)
 Paused ──execute_unpause() [M sigs reached]─────────► Active
```

A new `pause` call increments the nonce and clears all collected approvals,
preventing stale signatures from being replayed across incidents.

## Applying the Guard to Other Modules

```rust
use crate::circuit_breaker::assert_not_paused;

pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
    assert_not_paused(&env);   // ← whenNotPaused
    // ... rest of logic
}
```

## Entry Points

### `initialize(admins, guardians, threshold)`
One-time setup. Registers the admin set, guardian set, and M-of-N threshold.
Panics if called twice, if `threshold == 0`, or if `threshold > len(guardians)`.

### `pause(caller)`
Instantly pauses the protocol. `caller` must be a registered admin.
Increments the nonce and clears any in-progress unpause approvals.

### `approve_unpause(guardian)`
A registered guardian submits their approval for the current unpause round.
Panics if the contract is not paused, if the caller is not a guardian, or if
the guardian has already approved this round.

### `execute_unpause()`
Unpauses the protocol once the approval count reaches the threshold.
Anyone may call this; security comes from the guardian signatures.
Panics if not paused or if approvals are insufficient.

### `add_admin(caller, new_admin)` / `add_guardian(caller, new_guardian)`
Admin-only. Extends the admin or guardian set.

### `set_threshold(caller, threshold)`
Admin-only. Updates the M-of-N requirement. Panics if the new threshold
exceeds the current guardian count.

### View functions
- `is_paused() → bool`
- `nonce() → u32`
- `approval_count() → u32`

## Security Properties

| Threat | Mitigation |
|---|---|
| Single compromised admin key re-enables vulnerable contract | Unpause requires M-of-N guardian approvals |
| Replay of stale approvals across incidents | Nonce increments on every `pause`; approvals keyed by nonce |
| Non-admin triggering pause | `assert_admin` check + `require_auth()` |
| Non-guardian submitting approval | `assert_guardian` check + `require_auth()` |
| Guardian voting twice | Duplicate check before appending to approval list |
| Bypassing the guard | `assert_not_paused` reads from the same instance storage; no bypass path |

## File Locations

| File | Purpose |
|---|---|
| `contracts/src/circuit_breaker.rs` | Contract + `assert_not_paused` free function |
| `contracts/src/circuit_breaker_tests.rs` | 22 unit/integration tests |
| `docs/contracts/CIRCUIT_BREAKER.md` | This document |

## Running Tests

```bash
cd contracts
cargo test circuit_breaker
```
