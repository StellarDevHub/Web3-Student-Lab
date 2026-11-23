# Token Gated Access Control

This contract implements a Soroban-based token gating system for community education resources.
It uses a membership NFT contract with tiered access and optional temporary grants to control access to gated content.

## Overview

The token gated contract supports:
- tier-based resource access (`Bronze`, `Silver`, `Gold`)
- temporary access grants for non-members or lower tiers
- paused resources for admin maintenance or moderation
- per-tier benefit accrual that members claim into an internal balance
- transparent view functions for frontend integration

## How it works

1. An admin initializes the contract with a membership NFT contract address and an epoch cadence.
2. Admins configure named resources with a minimum tier rank and paused state.
3. The contract checks membership ownership and tier rank to allow or deny access.
4. Temporary grants can override tier requirements for a limited time.
5. Members accrue benefits per epoch and can claim them into an internal balance.

## Entry Points

### `init(admin, membership, epoch_seconds)`
One-time setup.
- `admin`: authorized address for governance operations.
- `membership`: the deployed membership NFT contract address.
- `epoch_seconds`: epoch length for benefit accrual.

### `configure_resource(admin, name, min_tier_rank, paused)`
Create or update a resource.
- `name`: resource identifier.
- `min_tier_rank`: minimum tier required (1=Bronze, 2=Silver, 3=Gold).
- `paused`: whether access is temporarily disabled.

### `set_benefit_rate(admin, tier, rate_per_epoch)`
Configure benefit accrual rate for a membership tier.

### `grant_temp_access(admin, addr, resource, until_ts)`
Issue a time-limited access grant.

### `revoke_temp_access(admin, addr, resource)`
Remove an existing temporary grant.

### `check_access(addr, resource) -> AccessDecision`
View-only permission check.
Returns whether `addr` may access `resource` and why.

### `claim_benefits(addr) -> i128`
Claim accrued benefits into the caller's balance.

### `pending_benefits(addr) -> i128`
View unclaimed benefits based on current epoch.

### `balance_of(addr) -> i128`
View current claimed benefit balance.

## Data types

- `ResourceConfig` stores access requirements and paused state.
- `TempGrant` stores a temporary access grant with expiration.
- `AccessDecision` returns `allowed` and `reason`.
- `AccessReason` enumerates `Denied`, `Tier`, `TempGrant`, and `Paused`.

## Security and educational notes

- Admin operations require auth and admin verification.
- Resources are paused at the contract level, preventing all access while paused.
- Temporary grants are stored per `(address, resource)` and expire automatically.
- Benefit accrual is pull-based; members must `claim_benefits` to settle rewards.
- The contract depends on the membership NFT contract for tier lookup.

## File locations

| File | Purpose |
|---|---|
| `contracts/src/token_gated_access.rs` | Contract implementation |
| `contracts/src/token_gated_access.rs` | Unit tests are included in the same file |

## Running tests

```bash
cd contracts
cargo test token_gated_access -- --nocapture
```
