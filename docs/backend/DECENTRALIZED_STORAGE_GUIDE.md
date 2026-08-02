# Decentralized Storage Guide

The backend now includes a decentralized storage manager for:

- generated NFT certificate images
- certificate metadata JSON
- generated project ideas and other structured payloads

The implementation uses a provider abstraction so the project can use Pinata in production while still running in a mock mode for local development and tests.

## Flow

1. A route or service asks the storage manager to pin JSON or file content.
2. The request is queued in BullMQ for asynchronous processing when needed.
3. A storage worker pins the content to IPFS through the configured provider.
4. The resulting CID, gateway URL, provider, and status are persisted in the `decentralized_assets` table.
5. A repeatable garbage-collection job finds assets with a `referenceCount` of `0` and unpins them after the retention window.

## Provider

The storage layer defaults to Pinata.

Environment variables:

- `DECENTRALIZED_STORAGE_PROVIDER`: `pinata` or `mock`
- `PINATA_JWT`: Pinata JWT used for uploads and unpins
- `STORAGE_GATEWAY_BASE_URL`: gateway URL used to build public links
- `STORAGE_GC_RETENTION_DAYS`: how long to retain unreferenced assets before cleanup
- `STORAGE_MAX_PIN_ATTEMPTS`: retry budget for pin jobs
- `STORAGE_BACKOFF_DELAY_MS`: initial exponential backoff delay
- `STORAGE_WORKER_CONCURRENCY`: BullMQ concurrency for pin jobs
- `STORAGE_JOB_TIMEOUT_MS`: timeout per pin job

## Certificate Integration

When a certificate is minted:

- the certificate image is rendered locally as SVG
- the SVG is pinned to IPFS
- the certificate metadata is generated with the IPFS image URI
- the metadata JSON is pinned to IPFS
- the blockchain mint flow uses the decentralized metadata payload
- the persisted certificate record stores the metadata CID URI

## Project Idea Integration

The project idea generator can optionally persist the generated idea to IPFS.

`POST /api/v1/generator/generate` accepts:

- `persistToStorage`: pin the generated project idea JSON
- `queuedPersist`: enqueue the pin operation instead of pinning immediately

## Storage API

New endpoints:

- `GET /api/v1/storage/health`
- `POST /api/v1/storage/pin-json`
- `POST /api/v1/storage/pin-file`
- `POST /api/v1/storage/gc`

## Database Model

Pinned assets are tracked in the `DecentralizedAsset` Prisma model, which stores:

- `cid`
- `ipfsUri`
- `gatewayUrl`
- `provider`
- `referenceCount`
- pin and unpin timestamps
- failure state for retries and debugging

## Operational Notes

- Use the `mock` provider for local testing when no Pinata JWT is available.
- The garbage-collection worker is intentionally separate from the pin worker.
- Unreferenced content is not deleted immediately; it is retained for the configured window before unpinning.
- Keep CIDs and gateway URLs out of public logs unless they are already public metadata.

