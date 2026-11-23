import { describe, expect, it } from '@jest/globals';
import { runSandboxedWasm } from '../src/simulator/wasmSandboxEngine.js';
import {
  compileWatToBase64,
  WAT_ADD,
  WAT_DISALLOWED_IMPORT,
  WAT_IMPORTED_MEMORY,
  WAT_INFINITE_LOOP,
  WAT_MEMORY_OVER_BUDGET,
  WAT_MEMORY_UNBOUNDED,
  WAT_TRAP,
} from './fixtures/wasmFixtures.js';

// Worker spin-up + real execution needs a bit more headroom than the
// default 5s Jest timeout, especially for the gas-exhaustion case which
// runs millions of metered instructions.
jest.setTimeout(20_000);

describe('wasmSandboxEngine.runSandboxedWasm', () => {
  it('executes a well-behaved pure function and returns its result', async () => {
    const wasmBase64 = await compileWatToBase64(WAT_ADD);
    const result = await runSandboxedWasm({
      wasmBase64,
      functionName: 'add',
      args: [2, 3],
    });

    expect(result.success).toBe(true);
    expect(result.returnValue).toBe(5);
    expect(result.terminationReason).toBe('completed');
    expect(result.gasUsed).toBeGreaterThan(0);
    expect(result.gasUsed).toBeLessThan(result.gasLimit);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('terminates a runaway loop via gas metering without crashing the host process', async () => {
    const wasmBase64 = await compileWatToBase64(WAT_INFINITE_LOOP);
    const result = await runSandboxedWasm({
      wasmBase64,
      functionName: 'run',
      gasLimit: 50_000,
    });

    expect(result.success).toBe(false);
    expect(result.terminationReason).toBe('gas-exhausted');
    expect(result.error).toMatch(/gas budget/i);
    // The fact that this assertion runs at all proves the host process
    // survived the infinite loop.
  });

  it('rejects a module that imports a disallowed host function before instantiation', async () => {
    const wasmBase64 = await compileWatToBase64(WAT_DISALLOWED_IMPORT);
    const result = await runSandboxedWasm({ wasmBase64, functionName: 'run' });

    expect(result.success).toBe(false);
    expect(result.terminationReason).toBe('host-call-violation');
    expect(result.gasUsed).toBe(0); // rejected before ever running
  });

  it('rejects a module whose local memory maximum exceeds the sandbox budget', async () => {
    const wasmBase64 = await compileWatToBase64(WAT_MEMORY_OVER_BUDGET);
    const result = await runSandboxedWasm({ wasmBase64, functionName: 'touch' });

    expect(result.success).toBe(false);
    expect(result.terminationReason).toBe('memory-limit-exceeded');
  });

  it('rejects a module with unbounded local memory', async () => {
    const wasmBase64 = await compileWatToBase64(WAT_MEMORY_UNBOUNDED);
    const result = await runSandboxedWasm({ wasmBase64, functionName: 'touch' });

    expect(result.success).toBe(false);
    expect(result.terminationReason).toBe('memory-limit-exceeded');
  });

  it('supplies a capped host memory for modules that import it, and executes successfully', async () => {
    const wasmBase64 = await compileWatToBase64(WAT_IMPORTED_MEMORY);
    const result = await runSandboxedWasm({
      wasmBase64,
      functionName: 'touch',
      memoryLimitBytes: 1024 * 1024, // 1 MB — well under the 128MB ceiling
    });

    expect(result.success).toBe(true);
    expect(result.terminationReason).toBe('completed');
  });

  it('reports a trap (unreachable) as a controlled failure, not a crash', async () => {
    const wasmBase64 = await compileWatToBase64(WAT_TRAP);
    const result = await runSandboxedWasm({ wasmBase64, functionName: 'run' });

    expect(result.success).toBe(false);
    expect(result.terminationReason).toBe('trap');
  });

  it('rejects malformed base64 input as an invalid module', async () => {
    const result = await runSandboxedWasm({ wasmBase64: '***not-base64***', functionName: 'x' });
    // Buffer.from tolerates a lot of garbage, so this should fail either at
    // base64 decode, or fail static validation of the resulting bytes.
    expect(result.success).toBe(false);
  });

  it('reports a clear error when the exported function does not exist', async () => {
    const wasmBase64 = await compileWatToBase64(WAT_ADD);
    const result = await runSandboxedWasm({ wasmBase64, functionName: 'doesNotExist' });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });
});
