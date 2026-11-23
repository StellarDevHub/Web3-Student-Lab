//! Ledger-fork detection and rollback.
//!
//! Each ingested ledger is sealed with the hash reported by Soroban RPC.
//! When a later poll returns a different hash for a ledger we already stored,
//! every event at that sequence and after it is deleted and the cursor rewinds
//! so the poller re-indexes the canonical fork. Inserts stay idempotent
//! (`INSERT OR IGNORE` / `ON CONFLICT DO NOTHING`).

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

use crate::db::IndexerPool;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LedgerSeal {
    pub sequence: u32,
    pub hash: String,
}

/// Oldest stored ledger whose hash disagrees with the canonical chain.
/// `None` means the overlap still agrees (no fork).
pub fn detect_fork(stored: &[LedgerSeal], canonical: &[LedgerSeal]) -> Option<u32> {
    let mut canon = std::collections::HashMap::<u32, &str>::new();
    for seal in canonical {
        canon.insert(seal.sequence, seal.hash.as_str());
    }
    let mut fork: Option<u32> = None;
    for seal in stored {
        if let Some(hash) = canon.get(&seal.sequence) {
            if *hash != seal.hash.as_str() {
                fork = Some(fork.map(|prev| prev.min(seal.sequence)).unwrap_or(seal.sequence));
            }
        }
    }
    fork
}

pub async fn upsert_seals(pool: &IndexerPool, seals: &[LedgerSeal]) -> Result<()> {
    if seals.is_empty() {
        return Ok(());
    }
    match pool {
        IndexerPool::Sqlite(p) => {
            for seal in seals {
                sqlx::query(
                    "INSERT INTO ledger_seals (ledger, hash) VALUES (?1, ?2)
                     ON CONFLICT(ledger) DO UPDATE SET hash = excluded.hash",
                )
                .bind(seal.sequence as i64)
                .bind(&seal.hash)
                .execute(p)
                .await
                .context("upsert sqlite seal")?;
            }
        }
        IndexerPool::Postgres(p) => {
            for seal in seals {
                sqlx::query(
                    "INSERT INTO ledger_seals (ledger, hash) VALUES ($1, $2)
                     ON CONFLICT (ledger) DO UPDATE SET hash = EXCLUDED.hash",
                )
                .bind(seal.sequence as i64)
                .bind(&seal.hash)
                .execute(p)
                .await
                .context("upsert postgres seal")?;
            }
        }
    }
    Ok(())
}

pub async fn list_seals(pool: &IndexerPool, start: u32, end: u32) -> Result<Vec<LedgerSeal>> {
    match pool {
        IndexerPool::Sqlite(p) => {
            let rows: Vec<(i64, String)> = sqlx::query_as(
                "SELECT ledger, hash FROM ledger_seals WHERE ledger >= ?1 AND ledger <= ?2 ORDER BY ledger ASC",
            )
            .bind(start as i64)
            .bind(end as i64)
            .fetch_all(p)
            .await
            .context("list sqlite seals")?;
            Ok(rows
                .into_iter()
                .map(|(ledger, hash)| LedgerSeal {
                    sequence: ledger as u32,
                    hash,
                })
                .collect())
        }
        IndexerPool::Postgres(p) => {
            let rows: Vec<(i64, String)> = sqlx::query_as(
                "SELECT ledger, hash FROM ledger_seals WHERE ledger >= $1 AND ledger <= $2 ORDER BY ledger ASC",
            )
            .bind(start as i64)
            .bind(end as i64)
            .fetch_all(p)
            .await
            .context("list postgres seals")?;
            Ok(rows
                .into_iter()
                .map(|(ledger, hash)| LedgerSeal {
                    sequence: ledger as u32,
                    hash,
                })
                .collect())
        }
    }
}

