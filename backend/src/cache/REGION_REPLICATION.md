# Multi-Region Cache Replication

Synchronizes Redis keys across multiple geographic regions so worldwide students
read from a nearby region while writes propagate everywhere. Implements an
application-layer **multi-master** model with **region-based fallback**.

## How it works

```
            write("course:1")
                  │
        ┌─────────▼─────────┐  active region first (low latency)
        │  us-east (origin) │
        └─────────┬─────────┘
        fan-out (best-effort, parallel)
        ┌─────────┼─────────┐
   ┌────▼───┐ ┌───▼────┐ ┌──▼─────┐
   │ eu-west│ │ ap-south│ │  ...   │   replica regions stay in sync
   └────────┘ └────────┘ └────────┘
```

- **Writes** (`set`) go to the active region first, then fan out to every other
  healthy region in parallel. A replica failure is logged, not fatal.
- **Reads** (`get`) try the active region, then fall back to other healthy
  regions — a regional outage degrades latency, not availability.
- **Deletes** (`del`) apply to every region for consistency.
- **Health**: a region is skipped only when its connection is dead
  (`end`/`close`); transient states still get attempted with per-call fallback.

## Configuration

| Env var | Example | Meaning |
|---------|---------|---------|
| `REDIS_REGIONS` | `us-east@redis://cache-us:6379,eu-west@cache-eu:6379` | Comma-separated `name@connection` (URL or `host:port`). |
| `REDIS_ACTIVE_REGION` | `eu-west` | This process's local region (defaults to the first listed). |

When `REDIS_REGIONS` is unset, `createRegionReplicator()` returns `null` and the
app continues with the existing single-instance cache — multi-region is opt-in.

## Files

| File | Responsibility |
|------|----------------|
| `../config/region.config.ts` | Pure parsing + active-region resolution + fallback ordering. Unit tested. |
| `RegionReplicator.ts` | `RegionReplicator` (set/get/del across regions) + ioredis client builder + `createRegionReplicator()`. |

The replicator depends only on a minimal `RedisLike` interface, so it runs on
real ioredis clients in production and on in-memory fakes in tests.

## Usage

```ts
import { createRegionReplicator } from './cache/RegionReplicator.js';

const replicator = createRegionReplicator();      // null if not configured
if (replicator) {
  await replicator.set('course:1', JSON.stringify(course), 900); // synced to all regions
  const cached = await replicator.get('course:1');               // nearest region, with fallback
}
```

> Production note: for native Redis-level geo-replication you would pair this
> with Redis Enterprise Active-Active (CRDT) or per-region replicas. This module
> provides the application-layer coordination and fallback that works on top of
> either, and keeps the behaviour testable.

## Tests

```bash
cd backend
npm test -- region-replication
```

Proves the acceptance criterion: a key modified in one region is present in every
replica region, plus fallback reads, replica-failure tolerance, and cross-region
deletes.
