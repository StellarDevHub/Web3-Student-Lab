# Soulbound Certificate Token Architecture

> Issue #1177 — Enforce Soulbound (Non-Transferable) Token Invariants on Certificate Contract

## Overview

Academic certificates issued by Web3 Student Lab are **soulbound tokens** —
NFTs permanently bound to the student's wallet address at the moment of issuance.
They cannot be sold, transferred, or moved to any other wallet except through
the designated revocation workflow.

The implementation lives in `contracts/certificate_nft/`.

---

## Why Soulbound?

Academic credentials derive their value from authentic attribution. A certificate
that can be sold or traded on a marketplace provides no assurance about who
actually completed the course. Soulbound tokens make credentials:

- **Tamper-proof** — metadata is pinned to IPFS with a cryptographic CID.
- **Non-marketable** — attempted transfers revert deterministically, on-chain.
- **Auditable** — every mint and revocation emits an on-chain event.

---

## Non-Transferability Design

### `transfer` and `transfer_from` — Unconditional Panic

Both entry points exist to satisfy interface completeness (so callers get a
clear error rather than a missing-function trap), but they unconditionally
panic with:

```
soulbound: certificate tokens are non-transferable
```

This applies to **all** destinations, including the burn address.  There is no
bypass — not even the issuer can invoke `transfer` to move a token.

### Revocation Pathway

The **only** way to remove a certificate from a student's wallet is via the
`revoke(token_id)` function, callable exclusively by the registered `issuer`.

On revocation the contract:

1. Sets `CertificateRecord.revoked = true` in persistent storage.
2. Moves ownership to the configured `burn_address`.
3. Removes the token from the former owner's token list.
4. Decrements `total_supply`.
5. Emits a `revoke` event.

The burn address should be a well-known, uncontrolled address
(e.g. `GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN` on Stellar testnet).

---

## Contract Interface

| Function | Auth required | Description |
|----------|--------------|-------------|
| `initialize(issuer, burn_address)` | — | One-time setup after deployment. |
| `mint(recipient, metadata_uri, issuer_did)` | Issuer | Mint a soulbound certificate. |
| `transfer(from, to, token_id)` | — | **Always panics.** Non-transferable invariant. |
| `transfer_from(spender, from, to, token_id)` | — | **Always panics.** Non-transferable invariant. |
| `revoke(token_id)` | Issuer | Approved revocation — moves ownership to burn address. |
| `owner_of(token_id)` | Public | Returns current owner. |
| `get_metadata(token_id)` | Public | Returns `CertificateRecord`. |
| `tokens_of(owner)` | Public | Returns all token IDs held by an address. |
| `total_supply()` | Public | Returns count of active (non-revoked) tokens. |
| `is_revoked(token_id)` | Public | Returns revocation flag. |
| `issuer()` | Public | Returns the registered issuer address. |

---

## `CertificateRecord` Structure

```rust
pub struct CertificateRecord {
    pub metadata_uri: String,  // IPFS CID or HTTPS URI
    pub issued_at:    u64,     // ledger timestamp (Unix seconds)
    pub issuer_did:   String,  // did:stellar:G…
    pub recipient:    Address, // student wallet
    pub revoked:      bool,    // true after revoke()
}
```

---

## Storage Layout

| Key | Type | Description |
|-----|------|-------------|
| `Issuer` | `Address` | Instance — issuer address |
| `BurnAddress` | `Address` | Instance — burn destination |
| `TokenCounter` | `u64` | Instance — monotonic token counter |
| `TotalSupply` | `u64` | Instance — active token count |
| `Owner(token_id)` | `Address` | Persistent — per-token owner |
| `Metadata(token_id)` | `CertificateRecord` | Persistent — per-token metadata |
| `TokensByOwner(address)` | `Vec<u64>` | Persistent — reverse index |

---

## Invariant Test Suite

Tests are co-located with the contract in `contracts/certificate_nft/src/lib.rs`.

Run them with:

```bash
cd contracts
cargo test -p certificate-nft -- --nocapture
```

### Key test cases

| Test | What it proves |
|------|---------------|
| `test_transfer_always_panics` | No wallet-to-wallet transfer succeeds |
| `test_transfer_from_always_panics` | Operator (marketplace) transfers blocked |
| `test_transfer_to_burn_address_also_panics` | Even issuer cannot use `transfer` |
| `test_revoke_marks_token_revoked` | Revocation correctly sets flag and moves to burn |
| `test_revoke_removes_token_from_owner_list` | Index integrity maintained after revocation |
| `test_supply_accounting_after_mint_and_revoke` | Supply counter stays accurate |
| `test_double_initialization_panics` | Contract cannot be re-initialized |

---

## Deployment

Deploy with `stellar contract deploy` and call `initialize` in a single transaction:

```bash
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/certificate_nft.wasm \
  --network testnet \
  --source <deployer-keypair>

stellar contract invoke \
  --id <CONTRACT_ID> \
  --source <deployer-keypair> \
  --network testnet \
  -- initialize \
    --issuer <ISSUER_ADDRESS> \
    --burn_address GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN
```

---

## Audit Considerations

- Both `transfer` functions must remain unconditional panics.
  Do not add conditional logic — any conditional bypass is a vulnerability.
- The `issuer` address should be a multisig or DAO-controlled account for production.
- `burn_address` must have no known private key to prevent recovery of revoked tokens.
