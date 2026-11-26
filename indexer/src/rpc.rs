//! Soroban RPC client + background poller.
//!
//! Talks plain JSON-RPC over HTTP (no `soroban-sdk` runtime dependency — only
//! public RPC data is needed). See the Soroban RPC spec at
//! <https://soroban.stellar.org/docs/rpc>.

use std::collections::HashSet;
use std::time::Duration;

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;
use tokio::time::sleep;
use tracing::{debug, error, info, warn};

use crate::config::Config;
use crate::db::{get_last_ledger, persist_batch, IndexerPool};
use crate::reorg::{reconcile_fork, LedgerSeal};

/// A row persisted in the events table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexedEvent {
    pub id: String,
    pub ledger: u32,
    pub ledger_closed_at: String,
    pub contract_id: String,
    pub event_type: String,
    pub topics_json: String,
    pub data_json: String,
    pub transaction_hash: String,
}

/// Minimal Soroban RPC client.
#[derive(Clone)]
pub struct RpcClient {
    endpoint: String,
    http: reqwest::Client,
}

impl RpcClient {
    pub fn new(endpoint: impl Into<String>) -> Self {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .user_agent(concat!("soroban-indexer/", env!("CARGO_PKG_VERSION")))
            .build()
            .expect("reqwest client builds");
        Self {
            endpoint: endpoint.into(),
            http,
        }
    }

    /// Health probe used by `/health` and `--smoke-test`.
    pub async fn ping(&self) -> Result<u32> {
        self.get_latest_ledger().await
    }

    pub async fn get_latest_ledger(&self) -> Result<u32> {
        let resp: RpcResponse<LedgerSeqResult> = self
            .post("getLatestLedger", serde_json::json!({}))
            .await
            .context("getLatestLedger")?;
        Ok(resp.result.sequence)
    }

    pub async fn get_events(
        &self,
        start_ledger: u32,
        end_ledger: Option<u32>,
        pagination_limit: u32,
    ) -> Result<Vec<RawEvent>> {
        let request_limit = pagination_limit.clamp(1, 1_000);
        let mut events = Vec::new();
        let mut seen_ids = HashSet::new();
        let mut seen_cursors = HashSet::new();
        let mut cursor: Option<String> = None;

        loop {
            let mut params = serde_json::json!({
                "startLedger": start_ledger,
                "pagination": { "limit": request_limit },
            });
            if let Some(end) = end_ledger {
                params["endLedger"] = serde_json::Value::from(end);
            }
            if let Some(cursor) = &cursor {
                params["pagination"]["cursor"] = serde_json::Value::from(cursor.clone());
            }

            let resp: RpcResponse<GetEventsResult> = self
                .post("getEvents", params)
                .await
                .context("getEvents")?;
            let page = resp.result.events;
            if page.is_empty() {
                break;
            }

            let page_len = page.len();
            let next_cursor = page
                .last()
                .map(|event| event.id.clone())
                .ok_or_else(|| anyhow!("getEvents returned a non-empty page without an event id"))?;
            if !seen_cursors.insert(next_cursor.clone()) {
                return Err(anyhow!("getEvents pagination cursor did not advance"));
            }
            for event in page {
                if seen_ids.insert(event.id.clone()) {
                    events.push(event);
                }
            }
            if page_len < request_limit as usize {
                break;
            }
            cursor = Some(next_cursor);
        }

        Ok(events)
    }