/// Delete events and seals at `fork_ledger` and later, then rewind the cursor
/// to the last still-valid ledger.
pub async fn rollback_from(pool: &IndexerPool, fork_ledger: u32) -> Result<u64> {
    let rewind = fork_ledger.saturating_sub(1) as i64;
    match pool {
        IndexerPool::Sqlite(p) => {
            let mut tx = p.begin().await.context("begin sqlite rollback")?;
            let deleted = sqlx::query("DELETE FROM events WHERE ledger >= ?1")
                .bind(fork_ledger as i64)
                .execute(&mut *tx)
                .await
                .context("delete sqlite events")?
                .rows_affected();
            sqlx::query("DELETE FROM ledger_seals WHERE ledger >= ?1")
                .bind(fork_ledger as i64)
                .execute(&mut *tx)
                .await
                .context("delete sqlite seals")?;
            sqlx::query(
                "INSERT INTO indexer_cursor (id, last_ledger) VALUES (1, ?1)
                 ON CONFLICT(id) DO UPDATE SET last_ledger = excluded.last_ledger",
            )
            .bind(rewind)
            .execute(&mut *tx)
            .await
            .context("rewind sqlite cursor")?;
            tx.commit().await.context("commit sqlite rollback")?;
            Ok(deleted)
        }
        IndexerPool::Postgres(p) => {
            let mut tx = p.begin().await.context("begin postgres rollback")?;
            let deleted = sqlx::query("DELETE FROM events WHERE ledger >= $1")
                .bind(fork_ledger as i64)
                .execute(&mut *tx)
                .await
                .context("delete postgres events")?
                .rows_affected();
            sqlx::query("DELETE FROM ledger_seals WHERE ledger >= $1")
                .bind(fork_ledger as i64)
                .execute(&mut *tx)
                .await
                .context("delete postgres seals")?;
            sqlx::query(
                "INSERT INTO indexer_cursor (id, last_ledger) VALUES (1, $1)
                 ON CONFLICT (id) DO UPDATE SET last_ledger = EXCLUDED.last_ledger",
            )
            .bind(rewind)
            .execute(&mut *tx)
            .await
            .context("rewind postgres cursor")?;
            tx.commit().await.context("commit postgres rollback")?;
            Ok(deleted)
        }
    }
}

#[allow(dead_code)]
pub async fn list_events_in_range(
    pool: &IndexerPool,
    start: u32,
    end: u32,
) -> Result<Vec<(String, u32)>> {
    match pool {
        IndexerPool::Sqlite(p) => {
            let rows: Vec<(String, i64)> = sqlx::query_as(
                "SELECT id, ledger FROM events WHERE ledger >= ?1 AND ledger <= ?2 ORDER BY ledger ASC, id ASC",
            )
            .bind(start as i64)
            .bind(end as i64)
            .fetch_all(p)
            .await
            .context("range sqlite events")?;
            Ok(rows.into_iter().map(|(id, ledger)| (id, ledger as u32)).collect())
        }
        IndexerPool::Postgres(p) => {
            let rows: Vec<(String, i64)> = sqlx::query_as(
                "SELECT id, ledger FROM events WHERE ledger >= $1 AND ledger <= $2 ORDER BY ledger ASC, id ASC",
            )
            .bind(start as i64)
            .bind(end as i64)
            .fetch_all(p)
            .await
            .context("range postgres events")?;
            Ok(rows.into_iter().map(|(id, ledger)| (id, ledger as u32)).collect())
        }
    }
}

