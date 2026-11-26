import * as grpc from '@grpc/grpc-js';
import {
  generateInternalPki,
  generateUntrustedClientCert,
  loadInternalProto,
  WasmEvaluatorGrpcClient,
  WasmWorkerGrpcServer,
} from '../src/grpc/index.js';
import {
  executeWasmWithTransport,
  type SandboxRunRequest,
} from '../src/services/wasmExecutionSandbox.js';

/**
 * Minimal valid WASM module exporting `add(i32, i32) -> i32`:
 * (module
 *   (func (export "add") (param i32 i32) (result i32)
 *     local.get 0
 *     local.get 1
 *     i32.add))
 */
const ADD_WASM_BYTES = Buffer.from([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
  0x01, 0x07, 0x01, 0x60, 0x02, 0x7f, 0x7f, 0x01, 0x7f,
  0x03, 0x02, 0x01, 0x00,
  0x07, 0x07, 0x01, 0x03, 0x61, 0x64, 0x64, 0x00, 0x00,
  0x0a, 0x09, 0x01, 0x07, 0x00, 0x20, 0x00, 0x20, 0x01, 0x6a, 0x0b,
]);

describe('BE-093: Internal gRPC Communication Channel with mTLS', () => {
  const pki = generateInternalPki(['api-gateway', 'wasm-worker', 'indexer']);
  const workerCert = pki.services['wasm-worker']!;
  const gatewayCert = pki.services['api-gateway']!;

  let server: WasmWorkerGrpcServer;
  let target: string;

  beforeAll(async () => {
    server = new WasmWorkerGrpcServer({
      host: '127.0.0.1',
      port: 0, // ephemeral free port
      mtls: {
        caCert: pki.caCert,
        cert: workerCert.cert,
        key: workerCert.key,
      },
    });
    const boundPort = await server.start();
    target = `127.0.0.1:${boundPort}`;
  }, 20_000);

  afterAll(async () => {
    await server.stop();
  });

  test('authenticates internal RPC calls with valid mTLS certificates and executes WASM', async () => {
    const client = new WasmEvaluatorGrpcClient({
      target,
      mtls: {
        caCert: pki.caCert,
        cert: gatewayCert.cert,
        key: gatewayCert.key,
      },
    });

    try {
      const health = await client.healthCheck();
      expect(health.status).toBe('SERVING');
      expect(health.service).toBe('wasm-worker');

      const request: SandboxRunRequest = {
        wasmBase64: ADD_WASM_BYTES.toString('base64'),
        tests: [
          {
            name: 'adds two positive integers',
            functionName: 'add',
            args: [2, 3],
            expected: 5,
          },
        ],
      };

      const result = await executeWasmWithTransport(request, client);
      expect(result.status).toBe('passed');
      expect(result.terminationReason).toBe('completed');
      expect(result.summary.passed).toBe(1);
      expect(result.tests[0]?.actual).toBe(5);
    } finally {
      client.close();
    }
  }, 20_000);

  test('rejects unauthenticated plaintext (insecure) requests at the transport layer', async () => {
    const proto = loadInternalProto();
    const insecureClient = new proto.internal.v1.WasmEvaluatorService(
      target,
      grpc.credentials.createInsecure(),
    ) as unknown as grpc.Client & Record<string, Function>;

    try {
      await expect(
        new Promise((resolve, reject) => {
          insecureClient.HealthCheck(
            { service: 'wasm-worker' },
            { deadline: new Date(Date.now() + 3_000) },
            (err: grpc.ServiceError | null, resp: unknown) => {
              if (err) reject(err);
              else resolve(resp);
            },
          );
        }),
      ).rejects.toThrow();
    } finally {
      insecureClient.close();
    }
  });

  test('rejects TLS client without a client certificate (one-way TLS) at the transport layer', async () => {
    const proto = loadInternalProto();
    const oneWayTlsClient = new proto.internal.v1.WasmEvaluatorService(
      target,
      grpc.credentials.createSsl(pki.caCert),
    ) as unknown as grpc.Client & Record<string, Function>;

    try {
      await expect(
        new Promise((resolve, reject) => {
          oneWayTlsClient.HealthCheck(
            { service: 'wasm-worker' },
            { deadline: new Date(Date.now() + 3_000) },
            (err: grpc.ServiceError | null, resp: unknown) => {
              if (err) reject(err);
              else resolve(resp);
            },
          );
        }),
      ).rejects.toThrow();
    } finally {
      oneWayTlsClient.close();
    }
  });

  test('rejects client presenting a certificate signed by an untrusted CA', async () => {
    const rogue = generateUntrustedClientCert('rogue-service');
    const rogueClient = new WasmEvaluatorGrpcClient({
      target,
      mtls: {
        caCert: pki.caCert, // trusts the server, but presents a rogue client cert
        cert: rogue.cert,
        key: rogue.key,
      },
    });

    try {
      await expect(rogueClient.healthCheck(3_000)).rejects.toThrow();
    } finally {
      rogueClient.close();
    }
  });

  test('Protocol Buffer serialization achieves > 3x throughput compared to JSON', () => {
    const proto = loadInternalProto();
    const methodDef = proto.internal.v1.WasmEvaluatorService.service.ExecuteWasm!;

    // Realistic 64 KiB WASM contract bytecode payload
    const wasmPayload = Buffer.alloc(64 * 1024, 0x42);
    const tests = Array.from({ length: 16 }, (_, i) => ({
      name: `test_case_${i}`,
      function_name: 'evaluate_contract',
      args: ['100', '200', String(i)],
      has_expected: true,
      expected: String(300 + i),
    }));

    const protoObj = {
      wasm_bytecode: wasmPayload,
      tests,
      gas_limit: 1_000_000,
      memory_limit_bytes: 52_428_800,
      timeout_ms: 2_000,
    };

    const ITERATIONS = 100;
    const jsonByteArray = Array.from(wasmPayload);

    // Warmup both paths
    for (let i = 0; i < 10; i++) {
      const encoded = methodDef.requestSerialize(protoObj);
      methodDef.requestDeserialize(encoded);

      const jsonStr = JSON.stringify({
        wasmBytecode: jsonByteArray,
        tests,
        gasLimit: 1_000_000,
        memoryLimitBytes: 52_428_800,
        timeoutMs: 2_000,
      });
      JSON.parse(jsonStr);
    }

    const pbStart = process.hrtime.bigint();
    for (let i = 0; i < ITERATIONS; i++) {
      const encoded = methodDef.requestSerialize(protoObj);
      methodDef.requestDeserialize(encoded);
    }
    const pbNs = Number(process.hrtime.bigint() - pbStart);

    const jsonStart = process.hrtime.bigint();
    for (let i = 0; i < ITERATIONS; i++) {
      const jsonStr = JSON.stringify({
        wasmBytecode: jsonByteArray,
        tests,
        gasLimit: 1_000_000,
        memoryLimitBytes: 52_428_800,
        timeoutMs: 2_000,
      });
      JSON.parse(jsonStr);
    }
    const jsonNs = Number(process.hrtime.bigint() - jsonStart);

    const speedup = jsonNs / Math.max(pbNs, 1);
    expect(speedup).toBeGreaterThan(3);
  });
});
