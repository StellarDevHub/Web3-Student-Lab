/**
 * usePlaygroundExecution
 *
 * Lifecycle manager for playground compiles and WASM simulations.
 *
 *  - One worker at a time, created lazily on the first run.
 *  - The worker is terminated (never just abandoned) when:
 *      • the playground unmounts or the page is hidden/unloaded (pagehide),
 *      • a run is cancelled (hard stop frees all guest memory instantly),
 *      • the watchdog fires (runaway guest code),
 *      • the worker crashes (e.g. the browser killed it for memory),
 *      • it has served `maxRunsPerWorker` runs, or a run came close to the
 *        50 MB memory budget — so every session starts from a clean heap.
 *  - Stale results are dropped via per-run cancellation IDs.
 *  - Log history is bounded so repeated runs can't grow React state forever.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CompileLogEntry } from '../lib/compiler/compileTypes';
import {
  CANCELLATION_ID_HEADER,
  type CancellableCompileRequest,
  type CancellableSimulateRequest,
  type CancellableWorkerResponse,
  type CancellationId,
  type ExecutionPhase,
  type ExecutionState,
} from '../lib/compiler/cancellationTypes';
import { getApiEndpoint } from '../lib/env';
import {
  MAX_SESSION_MEMORY_BYTES,
  formatDiagnostic,
  makeDiagnostic,
  type MemoryUsage,
  type SimulationDiagnostic,
} from '../services/stellar/simulator';

/** Kill the worker if a run produces no terminal message within this window. */
export const WORKER_WATCHDOG_MS = 15_000;
/** Recycle the worker after this many runs so heap fragmentation can't accumulate. */
export const MAX_RUNS_PER_WORKER = 10;
/** Recycle early when a run used this fraction of the memory budget. */
export const MEMORY_RECYCLE_RATIO = 0.8;
/** Cap on retained log entries. */
export const MAX_LOG_ENTRIES = 500;

export interface SimulateOptions {
  args?: Array<number | bigint>;
  /** Resident memory budget for the session (capped at 50 MB). */
  maxMemoryBytes?: number;
}

/** Shape returned by the hook. */
export interface UsePlaygroundExecutionReturn {
  /** Current lifecycle state. */
  executionState: ExecutionState;
  /** Accumulated log entries for the current (or most recent) run. */
  compileLogs: CompileLogEntry[];
  /** Memory usage reported by the most recent simulation. */
  memoryUsage: MemoryUsage | null;
  /** Friendly diagnostic for the most recent failed simulation, if any. */
  diagnostic: SimulationDiagnostic | null;
  /** Kick off a compile. No-op if already running. */
  compile: (source: string, filePath: string) => void;
  /** Run an exported function of a WASM module. No-op if already running. */
  simulate: (wasm: ArrayBuffer | Uint8Array, exportName: string, options?: SimulateOptions) => void;
  /** Cancel the in-flight run. No-op when idle/complete. */
  cancel: () => void;
  /** Clear logs and reset to idle. */
  reset: () => void;
}

export interface UsePlaygroundExecutionOptions {
  /** Injectable for tests. */
  createWorker?: () => Worker;
  watchdogMs?: number;
  maxRunsPerWorker?: number;
}

function makeIdleState(): ExecutionState {
  return {
    cancellationId: null,
    phase: 'idle',
    statusMessage: 'Ready',
    queuePosition: null,
    enteredAt: Date.now(),
  };
}

function statusFor(phase: ExecutionPhase): string {
  switch (phase) {
    case 'idle':
      return 'Ready';
    case 'queued':
      return 'Queued — waiting for worker…';
    case 'running':
      return 'Running…';
    case 'complete':
      return 'Done';
    case 'cancelled':
      return 'Cancelled';
    case 'error':
      return 'Run failed';
    default:
      return '';
  }
}

function transition(
  prev: ExecutionState,
  phase: ExecutionPhase,
  cancellationId?: CancellationId | null
): ExecutionState {
  const id = cancellationId !== undefined ? cancellationId : prev.cancellationId;
  return {
    cancellationId: id,
    phase,
    statusMessage: statusFor(phase),
    queuePosition: phase === 'queued' ? 1 : null,
    enteredAt: Date.now(),
  };
}

function logEntry(level: CompileLogEntry['level'], message: string): CompileLogEntry {
  return {
    id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    level,
    timestamp: new Date().toLocaleTimeString(),
    message,
  };
}

function appendBounded(prev: CompileLogEntry[], next: CompileLogEntry[]): CompileLogEntry[] {
  const merged = prev.concat(next);
  return merged.length > MAX_LOG_ENTRIES ? merged.slice(merged.length - MAX_LOG_ENTRIES) : merged;
}

