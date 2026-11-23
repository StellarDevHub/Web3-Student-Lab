import { describe, expect, it } from '@jest/globals';
import wabtInit from 'wabt';
import { decodeWasmBase64, validateWasmModule } from '../src/utils/wasmValidator.js';
import { compileWat, WAT_ADD, WAT_MEMORY_UNBOUNDED } from './fixtures/wasmFixtures.js';

const LIMIT = 50 * 1024 * 1024;

async function compileWithFeatures(wat: string, features: Record<string, boolean>): Promise<Uint8Array> {
  const wabt = await wabtInit();
  const mod = wabt.parseWat('feature.wat', wat, features);
  const { buffer } = mod.toBinary({});
  mod.destroy();
  return new Uint8Array(buffer);
}

describe('wasmValidator (BE-010)', () => {
  it('accepts a pure module and lists its exported functions', async () => {
    const result = validateWasmModule(await compileWat(WAT_ADD), { memoryLimitBytes: LIMIT, requiredExports: ['add'] });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.exportedFunctions).toEqual(['add']);
      expect(result.memoryLimitPages).toBe(800);
    }
  });

  it('rejects malformed base64 instead of silently dropping characters', () => {
    expect(decodeWasmBase64('AGFzbQ$$')).toBeNull();
    const result = validateWasmModule('not base64!!', { memoryLimitBytes: LIMIT });
    expect(result).toMatchObject({ valid: false, issue: { code: 'invalid-encoding' } });
  });

  it('rejects bytes that are not a wasm module', () => {
    const result = validateWasmModule(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]), { memoryLimitBytes: LIMIT });
    expect(result).toMatchObject({ valid: false, issue: { code: 'invalid-module' } });
  });

  it('rejects oversized modules before parsing them', () => {
    const result = validateWasmModule(new Uint8Array(32), { memoryLimitBytes: LIMIT, maxModuleBytes: 16 });
    expect(result).toMatchObject({ valid: false, issue: { code: 'module-too-large' } });
  });

  it('rejects unbounded local memory', async () => {
    const result = validateWasmModule(await compileWat(WAT_MEMORY_UNBOUNDED), { memoryLimitBytes: LIMIT });
    expect(result).toMatchObject({ valid: false, issue: { code: 'memory-unbounded' } });
  });

  it('rejects modules that try to declare the reserved metering import themselves', async () => {
    const wat = `(module (import "metering" "usegas" (func (param i32))) (func (export "run")))`;
    const result = validateWasmModule(await compileWat(wat), { memoryLimitBytes: LIMIT });
    expect(result).toMatchObject({ valid: false, issue: { code: 'host-import-forbidden' } });
  });

  it('rejects imported globals and tables, not just functions', async () => {
    const global = `(module (import "env" "g" (global i32)) (func (export "run")))`;
    const table = `(module (import "env" "t" (table 1 funcref)) (func (export "run")))`;
    for (const wat of [global, table]) {
      const result = validateWasmModule(await compileWat(wat), { memoryLimitBytes: LIMIT });
      expect(result).toMatchObject({ valid: false, issue: { code: 'host-import-forbidden' } });
    }
  });

  it('rejects a second (multi-memory) linear memory that would bypass the ceiling', async () => {
    const wat = `(module (memory 1 1) (memory 1) (func (export "run")))`;
    const result = validateWasmModule(await compileWithFeatures(wat, { multi_memory: true }), {
      memoryLimitBytes: LIMIT,
    });
    expect(result.valid).toBe(false);
  });

  it('rejects the exception-handling proposal so guests cannot catch the out-of-gas trap', async () => {
    const wat = `(module (tag $e) (func (export "run")))`;
    const result = validateWasmModule(await compileWithFeatures(wat, { exceptions: true }), {
      memoryLimitBytes: LIMIT,
    });
    expect(result).toMatchObject({ valid: false });
  });

  it('reports a missing required export', async () => {
    const result = validateWasmModule(await compileWat(WAT_ADD), {
      memoryLimitBytes: LIMIT,
      requiredExports: ['add', 'sub'],
    });
    expect(result).toMatchObject({ valid: false, issue: { code: 'missing-export' } });
  });
});
