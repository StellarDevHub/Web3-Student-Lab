# Soroban Indexer

Off-chain event indexer for the **Web3 Student Lab**. It talks plain JSON-RPC
to a [Soroban RPC](https://soroban.stellar.org/docs/rpc) endpoint, persists
every event into SQLite (default) or Postgres, and fan-outs new events over a
WebSocket so the frontend can stream live data from the chain.

## Why

The platform's smart-contract tests, learning-roadmap explorer and
hackathon dashboards all need historical **and** real-time access to on-chain
events. Polling Soroban RPC from many places is wasteful, so a single Rust
service indexes once and serves many.

## Layout

```
indexer/
├── Cargo.toml          # standalone crate — not part of contracts/ workspace
├── Dockerfile          # multi-stage Debian slim build
├── .dockerignore
├── migrations/         # SQL DDL applied on startup
└── src/
    ├── main.rs         # entry point: tracing, deps wiring, server
    ├── config.rs       # env-var loader (port, db url, rpc url, …)
    ├── db.rs           # sqlx pool + schema init + cursor / events
    ├── rpc.rs          # RpcClient + background Poller
    └── server.rs       # axum HTTP + WebSocket + SSE
```

## Run locally

```bash
cd indexer
cargo run --release
```

With defaults the service binds to `:3001`, talks to the public Stellar testnet
RPC and writes `indexer.db` next to the working directory.

## Run in Docker

```bash
docker build -t web3-student-lab-indexer ./indexer
docker run --rm -p 3001:3001 \
  -e SOROBAN_RPC_URL=https://soroban-testnet.stellar.org \
  -v indexer_data:/data \
  web3-student-lab-indexer
```

Or via the repo's compose file:

```bash
docker compose up -d indexer
```

## Environment variables

| Variable          | Default                                              | Purpose                                                              |
| ----------------- | ---------------------------------------------------- | -------------------------------------------------------------------- |
| `PORT`            | `3001`                                               | HTTP / WS port                                                       |
| `DATABASE_URL`    | `sqlite:///data/indexer.db?mode=rwc`                 | sqlx connection string; auto-detects SQLite vs Postgres from scheme |
| `SOROBAN_RPC_URL` | `https://soroban-testnet.stellar.org`                | Soroban RPC endpoint used by the poller                              |
| `POLL_INTERVAL_MS`| `5000`                                               | Sleep between successful polls                                       |
| `BATCH_SIZE`      | `100`                                                | Ledger window per request to `getEvents`                             |
| `START_LEDGER`    | unset                                                | Override the cursor (back-fills / tests)                             |
| `RUST_LOG`        | `info,indexer=debug,sqlx=warn,...`                   | `tracing-subscriber` env-filter                                      |

## HTTP routes

| Method | Path       | Description                                                                 |
| ------ | ---------- | --------------------------------------------------------------------------- |
| GET    | `/`        | Service banner                                                              |
| GET    | `/health`  | Liveness + best-effort RPC ping                                            |
| GET    | `/events`  | Most recent events from the DB. Query params: `contractId`, `eventType`, `fromLedger`, `limit` |
| GET    | `/ws`      | WebSocket fan-out of every newly indexed event                              |
| GET    | `/v1/sse`  | Equivalent to `/ws` but over Server-Sent Events (handy for `curl`)          |

### Try it

```bash
curl -s http://localhost:3001/health | jq
curl -s 'http://localhost:3001/events?limit=5' | jq

# Live fan-out via SSE
curl -N http://localhost:3001/v1/sse

# Live fan-out via WebSocket (using `websocat`)
websocat ws://localhost:3001/ws
```

From JavaScript:

```ts
const ws = new WebSocket("ws://localhost:3001/ws");
ws.onmessage = (e) => console.log("new event", JSON.parse(e.data));
```

## Schema

`events` rows are written once and upserted by `id` (the deterministic
`{ledger}-{txHash}-{eventIndex}` key returned by Soroban RPC). `indexer_cursor`
is a single-row table holding `last_ledger` so restarts resume from where the
service left off.

The full DDL lives in [`migrations/`](./migrations) and is applied on every
startup (`IF NOT EXISTS`-style — safe to re-run).

## Design notes

* Single Rust crate on purpose: keeping the indexer out of the
  `contracts/` workspace avoids the `wasm32-unknown-unknown` toolchain and
  keeps compile times short.
* `sqlx::query` is used (no compile-time SQLx macros) so the binary builds
  without needing a live database inside the Docker build context.
* Multi-stage Debian slim build (not Alpine) to avoid musl + OpenSSL pitfalls
  with `reqwest`.
* `tini` is used as PID 1 so the axum graceful-shutdown path actually fires
  when the container is stopped.
