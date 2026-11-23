import { describe, expect, it } from '@jest/globals';
import { inspectWasmModule, pagesForBytes, WasmParseError } from '../src/simulator/wasmModuleInspector.js';
import {
  compileWat,
  WAT_ADD,
  WAT_DISALLOWED_IMPORT,
  WAT_IMPORTED_MEMORY,
  WAT_MEMORY_OVER_BUDGET,
  WAT_MEMORY_UNBOUNDED,
  WAT_MEMORY_WITHIN_BUDGET,
} from './fixtures/wasmFixtures.js';

describe('wasmModuleInspector', () => {
  it('reports no memory and no imports for a plain pure function', async () => {
    const bytes = await compileWat(WAT_ADD);
    const inspection = inspectWasmModule(bytes);
    expect(inspection.memory).toBeNull();
    expect(inspection.imports).toHaveLength(0);
  });

  it('reads a locally-defined memory with an explicit maximum', async () => {
    const bytes = await compileWat(WAT_MEMORY_WITHIN_BUDGET);
    const inspection = inspectWasmModule(bytes);
    expect(inspection.memory).toEqual({ imported: false, minPages: 1, maxPages: 16 });
  });

  it('reads an oversized memory maximum correctly', async () => {
    const bytes = await compileWat(WAT_MEMORY_OVER_BUDGET);
    const inspection = inspectWasmModule(bytes);
    expect(inspection.memory).toEqual({ imported: false, minPages: 1, maxPages: 4096 });
  });

  it('reports maxPages null for unbounded memory', async () => {
    const bytes = await compileWat(WAT_MEMORY_UNBOUNDED);
    const inspection = inspectWasmModule(bytes);
    expect(inspection.memory).toEqual({ imported: false, minPages: 1, maxPages: null });
  });

  it('detects an imported memory', async () => {
    const bytes = await compileWat(WAT_IMPORTED_MEMORY);
    const inspection = inspectWasmModule(bytes);
    expect(inspection.memory).toEqual({ imported: true, minPages: 1, maxPages: null });
  });

  it('lists disallowed host function imports', async () => {
    const bytes = await compileWat(WAT_DISALLOWED_IMPORT);
    const inspection = inspectWasmModule(bytes);
    expect(inspection.imports).toEqual([{ module: 'env', name: 'print', kind: 'func' }]);
  });

  it('throws WasmParseError for garbage input', () => {
    expect(() => inspectWasmModule(new Uint8Array([1, 2, 3, 4]))).toThrow(WasmParseError);
  });

  it('throws WasmParseError for a bad magic number', () => {
    const bad = new Uint8Array([0xff, 0xff, 0xff, 0xff, 1, 0, 0, 0]);
    expect(() => inspectWasmModule(bad)).toThrow(/bad magic number/);
  });

  describe('pagesForBytes', () => {
    it('rounds up to the nearest full page', () => {
      expect(pagesForBytes(1)).toBe(1);
      expect(pagesForBytes(65_536)).toBe(1);
      expect(pagesForBytes(65_537)).toBe(2);
      expect(pagesForBytes(128 * 1024 * 1024)).toBe(2048);
    });
  });
});