    /// Ledger hashes for `[start, end]`. Used to detect forks before commit.
    pub async fn get_ledger_seals(&self, start: u32, end: u32) -> Result<Vec<LedgerSeal>> {
        if end < start {
            return Ok(Vec::new());
        }
        const MAX_LEDGERS_PER_REQUEST: u32 = 200;
        let mut seals = Vec::new();
        let mut chunk_start = start;

        while chunk_start <= end {
            let chunk_end = chunk_start
                .saturating_add(MAX_LEDGERS_PER_REQUEST - 1)
                .min(end);
            let limit = chunk_end - chunk_start + 1;
            let resp: RpcResponse<GetLedgersResult> = self
                .post(
                    "getLedgers",
                    serde_json::json!({
                        "startLedger": chunk_start,
                        "pagination": { "limit": limit },
                    }),
                )
                .await
                .context("getLedgers")?;
            let mut ledgers = resp.result.ledgers;
            ledgers.sort_by_key(|ledger| ledger.sequence);
            if ledgers.len() != limit as usize {
                return Err(anyhow!(
                    "getLedgers returned {} records for requested range {}..={}",
                    ledgers.len(),
                    chunk_start,
                    chunk_end
                ));
            }
            for (offset, ledger) in ledgers.into_iter().enumerate() {
                let expected_sequence = chunk_start + offset as u32;
                if ledger.sequence != expected_sequence {
                    return Err(anyhow!(
                        "getLedgers returned ledger {}, expected {}",
                        ledger.sequence,
                        expected_sequence
                    ));
                }
                seals.push(LedgerSeal {
                    sequence: ledger.sequence,
                    hash: ledger.hash,
                });
            }
            if chunk_end == end {
                break;
            }
            chunk_start = chunk_end + 1;
        }

        Ok(seals)
    }

