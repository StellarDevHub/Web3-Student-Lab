# Approach Statement: Issue #404 — On-Chain Analytics Platform

## Smart Contract Framework & Time Source

**Framework**: Soroban (Stellar Smart Contracts), SDK v22.0.0, Rust Edition 2021, compiled to wasm32-unknown-unknown

**Time Source**:
- `env.ledger().timestamp()` returns u64 (seconds since epoch)
- `env.ledger().sequence()` returns u32 (current ledger sequence number)
- Ledger close time: 5 seconds (Stellar network standard)

**Storage Tiers**:
- **Instance Storage**: Fast, ephemeral, cleared on contract upgrade
- **Persistent Storage**: Long-term, survives upgrades, ~1 year TTL (6,307,200 ledgers at 5-second close time)

---

## Complete Event Catalogue from Existing Contracts

The data indexer will process these events emitted across all contracts:

### From lib.rs (Certificate Contract) — v1 Schema
- `v1_role_granted` (caller: Address, account: Address, role: Role)
- `v1_role_revoked` (caller: Address, account: Address)
- `v1_pause_updated` (caller: Address, paused: bool)
- `v1_action_proposed` (caller: Address, proposal_id: u64)
- `v1_action_approved` (caller: Address, proposal_id: u64)
- `v1_action_executed` (caller: Address, proposal_id: u64)
- `v1_mint_cap_updated` (old_cap: u32, new_cap: u32)
- `v1_cert_issued` (student: Address, course_name: String)
- `v1_batch_cert_issued` (student: Address, course_name: String)
- `v1_batch_issue_completed` (instructor: Address, count: u32, course: String)
- `v1_cert_revoked` (caller: Address, student: Address)
- `v1_meta_tx_issued` (instructor: Address, student: Address, course_name: String)
- `v1_did_updated` (caller: Address, did: String, timestamp: u64)
- `v1_did_removed` (caller: Address, student: Address)

### From events.rs — v2 Schema
- `cert_minted` (token_id: u128, recipient: Address, course_id: BytesN<32>, metadata_hash: BytesN<32>, minted_at: u64, minted_by: Address)
- `cert_revoked` (token_id: u128, revoked_by: Address, reason: u32, revoked_at: u64)
- `batch_minted` (token_ids: Vec<u128>, course_id: BytesN<32>, count: u32, minted_at: u64, minted_by: Address)
- `cert_renewed` (token_id: u128, renewed_by: Address, renewed_at: u64, new_expiry: u64)
- `role_granted` (caller: Address, account: Address, role: u32)
- `role_revoked` (caller: Address, account: Address)
- `pause_updated` (caller: Address, paused: bool)
- `action_proposed` (caller: Address, proposal_id: u64)
- `action_approved` (caller: Address, proposal_id: u64)
- `action_executed` (caller: Address, proposal_id: u64)
- `mint_cap_updated` (old_cap: u32, new_cap: u32)
- `did_updated` (caller: Address, did: String, timestamp: u64)
- `did_removed` (caller: Address, student: Address)
- `upgrade_proposed` (caller: Address, wasm_hash: BytesN<32>, changelog: String)
- `upgrade_approved` (caller: Address, approval_mask: u32)
- `upgrade_executed` (caller: Address, wasm_hash: BytesN<32>)
- `upgrade_cancelled` (caller: Address)
- `emergency_rollback` (signer_a: Address, signer_b: Address, target_version: u32, wasm_hash: BytesN<32>)
- `admin_added` (caller: Address, new_admin: Address, role: u32)
- `admin_removed` (caller: Address, admin_to_remove: Address)
- `ownership_transferred` (caller: Address, new_owner: Address)

### From enrollment.rs
- `student_enrolled` (student: Address, course_id: Symbol)
- `enrollment_completed` (student: Address, course_id: Symbol)
- `enrollment_dropped` (student: Address, course_id: Symbol)

### From staking.rs
- `certs_staked` (staker: Address, added_weight: u128)
- `unstake_init` (staker: Address, release_at: u64)
- `unstake_done` (staker: Address, token_count: usize)
- `emergency_unstake` (staker: Address, penalty: u128)
- `rewards_claimed` (staker: Address, total_rewards: u128)

### From activity_log.rs (Implicit Event Types)
- EventType::Minted = 0
- EventType::Transferred = 1
- EventType::Revoked = 2
- EventType::Verified = 3
- EventType::Updated = 4
- EventType::BatchMinted = 5
- EventType::Renewed = 6
- EventType::RoleGranted = 7
- EventType::RoleRevoked = 8
- EventType::PauseUpdated = 9
- EventType::ActionProposed = 10
- EventType::ActionApproved = 11
- EventType::ActionExecuted = 12
- EventType::MintCapUpdated = 13
- EventType::DidUpdated = 14
- EventType::DidRemoved = 15
- EventType::UpgradeProposed = 16
- EventType::UpgradeApproved = 17
- EventType::UpgradeExecuted = 18
- EventType::UpgradeCancelled = 19
- EventType::EmergencyRollback = 20
- EventType::AdminAdded = 21
- EventType::AdminRemoved = 22
- EventType::OwnershipTransferred = 23

