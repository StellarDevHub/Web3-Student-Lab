import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CancellableWorkerResponse } from '@/lib/compiler/cancellationTypes';
import {
  MAX_LOG_ENTRIES,
  MAX_RUNS_PER_WORKER,
  usePlaygroundExecution,
} from '../usePlaygroundExecution';

const MB = 1024 * 1024;

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  onmessageerror: ((e: MessageEvent) => void) | null = null;
  posted: Array<{ type: string; cancellationId?: string }> = [];
  terminated = false;

  constructor() {
    FakeWorker.instances.push(this);
  }

  postMessage(message: { type: string; cancellationId?: string }) {
    this.posted.push(message);
  }

  terminate() {
    this.terminated = true;
  }

  /** Last compile/simulate request id. */
  get lastRunId(): string {
    const runs = this.posted.filter((m) => m.type === 'compile' || m.type === 'simulate');
    return runs[runs.length - 1].cancellationId!;
  }

  emit(message: CancellableWorkerResponse) {
    this.onmessage?.({ data: message } as MessageEvent);
  }

  complete(extra: Partial<Extract<CancellableWorkerResponse, { type: 'complete' }>> = {}) {
    this.emit({
      type: 'complete',
      cancellationId: this.lastRunId,
      success: true,
      warnings: [],
      errors: [],
      exports: [],
      wasmSizeKb: 1,
      durationMs: 1,
      ...extra,
    });
  }

  static get live() {
    return FakeWorker.instances.filter((w) => !w.terminated);
  }
}

function renderExecution(options: Parameters<typeof usePlaygroundExecution>[0] = {}) {
  return renderHook(() =>
    usePlaygroundExecution({
      createWorker: () => new FakeWorker() as unknown as Worker,
      ...options,
    })
  );
}

const latest = () => FakeWorker.instances[FakeWorker.instances.length - 1];

