//! Soroban Indexer — off-chain event indexer for the Web3 Student Lab.
//!
//! Architecture
//! ------------
//! * **Poller** — Tokio task that repeatedly calls Soroban RPC `getEvents`,
//!   paginating by ledger and persisting events into the database. It also
//!   tracks a `cursor.last_ledger` row so restarts resume cleanly.
//! * **Storage** — `sqlx` pool. SQLite is the default (zero-config) but the
//!   same code path works against Postgres; the choice is driven by the
//!   `DATABASE_URL` scheme.
//! * **Fan-out** — A Tokio `broadcast` channel carries the JSON serialised
//!   event messages to every connected WebSocket subscriber and is also
//!   exposed over a simple HTTP `GET /events` route for back-fill queries.
//!
//! Environment variables (all optional):
//!   PORT             - HTTP/WS port (default 3001)
//!   DATABASE_URL     - SQLite or Postgres URL (default: sqlite://indexer.db?mode=rwc)
//!   SOROBAN_RPC_URL  - Soroban RPC endpoint (default: https://soroban-testnet.stellar.org)
//!   POLL_INTERVAL_MS - Time between successful polls (default 5000)
//!   START_LEDGER     - Override starting ledger cursor (for back-fills / tests)
//!   RUST_LOG         - tracing log filter

mod config;
mod db;
mod rpc;
mod server;

use std::sync::Arc;

use anyhow::{Context, Result};
use tokio::sync::broadcast;
use tracing::{info, warn};

use crate::config::Config;
use crate::db::{init_schema, AppState, IndexerPool};
use crate::rpc::Poller;

#[tokio::main]
async fn main() -> Result<()> {
    // `--healthcheck` is invoked by docker-compose. We open DB, ensure that
    // the schema exists and exit (success / failure). No server is started.
    let mut args = std::env::args().skip(1);
    if args.next().as_deref() == Some("--healthcheck") {
        std::process::exit(healthcheck().await as i32);
    }

    init_tracing();

    let cfg = Config::from_env().context("loading configuration")?;
    info!(
        port = cfg.port,
        rpc = %cfg.soroban_rpc_url,
        db_kind = %cfg.db_kind(),
        "starting soroban-indexer"
    );

    let pool = db::connect(&cfg)
        .await
        .context("connecting to database")?;
    init_schema(&pool).await.context("initialising schema")?;

    let (tx, _rx) = broadcast::channel::<String>(1024);
    let state = Arc::new(AppState {
        pool: pool.clone(),
        tx: tx.clone(),
        cfg: cfg.clone(),
    });

    // Background poller. A panic in the poller must not crash the web server.
    let poller = Poller {
        cfg: cfg.clone(),
        pool: pool.clone(),
        tx: tx.clone(),
    };
    tokio::spawn(async move {
        if let Err(err) = poller.run().await {
            warn!(error = %err, "poller terminated");
        }
    });

    server::serve(cfg, state).await
}

/// One-shot probe used by the docker-compose `healthcheck` directive.
async fn healthcheck() -> i32 {
    let cfg = match Config::from_env() {
        Ok(c) => c,
        Err(err) => {
            eprintln!("healthcheck: bad config: {err}");
            return 1;
        }
    };
    let pool = match db::connect(&cfg).await {
        Ok(p) => p,
        Err(err) => {
            eprintln!("healthcheck: can not connect to DB: {err}");
            return 1;
        }
    };
    if let Err(err) = init_schema(&pool).await {
        eprintln!("healthcheck: schema init failed: {err}");
        return 1;
    }
    match pool_cursor(&pool).await {
        Ok(_) => 0,
        Err(err) => {
            eprintln!("healthcheck: cursor read failed: {err}");
            1
        }
    }
}

async fn pool_cursor(pool: &IndexerPool) -> Result<()> {
    match pool {
        IndexerPool::Sqlite(p) => {
            let _row: Option<(i64,)> =
                sqlx::query_as("SELECT last_ledger FROM indexer_cursor WHERE id = 1")
                    .fetch_optional(p)
                    .await
                    .context("sqlite cursor read")?;
        }
        IndexerPool::Postgres(p) => {
            let _row: Option<(i64,)> =
                sqlx::query_as("SELECT last_ledger FROM indexer_cursor WHERE id = 1")
                    .fetch_optional(p)
                    .await
                    .context("postgres cursor read")?;
        }
    }
    // Touch the imported trait so future schemas can be probed without churn.
    let _ = sqlx::Row::columns;
    Ok(())
}

fn init_tracing() {
    use tracing_subscriber::{fmt, EnvFilter};
    let filter = EnvFilter::try_from_env("RUST_LOG").unwrap_or_else(|_| {
        EnvFilter::new("info,indexer=debug,sqlx=warn,reqwest=warn,hyper=warn")
    });
    let _ = fmt().with_env_filter(filter).try_init();
}
