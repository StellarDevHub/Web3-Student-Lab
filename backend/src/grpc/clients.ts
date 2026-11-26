import * as grpc from '@grpc/grpc-js';
import type {
  SandboxRunRequest,
  SandboxRunResult,
  SandboxTerminationReason,
  WasmTestOutcome,
  WasmTestStatus,
  WasmValue,
} from '../services/wasmExecutionSandbox.js';
import type { WasmValidationCode } from '../utils/wasmValidator.js';
import { createMtlsClientCredentials, type MtlsCertMaterial } from './mtls.js';
import { loadInternalProto } from './protoLoader.js';

export interface GrpcClientOptions {
  target: string;
  mtls: MtlsCertMaterial;
  serverNameOverride?: string;
  defaultTimeoutMs?: number;
}

export interface HealthCheckResponse {
  status: string;
  service: string;
  timestampMs: number;
}

export interface IndexedEventDto {
  id: string;
  ledger: number;
  ledgerClosedAt: string;
  contractId: string;
  topicJson: string;
  valueJson: string;
  txHash: string;
}

export interface GetEventsResponseDto {
  events: IndexedEventDto[];
  latestLedger: number;
}

export interface GetCursorResponseDto {
  lastLedger: number;
  updatedAt: string;
}

function buildChannelOptions(serverNameOverride?: string): grpc.ChannelOptions {
  const opts: grpc.ChannelOptions = {
    'grpc.max_receive_message_length': 16 * 1024 * 1024,
    'grpc.max_send_message_length': 16 * 1024 * 1024,
  };
  if (serverNameOverride) {
    opts['grpc.ssl_target_name_override'] = serverNameOverride;
  }
  return opts;
}

function parseValue(hasVal: boolean, raw: string): WasmValue {
  if (!hasVal) return null;
  const asNum = Number(raw);
  if (!Number.isNaN(asNum) && raw.trim() !== '' && Number.isSafeInteger(asNum)) {
    return asNum;
  }
  return raw;
}

type GrpcUnaryMethod = (
  request: Record<string, unknown>,
  options: grpc.CallOptions,
  callback: (err: grpc.ServiceError | null, resp: Record<string, any>) => void,
) => void;

interface WasmEvaluatorClientStub extends grpc.Client {
  ExecuteWasm: GrpcUnaryMethod;
  HealthCheck: GrpcUnaryMethod;
}

interface IndexerClientStub extends grpc.Client {
  GetEvents: GrpcUnaryMethod;
  GetCursor: GrpcUnaryMethod;
  HealthCheck: GrpcUnaryMethod;
}

export class WasmEvaluatorGrpcClient {
  private readonly client: WasmEvaluatorClientStub;
  private readonly defaultTimeoutMs: number;

  constructor(options: GrpcClientOptions) {
    const proto = loadInternalProto();
    const creds = createMtlsClientCredentials(options.mtls);
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 15_000;
    this.client = new proto.internal.v1.WasmEvaluatorService(
      options.target,
      creds,
      buildChannelOptions(options.serverNameOverride),
    ) as unknown as WasmEvaluatorClientStub;
  }

  public executeWasm(
    request: SandboxRunRequest,
    timeoutMs = this.defaultTimeoutMs,
  ): Promise<SandboxRunResult> {
    const payload = {
      wasm_bytecode: Buffer.from(request.wasmBase64, 'base64'),
      tests: request.tests.map((t) => ({
        name: t.name,
        function_name: t.functionName,
        args: (t.args ?? []).map((a) => String(a)),
        has_expected: t.expected !== undefined,
        expected: t.expected === undefined ? '' : String(t.expected),
      })),
      gas_limit: request.gasLimit ?? 0,
      memory_limit_bytes: request.memoryLimitBytes ?? 0,
      timeout_ms: request.timeoutMs ?? 0,
    };

    const deadline = new Date(Date.now() + timeoutMs);

    return new Promise<SandboxRunResult>((resolve, reject) => {
      this.client.ExecuteWasm(
        payload,
        { deadline },
        (err: grpc.ServiceError | null, resp: Record<string, any>) => {
          if (err) {
            reject(err);
            return;
          }

          const tests: WasmTestOutcome[] = (resp.tests ?? []).map((t: Record<string, any>) => {
            const outcome: WasmTestOutcome = {
              name: String(t.name ?? ''),
              functionName: String(t.function_name ?? ''),
              status: (t.status ?? 'error') as WasmTestStatus,
              actual: parseValue(Boolean(t.has_actual), String(t.actual ?? '')),
              gasUsed: Number(t.gas_used ?? 0),
              durationMs: Number(t.duration_ms ?? 0),
            };
            if (t.has_expected) {
              outcome.expected = parseValue(true, String(t.expected ?? ''));
            }
            if (t.termination_reason) {
              outcome.terminationReason = t.termination_reason as SandboxTerminationReason;
            }
            if (t.error) {
              outcome.error = String(t.error);
            }
            return outcome;
          });

          const result: SandboxRunResult = {
            executionId: String(resp.execution_id ?? ''),
            status: (resp.status ?? 'error') as SandboxRunResult['status'],
            terminationReason: (resp.termination_reason ?? 'internal-error') as SandboxTerminationReason,
            gasUsed: Number(resp.gas_used ?? 0),
            gasLimit: Number(resp.gas_limit ?? 0),
            memoryPeakBytes: Number(resp.memory_peak_bytes ?? 0),
            memoryLimitBytes: Number(resp.memory_limit_bytes ?? 0),
            durationMs: Number(resp.duration_ms ?? 0),
            tests,
            summary: {
              total: Number(resp.summary?.total ?? 0),
              passed: Number(resp.summary?.passed ?? 0),
              failed: Number(resp.summary?.failed ?? 0),
              errored: Number(resp.summary?.errored ?? 0),
              skipped: Number(resp.summary?.skipped ?? 0),
            },
          };

          if (resp.validation_code) {
            result.validationCode = resp.validation_code as WasmValidationCode;
          }
          if (resp.error) {
            result.error = String(resp.error);
          }

          resolve(result);
        },
      );
    });
  }

