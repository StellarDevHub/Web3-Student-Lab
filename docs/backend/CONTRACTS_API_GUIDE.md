# Smart Contract Compilation and Execution API

This document explains the new backend contract endpoints, input validation rules, and logging design.

## Endpoints

- `POST /api/v1/contracts/compile`
  - Validates contract compilation requests against a strict schema.
  - Rejects malformed input early to prevent resource exhaustion.
  - Returns deterministic compile metadata and warnings.

- `POST /api/v1/contracts/execute`
  - Validates contract execution requests.
  - Returns structured execution metrics, logging data, and result metadata.

## Validation and Security

The compile endpoint enforces:

- `sourceCode`: 32-15,000 characters.
- `compilerVersion`: semantic version string like `0.8.10`.
- `optimization`: boolean flag.
- `target`: one of `solidity`, `evm`, `soroban`, or `wasm`.
- `entryPoint`: optional function name.

The execution endpoint enforces:

- `contractAddress`: required string.
- `functionName`: required string.
- `parameters`: optional array of primitive values, max 50 entries.
- `gasLimit`: positive integer, max 10,000,000.
- `caller`: optional string.

Validating inputs at the edge protects compile resources and prevents malformed payloads from consuming compute time.

## Logging and Monitoring

The contract service captures:

- Compile duration in milliseconds.
- Generated source hash and bytecode fingerprint.
- Error and warning counts.
- Execution ID, gas usage, and execution duration.
- Caller identity and contract address.

Logs are emitted through `winston` and stored in the backend logging pipeline for observability.

## Testing Strategy

The implementation includes unit tests for:

- schema validation behavior
- contract compile logic
- contract execution simulation
- API route integration

Mock blockchain behavior is supported through the existing certificate blockchain service simulation layer.
