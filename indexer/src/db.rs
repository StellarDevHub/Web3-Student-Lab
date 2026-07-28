//! Persistence helpers: connect, run migrations, expose shared state.

use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, Result};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{PgPool, Pool, SqlitePool};
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
            let opts = SqliteConnectOptions::from_url(&cfg.database_url.parse()?)
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
pub async fn init_schema(pool: &IndexerPool) -> Result<()> {
    match pool {
        IndexerPool::Sqlite(p) => {
            sqlx::query(SQLITE_SCHEMA)
                .execute(p)
                .await
                .context("creating SQLite schema")?;
        }
        IndexerPool::Postgres(p) => {
            sqlx::query(POSTGRES_SCHEMA)
                .execute(p)
                .await
                .context("creating Postgres schema")?;
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

/// Bulk-insert events. Duplicates by primary key are silently ignored.
pub async fn insert_events(pool: &IndexerPool, events: &[crate::rpc::IndexedEvent]) -> Result<()> {
    if events.is_empty() {
        return Ok(());
    }
    match pool {
        IndexerPool::Sqlite(p) => {
            let mut qb = sqlx::query::QueryBuilder::<sqlx::Sqlite>::new(
                "INSERT OR IGNORE INTO events \
                 (id, ledger, ledger_closed_at, contract_id, event_type, topics, data, tx_hash) ",
            );
            qb.push_values(events, |mut b, e| {
                b.push_bind(&e.id)
                    .push_bind(e.ledger as i64)
                    .push_bind(&e.ledger_closed_at)
                    .push_bind(&e.contract_id)
                    .push_bind(&e.event_type)
                    .push_bind(&e.topics_json)
                    .push_bind(&e.data_json)
                    .push_bind(&e.transaction_hash);
            });
            qb.build()
                .execute(p)
                .await
                .context("inserting events (sqlite)")?;
        }
        IndexerPool::Postgres(p) => {
            let mut qb = sqlx::query::QueryBuilder::<sqlx::Postgres>::new(
                "INSERT INTO events \
                 (id, ledger, ledger_closed_at, contract_id, event_type, topics, data, tx_hash) ",
            );
            qb.push_values(events, |mut b, e| {
                b.push_bind(&e.id)
                    .push_bind(e.ledger as i64)
                    .push_bind(&e.ledger_closed_at)
                    .push_bind(&e.contract_id)
                    .push_bind(&e.event_type)
                    .push_bind(&e.topics_json)
                    .push_bind(&e.data_json)
                    .push_bind(&e.transaction_hash);
            });
            qb.push(" ON CONFLICT (id) DO NOTHING");
            qb.build()
                .execute(p)
                .await
                .context("inserting events (postgres)")?;
        }
    }
    Ok(())
}

/// SQLite schema. `id` is the deterministic composite id from Soroban RPC.
const SQLITE_SCHEMA: &str = include_str!("migrations/0001_init.sqlite.sql");

/// Postgres schema. Adds a synthetic BIGSERIAL PK for index efficiency.
const POSTGRES_SCHEMA: &str = include_str!("migrations/0001_init.postgres.sql");