---

## On-Chain vs. Hybrid Indexing Decision

**Decision: Purely On-Chain Indexing**

**Justification**:
1. **No Off-Chain Infrastructure Found**: Reconnaissance revealed no subgraph.yaml, no Stellar Horizon API integration, no event listener scripts
2. **Existing On-Chain Pattern**: activity_log.rs already demonstrates on-chain event storage (append-only, indexed by address/token/timestamp)
3. **Determinism**: On-chain indexing ensures deterministic, auditable analytics
4. **No External Dependencies**: Avoids reliance on external indexing services
5. **Data Sovereignty**: All data remains on-chain, accessible to any contract

**Implementation**:
- data_indexer.rs stores indexed events in persistent storage
- Multi-tier key structure enables efficient querying
- No off-chain components required

---

## Storage Design for 1,000+ Metrics

### Storage Tier: Persistent
**Rationale**: Metrics and indexed events must survive contract upgrades and persist long-term

**TTL**: ~1 year (6,307,200 ledgers at 5-second close time)

### Key Structure

```rust
// Data Indexer Keys
IndexerKey {
  NextEventId,                                    // u128 counter
  IndexedEvent(event_id),                         // Main storage
  EventsByType(event_type, timestamp, event_id),  // Time-indexed
  EventsByAddress(event_type, address, event_id), // Address-indexed
  EventsByField(event_type, field_value, event_id), // Field-indexed
  Aggregate(event_type, bucket_start),            // Pre-computed aggregates
  EventTypeCount(event_type),                     // u64 counter
  AddressEventCount(address),                     // u64 counter
  LastIndexedTimestamp,                           // u64 timestamp
}

// Analytics Engine Keys
AnalyticsKey {
  NextMetricId,                                   // u64 counter
  MetricDefinition(metric_id),                    // Main storage
  MetricsByType(metric_type),                     // Type index
  MetricResult(metric_id, timestamp),             // Result cache
  Admin,                                          // Address
}
```

### Cost Model & Justification

**Soroban Storage Pricing**:
- Persistent storage: Charged per byte-ledger
- Instance storage: Charged per byte-ledger (but cleared on upgrade)
- TTL extension: Extends storage lifetime

**Cost Breakdown**:

1. **Event Storage**:
   - Per event: ~200-300 bytes (address, token_id, timestamp, event_type, indexed fields)
   - Daily volume: ~1,000 events/day
   - Daily cost: ~300KB/day
   - Annual cost: ~110MB (but pruned/archived)

2. **Metric Definitions**:
   - Per metric: ~150 bytes
   - 1,000 metrics: 150KB (one-time, minimal)

3. **Aggregates**:
   - Per bucket: ~50 bytes
   - 24 hourly buckets/day × 365 days = 8,760 buckets/year
   - Per metric type: ~440KB/year
   - For 10 metric types: ~4.4MB/year

4. **Total Estimated**: ~5-10MB for 1,000+ metrics over 1 year

**Why Persistent Storage**:
- Metrics must survive contract upgrades
- Historical data needed for trend analysis
- Audit trail requirements
- Cost is amortized over 1 year

---

## Frontend Charting Library

**Library Found**: D3.js v7.9.0 (in frontend/package.json)

**Chart Types to Implement**:
1. **Time-Series Line Chart** — D3 line generator for metric trends over time
2. **Bar Chart** — D3 bar chart for event count comparisons across event types
3. **Summary Statistic Cards** — Numeric displays with trend indicators (not D3, styled with Tailwind)

**Rationale**:
- D3 is already a dependency
- Provides low-level, flexible charting primitives
- No additional charting library introduced (Recharts, Chart.js, etc. not used)
- Sufficient for analytics dashboard requirements

---

## Real-Time Update Mechanism

**Mechanism**: Polling via contract query functions