    async fn post<P: Serialize, R: for<'de> Deserialize<'de>>(
        &self,
        method: &str,
        params: P,
    ) -> Result<RpcResponse<R>> {
        let body = serde_json::json!({
            "jsonrpc": "2.0",
            "id": "soroban-indexer",
            "method": method,
            "params": params,
        });
        let res = self
            .http
            .post(&self.endpoint)
            .json(&body)
            .send()
            .await
            .with_context(|| format!("posting {method} to {}", self.endpoint))?;
        let status = res.status();
        if !status.is_success() {
            let text = res.text().await.unwrap_or_default();
            return Err(anyhow!("{method} HTTP {status}: {text}"));
        }
        let parsed: serde_json::Value = res.json().await.context("decoding RPC body")?;
        if let Some(err) = parsed.get("error") {
            return Err(anyhow!("{method} RPC error: {err}"));
        }
        serde_json::from_value(parsed).context("decoding RPC response")
    }
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct RpcResponse<T> {
    jsonrpc: String,
    id: String,
    result: T,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct LedgerSeqResult {
    sequence: u32,
    #[serde(rename = "latestLedgerCloseTime")]
    latest_ledger_close_time: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GetLedgersResult {
    ledgers: Vec<LedgerHeader>,
}

#[derive(Debug, Deserialize)]
struct LedgerHeader {
    sequence: u32,
    hash: String,
}

#[derive(Debug, Deserialize)]
struct GetEventsResult {
    events: Vec<RawEvent>,
    #[serde(rename = "latestLedger")]
    #[allow(dead_code)]
    latest_ledger: Option<u32>,
}

/// Mirrors the Soroban RPC `EventResponse` shape. We keep fields as either
/// strongly-typed primitives or raw JSON because the indexer does not interpret
/// the XDR-decoded payload — downstream consumers do.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawEvent {
    #[serde(rename = "id")]
    pub id: String,
    #[serde(rename = "ledger")]
    pub ledger: u32,
    #[serde(rename = "ledgerClosedAt")]
    pub ledger_closed_at: String,
    #[serde(rename = "contractId")]
    pub contract_id: String,
    #[serde(rename = "type")]
    pub event_type: String,
    #[serde(default)]
    pub topic: Vec<serde_json::Value>,
    pub value: serde_json::Value,
    #[serde(rename = "transactionHash")]
    pub transaction_hash: String,
}

impl RawEvent {
    pub fn into_indexed(self) -> IndexedEvent {
        IndexedEvent {
            id: self.id,
            ledger: self.ledger,
            ledger_closed_at: self.ledger_closed_at,
            contract_id: self.contract_id,
            event_type: self.event_type,
            topics_json: serde_json::to_string(&self.topic).unwrap_or_default(),
            data_json: serde_json::to_string(&self.value).unwrap_or_default(),
            transaction_hash: self.transaction_hash,
        }
    }
}

/// Background poller that owns the event ingestion loop.
pub struct Poller {
    pub cfg: Config,
    pub pool: IndexerPool,
    pub tx: broadcast::Sender<String>,
}

impl Poller {
    pub async fn run(self) -> Result<()> {
        let client = RpcClient::new(self.cfg.soroban_rpc_url.clone());
        let mut backoff = Duration::from_secs(2);
        let max_backoff = Duration::from_secs(60);
        let mut start_override_active = self.cfg.start_ledger_override.is_some();

        loop {
            let result = self.poll_once(&client, start_override_active).await;
            if matches!(
                &result,
                Ok(PollStep::Advanced { .. })
                    | Ok(PollStep::Replayed { .. })
                    | Ok(PollStep::Reorganized { .. })
            ) {
                start_override_active = false;
            }
            match result {
                Ok(PollStep::Advanced { processed, next }) => {
                    if processed > 0 {
                        info!(processed, next_ledger = next, "indexer advanced");
                    } else {
                        debug!(next_ledger = next, "indexer caught up");
                    }
                    backoff = Duration::from_secs(2);
                    sleep(self.cfg.poll_interval).await;
                }
                Ok(PollStep::Idle { next }) => {
                    debug!(next_ledger = next, "no new ledgers");
                    sleep(self.cfg.poll_interval).await;
                }
                Ok(PollStep::Reorganized { fork_ledger }) => {
                    warn!(fork_ledger, "ledger fork detected; rolled back invalidated events");
                    backoff = Duration::from_secs(2);
                    sleep(Duration::from_millis(200)).await;
                }
                Ok(PollStep::Replayed { advanced }) => {
                    info!(
                        advanced,
                        "replayed gap from START_LEDGER override; advancing cursor forward"
                    );
                    sleep(self.cfg.poll_interval).await;
                }
                Err(err) => {
                    error!(error = %err, backoff_secs = backoff.as_secs(), "poll failed");
                    sleep(backoff).await;
                    backoff = (backoff * 2).min(max_backoff);
                }
            }
        }
    }

    async fn poll_once(
        &self,
        client: &RpcClient,
        use_start_override: bool,
    ) -> Result<PollStep> {
        let cursor = match (self.cfg.start_ledger_override, use_start_override) {
            (Some(forced), true) => Cursor {
                last_ledger: forced.saturating_sub(1),
                override_active: true,
            },
            _ => {
                let last = get_last_ledger(&self.pool).await.context("reading cursor")?;
                Cursor {
                    last_ledger: last,
                    override_active: false,
                }
            }
        };

        let latest = client
            .get_latest_ledger()
            .await
            .context("fetching latest ledger")?;

        let end = cursor
            .last_ledger
            .saturating_add(self.cfg.batch_size)
            .min(latest);
        let window_start = cursor.last_ledger.saturating_sub(3).max(1);
        let seals = if window_start <= end {
            let seals = client
                .get_ledger_seals(window_start, end)
                .await
                .context("fetching ledger hashes")?;
            if let Some(fork_ledger) = reconcile_fork(&self.pool, &seals)
                .await
                .context("reconciling ledger fork")?
            {
                return Ok(PollStep::Reorganized { fork_ledger });
            }
            seals
        } else {
            Vec::new()
        };

        let next_ledger = cursor.last_ledger.saturating_add(1);
        if next_ledger > latest {
            return Ok(PollStep::Idle {
                next: latest.saturating_add(1),
            });
        }

        let raw_events = client
            .get_events(next_ledger, Some(end), self.cfg.batch_size)
            .await
            .context("fetching events")?;

        let indexed: Vec<IndexedEvent> = raw_events.into_iter().map(|e| e.into_indexed()).collect();
        let inserted = persist_batch(&self.pool, &indexed, &seals, end)
            .await
            .context("persisting events, seals, and cursor")?;
        for event in &inserted {
            match serde_json::to_string(event) {
                Ok(json) => {
                    // A send only errors when there are zero subscribers;
                    // intentionally ignored to keep the poller hot.
                    let _ = self.tx.send(json);
                }
                Err(err) => warn!(error = %err, "failed to serialise event for fan-out"),
            }
        }
        let processed = inserted.len();

        if cursor.override_active {
            Ok(PollStep::Replayed {
                advanced: processed,
            })
        } else {
            Ok(PollStep::Advanced {
                processed,
                next: end.saturating_add(1),
            })
        }
    }
}

enum PollStep {
    Advanced { processed: usize, next: u32 },
    Idle { next: u32 },
    Replayed { advanced: usize },
    Reorganized { fork_ledger: u32 },
}

struct Cursor {
    last_ledger: u32,
    override_active: bool,
}
