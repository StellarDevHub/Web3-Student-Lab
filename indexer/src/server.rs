//! HTTP and WebSocket server (axum).
//!
//! Routes:
//!   GET /            – service banner
//!   GET /health      – 200 OK + JSON { status, db_kind, rpc_url }
//!   GET /events      – last N events from the DB (optional `contractId`,
//!                      `eventType`, `fromLedger`, `limit` query params)
//!   GET /ws          – WebSocket fan-out. Every connected client receives
//!                      every newly indexed event as a text frame.
//!   GET /v1/sse      – equivalent to /ws but over Server-Sent Events so
//!                      a plain `curl` or browser fetch works.

use std::net::SocketAddr;

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Router;
use futures::stream::Stream;
use serde::Deserialize;
use serde_json::json;
use sqlx::Row;
use tracing::{info, warn};

use crate::config::Config;
use crate::db::SharedState;

pub async fn serve(cfg: Config, state: crate::db::SharedState) -> anyhow::Result<()> {
    let router = build_router(state.clone());

    let addr: SocketAddr = format!("0.0.0.0:{}", cfg.port).parse()?;
    let listener = tokio::net::TcpListener::bind(addr).await?;
    info!(%addr, "HTTP/WS server listening");
    axum::serve(listener, router)
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}

fn build_router(state: SharedState) -> Router {
    Router::new()
        .route("/", get(root))
        .route("/health", get(health))
        .route("/events", get(list_events))
        .route("/v1/sse", get(sse_handler))
        .route("/ws", get(ws_handler))
        .with_state(state)
}

async fn root() -> &'static str {
    "soroban-indexer — see /health, /events, /ws, /v1/sse"
}

#[derive(serde::Serialize)]
struct HealthBody {
    status: &'static str,
    db_kind: String,
    rpc_url: String,
    port: u16,
}

async fn health(State(state): State<SharedState>) -> Response {
    let body = HealthBody {
        status: "ok",
        db_kind: state.cfg.db_kind().to_string(),
        rpc_url: state.cfg.soroban_rpc_url.clone(),
        port: state.cfg.port,
    };
    // Best-effort RPC ping so the response doubles as a synthetic monitor.
    let client = crate::rpc::RpcClient::new(state.cfg.soroban_rpc_url.clone());
    let rpc_status = match tokio::time::timeout(
        std::time::Duration::from_secs(3),
        client.ping(),
    )
    .await
    {
        Ok(Ok(_)) => "reachable".to_string(),
        Ok(Err(err)) => format!("error: {err}"),
        Err(_) => "timeout".to_string(),
    };

    (
        StatusCode::OK,
        axum::Json(json!({
            "status": body.status,
            "db_kind": body.db_kind,
            "rpc_url": body.rpc_url,
            "port": body.port,
            "rpc_status": rpc_status,
        })),
    )
        .into_response()
}

#[derive(Debug, Deserialize)]
pub struct ListEventsQuery {
    #[serde(default)]
    pub contract_id: Option<String>,
    #[serde(default)]
    pub event_type: Option<String>,
    #[serde(default)]
    pub from_ledger: Option<u32>,
    #[serde(default)]
    pub limit: Option<u32>,
}

async fn list_events(
    State(state): State<SharedState>,
    Query(q): Query<ListEventsQuery>,
) -> Response {
    let limit = q.limit.unwrap_or(50).min(500) as i64;
    let from_ledger = q.from_ledger.map(|n| n as i64).unwrap_or(0);

    let rows = match query_events(&state.pool, &q, limit, from_ledger).await {
        Ok(r) => r,
        Err(err) => {
            warn!(error = %err, "list_events failed");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                axum::Json(json!({ "error": err.to_string() })),
            )
                .into_response();
        }
    };

    match axum::Json(&rows).into_response() {
        // direct path; never fails for valid JSON
        ok => ok,
    }
}

#[derive(Debug, serde::Serialize)]
pub struct EventRow {
    pub id: String,
    pub ledger: i64,
    pub ledger_closed_at: String,
    pub contract_id: String,
    pub event_type: String,
    pub topics: String,
    pub data: String,
    pub tx_hash: String,
    pub ingested_at: String,
}

async fn query_events(
    pool: &crate::db::IndexerPool,
    q: &ListEventsQuery,
    limit: i64,
    from_ledger: i64,
) -> anyhow::Result<Vec<EventRow>> {
    match pool {
        crate::db::IndexerPool::Sqlite(p) => {
            let mut sql = String::from(
                "SELECT id, ledger, ledger_closed_at, contract_id, event_type, topics, data, tx_hash, ingested_at \
                 FROM events WHERE ledger >= ?",
            );
            let mut idx = 1;
            if q.contract_id.is_some() {
                sql.push_str(&format!(" AND contract_id = ?"));
                idx += 1;
            }
            if q.event_type.is_some() {
                sql.push_str(&format!(" AND event_type = ?"));
                idx += 1;
            }
            sql.push_str(" ORDER BY ledger DESC LIMIT ?");

            let mut query = sqlx::query_as::<_, EventRow>(&sql).bind(from_ledger);
            if let Some(c) = &q.contract_id {
                query = query.bind(c);
            }
            if let Some(t) = &q.event_type {
                query = query.bind(t);
            }
            query = query.bind(limit);
            Ok(query.fetch_all(p).await?)
        }
        crate::db::IndexerPool::Postgres(p) => {
            // QueryBuilder so we never have to hand-count `$1, $2, $3 …` placeholders.
            // Render `ingested_at` in UTC ISO-8601 so the FromRow String decode
            // works on every host timezone.
            let mut qb = sqlx::query_builder::QueryBuilder::<sqlx::Postgres>::new(
                "SELECT id, ledger, ledger_closed_at, contract_id, event_type, topics, data, tx_hash, \
                 to_char(ingested_at AT TIME ZONE 'UTC', \
                         'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') AS ingested_at \
                 FROM events WHERE ledger >= ",
            );
            qb.push_bind(from_ledger);
            if let Some(c) = &q.contract_id {
                qb.push(" AND contract_id = ").push_bind(c.clone());
            }
            if let Some(t) = &q.event_type {
                qb.push(" AND event_type = ").push_bind(t.clone());
            }
            qb.push(" ORDER BY ledger DESC LIMIT ").push_bind(limit);

            let query = qb.build_query_as::<EventRow>();
            Ok(query.fetch_all(p).await?)
        }
    }
}