**Polling Interval**: 5 seconds (aligned with Stellar's 5-second ledger close time)

**Implementation**:
- Frontend calls `calculate_metric()` and `export_metric_timeseries()` every 5 seconds
- Updates chart state on each poll
- Displays "Last updated: X seconds ago" timestamp

**Justification**:
1. **No WebSocket Infrastructure**: Frontend has no existing WebSocket setup for contract event subscriptions
2. **Simplicity**: Polling is the simplest approach consistent with existing contract interaction library (@stellar/stellar-sdk)
3. **Alignment**: 5-second interval matches Stellar's ledger close time
4. **Sufficient for Use Case**: Analytics don't require sub-second updates
5. **Existing Pattern**: Frontend already uses axios for API calls; polling follows same pattern

**Data Freshness Guarantee**: Data is at most 5 seconds old (plus contract execution time, typically <1 second)

---

## Test Framework & Utilities

### Contract Tests
**Framework**: Soroban SDK testutils (soroban_sdk::testutils)

**Utilities Found**:
- `Address::generate(&env)` — Generate random addresses
- `env.mock_all_auths()` — Mock authentication
- `env.ledger().with_mut()` — Advance ledger state
- `env.register_contract()` — Register contract for testing

**Pattern**: Tests in #[cfg(test)] blocks within each module

**Assertion Style**: Direct assertions (assert_eq!, assert!, panic checks)

### Frontend Tests
**Framework**: Jest (to be added) + React Testing Library (to be added)

**Pattern**: Component rendering, mock contract queries, user interaction simulation

---

## New Dependencies Required

### Frontend
1. **@testing-library/react** — React component testing library
   - **Justification**: Standard React testing stack, widely used, well-maintained

2. **@testing-library/jest-dom** — Jest matchers for DOM assertions
   - **Justification**: Complements React Testing Library, provides semantic matchers

### Contracts
- **None** — Soroban SDK 22.0.0 is sufficient

---

## Metric Types (Phase 2)

Derived from events and data found during reconnaissance:

1. **Count Metrics**: Total events of a type
   - Example: Total certificates minted, total revocations
   - Calculation: COUNT(events WHERE type = X AND timestamp IN range)

2. **Sum Metrics**: Aggregate numeric fields
   - Example: Total weight staked, total rewards claimed
   - Calculation: SUM(numeric_field WHERE type = X AND timestamp IN range)

3. **Average Metrics**: Mean of numeric fields
   - Example: Average stake duration, average rewards per staker
   - Calculation: AVG(numeric_field WHERE type = X AND timestamp IN range)

4. **Ratio Metrics**: Proportion of events
   - Example: Revocation rate = revoked / minted
   - Calculation: COUNT(revoked) / COUNT(minted)

5. **Percentage Metrics**: Percentage of total
   - Example: % of certificates active, % of students in each tier
   - Calculation: COUNT(active) / COUNT(total) * 100

6. **Custom Metrics**: User-defined aggregations with filters
   - Example: Certificates minted by instructor X in course Y
   - Calculation: COUNT(events WHERE instructor = X AND course = Y)

**Time Windows**:
- Rolling 24 hours
- Rolling 7 days
- Rolling 30 days
- All-time

---

## Real-Time Update Model

**Polling Interval**: 5 seconds (Stellar ledger close time)

**Data Freshness Guarantee**: Data is at most 5 seconds old (plus contract execution time)

**Frontend Display**: "Last updated: X seconds ago" timestamp, updated on each poll

**Update Flow**:
1. Component mounts → Initial fetch
2. Set up 5-second polling interval
3. On each poll → Call contract query functions
4. Update state → Charts re-render
5. User changes filter → Fetch new data immediately
6. Component unmounts → Clear polling interval

---

## Security & Access Control

### Event Ingestion
**Decision**: Permissionless

**Justification**:
- Events are public on-chain
- Indexing is a read operation
- No state modification
- Any caller can index events they observe

### Metric Definition
**Decision**: Admin-only (governance multisig)

**Justification**:
- Metric definitions affect dashboard display
- Should be controlled by governance
- Prevents spam/abuse
- Follows existing RBAC pattern

### Metric Deactivation
**Decision**: Admin-only

**Justification**: Same as metric definition

### Data Integrity
- **Atomicity**: All storage writes atomic within invocation
- **No Silent Errors**: All errors explicitly typed and returned
- **Deterministic**: Same inputs always produce same metric values
- **No PII**: Indexed events contain only addresses (public), token IDs, timestamps, course symbols

### Event Completeness
All operations emit proper events:
- Data Indexer: `event_indexed(event_id, event_type, timestamp)`
- Analytics Engine: `metric_defined`, `metric_calculated`, `trend_analyzed`, `metric_deactivated`

---

## Summary

This approach statement is grounded entirely in findings from codebase reconnaissance:
- Smart contract framework confirmed as Soroban SDK 22.0.0
- Event catalogue derived from actual contract code
- Storage design justified by existing patterns and cost model
- Frontend charting uses existing D3.js dependency
- Real-time updates use polling (no WebSocket infrastructure exists)
- Test framework matches existing patterns
- No new dependencies required for contracts
- Metric types derived from actual events in codebase

All implementation decisions are driven by what was found in the codebase, not assumptions or generic intentions.
