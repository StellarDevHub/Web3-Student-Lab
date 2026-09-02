# Webhook Delivery Guide

This backend now includes a BullMQ-backed webhook delivery pipeline for on-chain events and other asynchronous system events.

## Flow

1. An upstream event producer posts a signed dispatch request to `POST /api/v1/webhooks/ingest` or `POST /api/v1/webhooks/dispatch`.
2. The backend verifies the request signature with HMAC-SHA256.
3. The request is split into one or more delivery jobs and queued in BullMQ.
4. A dedicated worker sends each webhook with signed headers and a canonical JSON payload.
5. Transient failures are retried with exponential backoff.
6. Permanent failures and exhausted retries are written to a dead-letter queue for inspection.

## Signed Headers

Each outbound delivery includes:

- `x-webhook-delivery-id`
- `x-webhook-event`
- `x-webhook-timestamp`
- `x-webhook-signature`

The signature is computed over `timestamp.payload` using HMAC-SHA256.

## Environment Variables

- `WEBHOOK_SIGNING_SECRET`: secret used to sign outbound webhook deliveries
- `WEBHOOK_INGEST_SECRET`: secret used to verify inbound dispatch requests
- `WEBHOOK_MAX_ATTEMPTS`: retry attempts for each delivery job
- `WEBHOOK_BACKOFF_DELAY_MS`: initial delay for exponential backoff
- `WEBHOOK_REQUEST_TIMEOUT_MS`: HTTP request timeout for outbound deliveries
- `WEBHOOK_WORKER_CONCURRENCY`: BullMQ worker concurrency

## Operational Notes

- The worker starts with the backend process outside of test mode.
- The dead-letter queue is intentionally separate so failed deliveries do not block healthy traffic.
- Payload serialization is canonicalized before signing to avoid signature drift from object key ordering.

## Testing

The webhook module is covered by unit tests for:

- canonical payload serialization
- HMAC signing and verification
- queue dispatch job creation
- delivery retry and permanent-failure handling

