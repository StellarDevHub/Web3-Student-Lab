/**
 * Compile / simulation runtime used by `compile.worker.ts`.
 *
 * Kept free of worker globals so it can be unit-tested directly. Lifecycle
 * guarantees:
 *
 *  - Every request owns exactly one token; its timers and listeners are torn
 *    down in `finally`, and the token is removed from the registry, so nothing
 *    accumulates across runs.
 *  - Each simulation runs in a fresh `SimulationSession` that is always
 *    disposed, releasing the guest's WebAssembly.Memory.
 *  - `dispose` cancels everything in flight and closes the worker.
 */

import type { CompileLogEntry } from './compileTypes';
import type {
  CancellableCompileRequest,
  CancellableSimulateRequest,
  CancellableWorkerCompleteMessage,
  CancellableWorkerInbound,
  CancellableWorkerResponse,
  CancellationId,
} from './cancellationTypes';
import {
  MAX_SESSION_MEMORY_BYTES,
  formatBytes,
  formatDiagnostic,
  runIsolatedSimulation,
} from '../../services/stellar/simulator';

/** Hard ceiling for the (simulated) compile pipeline. */
export const COMPILE_TIMEOUT_MS = 3_000;

interface RequestToken {
  cancelled: boolean;
  onCancel: Set<() => void>;
}

export interface CompileWorkerRuntime {
  handle(message: CancellableWorkerInbound): Promise<void>;
  /** Number of requests currently tracked (should return to 0 between runs). */
  readonly activeRequests: number;
}

export interface RuntimeOptions {
  post: (message: CancellableWorkerResponse) => void;
  /** Called after `dispose`; the worker passes `self.close`. */
  close?: () => void;
  compileTimeoutMs?: number;
  /** Delay multiplier for the simulated compile stages (tests use 0). */
  stageDelayScale?: number;
}

class CancelledError extends Error {
  constructor() {
    super('cancelled');
    this.name = 'CancelledError';
  }
}

class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Execution timeout: compile stopped after ${Math.round(ms / 1000)} seconds`);
    this.name = 'TimeoutError';
  }
}

function makeLog(level: CompileLogEntry['level'], message: string): CompileLogEntry {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    level,
    timestamp: new Date().toLocaleTimeString(),
    message,
  };
}

function collectExports(source: string): string[] {
  const exports: string[] = [];
  const regex = /\bpub\s+fn\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(source))) {
    exports.push(match[1]);
  }
  return Array.from(new Set(exports));
}

export function analyzeSource(source: string) {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!source.trim()) {
    errors.push('Source is empty. Please add Rust source code before compiling.');
  }
  if (/\bfn\s+main\s*\(/.test(source)) {
    errors.push('`fn main` is not allowed in Soroban contract source; use contract entry points instead.');
  }
  if (/\bstd::/.test(source) || /use\s+std::/.test(source)) {
    errors.push('Standard library imports are unavailable in no_std Soroban contracts. Use `soroban_sdk` instead.');
  }
  if (!/use\s+soroban_sdk/.test(source)) {
    warnings.push('No `use soroban_sdk` import was found. Soroban contracts typically require `soroban_sdk` imports.');
  }
  if (!/#\[\s*contract\s*\]/.test(source)) {
    warnings.push('Missing `#[contract]` attribute above the main contract struct declaration.');
  }
  if (!/#\[\s*contractimpl\s*\]/.test(source)) {
    warnings.push('Missing `#[contractimpl]` block. Contract functions may not be exported properly without it.');
  }

  const exports = collectExports(source);
  if (exports.length === 0) {
    warnings.push('No exported `pub fn` contract methods were found. Add public functions to expose contract actions.');
  }

  return { errors, warnings, exports };
}

function estimateWasmSizeKb(source: string) {
  return Math.max(4, Math.min(96, Math.ceil(source.length / 200)));
}

