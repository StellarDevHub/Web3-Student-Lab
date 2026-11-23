/**
 * Cancellation and execution lifecycle types for the Playground.
 *
 * State machine:
 *   idle → queued → running → complete
 *                           ↘ cancelled
 *                           ↘ error
 */

/** Unique identifier for a single compile/execute request. */
export type CancellationId = string;

/** All possible states a playground operation can be in. */
export type ExecutionPhase =
  | 'idle'
  | 'queued'
  | 'running'
  | 'complete'
  | 'cancelled'
  | 'error';

/** Shape of a live execution state snapshot. */
export interface ExecutionState {
  /** The cancellation ID for the current request, or null when idle. */
  cancellationId: CancellationId | null;
  /** Current phase of the lifecycle. */
  phase: ExecutionPhase;
  /** Human-readable status message shown in the UI. */
  statusMessage: string;
  /** Queue position when phase === 'queued' (1-based); null otherwise. */
  queuePosition: number | null;
  /** Timestamp when the current state was entered (ms since epoch). */
  enteredAt: number;
}

/** Payload sent to the compile worker. */
export interface CancellableCompileRequest {
  type: 'compile';
  cancellationId: CancellationId;
  source: string;
  filePath: string;
}

/** Message from worker to cancel an in-flight compile. */
export interface WorkerCancelMessage {
  type: 'cancel';
  cancellationId: CancellationId;
}

/** Worker-to-page message carrying cancellation id in every frame. */
export interface CancellableWorkerLogMessage {
  type: 'log';
  cancellationId: CancellationId;
  entry: import('./compileTypes').CompileLogEntry;
}

export interface CancellableWorkerCompleteMessage {
  type: 'complete';
  cancellationId: CancellationId;
  success: boolean;
  warnings: string[];
  errors: string[];
  exports: string[];
  wasmSizeKb: number;
  durationMs: number;
}

export interface CancellableWorkerCancelledMessage {
  type: 'cancelled';
  cancellationId: CancellationId;
}

export type CancellableWorkerResponse =
  | CancellableWorkerLogMessage
  | CancellableWorkerCompleteMessage
  | CancellableWorkerCancelledMessage;

export type CancellableWorkerInbound =
  | CancellableCompileRequest
  | WorkerCancelMessage;

// ─── Backend cancellation types ───────────────────────────────────────────────

/** Request body for POST /api/v1/contracts/cancel */
export interface BackendCancelRequest {
  cancellationId: CancellationId;
}

/** Response from POST /api/v1/contracts/cancel */
export interface BackendCancelResponse {
  status: 'cancelled' | 'not_found' | 'already_complete';
  cancellationId: CancellationId;
}

/** Optional header for compile/execute requests. */
export const CANCELLATION_ID_HEADER = 'x-cancellation-id' as const;
