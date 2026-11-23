# SC-023: Emergency Circuit Breaker and Withdrawal Limits

The SmartVault and AMM contracts each expose an immediate pause and a rolling
24-hour outflow budget. A pause blocks deposits, withdrawals, swaps, liquidity
changes, and other user-facing payout or asset mutations. Read-only queries and
guardian/admin control calls remain available while paused.

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
admin can pause swaps and liquidity changes in one call. Only the admin can
unpause. The admin is the initial guardian.

Because the AMM has no shared price oracle, token A and token B outflows are
limited independently to 10% of each reserve at the start of the 24-hour
window. Swap output plus its fee counts against the relevant token's budget;
liquidity removals count against both budgets. `AmmError::WithdrawalLimitExceeded`
(`407`) identifies a rejected outflow.

Both contracts publish pause-state events and expose an `is_paused` view.
