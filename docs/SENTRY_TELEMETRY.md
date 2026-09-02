# Full-Stack Sentry Telemetry & Distributed Tracing Architecture (#1204)

## Overview
This document outlines the Sentry error tracking, performance monitoring, and distributed tracing setup deployed across the `Web3-Student-Lab` Next.js frontend and Express backend.

---

## 1. Architecture & DSN Configuration

- **Frontend (`@sentry/nextjs`)**:
  - `sentry.client.config.ts` (Client runtime)
  - `sentry.server.config.ts` (Node.js SSR & API routes)
  - `sentry.edge.config.ts` (Edge runtime & Middlewares)
  - Environment Variable: `NEXT_PUBLIC_SENTRY_DSN` or `SENTRY_DSN`

- **Backend (`@sentry/node`)**:
  - Initialized in `src/utils/sentry.ts` and mounted in `src/index.ts`
  - Environment Variable: `SENTRY_DSN`

---

## 2. Distributed Tracing (`sentry-trace` & `baggage`)

To trace slow user transactions end-to-end from Next.js UI component interactions down to Express REST endpoints and PostgreSQL query execution, distributed tracing headers are automatically propagated:

- **Frontend Target Patterns**:
  - `tracePropagationTargets: ['localhost', /^\/api/, /^https:\/\/.*\/api/]`
- **Backend CORS Headers**:
  - Allowed headers include `sentry-trace` and `baggage`.

When an HTTP request is made from the frontend, Sentry injects `sentry-trace` and `baggage` headers. The Express backend picks up these headers to combine frontend and backend spans into a single distributed trace waterfall.

---

## 3. Production Alert Rules & Escalation Policies

Sentry alert rules are configured to notify on-call engineers of production error rate spikes:

1. **High Priority Error Rate Spike**:
   - **Condition**: Total unhandled exception count > 10 in 1 minute OR Error rate increases by > 5% compared to 1-hour baseline.
   - **Action**: Trigger PagerDuty P1 incident & Send alert to `#alerts-production` Slack channel.

2. **New Issue Detected**:
   - **Condition**: A new unhandled exception type occurs in production for the first time.
   - **Action**: Post alert to `#engineering-sentry` Slack channel with full stacktrace and release tag.

3. **Performance Degradation Alert**:
   - **Condition**: P95 transaction duration for `/api/v1/learning/*` or `/api/v1/certificates/*` > 1.5 seconds.
   - **Action**: Create Jira issue and notify lead engineer.

---

## 4. Local Development Testing

Centralized Sentry reporting is automatically disabled when `SENTRY_DSN` is not present in `.env`.
To test telemetry locally:
```bash
export SENTRY_DSN="https://examplePublicKey@o0.ingest.sentry.io/0"
cd backend && npm run dev
```
