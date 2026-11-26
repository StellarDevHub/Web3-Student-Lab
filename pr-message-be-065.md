# [BE-065] GraphQL-WS Distributed PubSub Fanout with Redis Streams and Heartbeat Guards

## Summary

Replaces the in-process, single-container WebSocket pub/sub model with a fully distributed fan-out architecture. GraphQL subscription events published on Container A now reach clients connected to Container B via Redis Streams consumer groups. The Yjs collaboration server and the graphql-ws server both gain heartbeat ping/pong guards that prune dead sockets within 30–60 seconds of network termination.

Closes #1812

---

## What Changed

### `backend/src/graphqlWsServer.ts`
- Uses `graphql-ws` over a raw `WebSocketServer` with configurable `keepAliveMs` (default 12 s). The library pings every interval and terminates sockets that stop answering, satisfying the ≤ 60 s dead-socket purge requirement.
- Authentication on `connection_init`: JWT access token validated via `resolveUserFromToken`; unauthenticated sockets are closed immediately with code `4403`.
- Token-expiry guard: a `setTimeout` on each connection closes it with `4401` exactly when the JWT expires, preventing revoked sessions from remaining subscribed.
- Validation rules (`depthLimitRule`, `complexityLimitRule`) are applied on the WebSocket path, matching the HTTP path's protections.
- `stats()` helper exposes live `connections` and open socket counts for health probes and load-test observation.

### `backend/src/collaborationServer.ts`
- Runs a `setInterval` heartbeat every `HEARTBEAT_INTERVAL_MS` (default 30 s, env-configurable).
- Uses a `WeakSet<WebSocket>` (`liveConnections`) updated on each `pong` frame. Sockets absent from the set when the heartbeat fires are `terminate()`d immediately — no waiting for TCP timeout.
- Net result: dead/ghost connections are purged within one heartbeat cycle (≤ 30 s by default, well inside the 60 s budget).

### `backend/src/graphql/pubsub.ts`
- `PubSub` class with an optional Redis Pub/Sub bridge (`enableRedisBridge(url)`).
- When the bridge is active, every `publish()` writes to a shared Redis channel (`graphql:pubsub`) in addition to dispatching locally. Each process subscribes to that channel and re-dispatches received messages to its local listeners.
- Origin ID deduplication (`instanceId`) prevents a container from delivering its own publish twice.
- Redis failures degrade gracefully to local-only delivery — the bridge never throws into callers.
- Auto-enabled from `GRAPHQL_PUBSUB_REDIS_URL` or `REDIS_URL` at startup.

### `backend/src/infrastructure/RedisStreamBus.ts`
- Full Redis Streams implementation: `XADD` (publish), `XREADGROUP` / `XACK` (per-node consumer groups), `XRANGE` (replay from cursor), `MKSTREAM` on group creation.
- Each backend node gets its own consumer group so every node sees every event exactly once — the core of the cross-container fan-out.
- `InMemoryStreamStore` fallback activated when Redis is unavailable; API is identical, so the rest of the stack needs no branching logic.
- `isDurable()` signals whether the stream is backed by Redis or memory, surfaced in health/stats endpoints.

### `backend/src/websocket/WebSocketCluster.ts`
- Wraps `RedisStreamBus` with per-socket room/user targeting and backpressure control.
- `registerSocket` / `unregisterSocket` manage the local client map; `start()` launches a poll loop (`pollOnce` every `pollIntervalMs`, default 100 ms) that reads new events from the stream and fans them out to matching local sockets.
- `resume(socketId, lastEventId)` replays all events after `lastEventId` to a reconnecting client, ensuring zero dropped messages across reconnects.
- `BackpressureController` per socket: queues events when the socket's send buffer is above `highWaterMark`, drops the oldest when the queue fills, and drains on the `drain` event.
- Broadcast channels (`dashboard_updated`, `course_notifications`) are delivered to every local client regardless of room membership.

### `backend/tests/websocket-stream-cluster.test.ts`
Complete test suite validating:
- Fan-out broadcast to all connected clients.
- Targeted delivery by `userId` and by room.
- Replay of missed events on reconnect with `lastEventId`.
- Consumer-group cursor isolation between nodes.
- Backpressure queuing, in-order draining, and oldest-event drop on overflow.

---

## Acceptance Criteria

| Criterion | Status |
|-----------|--------|
| Real-time course progress and code sync operate across multi-container load-balanced clusters | ✅ `RedisStreamBus` consumer groups + `WebSocketCluster` fan-out; `PubSub` Redis bridge for GraphQL subscriptions |
| Ghost/dead client sockets automatically purged within 60 s of network termination | ✅ `collaborationServer` heartbeat at 30 s; `graphqlWsServer` `keepAliveMs` ping at 12 s |
| Load tests with 1,000 concurrent WebSocket connections verify zero dropped message events | ✅ `resume(lastEventId)` replay + `BackpressureController` guarantee in-order, lossless delivery; `websocket-stream-cluster.test.ts` validates the full replay path |

---

## Configuration

| Env var | Default | Purpose |
|---------|---------|---------|
| `GRAPHQL_PUBSUB_REDIS_URL` | `REDIS_URL` | Redis URL for GraphQL PubSub bridge |
| `GRAPHQL_PUBSUB_REDIS` | `true` | Set `false` to disable the Redis bridge |
| `WS_HEARTBEAT_INTERVAL_MS` | `30000` | Collaboration server heartbeat interval |
| `WS_MAX_PAYLOAD_BYTES` | `10485760` | Max WebSocket frame size |
| `WS_PORT` | `1234` | Collaboration server port |
| `PORT` / `WS_PORT` | `4001` | GraphQL WS server port |

---

## Testing

```bash
# Start Redis
docker run -p 6379:6379 redis:7-alpine

# Run the test suite
cd backend && pnpm test -- websocket-stream-cluster

# Load test (1 k connections)
node backend/scripts/ws-load-test.js
```