// Implement FromRow for both backends. Both schemas store `ingested_at` as
// TEXT in our migrations (RFC3339 / ISO8601), so the String decode works
// uniformly on every driver.
impl sqlx::FromRow<'_, sqlx::sqlite::SqliteRow> for EventRow {
    fn from_row(row: &sqlx::sqlite::SqliteRow) -> Result<Self, sqlx::Error> {
        Ok(Self {
            id: row.try_get("id")?,
            ledger: row.try_get("ledger")?,
            ledger_closed_at: row.try_get("ledger_closed_at")?,
            contract_id: row.try_get("contract_id")?,
            event_type: row.try_get("event_type")?,
            topics: row.try_get("topics")?,
            data: row.try_get("data")?,
            tx_hash: row.try_get("tx_hash")?,
            ingested_at: row.try_get("ingested_at")?,
        })
    }
}

impl sqlx::FromRow<'_, sqlx::postgres::PgRow> for EventRow {
    fn from_row(row: &sqlx::postgres::PgRow) -> Result<Self, sqlx::Error> {
        Ok(Self {
            id: row.try_get("id")?,
            ledger: row.try_get("ledger")?,
            ledger_closed_at: row.try_get("ledger_closed_at")?,
            contract_id: row.try_get("contract_id")?,
            event_type: row.try_get("event_type")?,
            topics: row.try_get("topics")?,
            data: row.try_get("data")?,
            tx_hash: row.try_get("tx_hash")?,
            // Postgres TIMESTAMPTZ is rendered into TEXT by the query layer via
            // the `AT TIME ZONE 'UTC'` projection in the SELECT.
            ingested_at: row.try_get("ingested_at")?,
        })
    }
}

// -- WebSocket / SSE ---------------------------------------------------------

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<SharedState>,
) -> impl IntoResponse {
    let rx = state.tx.subscribe();
    ws.on_upgrade(move |socket| handle_ws(socket, rx))
}

async fn handle_ws(mut socket: WebSocket, mut rx: tokio::sync::broadcast::Receiver<String>) {
    use axum::extract::ws::close_code::NORMAL;
    if let Ok(hello) = serde_json::to_string(&json!({
        "type": "hello",
        "service": "soroban-indexer",
    })) {
        if socket.send(Message::Text(hello)).await.is_err() {
            return;
        }
    }
    loop {
        tokio::select! {
            biased;
            inbound = socket.recv() => {
                match inbound {
                    Some(Ok(Message::Ping(p))) => {
                        if socket.send(Message::Pong(p)).await.is_err() {
                            break;
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => {
                        // Echo a Close frame so the peer sees a clean shutdown
                        // instead of a TCP reset, then exit.
                        let _ = socket
                            .send(Message::Close(Some(axum::extract::ws::CloseFrame {
                                code: NORMAL,
                                reason: "bye".into(),
                            })))
                            .await;
                        break;
                    }
                    Some(Err(_)) => break,
                    // Ignore text/binary frames from clients — this socket is push-only.
                    _ => {}
                }
            }
            outbound = rx.recv() => {
                let payload = match outbound {
                    Ok(msg) => msg,
                    // Lagged subscriber: skip missed events and keep streaming.
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(skipped)) => {
                        warn!(skipped, "ws subscriber lagged");
                        continue;
                    }
                    Err(_) => {
                        let _ = socket
                            .send(Message::Close(Some(axum::extract::ws::CloseFrame {
                                code: NORMAL,
                                reason: "server closing".into(),
                            })))
                            .await;
                        break;
                    }
                };
                if socket.send(Message::Text(payload)).await.is_err() {
                    break;
                }
            }
        }
    }
}

async fn sse_handler(
    State(state): State<SharedState>,
) -> Sse<impl Stream<Item = std::result::Result<Event, axum::Error>>> {
    let rx = state.tx.subscribe();
    let stream = async_stream::stream! {
        yield Ok::<_, axum::Error>(Event::default().data(
            serde_json::to_string(&json!({
                "type": "hello",
                "service": "soroban-indexer",
            })).unwrap_or_else(|_| "{}".into()),
        ));
        let mut rx = rx;
        loop {
            match rx.recv().await {
                Ok(msg) => yield Ok(Event::default().data(msg)),
                Err(tokio::sync::broadcast::error::RecvError::Lagged(skipped)) => {
                    warn!(skipped, "sse subscriber lagged");
                    yield Ok(Event::default().data(
                        serde_json::to_string(&json!({"type":"lagged","skipped":skipped}))
                            .unwrap_or_default(),
                    ));
                }
                Err(_) => break,
            }
        }
    };
    Sse::new(stream).keep_alive(KeepAlive::default())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    #[cfg(unix)]
    let terminate = async {
        if let Ok(mut sig) =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        {
            sig.recv().await;
        }
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}
