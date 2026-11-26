//! Persistence helpers: connect, run migrations, expose shared state.

use std::collections::HashSet;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, Result};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{PgPool, SqlitePool};
use tracing::info;

use crate::config::{Config, DbKind};

/// A backend-specific connection pool. Encoding the variant in the type lets
/// us have perfectly normal SQL for each dialect without contortions.
#[derive(Clone)]
pub enum IndexerPool {
    Sqlite(SqlitePool),
    Postgres(PgPool),
}

impl IndexerPool {
    #[allow(dead_code)]
    pub fn kind(&self) -> DbKind {
        match self {
            IndexerPool::Sqlite(_) => DbKind::Sqlite,
            IndexerPool::Postgres(_) => DbKind::Postgres,
        }
    }
}

/// Shared application state injected into every axum handler.
pub struct AppState {
    pub pool: IndexerPool,
    pub tx: tokio::sync::broadcast::Sender<String>,
    pub cfg: Config,
}

pub type SharedState = Arc<AppState>;

/// Open a connection pool. Driver is chosen from the URL scheme.
pub async fn connect(cfg: &Config) -> Result<IndexerPool> {
    match cfg.db_kind() {
        DbKind::Sqlite => {
            let opts = cfg
                .database_url
                .parse::<SqliteConnectOptions>()
                .context("parsing SQLite url")?
                .create_if_missing(true)
                .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
                .busy_timeout(Duration::from_secs(10));
            let pool = SqlitePoolOptions::new()
                .max_connections(10)
                .acquire_timeout(Duration::from_secs(10))
                .connect_with(opts)
                .await
                .with_context(|| format!("opening SQLite at {}", cfg.database_url))?;
            info!("SQLite connection pool ready");
            Ok(IndexerPool::Sqlite(pool))
        }
        DbKind::Postgres => {
            let pool = sqlx::postgres::PgPoolOptions::new()
                .max_connections(10)
                .acquire_timeout(Duration::from_secs(10))
                .connect(&cfg.database_url)
                .await
                .with_context(|| format!("opening Postgres at {}", cfg.database_url))?;
            info!("Postgres connection pool ready");
            Ok(IndexerPool::Postgres(pool))
        }
    }
}

/// Apply schema migrations on startup. We use dialect-specific SQL because the
/// shared feature set of SQLite + Postgres is too narrow to express
/// auto-incrementing primary keys cleanly.
fn sql_statements(script: &str) -> Vec<String> {
    script
        .split(';')
        .map(|statement| {
            statement
                .lines()
                .filter(|line| !line.trim_start().starts_with("--"))
                .collect::<Vec<_>>()
                .join("\n")
        })
        .map(|statement| statement.trim().to_string())
        .filter(|statement| !statement.is_empty())
        .collect()
}

pub async fn init_schema(pool: &IndexerPool) -> Result<()> {
    match pool {
        IndexerPool::Sqlite(p) => {
            for statement in sql_statements(SQLITE_SCHEMA) {
                sqlx::query(&statement)
                    .execute(p)
                    .await
                    .with_context(|| format!("creating SQLite schema: {statement}"))?;
            }
        }
        IndexerPool::Postgres(p) => {
            for statement in sql_statements(POSTGRES_SCHEMA) {
                sqlx::query(&statement)
                    .execute(p)
                    .await
                    .with_context(|| format!("creating Postgres schema: {statement}"))?;
            }
        }
    }
    info!("database schema ready");
    Ok(())
}

/// Read the persisted cursor; returns `(last_ledger)` or `0` if the table is empty.
pub async fn get_last_ledger(pool: &IndexerPool) -> Result<u32> {
    match pool {
        IndexerPool::Sqlite(p) => {
            let row: Option<(i64,)> = sqlx::query_as(
                "SELECT last_ledger FROM indexer_cursor WHERE id = 1",
            )
            .fetch_optional(p)
            .await
            .context("reading SQLite cursor")?;
            Ok(row.map(|r| r.0 as u32).unwrap_or(0))
        }
        IndexerPool::Postgres(p) => {
            let row: Option<(i64,)> = sqlx::query_as(
                "SELECT last_ledger FROM indexer_cursor WHERE id = 1",
            )
            .fetch_optional(p)
            .await
            .context("reading Postgres cursor")?;
            Ok(row.map(|r| r.0 as u32).unwrap_or(0))
        }
    }
}

