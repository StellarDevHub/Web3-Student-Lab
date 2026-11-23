/**
 * Sandboxed WASM Execution Engine — Issue #1420 (BE-HARD-29)
 *
 * Executes untrusted WebAssembly modules (e.g. student-submitted contract
 * bytecode) inside an isolated `worker_threads` Worker with:
 *
 *  - Deterministic instruction/gas metering via bytecode instrumentation
 *    (`wasm-metering`), so a runaway loop is caught by a hard gas budget
 *    instead of relying on wall-clock luck.
 *  - Static memory-limit enforcement (default 128 MB) performed *before*
 *    instantiation by inspecting the module's declared memory limits
 *    (see `wasmModuleInspector.ts`), plus a host-provided, capped
 *    `WebAssembly.Memory` for modules that import their memory.
 *  - Host-call sandboxing: the only import the engine ever supplies is the
 *    metering hook. Any module that imports anything else is rejected
 *    before it can run — there is no filesystem, network, or process
 *    access surface exposed to guest code.
 *  - A wall-clock timeout that force-terminates the worker as a backstop,
 *    guaranteeing the host Node.js process is never blocked or crashed by
 *    a hostile module even if gas accounting is somehow bypassed (e.g. a
 *    trap loop inside a single metered block boundary).
 *
 * Design note on why this isn't literally "Wasmer/Wasmtime": neither has a
 * usable, dependency-light Node.js embedding in this environment (Wasmer's
 * `@wasmer/sdk` targets WASI/browser sandboxes and pulls in its own runtime;
 * native `wasmtime` Node bindings require prebuilt platform binaries). This
 * engine reaches the same acceptance criteria — deterministic metering,
 * memory ceilings, safe termination of the host process — using Node's
 * built-in `WebAssembly` implementation plus real bytecode-level gas
 * instrumentation, run inside genuine OS-level thread isolation.
 */

import { Worker } from 'worker_threads';
import { randomUUID } from 'crypto';
import logger from '../utils/logger.js';
import { inspectWasmModule, pagesForBytes, WasmParseError } from './wasmModuleInspector.js';

export type WasmTerminationReason =
  | 'completed'
  | 'gas-exhausted'
  | 'memory-limit-exceeded'
  | 'host-call-violation'
  | 'invalid-module'
  | 'timeout'
  | 'trap';

export interface WasmExecutionRequest {
  /** Base64-encoded raw WASM binary. */
  wasmBase64: string;
  /** Exported function name to invoke. */
  functionName: string;
  /** i32 arguments passed positionally to the exported function. */
  args?: number[];
  /** Maximum gas units (instructions, approximately) the run may consume. Default 5,000,000. */
  gasLimit?: number;
  /** Maximum linear memory in bytes. Default 128 MiB. Hard ceiling is 128 MiB. */
  memoryLimitBytes?: number;
  /** Wall-clock backstop in ms in case metering doesn't catch a hang. Default 5,000ms. */
  timeoutMs?: number;
}

export interface WasmExecutionResult {
  success: boolean;
  executionId: string;
  returnValue: number | null;
  gasUsed: number;
  gasLimit: number;
  memoryUsedBytes: number;
  memoryLimitBytes: number;
  durationMs: number;
  terminationReason: WasmTerminationReason;
  error?: string;
}

export const DEFAULT_GAS_LIMIT = 5_000_000;
export const HARD_MEMORY_LIMIT_BYTES = 128 * 1024 * 1024; // 128 MB, per acceptance criteria
export const DEFAULT_TIMEOUT_MS = 5_000;

/** Import module/field the engine itself supplies. Nothing else is allowed. */
const ALLOWED_IMPORT_MODULE = 'metering';
const ALLOWED_IMPORT_FIELD = 'usegas';

interface StaticValidationOk {
  ok: true;
  memoryLimitPages: number;
  importsHostMemory: boolean;
}
interface StaticValidationFail {
  ok: false;
  reason: WasmTerminationReason;
  error: string;
}

/**
 * Performs all pre-instantiation safety checks. Never touches the wasm
 * runtime — pure static analysis of the binary.
 */
