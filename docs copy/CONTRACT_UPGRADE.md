# Contract Upgradeability – Risks & Security Considerations

## How It Works

The `upgrade(caller, new_wasm_hash)` function replaces the contract's executable WASM using
Soroban's built-in `update_current_contract_wasm`. Instance storage (certificates, nonces, admin
key) is **preserved** across upgrades — only the code changes.

## Security Considerations

| Risk                  | Mitigation                                                                                                                        |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Admin key compromise  | Attacker can deploy arbitrary code. Use a multisig or hardware wallet for the admin address in production.                        |
| Unaudited WASM        | New code is not validated on-chain. Always audit and test the new WASM before uploading its hash.                                 |
| No timelock           | Upgrades take effect immediately. Consider a timelock contract that delays execution to give users time to exit.                  |
| State incompatibility | If the new contract reads storage keys differently, existing data may be misread. Plan and test state migration before upgrading. |
| Irreversibility       | Once upgraded, the old code is gone. Keep the old WASM hash and a rollback plan ready.                                            |

## Upgrade Checklist

1. Audit the new contract code.
2. Upload the new WASM to the network (`soroban contract upload`).
3. Record the returned WASM hash.
4. Call `upgrade(admin, new_wasm_hash)` from the admin address.
5. Verify contract behaviour with integration tests against the live contract.
6. Update any off-chain clients that depend on the contract interface.
