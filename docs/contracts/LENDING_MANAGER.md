# Decentralized Lending and Collateral Manager

A compound-style lending protocol implemented as a Soroban smart contract on Stellar.

## Overview

Users deposit collateral tokens to borrow other assets. The protocol enforces a minimum
collateralization ratio at all times. Undercollateralized positions can be liquidated by
any third party, who receives a bonus on the seized collateral as an incentive.

## Architecture

```
User
 ├─► deposit_collateral(token, amount)   → records collateral balance
 ├─► borrow(token, amount)               → checks ratio, records debt
 ├─► repay(token, amount)                → reduces debt + accrued interest
 ├─► withdraw_collateral(token, amount)  → checks ratio post-withdrawal
 └─► liquidate(borrower, debt_token, collateral_token, repay_amount)
                                         → repays debt, seizes collateral + bonus
```

## Key Parameters

| Parameter | Description | Example |
|---|---|---|
| `min_coll_ratio` | Minimum collateralization ratio (BPS) | `15000` = 150 % |
| `collateral_factor` | Max LTV per token (BPS) | `7500` = 75 % |
| `borrow_rate_bps` | Annual interest rate (BPS) | `500` = 5 % APR |
| `liq_bonus` | Liquidation bonus (BPS) | `500` = 5 % |

## Interest Accrual

Interest accrues continuously using a first-order Taylor approximation of compound interest:

```
delta_index = old_index × annual_rate_bps × elapsed_seconds / (BPS × SECONDS_PER_YEAR)
new_index   = old_index + delta_index
```

A user's outstanding debt is computed lazily on each interaction:

```
accrued_debt = principal × global_index / user_index_at_last_interaction
```

## Liquidation

A position becomes liquidatable when:

```
collateral_value × collateral_factor / BPS < debt_value × min_coll_ratio / BPS
```

The liquidator repays `repay_amount` of `debt_token` and receives:

```
seize_amount = repay_amount × debt_price / coll_price × (BPS + liq_bonus) / BPS
```

## Security Properties

| Threat | Mitigation |
|---|---|
| Reentrancy | Explicit mutex via `nonreentrant_acquire` / `nonreentrant_release` from `security_primitives` |
| Integer overflow/underflow | All arithmetic uses `safe_add`, `safe_sub`, `safe_mul` (panic on overflow) |
| Oracle manipulation | Price fetched fresh per call; zero/negative price rejected; staleness enforced by oracle aggregator |
| Unauthorized admin actions | `require_auth()` on stored admin address |
| Liquidating healthy positions | `is_healthy()` check before any collateral seizure |

## Entry Points

### `initialize(admin, oracle, min_coll_ratio, liq_bonus)`
One-time setup. Stores admin, oracle address, and global risk parameters.

### `add_asset(token, collateral_factor, borrow_rate_bps)`
Admin-only. Registers a token as a supported collateral/borrow asset.

### `deposit_collateral(user, token, amount)`
Transfers `amount` of `token` from `user` to the contract and records the balance.

### `borrow(user, token, amount)`
Accrues interest, records new debt, verifies the position remains healthy, then
transfers `amount` of `token` to `user`.

### `repay(user, token, amount)`
Accrues interest, transfers tokens from `user` to the contract, reduces debt.
Caps repayment at outstanding debt to prevent over-repayment.

### `withdraw_collateral(user, token, amount)`
Reduces collateral balance and verifies the position is still healthy before
transferring tokens back to `user`.

### `liquidate(liquidator, borrower, debt_token, collateral_token, repay_amount)`
Verifies the position is unhealthy, computes the seize amount with bonus,
transfers `repay_amount` from `liquidator` to the contract, and transfers
`seize_amount` of `collateral_token` to `liquidator`.

### View functions
- `collateral_of(user, token) → i128`
- `debt_of(user, token) → i128`
- `health_check(user) → bool`

## File Locations

| File | Purpose |
|---|---|
| `contracts/src/lending.rs` | Contract implementation |
| `contracts/src/lending_tests.rs` | Unit and integration tests |
| `docs/contracts/LENDING_MANAGER.md` | This document |

## Running Tests

```bash
cd contracts
cargo test lending 2>&1
```
