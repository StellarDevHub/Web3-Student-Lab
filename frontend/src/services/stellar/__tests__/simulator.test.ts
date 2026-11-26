import { describe, expect, it } from 'vitest';
import {
  MAX_SESSION_MEMORY_BYTES,
  SimulationSession,
  WASM_PAGE_BYTES,
  capModuleMemory,
  classifySimulationError,
  inspectModuleMemory,
  runIsolatedSimulation,
} from '../simulator';
import {
  GROWING_MODULE,
  HOST_IMPORT_MODULE,
  IMPORTED_MEMORY_MODULE,
  memoryModule,
} from './wasmFixtures';

const MB = 1024 * 1024;
const LIMIT_PAGES = MAX_SESSION_MEMORY_BYTES / WASM_PAGE_BYTES; // 800

describe('module memory inspection & capping', () => {
  it('reads defined and imported memory limits', () => {
    expect(inspectModuleMemory(GROWING_MODULE).defined).toEqual([
      { minPages: 1, maxPages: undefined, shared: false },
    ]);
    expect(inspectModuleMemory(IMPORTED_MEMORY_MODULE).imported).toEqual([
      { module: 'env', name: 'memory', minPages: 1, maxPages: undefined, shared: false },
    ]);
  });

  it('adds a maximum to unbounded memories and keeps the module valid', () => {
    const capped = capModuleMemory(GROWING_MODULE, LIMIT_PAGES);
    expect(inspectModuleMemory(capped).defined[0].maxPages).toBe(LIMIT_PAGES);
    expect(WebAssembly.validate(capped as BufferSource)).toBe(true);
  });

  it('never raises an existing smaller maximum', () => {
    const capped = capModuleMemory(memoryModule({ maxPages: 4 }), LIMIT_PAGES);
    expect(inspectModuleMemory(capped).defined[0].maxPages).toBe(4);
  });

  it('rejects modules whose initial memory exceeds the cap', () => {
    expect(() => capModuleMemory(memoryModule({ minPages: 100 }), 50)).toThrow(
      expect.objectContaining({ diagnostic: expect.objectContaining({ code: 'memory-limit-exceeded' }) })
    );
  });

  it('rejects non-wasm input as a compile error', () => {
    expect(() => inspectModuleMemory(new Uint8Array([1, 2, 3]))).toThrow(
      expect.objectContaining({ diagnostic: expect.objectContaining({ code: 'compile-error' }) })
    );
  });
});

