# syntax=docker/dockerfile:1.7
# ---------- Stage 1: build ----------
FROM rust:1.77-slim-bookworm AS builder

ENV CARGO_HOME=/usr/local/cargo \
    CARGO_TARGET_DIR=/workspace/target \
    RUST_BACKTRACE=1

WORKDIR /workspace

# Build-time deps for reqwest (rustls-tls pulls in ring which needs pkg-config)
# and libssl-dev is kept available in case the chosen TLS backend changes.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        pkg-config \
        libssl-dev \
        ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Pre-warm the cargo dependency cache. We deliberately copy only Cargo.toml
# first and add a fake main.rs so dependencies (tokio, axum, sqlx, reqwest…)
# are cached in their own layer and don't have to be re-downloaded whenever
# application code changes.
COPY Cargo.toml ./
RUN mkdir -p src \
 && echo "fn main() { println!(\"boot\"); }" > src/main.rs \
 && cargo build --release --bin soroban-indexer \
 && rm -rf src target/release/deps/soroban_indexer*

# Real build. The dep cache above means this layer is fast even when the
# source changes.
COPY src ./src
# Touch the source file to force cargo to recompile the crate, not the cache.
RUN touch src/main.rs \
 && cargo build --release --bin soroban-indexer \
 && strip target/release/soroban-indexer

# ---------- Stage 2: runtime ----------
FROM debian:bookworm-slim AS runtime

ENV PORT=3001 \
    RUST_LOG=info \
    DATABASE_URL=sqlite:///data/indexer.db?mode=rwc \
    SOROBAN_RPC_URL=https://soroban-testnet.stellar.org

# Runtime libs: only what the binary actually needs. reqwest uses rustls so
# we don't need to ship OpenSSL in the final image. tini reaps zombies and
# forwards SIGTERM so the axum graceful-shutdown path actually runs.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        ca-certificates \
        tini \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 1001 indexer \
 && useradd  --system --uid 1001 --gid indexer --home /app --shell /sbin/nologin indexer

WORKDIR /app

COPY --from=builder /workspace/target/release/soroban-indexer /usr/local/bin/soroban-indexer

# Persistent SQLite database lives here. Mount a volume in docker-compose.
RUN mkdir -p /data && chown -R indexer:indexer /data

USER indexer
EXPOSE 3001

# tini reaps zombies and forwards signals so the axum server's graceful
# shutdown logic actually runs in container land.
ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["/usr/local/bin/soroban-indexer"]