  public healthCheck(timeoutMs = 5_000): Promise<HealthCheckResponse> {
    const deadline = new Date(Date.now() + timeoutMs);
    return new Promise<HealthCheckResponse>((resolve, reject) => {
      this.client.HealthCheck(
        { service: 'wasm-worker' },
        { deadline },
        (err: grpc.ServiceError | null, resp: Record<string, any>) => {
          if (err) {
            reject(err);
            return;
          }
          resolve({
            status: String(resp.status ?? ''),
            service: String(resp.service ?? ''),
            timestampMs: Number(resp.timestamp_ms ?? 0),
          });
        },
      );
    });
  }

  public close(): void {
    this.client.close();
  }
}

export class IndexerGrpcClient {
  private readonly client: IndexerClientStub;
  private readonly defaultTimeoutMs: number;

  constructor(options: GrpcClientOptions) {
    const proto = loadInternalProto();
    const creds = createMtlsClientCredentials(options.mtls);
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 10_000;
    this.client = new proto.internal.v1.IndexerService(
      options.target,
      creds,
      buildChannelOptions(options.serverNameOverride),
    ) as unknown as IndexerClientStub;
  }

  public getEvents(
    params: { contractId?: string; fromLedger?: number; limit?: number } = {},
    timeoutMs = this.defaultTimeoutMs,
  ): Promise<GetEventsResponseDto> {
    const deadline = new Date(Date.now() + timeoutMs);
    return new Promise<GetEventsResponseDto>((resolve, reject) => {
      this.client.GetEvents(
        {
          contract_id: params.contractId ?? '',
          from_ledger: params.fromLedger ?? 0,
          limit: params.limit ?? 100,
        },
        { deadline },
        (err: grpc.ServiceError | null, resp: Record<string, any>) => {
          if (err) {
            reject(err);
            return;
          }
          resolve({
            events: (resp.events ?? []).map((e: Record<string, any>) => ({
              id: String(e.id ?? ''),
              ledger: Number(e.ledger ?? 0),
              ledgerClosedAt: String(e.ledger_closed_at ?? ''),
              contractId: String(e.contract_id ?? ''),
              topicJson: String(e.topic_json ?? ''),
              valueJson: String(e.value_json ?? ''),
              txHash: String(e.tx_hash ?? ''),
            })),
            latestLedger: Number(resp.latest_ledger ?? 0),
          });
        },
      );
    });
  }

  public getCursor(timeoutMs = this.defaultTimeoutMs): Promise<GetCursorResponseDto> {
    const deadline = new Date(Date.now() + timeoutMs);
    return new Promise<GetCursorResponseDto>((resolve, reject) => {
      this.client.GetCursor(
        {},
        { deadline },
        (err: grpc.ServiceError | null, resp: Record<string, any>) => {
          if (err) {
            reject(err);
            return;
          }
          resolve({
            lastLedger: Number(resp.last_ledger ?? 0),
            updatedAt: String(resp.updated_at ?? ''),
          });
        },
      );
    });
  }

  public healthCheck(timeoutMs = 5_000): Promise<HealthCheckResponse> {
    const deadline = new Date(Date.now() + timeoutMs);
    return new Promise<HealthCheckResponse>((resolve, reject) => {
      this.client.HealthCheck(
        { service: 'indexer' },
        { deadline },
        (err: grpc.ServiceError | null, resp: Record<string, any>) => {
          if (err) {
            reject(err);
            return;
          }
          resolve({
            status: String(resp.status ?? ''),
            service: String(resp.service ?? ''),
            timestampMs: Number(resp.timestamp_ms ?? 0),
          });
        },
      );
    });
  }

  public close(): void {
    this.client.close();
  }
}
