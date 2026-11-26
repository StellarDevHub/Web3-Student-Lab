import { describe, expect, it } from 'vitest';

import { createDemoModule, disassembleWasm } from '../wasmDisassembler';

describe('disassembleWasm', () => {
  it('decodes the demo module into named functions and offsets', () => {
    const result = disassembleWasm(createDemoModule());

    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.functions.map((fn) => fn.name)).toEqual(['add', 'main']);
    expect(result.totalInstructions).toBe(10);
  });

  it('keeps parameters and declared locals separate in the locals table', () => {
    const result = disassembleWasm(createDemoModule());
    const add = result.functions.find((fn) => fn.name === 'add')!;
    const main = result.functions.find((fn) => fn.name === 'main')!;

    expect(add.locals).toHaveLength(2);
    expect(add.locals.every((local) => local.isParam && local.type === 'i32')).toBe(true);

    expect(main.locals).toHaveLength(1);
    expect(main.locals[0]).toMatchObject({ index: 0, type: 'i32', isParam: false });
  });

  it('decodes instructions with monotonic byte offsets and stack effects', () => {
    const result = disassembleWasm(createDemoModule());
    const add = result.functions.find((fn) => fn.name === 'add')!;
    const main = result.functions.find((fn) => fn.name === 'main')!;

    expect(add.instructions.map((instruction) => instruction.mnemonic)).toEqual([
      'local.get',
      'local.get',
      'i32.add',
      'end',
    ]);

    expect(main.instructions.map((instruction) => instruction.mnemonic)).toEqual([
      'i32.const',
      'i32.const',
      'call',
      'local.set',
      'local.get',
      'end',
    ]);

    const offsets = main.instructions.map((instruction) => instruction.offset);
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
    expect(new Set(offsets).size).toBe(offsets.length);

    const call = main.instructions.find((instruction) => instruction.mnemonic === 'call')!;
    expect(call.targetIndex).toBe(0);
    expect(call.immediates).toContain('add');
    expect(call.pop).toBe(2);
    expect(call.push).toBe(1);

    const addInstruction = add.instructions.find(
      (instruction) => instruction.mnemonic === 'i32.add'
    )!;
    expect(addInstruction).toMatchObject({ pop: 2, push: 1, category: 'numeric' });
  });

  it('reports a readable error for non-WASM input', () => {
    const result = disassembleWasm(new TextEncoder().encode('not wasm at all'));

    expect(result.valid).toBe(false);
    expect(result.functions).toHaveLength(0);
    expect(result.error).toMatch(/magic number/i);
  });

  it('rejects truncated section headers instead of throwing', () => {
    const bytes = createDemoModule();
    const result = disassembleWasm(bytes.subarray(0, 14));

    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
