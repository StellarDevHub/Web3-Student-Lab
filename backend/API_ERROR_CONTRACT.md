# API Error Contract

Every handled error returned by the backend uses one envelope. The shape is
declared in `src/utils/apiError.ts` and published in OpenAPI as
`components.schemas.ErrorEnvelope` (see `/api-docs`).

## Envelope

```json
{
  "error": {
    "version": "1",
    "code": "VALIDATION_FAILED",
    "message": "Request validation failed",
    "requestId": "9f1c2e3a-6b74-4c0f-9a5c-7b1d2e3f4a5b",
    "timestamp": "2026-01-01T12:00:00.000Z",
    "fieldErrors": [{ "field": "tokenId", "message": "tokenId must be alphanumeric" }]
  }
}
```

| Field | Always present | Notes |
| --- | --- | --- |
| `version` | yes | Envelope schema version. Bumped only on a breaking change. |
| `code` | yes | Stable machine-readable code — branch on this, never on `message`. |
| `message` | yes | Client-safe text. Server faults collapse to a generic sentence. |
| `requestId` | yes | Correlation ID; also returned as the `X-Correlation-ID` header. |
| `timestamp` | yes | ISO 8601, server clock. |
| `fieldErrors` | no | Present on validation failures. Field path + reason only — never the submitted value. |

## Codes

`BAD_REQUEST`, `VALIDATION_FAILED`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`,
`CONFLICT`, `UNPROCESSABLE_ENTITY`, `RATE_LIMITED`, `INTERNAL_ERROR`,
`SERVICE_UNAVAILABLE`.

## Raising errors

```ts
import { ApiError } from '../utils/apiError.js';

throw ApiError.notFound('Certificate not found');
throw ApiError.validationFailed('Request validation failed', [
  { field: 'grade', message: 'grade must be one of A–F' },
]);
throw ApiError.internal(); // message is replaced with the generic sentence
```

Anything else that reaches the global handler (`src/middleware/errorHandler.ts`)
becomes a 500 `INTERNAL_ERROR`. Zod failures raised by
`src/middleware/validation.ts` become 400 `VALIDATION_FAILED` with `fieldErrors`.

## Client messages vs server logs

Stack traces and raw error messages never leave the process. For every error the
handler writes a log entry containing `requestId`, `code`, `statusCode`, the raw
message, the stack and the request method/path — 5xx at `error` level, 4xx at
`warn`. To investigate a report, take the `requestId` the client saw and search
the logs for it.

`requestId` resolution order: the ID assigned by `detailedRequestLogger`, then an
inbound `X-Correlation-ID` or `X-Request-ID` header, then a freshly generated
UUID — so an error response is never returned without one.

## Tests

- `tests/errorEnvelope.routes.test.ts` — route-level contract (validation, 404, 500, correlation ID echo).
- `tests/sentry.errorHandler.test.ts` — global handler unit behaviour.
