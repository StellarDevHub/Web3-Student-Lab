import * as grpc from '@grpc/grpc-js';
import logger from '../utils/logger.js';
import {
  runWasmEvaluation,
  type SandboxRunRequest,
  type SandboxRunResult,
  type WasmArgument,
  type WasmTestCase,
  type WasmValue,
} from '../services/wasmExecutionSandbox.js';
import { createMtlsServerCredentials, type MtlsCertMaterial } from './mtls.js';
import { loadInternalProto } from './protoLoader.js';

export interface WasmWorkerServerOptions {
  host?: string;
  port?: number;
  mtls: MtlsCertMaterial;
  executor?: (req: SandboxRunRequest) => Promise<SandboxRunResult>;
}

interface ExecuteWasmRequestProto {
  wasm_bytecode: Buffer;
  tests: Array<{
    name: string;
    function_name: string;
    args: string[];
    has_expected: boolean;
    expected: string;
  }>;
  gas_limit: number;
  memory_limit_bytes: number;
  timeout_ms: number;
}

function parseProtoArg(raw: string): WasmArgument {
  if (/^-?\d+n$/.test(raw)) {
    return raw;
  }
  const asNum = Number(raw);
  if (!Number.isNaN(asNum) && raw.trim() !== '' && Number.isSafeInteger(asNum)) {
    return asNum;
  }
  return raw;
}

function parseProtoExpected(hasExpected: boolean, raw: string): WasmValue | undefined {
  if (!hasExpected) return undefined;
  if (raw === 'null') return null;
  const asNum = Number(raw);
  if (!Number.isNaN(asNum) && raw.trim() !== '' && Number.isSafeInteger(asNum)) {
    return asNum;
  }
  return raw;
}

function toSandboxRequest(req: ExecuteWasmRequestProto): SandboxRunRequest {
  const tests: WasmTestCase[] = (req.tests ?? []).map((t) => {
    const tc: WasmTestCase = {
      name: t.name,
      functionName: t.function_name,
      args: (t.args ?? []).map(parseProtoArg),
    };
    const expected = parseProtoExpected(t.has_expected, t.expected);
    if (expected !== undefined) {
      tc.expected = expected;
    }
    return tc;
  });

  const sandboxReq: SandboxRunRequest = {
    wasmBase64: Buffer.isBuffer(req.wasm_bytecode)
      ? req.wasm_bytecode.toString('base64')
      : Buffer.from(req.wasm_bytecode ?? []).toString('base64'),
    tests,
  };

  if (req.gas_limit > 0) sandboxReq.gasLimit = req.gas_limit;
  if (req.memory_limit_bytes > 0) sandboxReq.memoryLimitBytes = req.memory_limit_bytes;
  if (req.timeout_ms > 0) sandboxReq.timeoutMs = req.timeout_ms;

  return sandboxReq;
}

function toProtoResponse(result: SandboxRunResult) {
  return {
    execution_id: result.executionId,
    status: result.status,
    termination_reason: result.terminationReason,
    gas_used: result.gasUsed,
    gas_limit: result.gasLimit,
    memory_peak_bytes: result.memoryPeakBytes,
    memory_limit_bytes: result.memoryLimitBytes,
    duration_ms: result.durationMs,
    tests: result.tests.map((t) => ({
      name: t.name,
      function_name: t.functionName,
      status: t.status,
      has_expected: t.expected !== undefined,
      expected: t.expected === undefined ? '' : String(t.expected),
      has_actual: t.actual !== null && t.actual !== undefined,
      actual: t.actual === null || t.actual === undefined ? '' : String(t.actual),
      gas_used: t.gasUsed,
      duration_ms: t.durationMs,
      termination_reason: t.terminationReason ?? '',
      error: t.error ?? '',
    })),
    summary: {
      total: result.summary.total,
      passed: result.summary.passed,
      failed: result.summary.failed,
      errored: result.summary.errored,
      skipped: result.summary.skipped,
    },
    validation_code: result.validationCode ?? '',
    error: result.error ?? '',
  };
}

export class WasmWorkerGrpcServer {
  private readonly server: grpc.Server;
  private boundPort = 0;

  constructor(private readonly options: WasmWorkerServerOptions) {
    const proto = loadInternalProto();
    const executor = options.executor ?? runWasmEvaluation;

    this.server = new grpc.Server({
      'grpc.max_receive_message_length': 16 * 1024 * 1024,
      'grpc.max_send_message_length': 16 * 1024 * 1024,
    });

    this.server.addService(proto.internal.v1.WasmEvaluatorService.service, {
      ExecuteWasm: async (
        call: grpc.ServerUnaryCall<ExecuteWasmRequestProto, unknown>,
        callback: grpc.sendUnaryData<unknown>,
      ) => {
        try {
          const sandboxRequest = toSandboxRequest(call.request);
          const result = await executor(sandboxRequest);
          callback(null, toProtoResponse(result));
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          logger.error('[WasmWorkerGrpcServer] ExecuteWasm failed', { error: message });
          callback({
            code: grpc.status.INTERNAL,
            message,
          });
        }
      },
      HealthCheck: (
        _call: grpc.ServerUnaryCall<{ service: string }, unknown>,
        callback: grpc.sendUnaryData<unknown>,
      ) => {
        callback(null, {
          status: 'SERVING',
          service: 'wasm-worker',
          timestamp_ms: Date.now(),
        });
      },
    });
  }

  public get port(): number {
    return this.boundPort;
  }

  public async start(): Promise<number> {
    const host = this.options.host ?? '127.0.0.1';
    const port = this.options.port ?? 50052;
    const credentials = createMtlsServerCredentials(this.options.mtls);

    return new Promise<number>((resolve, reject) => {
      this.server.bindAsync(`${host}:${port}`, credentials, (err, boundPort) => {
        if (err) {
          reject(err);
          return;
        }
        this.boundPort = boundPort;
        logger.info('[WasmWorkerGrpcServer] Started mTLS gRPC server', {
          host,
          port: boundPort,
        });
        resolve(boundPort);
      });
    });
  }

  public async stop(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.server.tryShutdown((err) => {
        if (err) {
          this.server.forceShutdown();
        }
        resolve();
      });
    });
  }
}