pub async fn update_last_ledger(pool: &IndexerPool, last: u32) -> Result<()> {
    match pool {
        IndexerPool::Sqlite(p) => {
            sqlx::query(
                "INSERT INTO indexer_cursor (id, last_ledger) VALUES (1, ?1)
                 ON CONFLICT(id) DO UPDATE SET last_ledger = excluded.last_ledger",
            )
            .bind(last as i64)
            .execute(p)
            .await
            .context("updating SQLite cursor")?;
        }
        IndexerPool::Postgres(p) => {
            sqlx::query(
                "INSERT INTO indexer_cursor (id, last_ledger) VALUES (1, $1)
                 ON CONFLICT (id) DO UPDATE SET last_ledger = EXCLUDED.last_ledger",
            )
            .bind(last as i64)
            .execute(p)
            .await
            .context("updating Postgres cursor")?;
        }
    }
    Ok(())
}

/// Persist a batch, its canonical ledger seals, and its watermark atomically.
/// Returns only newly inserted events so retries cannot duplicate WebSocket fan-out.
pub async fn persist_batch(
    pool: &IndexerPool,
    events: &[crate::rpc::IndexedEvent],
    seals: &[crate::reorg::LedgerSeal],
    last_ledger: u32,
) -> Result<Vec<crate::rpc::IndexedEvent>> {
    let inserted_ids = match pool {
        IndexerPool::Sqlite(p) => {
            let mut tx = p.begin().await.context("begin sqlite ingestion batch")?;
            let inserted_ids = insert_events_sqlite(&mut tx, events).await?;
            upsert_seals_sqlite(&mut tx, seals).await?;
            update_cursor_sqlite(&mut tx, last_ledger).await?;
            tx.commit().await.context("commit sqlite ingestion batch")?;
            inserted_ids
        }
        IndexerPool::Postgres(p) => {
            let mut tx = p.begin().await.context("begin postgres ingestion batch")?;
            let inserted_ids = insert_events_postgres(&mut tx, events).await?;
            upsert_seals_postgres(&mut tx, seals).await?;
            update_cursor_postgres(&mut tx, last_ledger).await?;
            tx.commit().await.context("commit postgres ingestion batch")?;
            inserted_ids
        }
    };

    let mut emitted_ids = HashSet::with_capacity(inserted_ids.len());
    Ok(events
        .iter()
        .filter(|event| {
            inserted_ids.contains(&event.id) && emitted_ids.insert(event.id.clone())
        })
        .cloned()
        .collect())
}

/// Bulk-insert events idempotently. Event IDs include transaction hashes and
/// event ordinals, allowing multiple events in one transaction without loss.
pub async fn insert_events(pool: &IndexerPool, events: &[crate::rpc::IndexedEvent]) -> Result<()> {
    if events.is_empty() {
        return Ok(());
    }
    match pool {
        IndexerPool::Sqlite(p) => {
            let mut tx = p.begin().await.context("begin sqlite event insert")?;
            insert_events_sqlite(&mut tx, events).await?;
            tx.commit().await.context("commit sqlite event insert")?;
        }
        IndexerPool::Postgres(p) => {
            let mut tx = p.begin().await.context("begin postgres event insert")?;
            insert_events_postgres(&mut tx, events).await?;
            tx.commit().await.context("commit postgres event insert")?;
        }
    }
    Ok(())
}

const EVENT_INSERT_CHUNK_SIZE: usize = 100;

async fn insert_events_sqlite(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    events: &[crate::rpc::IndexedEvent],
) -> Result<HashSet<String>> {
    let mut inserted_ids = HashSet::new();
    for chunk in events.chunks(EVENT_INSERT_CHUNK_SIZE) {
        let mut qb = sqlx::QueryBuilder::<sqlx::Sqlite>::new(
            "INSERT INTO events \
             (id, ledger, ledger_closed_at, contract_id, event_type, topics, data, tx_hash) ",
        );
        qb.push_values(chunk, |mut b, event| {
            b.push_bind(&event.id)
                .push_bind(event.ledger as i64)
                .push_bind(&event.ledger_closed_at)
                .push_bind(&event.contract_id)
                .push_bind(&event.event_type)
                .push_bind(&event.topics_json)
                .push_bind(&event.data_json)
                .push_bind(&event.transaction_hash);
        });
        qb.push(" ON CONFLICT(id) DO NOTHING RETURNING id");
        let ids: Vec<String> = qb
            .build_query_scalar()
            .fetch_all(&mut **tx)
            .await
            .context("inserting events (sqlite)")?;
        inserted_ids.extend(ids);
    }
    Ok(inserted_ids)
}

