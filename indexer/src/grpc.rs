//! Internal mTLS gRPC server for `soroban-indexer` (BE-093).
//!
//! Enforces mutual TLS (bidirectional certificate verification) at the TLS
//! transport layer using `tonic::transport::ServerTlsConfig::client_ca_root`.

use std::net::SocketAddr;
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{anyhow, Context, Result};
use tonic::transport::{Certificate, Identity, Server, ServerTlsConfig};
use tonic::{Request, Response, Status};
use tracing::info;

use crate::config::Config;
use crate::db::{get_last_ledger, IndexerPool, SharedState};

pub mod pb {
    tonic::include_proto!("internal.v1");
}

use pb::indexer_service_server::{IndexerService, IndexerServiceServer};
use pb::{
    GetCursorRequest, GetCursorResponse, GetEventsRequest, GetEventsResponse, HealthCheckRequest,
    HealthCheckResponse, IndexedEvent,
};

pub struct IndexerGrpcService {
    state: SharedState,
}

impl IndexerGrpcService {
    pub fn new(state: SharedState) -> Self {
        Self { state }
    }
}

#[tonic::async_trait]
impl IndexerService for IndexerGrpcService {
    async fn get_events(
        &self,
        request: Request<GetEventsRequest>,
    ) -> Result<Response<GetEventsResponse>, Status> {
        let req = request.into_inner();
        let limit = if req.limit == 0 {
            100_i64
        } else {
            (req.limit.min(1000)) as i64
        };
        let from_ledger = req.from_ledger as i64;
        let contract_filter = req.contract_id;

        let rows: Vec<(String, i64, String, String, String, String, String)> =
            match &self.state.pool {
                IndexerPool::Sqlite(pool) => {
                    if contract_filter.is_empty() {
                        sqlx::query_as(
                            "SELECT id, ledger, ledger_closed_at, contract_id, topic, value, tx_hash \
                             FROM indexed_events \
                             WHERE ledger >= ?1 \
                             ORDER BY ledger ASC \
                             LIMIT ?2",
                        )
                        .bind(from_ledger)
                        .bind(limit)
                        .fetch_all(pool)
                        .await
                    } else {
                        sqlx::query_as(
                            "SELECT id, ledger, ledger_closed_at, contract_id, topic, value, tx_hash \
                             FROM indexed_events \
                             WHERE contract_id = ?1 AND ledger >= ?2 \
                             ORDER BY ledger ASC \
                             LIMIT ?3",
                        )
                        .bind(&contract_filter)
                        .bind(from_ledger)
                        .bind(limit)
                        .fetch_all(pool)
                        .await
                    }
                }
                IndexerPool::Postgres(pool) => {
                    if contract_filter.is_empty() {
                        sqlx::query_as(
                            "SELECT id, ledger, ledger_closed_at, contract_id, topic::text, value::text, tx_hash \
                             FROM indexed_events \
                             WHERE ledger >= $1 \
                             ORDER BY ledger ASC \
                             LIMIT $2",
                        )
                        .bind(from_ledger)
                        .bind(limit)
                        .fetch_all(pool)
                        .await
                    } else {
                        sqlx::query_as(
                            "SELECT id, ledger, ledger_closed_at, contract_id, topic::text, value::text, tx_hash \
                             FROM indexed_events \
                             WHERE contract_id = $1 AND ledger >= $2 \
                             ORDER BY ledger ASC \
                             LIMIT $3",
                        )
                        .bind(&contract_filter)
                        .bind(from_ledger)
                        .bind(limit)
                        .fetch_all(pool)
                        .await
                    }
                }
            }
            .map_err(|e| Status::internal(format!("database query failed: {e}")))?;

        let latest_ledger = get_last_ledger(&self.state.pool)
            .await
            .map_err(|e| Status::internal(format!("cursor read failed: {e}")))?;

        let events = rows
            .into_iter()
            .map(
                |(id, ledger, ledger_closed_at, contract_id, topic_json, value_json, tx_hash)| {
                    IndexedEvent {
                        id,
                        ledger: ledger.max(0) as u32,
                        ledger_closed_at,
                        contract_id,
                        topic_json,
                        value_json,
                        tx_hash,
                    }
                },
            )
            .collect();

        Ok(Response::new(GetEventsResponse {
            events,
            latest_ledger,
        }))
    }

    async fn get_cursor(
        &self,
        _request: Request<GetCursorRequest>,
    ) -> Result<Response<GetCursorResponse>, Status> {
        let last_ledger = get_last_ledger(&self.state.pool)
            .await
            .map_err(|e| Status::internal(format!("cursor read failed: {e}")))?;

        let now_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);

        Ok(Response::new(GetCursorResponse {
            last_ledger,
            updated_at: now_ms.to_string(),
        }))
    }

    async fn health_check(
        &self,
        _request: Request<HealthCheckRequest>,
    ) -> Result<Response<HealthCheckResponse>, Status> {
        let timestamp_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);

        Ok(Response::new(HealthCheckResponse {
            status: "SERVING".to_string(),
            service: "indexer".to_string(),
            timestamp_ms,
        }))
    }
}

/// Start the mTLS gRPC server on `0.0.0.0:<grpc_port>`.
/// Fails closed if any mTLS certificate or private key file is missing.
pub async fn serve_grpc_mtls(cfg: Config, state: SharedState) -> Result<()> {
    let port = cfg
        .grpc_port
        .ok_or_else(|| anyhow!("GRPC_PORT is not configured"))?;
    let ca_path = cfg
        .grpc_ca_cert_path
        .as_deref()
        .ok_or_else(|| anyhow!("GRPC_MTLS_CA_CERT_PATH is required for mTLS gRPC"))?;
    let cert_path = cfg
        .grpc_cert_path
        .as_deref()
        .ok_or_else(|| anyhow!("GRPC_MTLS_CERT_PATH is required for mTLS gRPC"))?;
    let key_path = cfg
        .grpc_key_path
        .as_deref()
        .ok_or_else(|| anyhow!("GRPC_MTLS_KEY_PATH is required for mTLS gRPC"))?;

    let ca_pem = tokio::fs::read(ca_path)
        .await
        .with_context(|| format!("reading CA cert at {ca_path}"))?;
    let cert_pem = tokio::fs::read(cert_path)
        .await
        .with_context(|| format!("reading server cert at {cert_path}"))?;
    let key_pem = tokio::fs::read(key_path)
        .await
        .with_context(|| format!("reading server key at {key_path}"))?;

    let identity = Identity::from_pem(cert_pem, key_pem);
    let client_ca = Certificate::from_pem(ca_pem);

    let tls_config = ServerTlsConfig::new()
        .identity(identity)
        .client_ca_root(client_ca);

    let addr: SocketAddr = ([0, 0, 0, 0], port).into();
    let svc = IndexerGrpcService::new(state);

    info!(%addr, "starting soroban-indexer mTLS gRPC server");

    Server::builder()
        .tls_config(tls_config)
        .context("configuring mTLS for gRPC server")?
        .add_service(IndexerServiceServer::new(svc))
        .serve(addr)
        .await
        .context("gRPC server exited with error")
}