function staticallyValidate(
  wasmBytes: Uint8Array,
  memoryLimitBytes: number
): StaticValidationOk | StaticValidationFail {
  let inspection;
  try {
    inspection = inspectWasmModule(wasmBytes);
  } catch (err) {
    const message = err instanceof WasmParseError ? err.message : String(err);
    return { ok: false, reason: 'invalid-module', error: `Could not parse module: ${message}` };
  }

  // Host-call sandboxing: reject any function/table/global import that isn't
  // the metering hook we provide. A `mem` import is handled separately below
  // (the engine supplies a capped WebAssembly.Memory for it) — it is not a
  // "host call" surface and is exempt from this whitelist.
  for (const imp of inspection.imports) {
    if (imp.kind === 'mem') continue;
    const isMeteringImport = imp.module === ALLOWED_IMPORT_MODULE && imp.name === ALLOWED_IMPORT_FIELD;
    if (!isMeteringImport) {
      return {
        ok: false,
        reason: 'host-call-violation',
        error:
          `Module imports '${imp.module}.${imp.name}' (${imp.kind}), which the sandbox does not ` +
          `provide. Only a deterministic gas-metering hook is available to guest code.`,
      };
    }
  }

  const limitPages = pagesForBytes(memoryLimitBytes);

  if (!inspection.memory) {
    // No memory at all is fine — nothing to bound.
    return { ok: true, memoryLimitPages: limitPages, importsHostMemory: false };
  }

  if (inspection.memory.imported) {
    // We will supply a capped WebAssembly.Memory ourselves — always safe.
    return { ok: true, memoryLimitPages: limitPages, importsHostMemory: true };
  }

  // Locally-defined memory: its ceiling is baked into the binary and we
  // cannot override it post-hoc, so we require it to already declare a
  // maximum that fits inside our budget. Unbounded (`maxPages === null`)
  // or oversized memories are rejected before instantiation.
  if (inspection.memory.maxPages === null) {
    return {
      ok: false,
      reason: 'memory-limit-exceeded',
      error: 'Module defines a local memory with no declared maximum (unbounded growth is not permitted).',
    };
  }
  if (inspection.memory.maxPages > limitPages) {
    return {
      ok: false,
      reason: 'memory-limit-exceeded',
      error:
        `Module's declared memory maximum (${inspection.memory.maxPages} pages, ` +
        `${inspection.memory.maxPages * 65_536} bytes) exceeds the sandbox limit of ` +
        `${limitPages} pages (${memoryLimitBytes} bytes).`,
    };
  }

  return { ok: true, memoryLimitPages: limitPages, importsHostMemory: false };
}

/**
 * The worker's entire program, expressed as a source string so it can be
 * spawned with `{ eval: true }`. This sidesteps any dependency on how the
 * *host* module was loaded (ts-node/tsx in dev, tsc-emitted JS in
 * production, babel-jest in tests) — the worker only ever needs a plain
 * ESM-capable Node runtime, which `worker_threads` always provides.
 */
const WORKER_SOURCE = `
import { parentPort, workerData } from 'worker_threads';

const respond = (msg) => parentPort.postMessage(msg);

try {
  const meteringMod = await import('wasm-metering');
  const metering = meteringMod.default ?? meteringMod;

  const { wasmBase64, functionName, args, gasLimit, memoryLimitBytes, importsHostMemory } = workerData;
  const wasmBytes = Buffer.from(wasmBase64, 'base64');

  const metered = metering.meterWASM(wasmBytes, { meterType: 'i32' });

  let gasUsed = 0;
  let gasExceeded = false;

  const imports = {
    metering: {
      usegas: (amount) => {
        gasUsed += amount;
        if (gasUsed > gasLimit) {
          gasExceeded = true;
          throw new Error('__SANDBOX_OUT_OF_GAS__');
        }
      },
    },
  };

  if (importsHostMemory) {
    const pages = Math.max(1, Math.ceil(memoryLimitBytes / 65536));
    imports.env = { memory: new WebAssembly.Memory({ initial: 1, maximum: pages }) };
  }

  const mod = new WebAssembly.Module(metered);
  const instance = new WebAssembly.Instance(mod, imports);

  const fn = instance.exports[functionName];
  if (typeof fn !== 'function') {
    respond({
      success: false,
      returnValue: null,
      gasUsed,
      memoryUsedBytes: 0,
      terminationReason: 'invalid-module',
      error: \`Exported function '\${functionName}' not found.\`,
    });
  } else {
    let returnValue = null;
    try {
      const raw = fn(...(args ?? []));
      returnValue = typeof raw === 'bigint' ? Number(raw) : (raw ?? null);
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      if (gasExceeded || message.includes('__SANDBOX_OUT_OF_GAS__')) {
        respond({
          success: false,
          returnValue: null,
          gasUsed,
          memoryUsedBytes: 0,
          terminationReason: 'gas-exhausted',
          error: \`Execution exceeded gas budget of \${gasLimit} units.\`,
        });
        parentPort.close?.();
        process.exit(0);
      }

      const isMemoryError = message.includes('memory') || err?.constructor?.name === 'RangeError';
      respond({
        success: false,
        returnValue: null,
        gasUsed,
        memoryUsedBytes: 0,
        terminationReason: isMemoryError ? 'memory-limit-exceeded' : 'trap',
        error: message,
      });
      parentPort.close?.();
      process.exit(0);
    }

    let memoryUsedBytes = 0;
    const mem = instance.exports.memory;
    if (mem && mem.buffer) memoryUsedBytes = mem.buffer.byteLength;

    respond({
      success: true,
      returnValue,
      gasUsed,
      memoryUsedBytes,
      terminationReason: 'completed',
    });
  }
} catch (err) {
  respond({
    success: false,
    returnValue: null,
    gasUsed: 0,
    memoryUsedBytes: 0,
    terminationReason: 'invalid-module',
    error: err && err.message ? err.message : String(err),
  });
}
`;

