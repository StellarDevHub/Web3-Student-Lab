# Soroban Upgradeable Contracts Architecture

This document describes the design, execution flow, and runbook for upgrading smart contracts in the Web3 Student Lab platform.

## Architecture Overview

**Chosen Approach: Option B — UUPS (Universal Upgradeable Proxy Standard)**

Unlike the Ethereum Virtual Machine (EVM) which uses a `delegatecall` opcode to execute external logic within the proxy's storage context, the Soroban runtime does not support delegate calls. If Contract A forwards a call to Contract B, the execution is strictly bound to Contract B's storage space. 

Therefore, a "Transparent Proxy" pattern (Option A) that holds state while executing logic from another address is technically impossible to achieve without complex, gas-heavy state serialization across boundaries.

Instead, Soroban natively supports **WASM Replacement** via `env.deployer().update_current_contract_wasm(new_wasm_hash)`. This perfectly matches the UUPS pattern:
- **The Contract Address** remains identical.
- **The Persistent Storage** remains perfectly intact.
- **The Executing Logic** (the WASM binary) is swapped out.

```text
+-------------------+
|  Contract State   | <------- (Storage persists across upgrades)
+-------------------+
| Proxy/UUPS Admin  | <------- (Validates upgradeTo calls)
+-------------------+
|                   |
|  Current Logic    | =======> `update_current_contract_wasm(v2_hash)`
|  (v1.wasm)        |          Replaces the logic layer entirely
+-------------------+
```

## Storage Collision Prevention

In Ethereum, developers must use unstructured storage slots (e.g., EIP-1967) to prevent implementation variables from overwriting proxy admin slots.

In Soroban, storage keys are strictly typed and hashed using XDR representation. We prevent collisions by separating keys into distinct `enum` namespaces:

```rust
pub enum ProxyDataKey {
    Admin,
    ImplementationWasm,
}

pub enum ImplDataKey {
    Score(Address),
}
```

Because XDR serialization prefixes the enum variant name, `ImplDataKey::Score` will *never* collide mathematically with `ProxyDataKey::Admin`, even if they map to the same binary indices under the hood.

## Security Assumptions & Known Limitations

1. **Self-Destructive Upgrades**: Because UUPS dictates that the upgrade logic lives inside the implementation itself, deploying a V2 implementation that *forgets* to include the `upgrade_to` function will permanently lock the contract, destroying future upgradeability.
2. **Reentrancy**: Soroban prevents cross-contract reentrancy natively. However, to guard against potential future runtime modifications or complex token callback loops, ensure all token transfers happen strictly at the end of the execution block (Checks-Effects-Interactions pattern).
3. **Integer Overflows**: Rust does not panic on overflow in release mode. All user-influenced arithmetic in our contracts strictly utilizes `.saturating_add()` or `.checked_mul()` to gracefully truncate bounds without panicking the node.

## Upgrade Runbook

### Step 1: Write and Compile V2
Write `implementation_v2/src/lib.rs`. Ensure it includes the base UUPS Admin trait/logic. Compile to WASM.

```bash
cargo build --target wasm32-unknown-unknown --release
```

### Step 2: Upload WASM
Install the V2 WASM binary to the ledger without deploying it. This returns a `WASM_HASH`.

```bash
soroban contract install --wasm target/wasm32-unknown-unknown/release/implementation_v2.wasm --source <admin_identity> --network testnet
```

### Step 3: Trigger the Upgrade
Invoke the `upgrade_to` function on your *existing* contract address, passing the new `WASM_HASH`.

```bash
soroban contract invoke \
  --id <existing_contract_id> \
  --source <admin_identity> \
  --network testnet \
  -- \
  upgrade_to \
  --caller <admin_public_key> \
  --new_implementation <WASM_HASH>
```

### Step 4: Verify
Call a new function introduced in V2 (e.g., `set_name`) to confirm the new logic is active against the old state!

## Key Rotation Procedure
If the Admin key needs to be rotated (e.g., migrating from a single key to a multisig):
1. The current Admin calls `transfer_admin(new_admin_address)`.
2. The old Admin loses all upgrade capabilities instantly.
3. The new Admin assumes control over the `upgrade_to` pipeline.
