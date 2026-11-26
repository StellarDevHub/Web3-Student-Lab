import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useZkProof } from '../useZkProof';
import type { ZkProveRequest, ZkProverMessage } from '@/lib/zk/proverProgress';

/** Minimal stand-in for the prover worker: records requests, lets tests reply. */
class FakeWorker {
  onmessage: ((event: MessageEvent<ZkProverMessage>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  requests: ZkProveRequest[] = [];
  terminated = false;
  postMessage = vi.fn((request: ZkProveRequest) => {
    this.requests.push(request);
  });
  terminate = vi.fn(() => {
    this.terminated = true;
  });
  reply(message: ZkProverMessage) {
    this.onmessage?.({ data: message } as MessageEvent<ZkProverMessage>);
  }
  crash(message: string) {
    this.onerror?.({ message } as ErrorEvent);
  }
}

const artifacts = { wasmUrl: '/zk/c.wasm', zkeyUrl: '/zk/c.zkey' };
const soroban = {
  courseHash: '01',
  nullifier: '02',
  publicInputs: [],
  proof: { a_g1: 'aa', b_g2: 'bb', c_g1: 'cc' },
};
const snarkProof = { pi_a: ['1', '2', '1'], pi_b: [['1', '2'], ['3', '4'], ['1', '0']], pi_c: ['5', '6', '1'] };

function setup() {
  const workers: FakeWorker[] = [];
  const createWorker = () => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker as unknown as Worker;
  };
  const hook = renderHook(() => useZkProof({ createWorker }));
  return { ...hook, workers };
}

describe('useZkProof', () => {
  it('runs the proof in a worker and streams witness → fft → synthesis progress', async () => {
    const { result, workers } = setup();

    let promise!: Promise<unknown>;
    act(() => {
      promise = result.current.generateProof({ secret: '7' }, artifacts);
    });

    expect(workers).toHaveLength(1);
    const [worker] = workers;
    expect(worker.requests[0]).toEqual({ id: 1, type: 'prove', input: { secret: '7' }, artifacts });
    expect(result.current.status).toBe('proving');

    const seen: Array<[string | null, number]> = [];
    for (const [stage, progress] of [
      ['witness', 0],
      ['fft', 40],
      ['synthesis', 80],
    ] as const) {
      act(() => worker.reply({ id: 1, type: 'progress', stage, progress }));
      seen.push([result.current.stage, result.current.progress]);
    }
    expect(seen).toEqual([
      ['witness', 0],
      ['fft', 40],
      ['synthesis', 80],
    ]);

    await act(async () => {
      worker.reply({ id: 1, type: 'result', proof: snarkProof, publicSignals: ['1', '2'], soroban });
      await promise;
    });

    expect(result.current.status).toBe('success');
    expect(result.current.stage).toBe('done');
    expect(result.current.progress).toBe(100);
    expect(result.current.result?.soroban).toEqual(soroban);
  });

  it('surfaces worker errors and rejects the promise', async () => {
    const { result, workers } = setup();
    let promise!: Promise<unknown>;
    act(() => {
      promise = result.current.generateProof({}, artifacts);
    });

    await act(async () => {
      workers[0].reply({ id: 1, type: 'error', error: 'Not enough values for input signal secret' });
      await expect(promise).rejects.toThrow(/input signal/);
    });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toMatch(/input signal/);
  });

  it('rejects and recovers when the worker crashes', async () => {
    const { result, workers } = setup();
    let promise!: Promise<unknown>;
    act(() => {
      promise = result.current.generateProof({}, artifacts);
    });

    await act(async () => {
      workers[0].crash('out of memory');
      await expect(promise).rejects.toThrow('out of memory');
    });
    expect(workers[0].terminated).toBe(true);

    act(() => {
      result.current.generateProof({}, artifacts).catch(() => undefined);
    });
    expect(workers).toHaveLength(2);
  });

  it('cancel terminates the worker and ignores late messages', async () => {
    const { result, workers } = setup();
    let promise!: Promise<unknown>;
    act(() => {
      promise = result.current.generateProof({}, artifacts);
    });

    await act(async () => {
      result.current.cancel();
      await expect(promise).rejects.toThrow(/cancelled/);
    });
    expect(workers[0].terminated).toBe(true);
    expect(result.current.status).toBe('idle');

    act(() => workers[0].reply({ id: 1, type: 'progress', stage: 'fft', progress: 50 }));
    expect(result.current.progress).toBe(0);
  });

  it('terminates the worker on unmount', async () => {
    const { result, workers, unmount } = setup();
    let promise!: Promise<unknown>;
    act(() => {
      promise = result.current.generateProof({}, artifacts);
    });
    unmount();
    await expect(promise).rejects.toThrow(/cancelled/);
    expect(workers[0].terminated).toBe(true);
  });
});
