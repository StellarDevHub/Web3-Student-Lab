-- Soroban Indexer — SQLite schema (v1)
--
-- The `events` table stores one row per Soroban RPC event. `id` is the
-- deterministic composite id exposed by the RPC (`{ledger}-{txHash}-{eventIndex}`)
-- so re-ingestion is idempotent.

CREATE TABLE IF NOT EXISTS events (
    id                TEXT PRIMARY KEY,
    ledger            INTEGER NOT NULL,
    ledger_closed_at  TEXT NOT NULL,
    contract_id       TEXT NOT NULL,
    event_type        TEXT NOT NULL,
    topics            TEXT NOT NULL,
    data              TEXT NOT NULL,
    tx_hash           TEXT NOT NULL,
    ingested_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_ledger     ON events (ledger);
CREATE INDEX IF NOT EXISTS idx_events_contract   ON events (contract_id);
CREATE INDEX IF NOT EXISTS idx_events_type       ON events (event_type);

-- Single-row table used as the poller's cursor (last successfully processed
-- ledger). Replaying from a START_LEDGER override is also funnelled through
-- this row so restart behaviour is identical.
CREATE TABLE IF NOT EXISTS indexer_cursor (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    last_ledger INTEGER NOT NULL,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO indexer_cursor (id, last_ledger) VALUES (1, 0);
