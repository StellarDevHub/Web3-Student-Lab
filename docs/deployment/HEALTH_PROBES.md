# Health Probes (Liveness & Readiness)

This document describes the health monitoring endpoints and how to configure
probes for Docker and common hosting providers so orchestrators can
distinguish a running process from one that is ready to serve traffic.

## Overview

A single combined health endpoint cannot tell an orchestrator *why* a service
is unhealthy. The backend therefore exposes three separate endpoints:

| Endpoint | Purpose | Status codes | Dependency calls |
| --- | --- | --- | --- |
| `GET /health` | Legacy overview endpoint (kept for backward compatibility) | `200` always | none (cached state only) |
| `GET /health/live` | **Liveness** — process is alive and not deadlocked | `200` | none |
| `GET /health/ready` | **Readiness** — process can serve dependent services | `200` / `503` | database (`SELECT 1`), Redis (`PING`) |

The same endpoints are also available under the versioned API namespace at
`/api/v1/health/live` and `/api/v1/health/ready`.

## Liveness probe

`GET /health/live`

Fast, dependency-free probe. Returns `200 OK` while the Node.js process is
alive, regardless of the state of downstream services.

```json
{
  "status": "ok",
  "uptime": 123.456,
  "version": "1.0.0",
  "timestamp": "2026-07-31T12:00:00.000Z"
}
```

## Readiness probe

`GET /health/ready`

Checks database and Redis capabilities with a bounded timeout
(`HEALTH_READINESS_TIMEOUT_MS`, default `3000` ms). Returns `200 OK` only when
every required dependency is available, otherwise `503 Service Unavailable`.

**Ready — `200`:**

```json
{
  "status": "ready",
  "checks": {
    "database": { "status": "ready", "latencyMs": 12 },
    "redis": { "status": "ready", "latencyMs": 3 }
  },
  "checkedAt": "2026-07-31T12:00:00.000Z"
}
```

**Not ready — `503`:**

```json
{
  "status": "not_ready",
  "checks": {
    "database": { "status": "ready", "latencyMs": 12 },
    "redis": { "status": "unavailable", "latencyMs": 3000, "error": "redis unavailable" }
  },
  "checkedAt": "2026-07-31T12:00:00.000Z"
}
```

### Security

Probe responses are sanitized. They never include credentials, connection
strings, or internal stack traces — dependency failures return a safe message
such as `"database unavailable"` / `"redis unavailable"`, while full error
details are written to the server logs.

## Configuration

| Environment variable | Default | Description |
| --- | --- | --- |
| `HEALTH_READINESS_TIMEOUT_MS` | `3000` | Maximum time (ms) each readiness dependency check may take before it is reported as unavailable. |

## Docker Compose

The backend service in `docker-compose.yml` uses the readiness probe so a
container is only considered healthy once the API is running **and** database
and Redis are reachable:

```yaml
backend:
  # ...
  healthcheck:
    test: ["CMD", "node", "-e", "require('http').get('http://localhost:8080/health/ready', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"]
    interval: 30s
    timeout: 10s
    retries: 3
    start_period: 40s
```

## Dockerfile

`backend/Dockerfile` declares the same readiness probe:

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health/ready', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"
```

## Kubernetes

```yaml
containers:
  - name: backend
    image: web3-student-lab-backend:latest
    ports:
      - containerPort: 8080
    livenessProbe:
      httpGet:
        path: /health/live
        port: 8080
      initialDelaySeconds: 10
      periodSeconds: 10
      timeoutSeconds: 3
      failureThreshold: 3
    readinessProbe:
      httpGet:
        path: /health/ready
        port: 8080
      initialDelaySeconds: 20
      periodSeconds: 10
      timeoutSeconds: 5
      failureThreshold: 3
    env:
      - name: HEALTH_READINESS_TIMEOUT_MS
        value: "3000"
```

## Other hosting providers

### Render

```yaml
healthCheckPath: /health/live
```

Or use the readiness path `/health/ready` for services whose dependency
health should gate traffic.

### Fly.io

```toml
[services.checks]
grace_period = "30s"
interval = "10s"
timeout = "3s"
[services.checks.http]
path = "/health/live"
method = "GET"
```

### Heroku

```bash
# Health check via a resource:
heroku ps:wait
curl -f https://YOUR-APP.herokuapp.com/health/ready
```

### Railway

Use the `HEALTHCHECK_ENDPOINT`/monitor configuration of the service to point
at `/health/ready`.

## Testing

Health probes have automated tests:

- `backend/tests/health.test.ts` — integration tests for `/health`, `/health/live`, and `/health/ready`.
- `backend/tests/readinessMonitor.test.ts` — unit tests for `checkReadiness()` covering success, dependency failures, and timeouts.

Run them with:

```bash
cd backend
npm test -- health.test.ts readinessMonitor.test.ts
```