function defaultCreateWorker(): Worker {
  return new Worker(new URL('../lib/compiler/compile.worker.ts', import.meta.url), {
    type: 'module',
  });
}

/**
 * Base URL for backend contract API — normalized via getApiEndpoint to prevent
 * duplicate /api/v1 prefix bugs.
 */
const getContractsApiBase = (): string => getApiEndpoint('/contracts');

export function usePlaygroundExecution(
  options: UsePlaygroundExecutionOptions = {}
): UsePlaygroundExecutionReturn {
  const {
    createWorker = defaultCreateWorker,
    watchdogMs = WORKER_WATCHDOG_MS,
    maxRunsPerWorker = MAX_RUNS_PER_WORKER,
  } = options;

  const [executionState, setExecutionState] = useState<ExecutionState>(makeIdleState);
  const [compileLogs, setCompileLogs] = useState<CompileLogEntry[]>([]);
  const [memoryUsage, setMemoryUsage] = useState<MemoryUsage | null>(null);
  const [diagnostic, setDiagnostic] = useState<SimulationDiagnostic | null>(null);

  /** The authoritative "live" run id; worker messages for other ids are stale. */
  const currentIdRef = useRef<CancellationId | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const runsOnWorkerRef = useRef(0);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const createWorkerRef = useRef(createWorker);
  createWorkerRef.current = createWorker;

  const clearWatchdog = () => {
    if (watchdogRef.current !== null) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  };

  /** Terminate the worker and drop every reference to it. Idempotent. */
  const retireWorker = useCallback(() => {
    clearWatchdog();
    const worker = workerRef.current;
    if (!worker) return;
    workerRef.current = null;
    runsOnWorkerRef.current = 0;
    worker.onmessage = null;
    worker.onerror = null;
    worker.onmessageerror = null;
    try {
      worker.postMessage({ type: 'dispose' });
    } catch {
      // Already gone.
    }
    worker.terminate();
  }, []);

  /** End the current run with an engine-level diagnostic (timeout, crash). */
  const failCurrentRun = useCallback((diag: SimulationDiagnostic) => {
    const id = currentIdRef.current;
    if (!id) return;
    currentIdRef.current = null;
    if (!mountedRef.current) return;
    setDiagnostic(diag);
    setCompileLogs((prev) =>
      appendBounded(
        prev,
        formatDiagnostic(diag).map((line) => logEntry('error', line))
      )
    );
    setExecutionState((prev) => (prev.cancellationId === id ? transition(prev, 'error') : prev));
  }, []);

  const handleMessage = useCallback(
    (event: MessageEvent<CancellableWorkerResponse>) => {
      const msg = event.data;
      const currentId = currentIdRef.current;
      if (!msg || msg.cancellationId !== currentId || !mountedRef.current) return;

      if (msg.type === 'log') {
        setCompileLogs((prev) => appendBounded(prev, [msg.entry]));
        return;
      }

      clearWatchdog();
      currentIdRef.current = null;

      if (msg.type === 'cancelled') {
        setExecutionState((prev) =>
          prev.cancellationId === currentId ? transition(prev, 'cancelled') : prev
        );
        return;
      }

      // complete
      if (msg.memory) setMemoryUsage(msg.memory);
      setDiagnostic(msg.diagnostic ?? null);
      setExecutionState((prev) =>
        prev.cancellationId === currentId ? transition(prev, msg.success ? 'complete' : 'error') : prev
      );

      const nearLimit =
        msg.memory && msg.memory.peakBytes >= msg.memory.limitBytes * MEMORY_RECYCLE_RATIO;
      if (nearLimit || msg.diagnostic?.code === 'out-of-memory') {
        // Start the next run from a fresh heap.
        retireWorker();
      }
    },
    [retireWorker]
  );

  const ensureWorker = useCallback((): Worker | null => {
    if (workerRef.current && runsOnWorkerRef.current >= maxRunsPerWorker) {
      retireWorker();
    }
    if (workerRef.current) return workerRef.current;
    try {
      const worker = createWorkerRef.current();
      worker.onmessage = handleMessage as (event: MessageEvent) => void;
      worker.onerror = (event: ErrorEvent) => {
        event.preventDefault?.();
        retireWorker();
        failCurrentRun(makeDiagnostic('worker-crashed', event.message || undefined));
      };
      worker.onmessageerror = () => {
        retireWorker();
        failCurrentRun(makeDiagnostic('worker-crashed', 'Worker message could not be deserialized'));
      };
      workerRef.current = worker;
      runsOnWorkerRef.current = 0;
      return worker;
    } catch (error) {
      console.error('Failed to start playground worker:', error);
      return null;
    }
  }, [failCurrentRun, handleMessage, maxRunsPerWorker, retireWorker]);

  // ── Teardown on unmount / navigation ──────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    const onPageHide = () => {
      currentIdRef.current = null;
      abortControllerRef.current?.abort();
      retireWorker();
    };
    window.addEventListener('pagehide', onPageHide);
    return () => {
      mountedRef.current = false;
      window.removeEventListener('pagehide', onPageHide);
      currentIdRef.current = null;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      retireWorker();
    };
  }, [retireWorker]);

  /** Shared start sequence for compile and simulate. Returns false if busy. */
  const startRun = useCallback(
    (
      build: (id: CancellationId) => CancellableCompileRequest | CancellableSimulateRequest,
      transfer: Transferable[] = []
    ): CancellationId | null => {
      if (currentIdRef.current !== null) return null;

      const cancellationId: CancellationId = crypto.randomUUID();
      currentIdRef.current = cancellationId;
      setCompileLogs([]);
      setDiagnostic(null);
      setExecutionState(transition(makeIdleState(), 'queued', cancellationId));

      const worker = ensureWorker();
      if (!worker) {
        failCurrentRun(makeDiagnostic('worker-crashed', 'Web Workers are unavailable in this browser'));
        return null;
      }

      runsOnWorkerRef.current += 1;
      setExecutionState(transition(makeIdleState(), 'running', cancellationId));
      worker.postMessage(build(cancellationId), transfer);

      clearWatchdog();
      watchdogRef.current = setTimeout(() => {
        watchdogRef.current = null;
        if (currentIdRef.current !== cancellationId) return;
        retireWorker();
        failCurrentRun(
          makeDiagnostic('timeout', `No response from the simulation engine after ${Math.round(watchdogMs / 1000)}s`)
        );
      }, watchdogMs);

      return cancellationId;
    },
    [ensureWorker, failCurrentRun, retireWorker, watchdogMs]
  );

  // ── compile ───────────────────────────────────────────────────────────────
  const compile = useCallback(
    (source: string, filePath: string) => {
      const id = startRun((cancellationId) => ({
        type: 'compile',
        cancellationId,
        source,
        filePath,
      }));
      if (!id) return;

      // Best-effort backend notification so the server can register the id for
      // /cancel. The browser compile result is authoritative.
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();
      fetch(`${getContractsApiBase()}/compile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [CANCELLATION_ID_HEADER]: id,
        },
        body: JSON.stringify({
          sourceCode: source,
          compilerVersion: '21.0.0',
          optimization: false,
          target: 'soroban',
        }),
        signal: abortControllerRef.current.signal,
      }).catch(() => {
        // Network errors are non-fatal for the browser-based compile workflow.
      });
    },
    [startRun]
  );

  // ── simulate ──────────────────────────────────────────────────────────────
  const simulate = useCallback(
    (wasm: ArrayBuffer | Uint8Array, exportName: string, simOptions: SimulateOptions = {}) => {
      // Copy into a standalone buffer that can be transferred (zero-copy) to
      // the worker without detaching the caller's data.
      const source = wasm instanceof Uint8Array ? wasm : new Uint8Array(wasm);
      const bytes = source.slice().buffer as ArrayBuffer;
      startRun(
        (cancellationId) => ({
          type: 'simulate',
          cancellationId,
          wasm: bytes,
          exportName,
          args: simOptions.args,
          maxMemoryBytes: Math.min(
            simOptions.maxMemoryBytes ?? MAX_SESSION_MEMORY_BYTES,
            MAX_SESSION_MEMORY_BYTES
          ),
        }),
        [bytes]
      );
    },
    [startRun]
  );

  // ── cancel ────────────────────────────────────────────────────────────────
  const cancel = useCallback(() => {
    const id = currentIdRef.current;
    if (!id) return;
    currentIdRef.current = null;

    // Hard stop: terminating the worker is the only way to interrupt running
    // guest code and it releases all of its memory at once. A fresh worker is
    // created lazily on the next run.
    retireWorker();
    abortControllerRef.current?.abort();

    fetch(`${getContractsApiBase()}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cancellationId: id }),
    }).catch(() => {});

    setExecutionState((prev) => (prev.cancellationId === id ? transition(prev, 'cancelled') : prev));
  }, [retireWorker]);

  // ── reset ─────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    if (currentIdRef.current) retireWorker();
    currentIdRef.current = null;
    setCompileLogs([]);
    setDiagnostic(null);
    setMemoryUsage(null);
    setExecutionState(makeIdleState());
  }, [retireWorker]);

  return { executionState, compileLogs, memoryUsage, diagnostic, compile, simulate, cancel, reset };
}