export function createCompileWorkerRuntime({
  post,
  close,
  compileTimeoutMs = COMPILE_TIMEOUT_MS,
  stageDelayScale = 1,
}: RuntimeOptions): CompileWorkerRuntime {
  const tokens = new Map<CancellationId, RequestToken>();
  let closed = false;

  const log = (id: CancellationId, level: CompileLogEntry['level'], message: string) =>
    post({ type: 'log', cancellationId: id, entry: makeLog(level, message) });

  const complete = (
    id: CancellationId,
    payload: Omit<CancellableWorkerCompleteMessage, 'type' | 'cancellationId'>
  ) => post({ type: 'complete', cancellationId: id, ...payload });

  const cancelToken = (token: RequestToken) => {
    if (token.cancelled) return;
    token.cancelled = true;
    token.onCancel.forEach((fn) => fn());
    token.onCancel.clear();
  };

  /** Sleep that rejects immediately when the request is cancelled. */
  const sleep = (ms: number, token: RequestToken) =>
    new Promise<void>((resolve, reject) => {
      if (token.cancelled) return reject(new CancelledError());
      const timer = setTimeout(() => {
        token.onCancel.delete(onCancel);
        resolve();
      }, ms * stageDelayScale);
      const onCancel = () => {
        clearTimeout(timer);
        reject(new CancelledError());
      };
      token.onCancel.add(onCancel);
    });

  /** Run `work` with a deadline; the deadline timer is always cleared. */
  const withDeadline = <T>(work: Promise<T>, ms: number, token: RequestToken) =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        cancelToken(token);
        reject(new TimeoutError(ms));
      }, ms);
      work.then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (e) => {
          clearTimeout(timer);
          reject(e);
        }
      );
    });

  async function compilePipeline(request: CancellableCompileRequest, token: RequestToken) {
    const { source, filePath, cancellationId: id } = request;
    log(id, 'info', `Starting sandboxed worker compile for ${filePath}`);

    await sleep(200, token);
    log(id, 'info', 'Resolving Soroban dependencies...');
    await sleep(250, token);
    log(id, 'info', 'Checking Rust target wasm32-unknown-unknown...');
    await sleep(350, token);
    log(id, 'info', 'Performing static analysis and WebAssembly emission...');
    await sleep(400, token);

    const start = performance.now();
    const { errors, warnings, exports } = analyzeSource(source);
    const durationMs = Math.max(120, Math.round(performance.now() - start));
    const wasmSizeKb = estimateWasmSizeKb(source);

    if (token.cancelled) throw new CancelledError();

    for (const warning of warnings) log(id, 'info', `Warning: ${warning}`);

    if (errors.length > 0) {
      for (const error of errors) log(id, 'error', error);
      log(id, 'error', 'Browser compile failed. Review the errors above and try again.');
      complete(id, { success: false, warnings, errors, exports, wasmSizeKb, durationMs });
      return;
    }

    log(id, 'success', `Compilation successful. WASM size: ${wasmSizeKb}KB`);
    log(
      id,
      'success',
      `Contract ready for simulation. Exports: ${exports.length > 0 ? exports.join(', ') : 'none'}.`
    );
    complete(id, { success: true, warnings, errors, exports, wasmSizeKb, durationMs });
  }

  async function simulatePipeline(request: CancellableSimulateRequest, token: RequestToken) {
    const { cancellationId: id, wasm, exportName, args = [] } = request;
    const limit = Math.min(request.maxMemoryBytes ?? MAX_SESSION_MEMORY_BYTES, MAX_SESSION_MEMORY_BYTES);
    log(id, 'info', `Simulating ${exportName}() — memory limit ${formatBytes(limit)}`);

    const result = await runIsolatedSimulation({
      wasm,
      exportName,
      args,
      maxMemoryBytes: limit,
    });
    if (token.cancelled) throw new CancelledError();

    const memoryLine = `Peak WASM memory: ${formatBytes(result.memory.peakBytes)} / ${formatBytes(result.memory.limitBytes)}`;
    const wasmSizeKb = Math.ceil(wasm.byteLength / 1024);

    if (result.ok) {
      const rendered = typeof result.value === 'bigint' ? result.value.toString() : String(result.value);
      log(id, 'success', `${exportName}() returned ${rendered} in ${result.durationMs.toFixed(1)} ms`);
      log(id, 'info', memoryLine);
      complete(id, {
        success: true,
        warnings: [],
        errors: [],
        exports: result.exports,
        wasmSizeKb,
        durationMs: Math.round(result.durationMs),
        memory: result.memory,
        result: rendered,
      });
      return;
    }

    const lines = formatDiagnostic(result.diagnostic);
    for (const line of lines) log(id, 'error', line);
    log(id, 'info', memoryLine);
    complete(id, {
      success: false,
      warnings: [],
      errors: [lines[0]],
      exports: result.exports,
      wasmSizeKb,
      durationMs: Math.round(result.durationMs),
      memory: result.memory,
      diagnostic: result.diagnostic,
    });
  }

  async function run(
    request: CancellableCompileRequest | CancellableSimulateRequest,
    pipeline: (token: RequestToken) => Promise<void>,
    timeoutMs: number | null
  ) {
    const id = request.cancellationId;
    const token: RequestToken = { cancelled: false, onCancel: new Set() };
    tokens.set(id, token);
    try {
      const work = pipeline(token);
      await (timeoutMs ? withDeadline(work, timeoutMs, token) : work);
    } catch (error) {
      if (error instanceof CancelledError) {
        post({ type: 'cancelled', cancellationId: id });
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      log(id, 'error', error instanceof TimeoutError ? message : `Unexpected browser compile error: ${message}`);
      complete(id, {
        success: false,
        warnings: [],
        errors: [message],
        exports: [],
        wasmSizeKb: 0,
        durationMs: error instanceof TimeoutError ? timeoutMs ?? 0 : 0,
      });
    } finally {
      token.onCancel.clear();
      tokens.delete(id);
    }
  }

  return {
    get activeRequests() {
      return tokens.size;
    },

    async handle(message) {
      if (closed) return;
      switch (message.type) {
        case 'cancel': {
          const token = tokens.get(message.cancellationId);
          if (token) cancelToken(token);
          return;
        }
        case 'dispose': {
          closed = true;
          tokens.forEach((token) => cancelToken(token));
          tokens.clear();
          close?.();
          return;
        }
        case 'compile':
          return run(message, (token) => compilePipeline(message, token), compileTimeoutMs);
        case 'simulate':
          // Synchronous guest code can't be pre-empted here; the page-side
          // watchdog terminates the whole worker if a guest never returns.
          return run(message, (token) => simulatePipeline(message, token), null);
      }
    },
  };
}