async fn insert_events_postgres(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    events: &[crate::rpc::IndexedEvent],
) -> Result<HashSet<String>> {
    let mut inserted_ids = HashSet::new();
    for chunk in events.chunks(EVENT_INSERT_CHUNK_SIZE) {
        let mut qb = sqlx::QueryBuilder::<sqlx::Postgres>::new(
            "INSERT INTO events \
             (id, ledger, ledger_closed_at, contract_id, event_type, topics, data, tx_hash) ",
        );
        qb.push_values(chunk, |mut b, event| {
            b.push_bind(&event.id)
                .push_bind(event.ledger as i64)
                .push_bind(&event.ledger_closed_at)
                .push_bind(&event.contract_id)
                .push_bind(&event.event_type)
                .push_bind(&event.topics_json)
                .push_bind(&event.data_json)
                .push_bind(&event.transaction_hash);
        });
        qb.push(" ON CONFLICT (id) DO NOTHING RETURNING id");
        let ids: Vec<String> = qb
            .build_query_scalar()
            .fetch_all(&mut **tx)
            .await
            .context("inserting events (postgres)")?;
        inserted_ids.extend(ids);
    }
    Ok(inserted_ids)
}

async fn upsert_seals_sqlite(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    seals: &[crate::reorg::LedgerSeal],
) -> Result<()> {
    for chunk in seals.chunks(400) {
        let mut qb =
            sqlx::QueryBuilder::<sqlx::Sqlite>::new("INSERT INTO ledger_seals (ledger, hash) ");
        qb.push_values(chunk, |mut b, seal| {
            b.push_bind(seal.sequence as i64).push_bind(&seal.hash);
        });
        qb.push(" ON CONFLICT(ledger) DO UPDATE SET hash = excluded.hash");
        qb.build()
            .execute(&mut **tx)
            .await
            .context("upserting sqlite seals")?;
    }
    Ok(())
}

async fn upsert_seals_postgres(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    seals: &[crate::reorg::LedgerSeal],
) -> Result<()> {
    for chunk in seals.chunks(400) {
        let mut qb = sqlx::QueryBuilder::<sqlx::Postgres>::new(
            "INSERT INTO ledger_seals (ledger, hash) ",
        );
        qb.push_values(chunk, |mut b, seal| {
            b.push_bind(seal.sequence as i64).push_bind(&seal.hash);
        });
        qb.push(" ON CONFLICT (ledger) DO UPDATE SET hash = EXCLUDED.hash");
        qb.build()
            .execute(&mut **tx)
            .await
            .context("upserting postgres seals")?;
    }
    Ok(())
}

async fn update_cursor_sqlite(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    last_ledger: u32,
) -> Result<()> {
    sqlx::query(
        "INSERT INTO indexer_cursor (id, last_ledger) VALUES (1, ?1)
         ON CONFLICT(id) DO UPDATE SET last_ledger = excluded.last_ledger,
             updated_at = datetime('now')",
    )
    .bind(last_ledger as i64)
    .execute(&mut **tx)
    .await
    .context("updating sqlite cursor")?;
    Ok(())
}

async fn update_cursor_postgres(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    last_ledger: u32,
) -> Result<()> {
    sqlx::query(
        "INSERT INTO indexer_cursor (id, last_ledger) VALUES (1, $1)
         ON CONFLICT (id) DO UPDATE SET last_ledger = EXCLUDED.last_ledger,
             updated_at = NOW()",
    )
    .bind(last_ledger as i64)
    .execute(&mut **tx)
    .await
    .context("updating postgres cursor")?;
    Ok(())
}

/// SQLite schema. `id` is the deterministic composite id from Soroban RPC.
const SQLITE_SCHEMA: &str = include_str!("../migrations/0001_init.sqlite.sql");

/// Postgres schema. Adds a synthetic BIGSERIAL PK for index efficiency.
const POSTGRES_SCHEMA: &str = include_str!("../migrations/0001_init.postgres.sql");
