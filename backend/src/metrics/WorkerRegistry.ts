/**
 * WorkerRegistry — tracks background worker liveness for the metrics exporter.
 *
 * Workers register themselves on start, deregister on stop, and report job
 * outcomes. Only aggregate counters and state are stored: no job payloads,
 * user identifiers or error messages, so the data is safe to export.
 */

export type WorkerState = 'running' | 'stopped' | 'degraded';

export interface WorkerStatus {
  /** Stable worker name used as the `worker` metric label. */
  name: string;
  state: WorkerState;
  /** Configured concurrency, when the worker exposes one. */
  concurrency?: number;
  jobsCompleted: number;
  jobsFailed: number;
  /** ISO timestamp of the last state change or job outcome. */
  lastUpdatedAt: string;
}

class WorkerRegistry {
  private workers = new Map<string, WorkerStatus>();

  private upsert(name: string, patch: Partial<WorkerStatus>): WorkerStatus {
    const existing: WorkerStatus = this.workers.get(name) ?? {
      name,
      state: 'stopped',
      jobsCompleted: 0,
      jobsFailed: 0,
      lastUpdatedAt: new Date().toISOString(),
    };

    const updated: WorkerStatus = {
      ...existing,
      ...patch,
      name,
      lastUpdatedAt: new Date().toISOString(),
    };

    this.workers.set(name, updated);
    return updated;
  }

  /** Mark a worker as running. Idempotent — safe to call on every start. */
  register(name: string, options: { concurrency?: number } = {}): void {
    this.upsert(name, {
      state: 'running',
      ...(options.concurrency !== undefined && { concurrency: options.concurrency }),
    });
  }

  /** Mark a worker as stopped while retaining its counters. */
  markStopped(name: string): void {
    this.upsert(name, { state: 'stopped' });
  }

  /** Mark a worker as running but unhealthy (e.g. repeated connection errors). */
  markDegraded(name: string): void {
    this.upsert(name, { state: 'degraded' });
  }

  recordCompleted(name: string): void {
    const current = this.workers.get(name);
    this.upsert(name, { jobsCompleted: (current?.jobsCompleted ?? 0) + 1 });
  }

  recordFailed(name: string): void {
    const current = this.workers.get(name);
    this.upsert(name, { jobsFailed: (current?.jobsFailed ?? 0) + 1 });
  }

  /** Snapshot of every known worker, ordered by name for stable metric output. */
  list(): WorkerStatus[] {
    return [...this.workers.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Test helper — drops all registrations. */
  reset(): void {
    this.workers.clear();
  }
}

export const workerRegistry = new WorkerRegistry();
export default workerRegistry;
