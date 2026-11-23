import { describe, expect, it, jest } from '@jest/globals';
import {
  runWasmEvaluation,
  SANDBOX_GAS_LIMIT,
  SANDBOX_MEMORY_LIMIT_BYTES,
  SANDBOX_TIMEOUT_MS,
} from '../src/services/wasmExecutionSandbox.js';
import { compileWatToBase64, WAT_ADD, WAT_DISALLOWED_IMPORT, WAT_INFINITE_LOOP, WAT_TRAP } from './fixtures/wasmFixtures.js';

/**
 * BE-010: sandboxed execution with gas metering, a 50MB memory ceiling and a
 * 2s wall-clock limit. These tests run real worker threads.
 */

const spawnedWorkerOptions: Array<Record<string, unknown>> = [];

jest.mock('worker_threads', () => {
  const actual = jest.requireActual('worker_threads') as typeof import('worker_threads');
  class RecordingWorker extends actual.Worker {
    constructor(source: string, options: Record<string, unknown>) {
      spawnedWorkerOptions.push(options);
      super(source, options);
    }
  }
  return { ...actual, Worker: RecordingWorker };
});

jest.setTimeout(30_000);

const WAT_RECURSION = `(module
  (func $down (export "down") (param i32) (result i32)
    (call $down (i32.add (local.get 0) (i32.const 1)))))`;

/** 800 pages == exactly 50MB. */
const WAT_GROW = `(module
  (memory (export "memory") 1 800)
  (func (export "grow") (param i32) (result i32)
    (memory.grow (local.get 0))))`;

const WAT_MEMORY_BOMB = `(module
  (memory (export "memory") 1 800)
  (func (export "bomb") (result i32)
    (loop $again
      (drop (memory.grow (i32.const 64)))
      (br $again))
    (i32.const 0)))`;

/** 816 pages == 51MB — one page budget over the ceiling. */
const WAT_MEMORY_OVER_50MB = `(module
  (memory (export "memory") 1 816)
  (func (export "run") (result i32) (i32.const 0)))`;

const WAT_IMPORTED_MEMORY = `(module
  (import "env" "memory" (memory 1))
  (func (export "pages") (result i32)
    (drop (memory.grow (i32.const 100000)))
    (memory.size)))`;

const WAT_WASI = `(module
  (import "wasi_snapshot_preview1" "fd_write" (func $fd_write (param i32 i32 i32 i32) (result i32)))
  (func (export "run") (result i32) (i32.const 0)))`;

const WAT_I64 = `(module
  (func (export "mul") (param i64 i64) (result i64)
    (i64.mul (local.get 0) (local.get 1))))`;

