import { describe, expect, it, vi } from 'vitest';
import type { CancellableWorkerResponse } from '../cancellationTypes';
import { createCompileWorkerRuntime } from '../compileWorkerRuntime';
import { GROWING_MODULE } from '../../../services/stellar/__tests__/wasmFixtures';

const VALID_SOURCE = `
use soroban_sdk::{contract, contractimpl, Env};
#[contract]
pub struct Counter;
#[contractimpl]
impl Counter {
    pub fn increment(env: Env) -> u32 { 1 }
}
`;

function setup(overrides: Partial<Parameters<typeof createCompileWorkerRuntime>[0]> = {}) {
  const messages: CancellableWorkerResponse[] = [];
  const close = vi.fn();
  const runtime = createCompileWorkerRuntime({
    post: (m) => messages.push(m),
    close,
    stageDelayScale: 0,
    ...overrides,
  });
  const terminal = (id: string) =>
    messages.find((m) => m.cancellationId === id && m.type !== 'log');
  return { runtime, messages, close, terminal };
}

const wasmBuffer = () => GROWING_MODULE.slice().buffer as ArrayBuffer;

describe('compile worker runtime', () => {
  it('completes a compile instead of treating it as cancelled', async () => {
    const { runtime, terminal } = setup();
    await runtime.handle({ type: 'compile', cancellationId: 'c1', source: VALID_SOURCE, filePath: '/src/lib.rs' });
    expect(terminal('c1')).toMatchObject({ type: 'complete', success: true, exports: ['increment'] });
    expect(runtime.activeRequests).toBe(0);
  });

  it('reports source errors as a failed compile', async () => {
    const { runtime, terminal } = setup();
    await runtime.handle({ type: 'compile', cancellationId: 'c2', source: 'fn main() {}', filePath: 'x.rs' });
    expect(terminal('c2')).toMatchObject({ type: 'complete', success: false });
  });

  it('cancels an in-flight compile and cleans up its token', async () => {
    const { runtime, terminal } = setup({ stageDelayScale: 1 });
    const done = runtime.handle({ type: 'compile', cancellationId: 'c3', source: VALID_SOURCE, filePath: 'x.rs' });
    expect(runtime.activeRequests).toBe(1);
    await runtime.handle({ type: 'cancel', cancellationId: 'c3' });
    await done;
    expect(terminal('c3')).toEqual({ type: 'cancelled', cancellationId: 'c3' });
    expect(runtime.activeRequests).toBe(0);
  });

  it('enforces the compile deadline', async () => {
    const { runtime, terminal } = setup({ stageDelayScale: 1, compileTimeoutMs: 20 });
    await runtime.handle({ type: 'compile', cancellationId: 'c4', source: VALID_SOURCE, filePath: 'x.rs' });
    const msg = terminal('c4');
    expect(msg).toMatchObject({ type: 'complete', success: false });
    expect(msg && 'errors' in msg ? msg.errors[0] : '').toMatch(/timeout/i);
    expect(runtime.activeRequests).toBe(0);
  });

  it('runs simulations and reports memory usage', async () => {
    const { runtime, terminal, messages } = setup();
    await runtime.handle({ type: 'simulate', cancellationId: 's1', wasm: wasmBuffer(), exportName: 'add', args: [20, 22] });
    expect(terminal('s1')).toMatchObject({
      type: 'complete',
      success: true,
      result: '42',
      memory: expect.objectContaining({ limitBytes: 50 * 1024 * 1024 }),
    });
    expect(messages.some((m) => m.type === 'log' && /Peak WASM memory/.test(m.entry.message))).toBe(true);
  });

  it('turns a guest out-of-memory abort into a friendly diagnostic', async () => {
    const { runtime, terminal, messages } = setup();
    await runtime.handle({ type: 'simulate', cancellationId: 's2', wasm: wasmBuffer(), exportName: 'oom' });
    const msg = terminal('s2');
    expect(msg).toMatchObject({
      type: 'complete',
      success: false,
      diagnostic: expect.objectContaining({ code: 'out-of-memory' }),
    });
    expect(
      messages.some((m) => m.type === 'log' && m.entry.level === 'error' && /ran out of memory/i.test(m.entry.message))
    ).toBe(true);
  });

  it('holds no per-request state after 50 consecutive simulations', async () => {
    const { runtime, messages } = setup();
    for (let i = 0; i < 50; i++) {
      await runtime.handle({
        type: 'simulate',
        cancellationId: `run-${i}`,
        wasm: wasmBuffer(),
        exportName: i % 2 ? 'oom' : 'grow',
        args: [200],
      });
    }
    expect(runtime.activeRequests).toBe(0);
    const completes = messages.filter((m) => m.type === 'complete');
    expect(completes).toHaveLength(50);
    for (const m of completes) {
      if (m.type === 'complete') expect(m.memory!.peakBytes).toBeLessThanOrEqual(50 * 1024 * 1024);
    }
  });

  it('dispose cancels in-flight work, closes the worker and ignores later messages', async () => {
    const { runtime, close, messages } = setup({ stageDelayScale: 1 });
    const pending = runtime.handle({ type: 'compile', cancellationId: 'd1', source: VALID_SOURCE, filePath: 'x.rs' });
    await runtime.handle({ type: 'dispose' });
    await pending;
    expect(close).toHaveBeenCalledTimes(1);
    expect(runtime.activeRequests).toBe(0);

    const before = messages.length;
    await runtime.handle({ type: 'compile', cancellationId: 'd2', source: VALID_SOURCE, filePath: 'x.rs' });
    expect(messages.length).toBe(before);
  });
});
