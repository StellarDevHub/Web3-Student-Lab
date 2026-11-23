//! Runtime configuration loaded from environment variables.

use std::env;
use std::time::Duration;

use anyhow::{anyhow, Result};

#[derive(Debug, Clone)]
pub struct Config {
    pub port: u16,
    pub database_url: String,
    pub soroban_rpc_url: String,
    pub poll_interval: Duration,
    pub batch_size: u32,
    pub start_ledger_override: Option<u32>,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        let port = env::var("PORT")
            .unwrap_or_else(|_| "3001".into())
            .parse()
            .map_err(|e| anyhow!("invalid PORT: {e}"))?;

        let database_url = env::var("DATABASE_URL")
            .unwrap_or_else(|_| default_sqlite_url());

        let soroban_rpc_url = env::var("SOROBAN_RPC_URL")
            .unwrap_or_else(|_| "https://soroban-testnet.stellar.org".into());

        let poll_interval = Duration::from_millis(
            env::var("POLL_INTERVAL_MS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(5_000),
        );

        let batch_size: u32 = env::var("BATCH_SIZE")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(100);
        if batch_size == 0 || batch_size > 10_000 {
            return Err(anyhow!("BATCH_SIZE must be in 1..=10000"));
        }

        let start_ledger_override = match env::var("START_LEDGER") {
            Ok(v) => Some(v.parse().map_err(|e| anyhow!("invalid START_LEDGER: {e}"))?),
            Err(_) => None,
        };

        Ok(Self {
            port,
            database_url,
            soroban_rpc_url,
            poll_interval,
            batch_size,
            start_ledger_override,
        })
    }

    /// Human-friendly backend name used by the schema initialiser to decide
    /// which DDL script to apply.
    pub fn db_kind(&self) -> DbKind {
        if self.database_url.starts_with("postgres://")
            || self.database_url.starts_with("postgresql://")
        {
            DbKind::Postgres
        } else {
            DbKind::Sqlite
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DbKind {
    Sqlite,
    Postgres,
}

impl std::fmt::Display for DbKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DbKind::Sqlite => write!(f, "sqlite"),
            DbKind::Postgres => write!(f, "postgres"),
        }
    }
}

fn default_sqlite_url() -> String {
    match env::var("INDEXER_DATA_DIR") {
        Ok(dir) => format!("sqlite://{dir}/indexer.db?mode=rwc"),
        Err(_) => "sqlite://indexer.db?mode=rwc".into(),
    }
}