describe('SimulationSession', () => {
  it('runs exports and reports memory usage', async () => {
    const session = new SimulationSession();
    const contract = await session.load(GROWING_MODULE);
    expect(contract.exports.sort()).toEqual(['add', 'grow', 'oom']);

    const sum = session.invoke(contract, 'add', [2, 3]);
    expect(sum).toMatchObject({ ok: true, value: 5 });

    const grown = session.invoke(contract, 'grow', [15]);
    expect(grown).toMatchObject({ ok: true, value: 1 });
    expect(grown.memory.residentBytes).toBe(16 * WASM_PAGE_BYTES);
    expect(grown.memory.limitBytes).toBe(MAX_SESSION_MEMORY_BYTES);
    session.dispose();
  });

  it('stops guest memory growth at the 50 MB budget', async () => {
    const session = new SimulationSession();
    const contract = await session.load(GROWING_MODULE);
    expect(session.invoke(contract, 'grow', [LIMIT_PAGES - 1])).toMatchObject({ ok: true, value: 1 });
    // One more page would exceed the cap — memory.grow returns -1 instead of allocating.
    expect(session.invoke(contract, 'grow', [1])).toMatchObject({ ok: true, value: -1 });
    expect(session.getMemoryUsage().residentBytes).toBe(MAX_SESSION_MEMORY_BYTES);
    session.dispose();
  });

  it('surfaces a guest out-of-memory abort as a friendly diagnostic', async () => {
    const result = await runIsolatedSimulation({ wasm: GROWING_MODULE, exportName: 'oom' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.code).toBe('out-of-memory');
    expect(result.diagnostic.message).toMatch(/ran out of memory/i);
    expect(result.diagnostic.hint).toMatch(/50 MB/);
    expect(result.memory.peakBytes).toBeLessThanOrEqual(MAX_SESSION_MEMORY_BYTES);
  });

  it('honours a smaller per-session budget', async () => {
    const result = await runIsolatedSimulation({
      wasm: GROWING_MODULE,
      exportName: 'oom',
      maxMemoryBytes: 4 * MB,
    });
    expect(result.memory.peakBytes).toBeLessThanOrEqual(4 * MB);
    expect(result.ok ? null : result.diagnostic.code).toBe('out-of-memory');
  });

  it('supplies a bounded memory to modules that import one', async () => {
    const session = new SimulationSession({ maxMemoryBytes: 2 * MB });
    const contract = await session.load(IMPORTED_MEMORY_MODULE);
    expect(session.invoke(contract, 'grow', [31])).toMatchObject({ ok: true, value: 1 });
    expect(session.invoke(contract, 'grow', [1])).toMatchObject({ ok: true, value: -1 });
    expect(session.getMemoryUsage().residentBytes).toBe(2 * MB);
    session.dispose();
  });

  it('shares one budget across contracts loaded into the same session', async () => {
    const session = new SimulationSession({ maxMemoryBytes: 4 * MB });
    const first = await session.load(GROWING_MODULE);
    session.invoke(first, 'grow', [10]);
    // The first contract reserved the whole budget, so a second cannot load.
    await expect(session.load(GROWING_MODULE)).rejects.toMatchObject({
      diagnostic: { code: 'memory-limit-exceeded' },
    });
    session.unload(first);
    await expect(session.load(GROWING_MODULE)).resolves.toBeTruthy();
    session.dispose();
  });

  it('reports link, export and disposal problems as diagnostics', async () => {
    const link = await runIsolatedSimulation({ wasm: HOST_IMPORT_MODULE, exportName: 'x' });
    expect(link.ok ? null : link.diagnostic.code).toBe('link-error');

    const missing = await runIsolatedSimulation({ wasm: GROWING_MODULE, exportName: 'nope' });
    expect(missing.ok ? null : missing.diagnostic.code).toBe('export-not-found');

    const session = new SimulationSession();
    const contract = await session.load(GROWING_MODULE);
    session.dispose();
    expect(session.invoke(contract, 'add', [1, 2])).toMatchObject({
      ok: false,
      diagnostic: { code: 'session-disposed' },
    });
    await expect(session.load(GROWING_MODULE)).rejects.toMatchObject({
      diagnostic: { code: 'session-disposed' },
    });
  });

  it('releases every instance and memory on dispose', async () => {
    const session = new SimulationSession();
    const contract = await session.load(GROWING_MODULE);
    session.invoke(contract, 'grow', [100]);
    expect(session.liveContracts).toBe(1);
    const final = session.dispose();
    expect(session.liveContracts).toBe(0);
    expect(final.residentBytes).toBe(0);
    expect(final.peakBytes).toBe(101 * WASM_PAGE_BYTES);
    expect(session.dispose().residentBytes).toBe(0); // idempotent
  });

  it('keeps every one of 50 consecutive runs within budget and fully released', async () => {
    const sessions: SimulationSession[] = [];
    for (let run = 0; run < 50; run++) {
      const session = new SimulationSession();
      sessions.push(session);
      const contract = await session.load(GROWING_MODULE);
      const result = session.invoke(contract, run % 5 === 0 ? 'oom' : 'grow', [159]);
      expect(result.memory.peakBytes).toBeLessThanOrEqual(MAX_SESSION_MEMORY_BYTES);
      session.dispose();
    }
    // Nothing retained by any session: total live linear memory is zero.
    const retained = sessions.reduce((sum, s) => sum + s.getMemoryUsage().residentBytes, 0);
    expect(retained).toBe(0);
    expect(sessions.every((s) => s.isDisposed && s.liveContracts === 0)).toBe(true);
  });
});

describe('classifySimulationError', () => {
  it('maps engine errors to friendly diagnostics', () => {
    expect(classifySimulationError(new RangeError('WebAssembly.Memory(): could not allocate memory')).code).toBe(
      'out-of-memory'
    );
    expect(classifySimulationError(new RangeError('Maximum call stack size exceeded')).code).toBe(
      'stack-overflow'
    );
    expect(classifySimulationError(new WebAssembly.RuntimeError('unreachable')).code).toBe('trap');
    expect(
      classifySimulationError(new WebAssembly.RuntimeError('unreachable'), { memoryNearLimit: true }).code
    ).toBe('out-of-memory');
    expect(classifySimulationError(new WebAssembly.CompileError('bad')).code).toBe('compile-error');
    expect(classifySimulationError('weird').code).toBe('unknown');
  });
});
