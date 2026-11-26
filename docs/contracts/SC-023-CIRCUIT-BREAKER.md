# SC-023: Emergency Circuit Breaker and Withdrawal Limits

The SmartVault, AMM, and lending-pool contracts expose an immediate pause and a
rolling 24-hour outflow budget. Read-only queries and emergency control calls
remain available while paused.

## Shared breaker (SC-074)

The AMM and lending pool use the reusable two-tier breaker in
`contracts/access_control/src/circuit_breaker.rs`. State lives under its own
storage namespace, so host contracts do not need to share storage keys.

- **Pause (instant).** The configured guardian or the admin can call `pause()`.
  Anyone else reverts with `AcError::Unauthorized` (`300`).
- **Unpause (timelocked).** Only the admin can `propose_unpause()`, which
  returns an unlock timestamp 24 hours (`UNPAUSE_TIMELOCK_SECONDS`) in the
  future. `unpause()` before that timestamp reverts with
  `AcError::TimelockNotExpired` (`302`); without a proposal it reverts with
  `AcError::NoPendingUnpause` (`309`). A guardian can never unpause.
- **Re-pausing** clears any pending unpause, so a second incident cannot ride
  the original unlock schedule.
- **Guardian rotation** is admin-only. The admin is the initial guardian.
- Consuming contracts gate state-mutating entrypoints with
  `require_not_paused!()`; a second form takes the host contract's error so the
  ABI keeps its own error space (`AmmError::ContractPaused` `409`,
  `LPError::ContractPaused` `14`).
- Emergency-exit paths deliberately do **not** call the macro.

## SmartVault

The existing governance guardian set is authorized to pause immediately through
`emergency_freeze` or `set_paused`. Any configured guardian can trigger the
pause; `unfreeze`/`set_paused(false)` is also restricted to a configured
guardian. Governance must be initialized before these calls can be used.

Withdrawals are capped cumulatively at 10% of total vault assets measured at
the start of the first withdrawal in each 24-hour window. A rejected withdrawal
does not consume the allowance. `VaultError::WithdrawalLimitExceeded` (`123`)
reports an exceeded budget.

## AMM

The admin designates one guardian with `set_guardian`. That guardian or the
admin can `pause()` swaps and liquidity additions in one call. Resuming requires
the admin to `propose_unpause()` and wait out the 24-hour timelock before
`unpause()`. The admin is the initial guardian.

Liquidity removal stays available while paused so providers can exit during an
incident; it is still rate-limited by the outflow budget below.

Because the AMM has no shared price oracle, token A and token B outflows are
limited independently to 10% of each reserve at the start of the 24-hour
window. Swap output plus its fee counts against the relevant token's budget;
liquidity removals count against both budgets. `AmmError::WithdrawalLimitExceeded`
(`407`) identifies a rejected outflow.

## Lending pool

The admin designates a guardian with `set_guardian`; the guardian or admin can
`pause()` and only the admin can resume after the same 24-hour timelock.
Pausing blocks `deposit_collateral`, `borrow`, `withdraw_collateral`,
`liquidate`, `flash_loan`, and `stake`. Unstaking, reward claims, and
`emergency_withdraw` remain available.

`emergency_withdraw` lets a depositor recover collateral that does not back an
outstanding borrow in that token. If debt is still outstanding it reverts with
`LPError::DebtOutstanding` (`15`), so a paused pool cannot be drained by
underwater positions.

All three contracts publish pause-state events and expose an `is_paused` (or
`paused`) view.
