/**
 * Sandboxed WASM Execution Engine — BE-010
 *
 * Evaluates untrusted student contract bytecode against a list of test cases
 * with hard, non-negotiable resource ceilings:
 *
 *  - 50 MB linear-memory ceiling. Local memories must declare a maximum
 *    within budget (checked statically by `wasmValidator`); imported
 *    memories are supplied by the sandbox already capped. `memory.grow`
 *    past the cap simply returns -1, so a memory bomb degrades into a
 *    gas-burning loop that the meter then stops.
 *  - 1,000,000 gas. Bytecode is instrumented with `wasm-metering` before it
 *    is ever compiled, so every basic block charges the shared budget and
 *    infinite loops halt deterministically.
 *  - 2 second wall-clock execution timeout as a backstop. The worker is
 *    force-terminated, which also covers pathological cases the meter
 *    cannot see (e.g. a single very expensive host-side operation).
 *  - Deep recursion is bounded by the worker's own small stack and surfaces
 *    as a `stack-overflow` result rather than crashing the host.
 *
 * Isolation: guest code runs inside a dedicated `worker_threads` Worker that
 * is given an empty environment (`env: {}`), no inherited exec flags, and a
 * capped V8 heap. The only import the instantiated module receives is the
 * gas hook — the validator rejects any module that imports a function,
 * table or global — so there is no path from guest code to the filesystem,
 * network sockets, child processes or environment variables.
 *
 * Gas consumption is mirrored into a SharedArrayBuffer on every metering
 * call, which lets the host report an accurate figure even when it has to
 * kill a worker that is stuck past the wall-clock limit.
 */

import { randomUUID } from 'crypto';
import os from 'os';
import { Worker } from 'worker_threads';
import logger from '../utils/logger.js';
import { validateWasmModule, type WasmValidationCode } from '../utils/wasmValidator.js';

export const SANDBOX_MEMORY_LIMIT_BYTES = 50 * 1024 * 1024;
export const SANDBOX_GAS_LIMIT = 1_000_000;
export const SANDBOX_TIMEOUT_MS = 2_000;
/** Budget for spawning the worker and metering/compiling the module, separate from execution time. */
export const SANDBOX_STARTUP_TIMEOUT_MS = 10_000;
export const MAX_TEST_CASES = 64;

export type SandboxTerminationReason =
  | 'completed'
  | 'gas-exhausted'
  | 'timeout'
  | 'memory-limit-exceeded'
  | 'stack-overflow'
  | 'trap'
  | 'validation-failed'
  | 'internal-error';

export type WasmArgument = number | string;
export type WasmValue = number | string | null;

export interface WasmTestCase {
  name: string;
  functionName: string;
  /** Strings of the form `123` / `-5n` are passed as BigInt (for i64 parameters). */
  args?: WasmArgument[];
  /** When omitted, the test passes as long as the call returns without trapping. */
  expected?: WasmValue;
}

export type WasmTestStatus = 'passed' | 'failed' | 'error' | 'skipped';

export interface WasmTestOutcome {
  name: string;
  functionName: string;
  status: WasmTestStatus;
  expected?: WasmValue;
  actual: WasmValue;
  gasUsed: number;
  durationMs: number;
  terminationReason?: SandboxTerminationReason;
  error?: string;
}

export interface SandboxRunRequest {
  wasmBase64: string;
  tests: WasmTestCase[];
  /** Overrides may only tighten the defaults, never loosen them. */
  gasLimit?: number;
  memoryLimitBytes?: number;
  timeoutMs?: number;
}

export interface SandboxRunResult {
  executionId: string;
  status: 'passed' | 'failed' | 'error';
  terminationReason: SandboxTerminationReason;
  gasUsed: number;
  gasLimit: number;
  memoryPeakBytes: number;
  memoryLimitBytes: number;
  durationMs: number;
  tests: WasmTestOutcome[];
  summary: { total: number; passed: number; failed: number; errored: number; skipped: number };
  validationCode?: WasmValidationCode;
  error?: string;
}