describe('wasmExecutionSandbox.runWasmEvaluation', () => {
  it('enforces the spec limits: 50MB memory, 1,000,000 gas, 2s timeout', () => {
    expect(SANDBOX_MEMORY_LIMIT_BYTES).toBe(50 * 1024 * 1024);
    expect(SANDBOX_GAS_LIMIT).toBe(1_000_000);
    expect(SANDBOX_TIMEOUT_MS).toBe(2_000);
  });

  it('returns structured per-test outputs and accurate gas usage', async () => {
    const wasmBase64 = await compileWatToBase64(WAT_ADD);
    const result = await runWasmEvaluation({
      wasmBase64,
      tests: [
        { name: 'adds small numbers', functionName: 'add', args: [2, 3], expected: 5 },
        { name: 'wrong expectation', functionName: 'add', args: [2, 2], expected: 5 },
        { name: 'no expectation', functionName: 'add', args: [1, 1] },
      ],
    });

    expect(result.terminationReason).toBe('completed');
    expect(result.status).toBe('failed');
    expect(result.summary).toEqual({ total: 3, passed: 2, failed: 1, errored: 0, skipped: 0 });
    expect(result.tests.map((t) => t.status)).toEqual(['passed', 'failed', 'passed']);
    expect(result.tests[1]).toMatchObject({ actual: 4, expected: 5 });

    // Gas is per test, and the total is exactly the sum of the parts.
    for (const t of result.tests) expect(t.gasUsed).toBeGreaterThan(0);
    expect(result.gasUsed).toBe(result.tests.reduce((sum, t) => sum + t.gasUsed, 0));
    expect(result.gasLimit).toBe(SANDBOX_GAS_LIMIT);
  });

  it('reports overall status "passed" only when every test passes', async () => {
    const wasmBase64 = await compileWatToBase64(WAT_ADD);
    const result = await runWasmEvaluation({
      wasmBase64,
      tests: [{ name: 'ok', functionName: 'add', args: [40, 2], expected: 42 }],
    });
    expect(result.status).toBe('passed');
  });

  it('halts an infinite loop at the gas limit and skips the remaining tests', async () => {
    const wasmBase64 = await compileWatToBase64(WAT_INFINITE_LOOP);
    const result = await runWasmEvaluation({
      wasmBase64,
      tests: [
        { name: 'spins forever', functionName: 'run' },
        { name: 'never reached', functionName: 'run' },
      ],
    });

    expect(result.status).toBe('error');
    expect(result.terminationReason).toBe('gas-exhausted');
    expect(result.gasUsed).toBe(SANDBOX_GAS_LIMIT);
    expect(result.tests[0]).toMatchObject({ status: 'error', terminationReason: 'gas-exhausted' });
    expect(result.tests[1]?.status).toBe('skipped');
    expect(result.durationMs).toBeLessThan(SANDBOX_TIMEOUT_MS + 1_000);
  });

  it('halts unbounded recursion without crashing the host', async () => {
    const wasmBase64 = await compileWatToBase64(WAT_RECURSION);
    const result = await runWasmEvaluation({
      wasmBase64,
      tests: [{ name: 'recurses', functionName: 'down', args: [0] }],
    });

    expect(result.status).toBe('error');
    expect(['gas-exhausted', 'stack-overflow']).toContain(result.tests[0]?.terminationReason);
  });

  it('caps linear memory at 50MB: growth past the ceiling fails inside the guest', async () => {
    const wasmBase64 = await compileWatToBase64(WAT_GROW);
    const result = await runWasmEvaluation({
      wasmBase64,
      tests: [
        // From 1 page to the 800-page ceiling: succeeds, returns old size.
        { name: 'grow to ceiling', functionName: 'grow', args: [799], expected: 1 },
        // Fresh instance: asking for 1000 pages is refused with -1.
        { name: 'grow past ceiling', functionName: 'grow', args: [1000], expected: -1 },
      ],
    });

    expect(result.status).toBe('passed');
    expect(result.memoryPeakBytes).toBe(SANDBOX_MEMORY_LIMIT_BYTES);
    expect(result.memoryPeakBytes).toBeLessThanOrEqual(result.memoryLimitBytes);
  });

  it('defuses a memory bomb: repeated growth stays under the cap and is halted by gas', async () => {
    const wasmBase64 = await compileWatToBase64(WAT_MEMORY_BOMB);
    const result = await runWasmEvaluation({
      wasmBase64,
      tests: [{ name: 'bomb', functionName: 'bomb' }],
    });

    expect(result.terminationReason).toBe('gas-exhausted');
    expect(result.memoryPeakBytes).toBeLessThanOrEqual(SANDBOX_MEMORY_LIMIT_BYTES);
  });

  it('supplies a capped memory to modules that import one', async () => {
    const wasmBase64 = await compileWatToBase64(WAT_IMPORTED_MEMORY);
    const result = await runWasmEvaluation({
      wasmBase64,
      tests: [{ name: 'pages', functionName: 'pages', expected: 1 }],
    });

    // memory.grow(100000) was refused, so the memory is still 1 page.
    expect(result.status).toBe('passed');
  });

  it('rejects modules whose declared memory exceeds 50MB before running anything', async () => {
    const wasmBase64 = await compileWatToBase64(WAT_MEMORY_OVER_50MB);
    const result = await runWasmEvaluation({ wasmBase64, tests: [{ name: 't', functionName: 'run' }] });

    expect(result.terminationReason).toBe('validation-failed');
    expect(result.validationCode).toBe('memory-limit-exceeded');
    expect(result.gasUsed).toBe(0);
    expect(result.tests[0]?.status).toBe('skipped');
  });

  it('terminates a stuck worker at the wall-clock limit and reports the gas it had consumed', async () => {
    // Under metering no legal guest outlives 1,000,000 gas, so the timeout is a
    // backstop for faults the meter can't see. Simulate one: a worker that
    // signals ready, records some gas, then hangs.
    const stuckWorker = `
      const { parentPort, workerData } = require('worker_threads');
      Atomics.store(new Int32Array(workerData.gasCounter), 0, 4321);
      parentPort.postMessage({ type: 'ready' });
      for (;;) {}
    `;
    const wasmBase64 = await compileWatToBase64(WAT_ADD);
    const result = await runWasmEvaluation(
      { wasmBase64, timeoutMs: 200, tests: [{ name: 'hangs', functionName: 'add', args: [1, 2] }] },
      { workerSource: stuckWorker }
    );

    expect(result.terminationReason).toBe('timeout');
    expect(result.tests[0]).toMatchObject({ status: 'error', terminationReason: 'timeout' });
    expect(result.gasUsed).toBe(4321);
    expect(result.durationMs).toBeGreaterThanOrEqual(200);
    expect(result.durationMs).toBeLessThan(2_000);
  });

  it('uses the 2s execution limit by default', async () => {
    const stuckWorker = `
      const { parentPort } = require('worker_threads');
      parentPort.postMessage({ type: 'ready' });
      for (;;) {}
    `;
    const wasmBase64 = await compileWatToBase64(WAT_ADD);
    const result = await runWasmEvaluation(
      { wasmBase64, tests: [{ name: 'hangs', functionName: 'add', args: [1, 2] }] },
      { workerSource: stuckWorker }
    );

    expect(result.terminationReason).toBe('timeout');
    expect(result.error).toContain(`${SANDBOX_TIMEOUT_MS}ms`);
    expect(result.durationMs).toBeGreaterThanOrEqual(SANDBOX_TIMEOUT_MS);
  });

  it('never lets callers loosen the limits', async () => {
    const wasmBase64 = await compileWatToBase64(WAT_ADD);
    const result = await runWasmEvaluation({
      wasmBase64,
      gasLimit: 10 * SANDBOX_GAS_LIMIT,
      memoryLimitBytes: 10 * SANDBOX_MEMORY_LIMIT_BYTES,
      timeoutMs: 60_000,
      tests: [{ name: 'ok', functionName: 'add', args: [1, 2], expected: 3 }],
    });

    expect(result.gasLimit).toBe(SANDBOX_GAS_LIMIT);
    expect(result.memoryLimitBytes).toBe(SANDBOX_MEMORY_LIMIT_BYTES);
  });

  it('reports a trap as a per-test error and keeps running later tests', async () => {
    const trap = await compileWatToBase64(WAT_TRAP);
    const result = await runWasmEvaluation({
      wasmBase64: trap,
      tests: [
        { name: 'traps', functionName: 'run' },
        { name: 'traps again', functionName: 'run' },
      ],
    });

    expect(result.terminationReason).toBe('completed');
    expect(result.status).toBe('failed');
    expect(result.tests.every((t) => t.status === 'error' && t.terminationReason === 'trap')).toBe(true);
  });

  it('passes string arguments as BigInt for i64 parameters', async () => {
    const wasmBase64 = await compileWatToBase64(WAT_I64);
    const result = await runWasmEvaluation({
      wasmBase64,
      tests: [{ name: 'big', functionName: 'mul', args: ['9007199254740993', '2'], expected: '18014398509481986' }],
    });
    expect(result.tests[0]).toMatchObject({ status: 'passed', actual: '18014398509481986' });
  });

  describe('host isolation', () => {
    it.each([
      ['an env host function', WAT_DISALLOWED_IMPORT],
      ['a WASI filesystem call', WAT_WASI],
    ])('rejects modules importing %s', async (_label, wat) => {
      const wasmBase64 = await compileWatToBase64(wat);
      const result = await runWasmEvaluation({ wasmBase64, tests: [{ name: 't', functionName: 'run' }] });

      expect(result.terminationReason).toBe('validation-failed');
      expect(result.validationCode).toBe('host-import-forbidden');
    });

    it('spawns the worker with an empty environment and no inherited exec flags', async () => {
      spawnedWorkerOptions.length = 0;
      const wasmBase64 = await compileWatToBase64(WAT_ADD);
      await runWasmEvaluation({ wasmBase64, tests: [{ name: 'ok', functionName: 'add', args: [1, 1] }] });

      expect(spawnedWorkerOptions).toHaveLength(1);
      const options = spawnedWorkerOptions[0]!;
      expect(options.env).toEqual({});
      expect(options.execArgv).toEqual([]);
      expect(options.resourceLimits).toBeDefined();
    });
  });

  it('rejects a submission whose tests reference a missing export', async () => {
    const wasmBase64 = await compileWatToBase64(WAT_ADD);
    const result = await runWasmEvaluation({ wasmBase64, tests: [{ name: 't', functionName: 'nope' }] });
    expect(result.validationCode).toBe('missing-export');
  });

  it('rejects an empty test list', async () => {
    const wasmBase64 = await compileWatToBase64(WAT_ADD);
    const result = await runWasmEvaluation({ wasmBase64, tests: [] });
    expect(result.terminationReason).toBe('validation-failed');
  });
});