/// Compare stored seals to the canonical window. On disagreement, roll back
/// and return the fork ledger so the poller can re-index.
pub async fn reconcile_fork(pool: &IndexerPool, canonical: &[LedgerSeal]) -> Result<Option<u32>> {
    if canonical.is_empty() {
        return Ok(None);
    }
    let start = canonical.iter().map(|s| s.sequence).min().unwrap_or(0);
    let end = canonical.iter().map(|s| s.sequence).max().unwrap_or(0);
    let stored = list_seals(pool, start, end).await?;
    match detect_fork(&stored, canonical) {
        Some(fork) => {
            rollback_from(pool, fork).await?;
            Ok(Some(fork))
        }
        None => Ok(None),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{init_schema, insert_events, IndexerPool};
    use crate::rpc::IndexedEvent;

    fn event(id: &str, ledger: u32) -> IndexedEvent {
        IndexedEvent {
            id: id.to_string(),
            ledger,
            ledger_closed_at: "2026-01-01T00:00:00Z".into(),
            contract_id: "C".into(),
            event_type: "contract".into(),
            topics_json: "[]".into(),
            data_json: "{}".into(),
            transaction_hash: format!("tx-{id}"),
        }
    }

    #[test]
    fn detects_a_three_ledger_fork_at_the_oldest_mismatch() {
        let stored = vec![
            LedgerSeal { sequence: 10, hash: "a".into() },
            LedgerSeal { sequence: 11, hash: "b".into() },
            LedgerSeal { sequence: 12, hash: "c".into() },
            LedgerSeal { sequence: 13, hash: "d".into() },
        ];
        let canonical = vec![
            LedgerSeal { sequence: 10, hash: "a".into() },
            LedgerSeal { sequence: 11, hash: "b2".into() },
            LedgerSeal { sequence: 12, hash: "c2".into() },
            LedgerSeal { sequence: 13, hash: "d2".into() },
        ];
        assert_eq!(detect_fork(&stored, &canonical), Some(11));
        assert_eq!(detect_fork(&stored, &stored), None);
    }

    #[tokio::test]
    async fn three_ledger_fork_rolls_back_and_reindexes_without_duplicates() {
        let pool = IndexerPool::Sqlite(
            sqlx::sqlite::SqlitePoolOptions::new()
                .connect("sqlite::memory:")
                .await
                .unwrap(),
        );
        init_schema(&pool).await.unwrap();

        let original = vec![
            event("e10", 10),
            event("e11", 11),
            event("e12", 12),
            event("e13", 13),
        ];
        insert_events(&pool, &original).await.unwrap();
        upsert_seals(
            &pool,
            &[
                LedgerSeal { sequence: 10, hash: "h10".into() },
                LedgerSeal { sequence: 11, hash: "h11".into() },
                LedgerSeal { sequence: 12, hash: "h12".into() },
                LedgerSeal { sequence: 13, hash: "h13".into() },
            ],
        )
        .await
        .unwrap();
        crate::db::update_last_ledger(&pool, 13).await.unwrap();

        let fork = reconcile_fork(
            &pool,
            &[
                LedgerSeal { sequence: 10, hash: "h10".into() },
                LedgerSeal { sequence: 11, hash: "fork11".into() },
                LedgerSeal { sequence: 12, hash: "fork12".into() },
                LedgerSeal { sequence: 13, hash: "fork13".into() },
            ],
        )
        .await
        .unwrap();
        assert_eq!(fork, Some(11));

        let remaining = list_events_in_range(&pool, 1, 100).await.unwrap();
        assert_eq!(remaining, vec![("e10".into(), 10)]);
        assert_eq!(crate::db::get_last_ledger(&pool).await.unwrap(), 10);

        let replay = vec![event("e11", 11), event("e12", 12), event("e13b", 13)];
        insert_events(&pool, &replay).await.unwrap();
        insert_events(&pool, &replay).await.unwrap();
        upsert_seals(
            &pool,
            &[
                LedgerSeal { sequence: 11, hash: "fork11".into() },
                LedgerSeal { sequence: 12, hash: "fork12".into() },
                LedgerSeal { sequence: 13, hash: "fork13".into() },
            ],
        )
        .await
        .unwrap();

        let after = list_events_in_range(&pool, 10, 13).await.unwrap();
        assert_eq!(
            after,
            vec![
                ("e10".into(), 10),
                ("e11".into(), 11),
                ("e12".into(), 12),
                ("e13b".into(), 13),
            ]
        );
    }
}