type WorkerToHostMessage =
  | { type: 'ready' }
  | { type: 'test'; index: number; outcome: WasmTestOutcome; memoryBytes: number }
  | { type: 'done'; terminationReason: SandboxTerminationReason }
  | { type: 'fatal'; terminationReason: SandboxTerminationReason; error: string };

/**
 * The worker's program. Kept as a source string and spawned with
 * `eval: true` so it runs identically under tsx, compiled `dist/` output and
 * babel-jest without depending on how the host module was loaded.
 */
const WORKER_SOURCE = `
const { parentPort, workerData } = require('worker_threads');
const metering = require('wasm-metering');

const { wasm, tests, gasLimit, memoryLimitPages, importsMemory, gasCounter } = workerData;
const gas = new Int32Array(gasCounter);
const OUT_OF_GAS = '__SANDBOX_OUT_OF_GAS__';
const send = (msg) => parentPort.postMessage(msg);

const classify = (err, gasExceeded) => {
  const message = err && err.message ? String(err.message) : String(err);
  if (gasExceeded || message.includes(OUT_OF_GAS)) {
    return { reason: 'gas-exhausted', message: 'Execution exceeded the gas budget of ' + gasLimit + ' units.' };
  }
  if (err instanceof RangeError && /call stack/i.test(message)) {
    return { reason: 'stack-overflow', message: 'Maximum call stack depth exceeded (unbounded recursion).' };
  }
  if (err instanceof RangeError && /memory|allocat/i.test(message)) {
    return { reason: 'memory-limit-exceeded', message };
  }
  return { reason: 'trap', message };
};

const toArg = (value) => {
  if (typeof value === 'string' && /^-?\\d+n?$/.test(value)) return BigInt(value.replace(/n$/, ''));
  return value;
};

const normalize = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number') return value;
  return String(value);
};

const sameValue = (actual, expected) => {
  if (typeof actual === 'number' && typeof expected === 'number') {
    return Object.is(actual, expected) || actual === expected;
  }
  return String(actual) === String(expected);
};

let module;
try {
  const meteredBytes = metering.meterWASM(Buffer.from(wasm), { meterType: 'i32' });
  module = new WebAssembly.Module(meteredBytes);
} catch (err) {
  send({ type: 'fatal', terminationReason: 'validation-failed', error: 'Unable to meter module: ' + (err && err.message ? err.message : String(err)) });
  module = null;
}

if (module) {
  let gasUsed = 0;
  let gasExceeded = false;
  const usegas = (amount) => {
    gasUsed += amount;
    Atomics.store(gas, 0, Math.min(gasUsed, 0x7fffffff));
    if (gasUsed > gasLimit) {
      gasExceeded = true;
      throw new Error(OUT_OF_GAS);
    }
  };

  send({ type: 'ready' });

  let terminationReason = 'completed';
  for (let index = 0; index < tests.length; index++) {
    const test = tests[index];
    const gasBefore = gasUsed;
    const started = process.hrtime.bigint();
    const outcome = { name: test.name, functionName: test.functionName, actual: null, gasUsed: 0, durationMs: 0 };
    if (test.expected !== undefined) outcome.expected = test.expected;
    let memoryBytes = 0;

    try {
      // Fresh instance per test: no state leaks between cases, gas is shared.
      const imports = { metering: { usegas } };
      let memory = null;
      if (importsMemory) {
        memory = new WebAssembly.Memory({ initial: 1, maximum: memoryLimitPages });
        imports.env = { memory };
      }
      const instance = new WebAssembly.Instance(module, imports);
      const exported = instance.exports.memory;
      if (!memory && exported instanceof WebAssembly.Memory) memory = exported;

      const fn = instance.exports[test.functionName];
      if (typeof fn !== 'function') {
        outcome.status = 'error';
        outcome.terminationReason = 'trap';
        outcome.error = "Exported function '" + test.functionName + "' not found.";
      } else {
        try {
          outcome.actual = normalize(fn(...(test.args || []).map(toArg)));
        } finally {
          if (memory) memoryBytes = memory.buffer.byteLength;
        }
        outcome.terminationReason = 'completed';
        outcome.status = test.expected === undefined || sameValue(outcome.actual, test.expected) ? 'passed' : 'failed';
      }
    } catch (err) {
      const { reason, message } = classify(err, gasExceeded);
      outcome.status = 'error';
      outcome.terminationReason = reason;
      outcome.error = message;
    }

    outcome.gasUsed = Math.min(gasUsed, gasLimit) - Math.min(gasBefore, gasLimit);
    outcome.durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    send({ type: 'test', index, outcome, memoryBytes });

    if (gasExceeded) {
      terminationReason = 'gas-exhausted';
      break;
    }
  }

  send({ type: 'done', terminationReason });
}
`;

