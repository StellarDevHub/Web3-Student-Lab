/**
 * In-process registry that tracks active compile/execute requests and allows
 * callers to mark them as cancelled. Entries expire after TTL_MS to prevent
 * unbounded growth without requiring a Redis dependency.
 *
 * Thread-safety note: Node.js is single-threaded in the event loop, so the
 * Map operations here are inherently atomic for our purposes.
 */

export type RequestPhase = 'queued' | 'running' | 'complete' | 'cancelled';

export interface RegistryEntry {
  cancellationId: string;
  phase: RequestPhase;
  createdAt: number;
}

const TTL_MS = 5 * 60 * 1_000; // 5 minutes
const CLEANUP_INTERVAL_MS = 60 * 1_000; // clean up every minute

class CancellationRegistry {
  private readonly entries = new Map<string, RegistryEntry>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Start background cleanup so the map never grows unboundedly in long-running processes.
    this.cleanupTimer = setInterval(() => this.evictExpired(), CLEANUP_INTERVAL_MS);
    // Allow the process to exit even when this timer is live.
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Register a new cancellation ID as queued.
   * Throws if the ID is already present and not yet complete/cancelled.
   */
  register(cancellationId: string): void {
    const existing = this.entries.get(cancellationId);
    if (existing && existing.phase !== 'complete' && existing.phase !== 'cancelled') {
      throw new Error(`Cancellation ID ${cancellationId} is already active.`);
    }
    this.entries.set(cancellationId, {
      cancellationId,
      phase: 'queued',
      createdAt: Date.now(),
    });
  }

  /**
   * Transition a queued entry to running.
   * No-op if the entry is already cancelled (preserves the cancelled state).
   */
  markRunning(cancellationId: string): void {
    const entry = this.entries.get(cancellationId);
    if (!entry) return;
    if (entry.phase === 'queued') {
      entry.phase = 'running';
    }
  }

  /**
   * Transition entry to complete. No-op when already cancelled.
   */
  markComplete(cancellationId: string): void {
    const entry = this.entries.get(cancellationId);
    if (!entry) return;
    if (entry.phase !== 'cancelled') {
      entry.phase = 'complete';
    }
  }

  /**
   * Attempt to cancel an active request.
   * Returns:
   *   'cancelled'       — successful, was queued or running.
   *   'already_complete'— request already finished normally.
   *   'not_found'       — unknown ID.
   */
  cancel(cancellationId: string): 'cancelled' | 'already_complete' | 'not_found' {
    const entry = this.entries.get(cancellationId);
    if (!entry) return 'not_found';
    if (entry.phase === 'complete' || entry.phase === 'cancelled') {
      return 'already_complete';
    }
    entry.phase = 'cancelled';
    return 'cancelled';
  }

  /**
   * Returns true when a cancellationId has been cancelled before or during execution.
   * Service methods should poll this to abort expensive work early.
   */
  isCancelled(cancellationId: string): boolean {
    return this.entries.get(cancellationId)?.phase === 'cancelled';
  }

  /** Return current phase, or null if not found. */
  getPhase(cancellationId: string): RequestPhase | null {
    return this.entries.get(cancellationId)?.phase ?? null;
  }

  /** Remove entries older than TTL_MS. */
  private evictExpired(): void {
    const cutoff = Date.now() - TTL_MS;
    for (const [id, entry] of this.entries) {
      if (entry.createdAt < cutoff) {
        this.entries.delete(id);
      }
    }
  }

  /** Exposed for tests — clears all entries. */
  _clearAll(): void {
    this.entries.clear();
  }
}

// Singleton shared across the application lifecycle.
export const cancellationRegistry = new CancellationRegistry();
