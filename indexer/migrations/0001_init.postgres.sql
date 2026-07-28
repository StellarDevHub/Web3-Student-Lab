-- Soroban Indexer — Postgres schema (v1)
--
-- Same logical shape as the SQLite schema but with a synthetic BIGSERIAL
-- primary key for index-friendly joins and BIGINT instead of INTEGER for
-- ledger numbers (Soroban testnet has already crossed 2^31 ledgers on
-- future-firm timelines).

CREATE TABLE IF NOT EXISTS events (
    pk_id              BIGSERIAL PRIMARY KEY,
    id                 TEXT NOT NULL UNIQUE,
    ledger             BIGINT NOT NULL,
    ledger_closed_at   TEXT NOT NULL,
    contract_id        TEXT NOT NULL,
    event_type         TEXT NOT NULL,
    topics             TEXT NOT NULL,
    data               TEXT NOT NULL,
    tx_hash            TEXT NOT NULL,
    ingested_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
);

CREATE INDEX IF NOT EXISTS idx_events_ledger     ON events (ledger);
CREATE INDEX IF NOT EXISTS idx_events_contract   ON events (contract_id);
CREATE INDEX IF NOT EXISTS idx_events_type       ON events (event_type);

CREATE TABLE IF NOT EXISTS indexer_cursor (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    last_ledger BIGINT NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO indexer_cursor (id, last_ledger) VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;