// ---------------------------------------------------------------------------
// Concurrency guard — each sandbox is a full V8 isolate, so cap how many a
// single process runs at once regardless of how many callers there are.
// ---------------------------------------------------------------------------

const MAX_CONCURRENT_SANDBOXES = Math.max(
  1,
  Number(process.env.WASM_SANDBOX_MAX_CONCURRENCY) || Math.min(4, os.availableParallelism?.() ?? 2)
);
let activeSandboxes = 0;
const sandboxWaiters: Array<() => void> = [];

async function acquireSlot(): Promise<void> {
  if (activeSandboxes < MAX_CONCURRENT_SANDBOXES) {
    activeSandboxes++;
    return;
  }
  await new Promise<void>((resolve) => sandboxWaiters.push(resolve));
}

function releaseSlot(): void {
  const next = sandboxWaiters.shift();
  if (next) next();
  else activeSandboxes--;
}

const clampLimit = (requested: number | undefined, ceiling: number): number =>
  requested !== undefined && Number.isFinite(requested) && requested > 0 ? Math.min(requested, ceiling) : ceiling;

function summarize(tests: WasmTestOutcome[]): SandboxRunResult['summary'] {
  const count = (status: WasmTestStatus) => tests.filter((t) => t.status === status).length;
  return {
    total: tests.length,
    passed: count('passed'),
    failed: count('failed'),
    errored: count('error'),
    skipped: count('skipped'),
  };
}

/** @internal Test seam: lets tests substitute the worker program to exercise the host-side backstops. */
export interface SandboxInternals {
  workerSource?: string;
}

/**
 * Runs every test case against the submitted module. Never rejects because of
 * guest behaviour — hostile or broken submissions come back as structured
 * results with `status: 'error'` and a `terminationReason`.
 */
