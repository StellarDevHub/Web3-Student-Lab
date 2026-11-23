# File Notarization and Payment Gateway Contracts

This guide documents the two MVP Soroban contracts added for the Web3 Student Lab playground.
Both examples are intentionally educational: they favor explicit state, readable errors, and inline
comments over advanced abstractions.

## Basic File Notarization

Source: `contracts/src/file_notarization.rs`

The file notarization contract teaches proof-of-existence workflows:

1. Hash the document off-chain with a deterministic 32-byte digest algorithm such as SHA-256.
2. Call `register_hash(owner, hash, metadata)` to store the hash, owner, ledger timestamp, and ledger sequence.
3. Call `verify(hash)` later to prove the matching document existed no later than the stored timestamp.
4. Call `history_for_owner(owner)` to review every hash registered by a learner or organization.

Important learning points:

- The document itself is never stored on-chain, preserving privacy and keeping ledger costs low.
- Duplicate hashes revert with `HashAlreadyRegistered` so the first timestamp remains immutable.
- `register_batch` demonstrates batch processing while enforcing one metadata entry per hash.

## Simple Payment Gateway

Source: `contracts/src/payment_gateway.rs`

The payment gateway contract teaches a merchant payment lifecycle using a Soroban token contract:

1. `init(admin, token_contract)` configures the dispute administrator and accepted asset.
2. `process_payment(payment_id, payer, merchant, amount, memo)` transfers payer funds into gateway escrow.
3. `release_payment(payment_id)` lets the merchant settle a pending payment.
4. `refund_payment(payment_id, reason)` lets the merchant voluntarily return pending funds.
5. `open_dispute(payment_id, opened_by, reason)` freezes a pending payment for payer/merchant disputes.
6. `resolve_dispute(payment_id, decision, note)` lets the admin refund the payer or release the merchant.

Important learning points:

- `payment_id` is an idempotency key that prevents accidental double charges.
- Escrow keeps funds inside the gateway contract while the payment is pending or disputed.
- Explicit `PaymentStatus` values make simulations easy to inspect in the playground.
- Admin-only dispute resolution models centralized merchant support without hiding the tradeoff.

## Playground Integration

The playground file tree now lists:

- `file_notarization.rs`
- `payment_gateway.rs`
- `timestamping.rs`

The simulated compile output also highlights the main entrypoints so learners can quickly map UI
experiments to contract functions.

## Testing

Run the focused contract checks from the `contracts` directory:

```bash
cargo test file_notarization payment_gateway
```

For a full crate check, run:

```bash
cargo test
```