interface WorkerMessage {
  success: boolean;
  returnValue: number | null;
  gasUsed: number;
  memoryUsedBytes: number;
  terminationReason: WasmTerminationReason;
  error?: string;
}

/**
 * Runs `request` inside an isolated worker thread and resolves once the
 * guest module completes, traps, exhausts its gas budget, or is
 * terminated for exceeding the wall-clock backstop. Never rejects for
 * guest-code failures — those are reported via `success: false` in the
 * result, matching the "runaway code must not crash the host process"
 * requirement.
 */
export async function runSandboxedWasm(request: WasmExecutionRequest): Promise<WasmExecutionResult> {
  const executionId = randomUUID();
  const gasLimit = request.gasLimit ?? DEFAULT_GAS_LIMIT;
  const memoryLimitBytes = Math.min(request.memoryLimitBytes ?? HARD_MEMORY_LIMIT_BYTES, HARD_MEMORY_LIMIT_BYTES);
  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const start = process.hrtime.bigint();

  const finish = (
    partial: Omit<WasmExecutionResult, 'executionId' | 'gasLimit' | 'memoryLimitBytes' | 'durationMs'>
  ): WasmExecutionResult => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    return { ...partial, executionId, gasLimit, memoryLimitBytes, durationMs };
  };

  let wasmBytes: Buffer;
  try {
    wasmBytes = Buffer.from(request.wasmBase64, 'base64');
  } catch {
    return finish({
      success: false,
      returnValue: null,
      gasUsed: 0,
      memoryUsedBytes: 0,
      terminationReason: 'invalid-module',
      error: 'wasmBase64 is not valid base64.',
    });
  }

  const validation = staticallyValidate(wasmBytes, memoryLimitBytes);
  if (!validation.ok) {
    logger.warn('[wasmSandboxEngine] Rejected module before instantiation', {
      executionId,
      reason: validation.reason,
      error: validation.error,
    });
    return finish({
      success: false,
      returnValue: null,
      gasUsed: 0,
      memoryUsedBytes: 0,
      terminationReason: validation.reason,
      error: validation.error,
    });
  }

  return new Promise<WasmExecutionResult>((resolve) => {
    let settled = false;
    const worker = new Worker(WORKER_SOURCE, {
      eval: true,
      workerData: {
        wasmBase64: request.wasmBase64,
        functionName: request.functionName,
        args: request.args ?? [],
        gasLimit,
        memoryLimitBytes,
        importsHostMemory: validation.importsHostMemory,
      },
      resourceLimits: {
        // Backstop cap on the worker's own JS heap; guest wasm memory is
        // bounded separately (host-provided capped Memory, or rejected
        // pre-instantiation when locally-defined and oversized).
        maxOldGenerationSizeMb: 256,
        maxYoungGenerationSizeMb: 64,
      },
    });

    const settle = (result: WasmExecutionResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.removeAllListeners();
      void worker.terminate();
      resolve(result);
    };

    const timer = setTimeout(() => {
      logger.warn('[wasmSandboxEngine] Wall-clock timeout — terminating worker', { executionId, timeoutMs });
      settle(
        finish({
          success: false,
          returnValue: null,
          gasUsed: gasLimit, // report as fully consumed — we can't know the true count
          memoryUsedBytes: 0,
          terminationReason: 'timeout',
          error: `Execution exceeded wall-clock timeout of ${timeoutMs}ms.`,
        })
      );
    }, timeoutMs);

    worker.once('message', (msg: WorkerMessage) => {
      settle(finish(msg));
    });

    worker.once('error', (err: Error) => {
      logger.error('[wasmSandboxEngine] Worker crashed', err);
      settle(
        finish({
          success: false,
          returnValue: null,
          gasUsed: 0,
          memoryUsedBytes: 0,
          terminationReason: 'trap',
          error: err.message,
        })
      );
    });

    worker.once('exit', (code) => {
      if (!settled && code !== 0) {
        settle(
          finish({
            success: false,
            returnValue: null,
            gasUsed: 0,
            memoryUsedBytes: 0,
            terminationReason: 'trap',
            error: `Worker exited with code ${code} before reporting a result.`,
          })
        );
      }
    });
  });
}