export async function runWasmEvaluation(
  request: SandboxRunRequest,
  internals: SandboxInternals = {}
): Promise<SandboxRunResult> {
  const executionId = randomUUID();
  const gasLimit = clampLimit(request.gasLimit, SANDBOX_GAS_LIMIT);
  const memoryLimitBytes = clampLimit(request.memoryLimitBytes, SANDBOX_MEMORY_LIMIT_BYTES);
  const timeoutMs = clampLimit(request.timeoutMs, SANDBOX_TIMEOUT_MS);
  const start = process.hrtime.bigint();
  const elapsedMs = () => Number(process.hrtime.bigint() - start) / 1e6;

  const tests = request.tests.slice(0, MAX_TEST_CASES);
  const pending: WasmTestOutcome[] = tests.map((test) => ({
    name: test.name,
    functionName: test.functionName,
    status: 'skipped',
    ...(test.expected !== undefined ? { expected: test.expected } : {}),
    actual: null,
    gasUsed: 0,
    durationMs: 0,
  }));

  const build = (
    terminationReason: SandboxTerminationReason,
    gasUsed: number,
    memoryPeakBytes: number,
    error?: string,
    validationCode?: WasmValidationCode
  ): SandboxRunResult => {
    const summary = summarize(pending);
    const ranToCompletion = terminationReason === 'completed';
    const status: SandboxRunResult['status'] = !ranToCompletion
      ? 'error'
      : summary.total > 0 && summary.passed === summary.total
        ? 'passed'
        : 'failed';
    return {
      executionId,
      status,
      terminationReason,
      gasUsed: Math.min(gasUsed, gasLimit),
      gasLimit,
      memoryPeakBytes,
      memoryLimitBytes,
      durationMs: elapsedMs(),
      tests: pending,
      summary,
      ...(validationCode ? { validationCode } : {}),
      ...(error ? { error } : {}),
    };
  };

  if (tests.length === 0) {
    return build('validation-failed', 0, 0, 'At least one test case is required.');
  }

  const validation = validateWasmModule(request.wasmBase64, {
    memoryLimitBytes,
    requiredExports: [...new Set(tests.map((t) => t.functionName))],
  });
  if (!validation.valid) {
    logger.warn('[wasmExecutionSandbox] Rejected submission before execution', {
      executionId,
      code: validation.issue.code,
    });
    return build('validation-failed', 0, 0, validation.issue.message, validation.issue.code);
  }

  await acquireSlot();
  try {
    return await new Promise<SandboxRunResult>((resolve) => {
      const gasCounter = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
      const gasView = new Int32Array(gasCounter);
      let memoryPeakBytes = 0;
      let currentIndex = 0;
      let settled = false;
      let executionTimer: NodeJS.Timeout | undefined;

      const worker = new Worker(internals.workerSource ?? WORKER_SOURCE, {
        eval: true,
        env: {},
        execArgv: [],
        argv: [],
        stdout: true,
        stderr: true,
        workerData: {
          wasm: validation.bytes,
          tests,
          gasLimit,
          memoryLimitPages: validation.memoryLimitPages,
          importsMemory: validation.importsMemory,
          gasCounter,
        },
        resourceLimits: {
          // Metering a module expands it into an AST, so the JS heap needs
          // some headroom; guest linear memory is capped separately above.
          maxOldGenerationSizeMb: 128,
          maxYoungGenerationSizeMb: 16,
          stackSizeMb: 4,
        },
      });

      const settle = (reason: SandboxTerminationReason, error?: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(startupTimer);
        clearTimeout(executionTimer);
        worker.removeAllListeners();
        void worker.terminate();
        resolve(build(reason, Atomics.load(gasView, 0), memoryPeakBytes, error));
      };

      const killCurrent = (reason: SandboxTerminationReason, message: string) => {
        const current = pending[currentIndex];
        if (current && current.status === 'skipped') {
          current.status = 'error';
          current.terminationReason = reason;
          current.error = message;
        }
        settle(reason, message);
      };

      const startupTimer = setTimeout(() => {
        logger.warn('[wasmExecutionSandbox] Worker failed to start in time', { executionId });
        settle('internal-error', `Sandbox did not start within ${SANDBOX_STARTUP_TIMEOUT_MS}ms.`);
      }, SANDBOX_STARTUP_TIMEOUT_MS);

      worker.on('message', (msg: WorkerToHostMessage) => {
        switch (msg.type) {
          case 'ready':
            clearTimeout(startupTimer);
            executionTimer = setTimeout(() => {
              logger.warn('[wasmExecutionSandbox] Wall-clock limit hit — terminating worker', {
                executionId,
                timeoutMs,
              });
              killCurrent('timeout', `Execution exceeded the wall-clock limit of ${timeoutMs}ms.`);
            }, timeoutMs);
            break;
          case 'test':
            pending[msg.index] = msg.outcome;
            currentIndex = msg.index + 1;
            memoryPeakBytes = Math.max(memoryPeakBytes, msg.memoryBytes);
            break;
          case 'done':
            settle(msg.terminationReason);
            break;
          case 'fatal':
            settle(msg.terminationReason, msg.error);
            break;
        }
      });

      worker.on('error', (err: Error & { code?: string }) => {
        if (err.code === 'ERR_WORKER_OUT_OF_MEMORY') {
          killCurrent('memory-limit-exceeded', 'Sandbox exceeded its heap allowance.');
          return;
        }
        logger.error('[wasmExecutionSandbox] Worker crashed', { executionId, error: err.message });
        killCurrent('internal-error', err.message);
      });

      worker.on('exit', (code) => {
        if (!settled) killCurrent('internal-error', `Sandbox exited with code ${code} before reporting.`);
      });
    });
  } finally {
    releaseSlot();
  }
}