beforeEach(() => {
  FakeWorker.instances = [];
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{}'))));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('usePlaygroundExecution worker lifecycle', () => {
  it('creates the worker lazily on the first run', () => {
    const { result } = renderExecution();
    expect(FakeWorker.instances).toHaveLength(0);
    act(() => result.current.compile('src', '/a.rs'));
    expect(FakeWorker.instances).toHaveLength(1);
    expect(result.current.executionState.phase).toBe('running');
  });

  it('keeps at most one live worker across 50 consecutive runs', () => {
    const { result } = renderExecution();
    for (let i = 0; i < 50; i++) {
      act(() => result.current.simulate(new Uint8Array([0, 97, 115, 109]), 'run'));
      expect(FakeWorker.live).toHaveLength(1);
      act(() =>
        latest().complete({ memory: { residentBytes: 0, peakBytes: 2 * MB, limitBytes: 50 * MB } })
      );
      expect(result.current.executionState.phase).toBe('complete');
    }
    // Workers are recycled every MAX_RUNS_PER_WORKER runs; every retired one was terminated.
    expect(FakeWorker.instances).toHaveLength(Math.ceil(50 / MAX_RUNS_PER_WORKER));
    expect(FakeWorker.instances.slice(0, -1).every((w) => w.terminated)).toBe(true);
    expect(FakeWorker.instances.slice(0, -1).every((w) => w.posted.some((m) => m.type === 'dispose'))).toBe(
      true
    );
  });

  it('terminates the worker when leaving the playground route (unmount)', () => {
    const { result, unmount } = renderExecution();
    act(() => result.current.compile('src', '/a.rs'));
    const worker = latest();
    unmount();
    expect(worker.terminated).toBe(true);
    expect(worker.onmessage).toBeNull();
    expect(FakeWorker.live).toHaveLength(0);
  });

  it('terminates the worker on pagehide', () => {
    const { result } = renderExecution();
    act(() => result.current.compile('src', '/a.rs'));
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(latest().terminated).toBe(true);
  });

  it('cancel hard-stops the worker and a new run gets a fresh one', () => {
    const { result } = renderExecution();
    act(() => result.current.simulate(new Uint8Array([1]), 'loop'));
    const first = latest();
    act(() => result.current.cancel());
    expect(first.terminated).toBe(true);
    expect(result.current.executionState.phase).toBe('cancelled');

    act(() => result.current.compile('src', '/a.rs'));
    expect(FakeWorker.instances).toHaveLength(2);
    expect(latest().terminated).toBe(false);
  });

  it('watchdog kills a runaway worker and explains the timeout', () => {
    vi.useFakeTimers();
    const { result } = renderExecution({ watchdogMs: 1_000 });
    act(() => result.current.simulate(new Uint8Array([1]), 'spin'));
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(latest().terminated).toBe(true);
    expect(result.current.executionState.phase).toBe('error');
    expect(result.current.diagnostic?.code).toBe('timeout');
    expect(result.current.compileLogs.some((l) => /took too long/i.test(l.message))).toBe(true);
  });

  it('does not fire the watchdog after a run completes', () => {
    vi.useFakeTimers();
    const { result } = renderExecution({ watchdogMs: 1_000 });
    act(() => result.current.compile('src', '/a.rs'));
    act(() => latest().complete());
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(latest().terminated).toBe(false);
    expect(result.current.executionState.phase).toBe('complete');
  });

  it('recovers from a crashed worker with a friendly diagnostic', () => {
    const { result } = renderExecution();
    act(() => result.current.simulate(new Uint8Array([1]), 'boom'));
    const worker = latest();
    act(() => worker.onerror?.({ message: 'Out of memory', preventDefault: () => {} } as ErrorEvent));
    expect(worker.terminated).toBe(true);
    expect(result.current.executionState.phase).toBe('error');
    expect(result.current.diagnostic?.code).toBe('worker-crashed');
    expect(result.current.diagnostic?.message).toMatch(/low on memory/i);
  });

  it('surfaces guest out-of-memory diagnostics and recycles the worker', () => {
    const { result } = renderExecution();
    act(() => result.current.simulate(new Uint8Array([1]), 'oom'));
    const worker = latest();
    act(() =>
      worker.complete({
        success: false,
        memory: { residentBytes: 50 * MB, peakBytes: 50 * MB, limitBytes: 50 * MB },
        diagnostic: {
          code: 'out-of-memory',
          message: 'The contract ran out of memory during simulation.',
          hint: 'Each simulation is limited to 50 MB.',
        },
      })
    );
    expect(result.current.executionState.phase).toBe('error');
    expect(result.current.diagnostic?.code).toBe('out-of-memory');
    expect(result.current.memoryUsage?.peakBytes).toBe(50 * MB);
    expect(worker.terminated).toBe(true);
  });

  it('transfers simulation bytes without detaching the caller buffer', () => {
    const { result } = renderExecution();
    const wasm = new Uint8Array([0, 97, 115, 109]);
    act(() => result.current.simulate(wasm, 'run', { maxMemoryBytes: 500 * MB }));
    const request = latest().posted[0] as unknown as { wasm: ArrayBuffer; maxMemoryBytes: number };
    expect(new Uint8Array(request.wasm)).toEqual(wasm);
    expect(request.maxMemoryBytes).toBe(50 * MB); // clamped to the session ceiling
    expect(wasm.byteLength).toBe(4);
  });

  it('drops stale messages from previous runs', () => {
    const { result } = renderExecution();
    act(() => result.current.compile('src', '/a.rs'));
    act(() =>
      latest().emit({
        type: 'log',
        cancellationId: 'stale-id',
        entry: { id: '1', level: 'info', message: 'old', timestamp: 'now' },
      })
    );
    expect(result.current.compileLogs).toHaveLength(0);
  });

  it('bounds retained log entries', () => {
    const { result } = renderExecution();
    act(() => result.current.compile('src', '/a.rs'));
    const id = latest().lastRunId;
    act(() => {
      for (let i = 0; i < MAX_LOG_ENTRIES + 50; i++) {
        latest().emit({
          type: 'log',
          cancellationId: id,
          entry: { id: String(i), level: 'info', message: `line ${i}`, timestamp: 'now' },
        });
      }
    });
    expect(result.current.compileLogs).toHaveLength(MAX_LOG_ENTRIES);
    expect(result.current.compileLogs.at(-1)?.message).toBe(`line ${MAX_LOG_ENTRIES + 49}`);
  });

  it('ignores a second run while one is in flight', () => {
    const { result } = renderExecution();
    act(() => result.current.compile('src', '/a.rs'));
    act(() => result.current.compile('src', '/a.rs'));
    expect(latest().posted.filter((m) => m.type === 'compile')).toHaveLength(1);
  });
});
