/**
 * usePlaygroundExecution
 *
 * Manages the full lifecycle of a playground compile operation:
 *   – Generates a unique cancellation ID per request.
 *   – Sends the cancellation ID to the compile worker and (optionally) the backend.
 *   – Guards against stale results: any message whose cancellationId differs from
 *     the current one is silently dropped.
 *   – Exposes an `ExecutionState` that the UI can render.
 *   – Provides a `cancel()` function that notifies both the worker and the backend.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CompileLogEntry } from '../lib/compiler/compileTypes';
import type {
  CancellableWorkerResponse,
  CancellationId,
  ExecutionPhase,
  ExecutionState,
} from '../lib/compiler/cancellationTypes';
import { CANCELLATION_ID_HEADER } from '../lib/compiler/cancellationTypes';

/** Shape returned by the hook. */
export interface UsePlaygroundExecutionReturn {
  /** Current lifecycle state. */
  executionState: ExecutionState;
  /** Accumulated compile log entries for the current (or most recent) run. */
  compileLogs: CompileLogEntry[];
  /** Call to kick off a compile. No-op if already running. */
  compile: (source: string, filePath: string) => void;
  /** Cancel the in-flight compile. No-op when idle/complete. */
  cancel: () => void;
  /** Clear logs and reset to idle. */
  reset: () => void;
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

function statusFor(phase: ExecutionPhase, cancellationId: CancellationId | null): string {
  switch (phase) {
    case 'idle':       return 'Ready';
    case 'queued':     return 'Queued — waiting for worker…';
    case 'running':    return 'Compiling…';
    case 'complete':   return 'Done';
    case 'cancelled':  return 'Cancelled';
    case 'error':      return 'Compilation failed';
    default:           return '';
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
    statusMessage: statusFor(phase, id),
    queuePosition: phase === 'queued' ? 1 : null,
    enteredAt: Date.now(),
  };
}

/** Base URL for backend contract API — falls back to relative when not set. */
const API_BASE = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/api/v1/contracts`
  : '/api/v1/contracts';

export function usePlaygroundExecution(): UsePlaygroundExecutionReturn {
  const [executionState, setExecutionState] = useState<ExecutionState>(makeIdleState);
  const [compileLogs, setCompileLogs] = useState<CompileLogEntry[]>([]);

  /**
   * currentIdRef is the authoritative "live" cancellation ID.
   * Any worker message whose ID does not match is stale and is discarded.
   */
  const currentIdRef = useRef<CancellationId | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ── Worker lifecycle ──────────────────────────────────────────────────────
  useEffect(() => {
    // Dynamically import the worker so Next.js bundles it correctly.
    const worker = new Worker(
      new URL('../lib/compiler/compile.worker.ts', import.meta.url),
      { type: 'module' }
    );

    const handleMessage = (event: MessageEvent<CancellableWorkerResponse>) => {
      const msg = event.data;
      const currentId = currentIdRef.current;

      // Stale-result guard: drop messages that belong to a previous request.
      if (msg.cancellationId !== currentId) return;

      if (msg.type === 'log') {
        setCompileLogs((prev) => [...prev, msg.entry]);
        return;
      }

      if (msg.type === 'cancelled') {
        setExecutionState((prev) =>
          prev.cancellationId === currentId
            ? transition(prev, 'cancelled')
            : prev
        );
        return;
      }

      if (msg.type === 'complete') {
        setExecutionState((prev) =>
          prev.cancellationId === currentId
            ? transition(prev, msg.success ? 'complete' : 'error')
            : prev
        );
      }
    };

    worker.addEventListener('message', handleMessage);
    workerRef.current = worker;

    return () => {
      worker.removeEventListener('message', handleMessage);
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  // ── compile ───────────────────────────────────────────────────────────────
  const compile = useCallback((source: string, filePath: string) => {
    // Already running — prevent double-submit.
    if (currentIdRef.current !== null) return;

    const cancellationId: CancellationId = crypto.randomUUID();
    currentIdRef.current = cancellationId;
    abortControllerRef.current = new AbortController();

    setCompileLogs([]);
    setExecutionState(transition(makeIdleState(), 'queued', cancellationId));

    if (!workerRef.current) {
      setExecutionState(transition(makeIdleState(), 'error', cancellationId));
      currentIdRef.current = null;
      return;
    }

    // Move to running state just before we send to the worker.
    setExecutionState(transition(makeIdleState(), 'running', cancellationId));

    workerRef.current.postMessage({
      type: 'compile',
      cancellationId,
      source,
      filePath,
    });

    // Best-effort backend notification — fire and forget, does not block the UI.
    // We send the ID so the server can register it in its registry and allow
    // the /cancel endpoint to short-circuit backend execution for future operations.
    const signal = abortControllerRef.current.signal;
    fetch(`${API_BASE}/compile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [CANCELLATION_ID_HEADER]: cancellationId,
      },
      body: JSON.stringify({
        // Minimal body that satisfies the backend schema; frontend compile
        // is browser-only so the server result is advisory only.
        sourceCode: source,
        compilerVersion: '21.0.0',
        optimization: false,
        target: 'soroban',
      }),
      signal,
    }).catch(() => {
      // Network errors are non-fatal for the browser-based compile workflow.
    });
  }, []);

  // ── cancel ────────────────────────────────────────────────────────────────
  const cancel = useCallback(() => {
    const id = currentIdRef.current;
    if (!id) return;

    // 1. Tell the worker to stop.
    workerRef.current?.postMessage({ type: 'cancel', cancellationId: id });

    // 2. Abort any in-flight fetch.
    abortControllerRef.current?.abort();

    // 3. Notify the backend (fire and forget).
    fetch(`${API_BASE}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cancellationId: id }),
    }).catch(() => {});

    // 4. Update UI state immediately — don't wait for worker confirmation.
    setExecutionState((prev) =>
      prev.cancellationId === id ? transition(prev, 'cancelled') : prev
    );

    // 5. Clear the current ID so a new compile can start.
    currentIdRef.current = null;
  }, []);

  // ── reset ─────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    currentIdRef.current = null;
    setCompileLogs([]);
    setExecutionState(makeIdleState());
  }, []);

  // When execution reaches a terminal state, unblock the current ID slot so
  // a new compile can be queued without calling reset().
  useEffect(() => {
    const { phase, cancellationId } = executionState;
    if (
      (phase === 'complete' || phase === 'error' || phase === 'cancelled') &&
      cancellationId === currentIdRef.current
    ) {
      currentIdRef.current = null;
    }
  }, [executionState]);

  return { executionState, compileLogs, compile, cancel, reset };
}
