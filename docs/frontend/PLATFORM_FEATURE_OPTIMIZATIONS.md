# Platform Feature Optimizations

This document covers the MVP frontend/DevOps additions for:

- Performance Profiling in the Open Source Contribution Trainer
- Optimized Merkle Tree Builder
- Consensus Algorithm Sandbox in the Web3 Learning Roadmap
- Mentor Booking optimization checks

## Open Source Contribution Performance Profiling

Core logic lives in `frontend/src/lib/contribution-performance.ts`.

The profiler accepts timestamped contribution events such as issue assignment, PR open, review request, review received, change requests, and merge. It derives:

- issue-to-merge cycle time
- review response time
- throughput, quality, focus, and overall scores
- bottlenecks and recommendations

The UI panel is rendered on `/performance-metrics` through `ContributionPerformanceProfiler`.

## Optimized Merkle Tree Builder

Core logic lives in `frontend/src/lib/merkle-tree-builder.ts`.

The builder normalizes leaves, removes duplicates, builds levels iteratively, duplicates odd leaves deterministically, and exposes proof generation plus proof verification. The `/merkle-tree` page now uses this shared logic for visualization and validation path display.

## Consensus Algorithm Sandbox

Core logic lives in `frontend/src/lib/consensus-sandbox.ts`.

The sandbox supports:

- proof of work leader selection by hash power
- proof of stake leader selection by active stake
- federated Byzantine agreement selection by quorum-slice trust overlap

The sandbox is embedded on `/roadmap` next to the learning path selector.

## Mentor Booking Optimization

Core logic lives in `frontend/src/lib/mentor-booking.ts`.

It provides deterministic slot selection based on tag match, capacity, fill ratio, and start time. It also prevents overbooking and detects overlapping slots per mentor.

CI coverage is isolated in `.github/workflows/mentor-booking.yml`, which runs mentor booking tests when relevant files change.

## Tests

Run the focused tests:

```bash
cd frontend
pnpm vitest run \
  src/lib/__tests__/contribution-performance.test.ts \
  src/lib/__tests__/merkle-tree-builder.test.ts \
  src/lib/__tests__/consensus-sandbox.test.ts \
  src/lib/__tests__/mentor-booking.test.ts
```
