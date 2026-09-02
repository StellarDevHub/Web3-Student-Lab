# On-Chain Event Schemas

Standardized event vocabulary for the Web3-Student-Lab Soroban platform
contracts. Every state-modifying function emits structured, searchable
events so indexers, auditors, and frontend subscription streams consume a
single, predictable schema.

The canonical topic `Symbol`s and typed decode helpers live in the shared
[`contract-events`](../../contracts/contract_events/) crate (workspace
member `contract-events`). Contracts that want to standardize should depend
on it and use its `publish_*` helpers; off-chain consumers can use the
`decode_*` helpers to turn raw `(topics, data)` pairs back into typed
values.

## Conventions

* **Topics** — the first topic element is always one of the canonical
  `Symbol`s below; the remaining topic elements are the *indexed keys*
  (addresses or ids) used for filtering in real-time indexers.
* **Payloads** — event data is a tuple packed into a single `Vec` value by
  the Soroban host; `contract_events::event_data(env, data)` unpacks it.
* **Timestamps** — every payload ends with `ts`, the ledger timestamp at
  emission.
* **Contract id** — events are naturally attributed to the contract that
  emitted them via the XDR contract id; no need to duplicate it in topics.

## Event index

| Topic symbol | Emitted by | Payload |
|---|---|---|
| `trade` | `continuous-bonding-curve` | buy/sell execution |
| `paused` | `continuous-bonding-curve` | pool pause/unpause |
| `fee_wd` | `continuous-bonding-curve` | protocol fee withdrawal |
| `vault` | `fractional-nft-vault` | NFT lock/unlock |
| `shares` | `fractional-nft-vault` | fractional share mint |
| `bid` | `fractional-nft-vault` | buyout bid placed/refunded |
| `auction` | `fractional-nft-vault` | buyout finalized/cancelled |
| `payout` | `fractional-nft-vault` | pro-rata payout claim |
| `submit` | `peer-review` | submission created |
| `stake` | `peer-review` | stake deposited/withdrawn |
| `commit` | `peer-review` | blind review committed |
| `reveal` | `peer-review` | review revealed |
| `rview` | `peer-review` | submission finalized |
| `slash` | `peer-review` | dishonest stake slashed |
| `enroll` | course/content contracts | enrollment created/revoked |
| `milestn` | course/content contracts | milestone achieved |
| `cert` | `certificate-nft` | certificate minted |
| `xfer` | platform contracts | fungible token transfer |

---

## `trade` — bonding curve execution

Topics: `(trade, trader)`

Data: `(action, tokens, reserve, supply_after, reserve_after, fee, ts)`

| Field | Type | Description |
|---|---|---|
| `action` | `Symbol` | `buy` or `sell` |
| `tokens` | `i128` | curve tokens traded |
| `reserve` | `i128` | reserve moved on the curve (before fee on buy, before fee on sell) |
| `supply_after` | `i128` | total curve-token supply after the trade |
| `reserve_after` | `i128` | curve reserve after the trade |
| `fee` | `i128` | protocol fee collected |
| `ts` | `u64` | ledger timestamp |

Example (indexer pseudo-code):

```rust
use contract_events::decode_trade;
for event in events.filter_by_topic("trade") {
    let trade = decode_trade(&env, &event.topics, &event.data);
    println!("{} {} tokens for {}", trade.action, trade.tokens, trade.reserve);
}
```

## `paused` — pool pause/unpause

Topics: `(paused, admin)`

Data: `(paused, ts)`

## `fee_wd` — protocol fee withdrawal

Topics: `(fee_wd, admin)`

Data: `(treasury, amount, ts)`

## `vault` — NFT lock/unlock

Topics: `(vault, party)`

Data: `(nft_contract, token_id, locked, ts)`

`locked: true` on `fractionalize`, `false` on `redeem_nft` / buyout
finalization.

## `shares` — fractional share mint

Topics: `(shares, recipient)`

Data: `(amount, total_shares, ts)`

## `bid` — buyout bid

Topics: `(bid, bidder)`

Data: `(amount, refunded, ts)`

`refunded` is the escrow returned to a previously-leading bidder who was
outbid (0 for the first bid or self-raises).

## `auction` — buyout finalize/cancel

Topics: `(auction, winner)`

Data: `(offer, total_shares, finalized, ts)`

`finalized: true` for a completed buyout (winner = winning bidder,
`offer` = winning bid). For a cancellation, callers emit `finalized:
false` with their own contract address as the winner marker.

## `payout` — pro-rata buyout claim

Topics: `(payout, holder)`

Data: `(amount, ts)`

## `submit` — submission created

Topics: `(submit, creator)`

Data: `(submission_id, reward_pool, commit_deadline, reveal_deadline, ts)`

## `stake` — stake deposit/withdrawal

Topics: `(stake, reviewer)`

Data: `(amount, total_stake, deposit, ts)`

`deposit: true` on deposit, `false` on withdrawal.

## `commit` — blind review commit

Topics: `(commit, reviewer)`

Data: `(submission_id, commitment, ts)`

`commitment` is `sha256(grade_be_bytes || salt)` — the review stays hidden
until reveal.

## `reveal` — review reveal

Topics: `(reveal, reviewer)`

Data: `(submission_id, grade, ts)`

## `rview` — submission finalized

Topics: `(rview, submission_id)`

Data: `(median, rewarded, slashed, ts)`

`rewarded`/`slashed` are counts of accurate / outlier reviewers.

## `slash` — stake slashed

Topics: `(slash, reviewer)`

Data: `(submission_id, amount, ts)`

## `enroll` — enrollment (course/content contracts)

Topics: `(enroll, student)`

Data: `(content_id, revoked, ts)`

## `milestn` — milestone achieved

Topics: `(milestn, student)`

Data: `(content_id, milestone, ts)`

## `cert` — certificate mint

Topics: `(cert, student)`

Data: `(course_id, ts)`

## `xfer` — fungible token transfer

Topics: `(xfer, from)`

Data: `(to, amount, ts)`

---

## Adding a new event

1. Add the canonical topic `Symbol` in `contract-events` `topic` module.
2. Add a `publish_*` helper (topics + payload layout) and a typed
   `decode_*` helper plus its struct.
3. Emit from the contract using the helper.
4. Add a payload example above and a round-trip assertion in
   `contract-events` tests.
