import { describe, it, expect } from 'vitest';

import {
  SOROBAN_HOST_MODULE,
  analyzeWasm,
  emptyModuleBytes,
  formatBytes,
  groupHostFunctions,
  hasWasmMagic,
  optimizationHints,
  sectionBreakdown,
} from '@/lib/wasmAnalyzer';

// ─── Binary builders ────────────────────────────────────────────────────────
// Hand-assembling modules keeps the tests honest: they exercise the real byte
// layout rather than a mock of it.

/** Unsigned LEB128. */
function leb(value: number): number[] {
  const out: number[] = [];
  let v = value;
  do {
    let byte = v & 0x7f;
    v >>>= 7;
    if (v !== 0) byte |= 0x80;
    out.push(byte);
  } while (v !== 0);
  return out;
}

/** A length-prefixed UTF-8 name. */
function name(text: string): number[] {
  const bytes = Array.from(new TextEncoder().encode(text));
  return [...leb(bytes.length), ...bytes];
}

function section(id: number, payload: number[]): number[] {
  return [id, ...leb(payload.length), ...payload];
}

function module(...sections: number[][]): Uint8Array {
  return new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, ...sections.flat()]);
}

/** An import section entry for a function. */
function funcImport(mod: string, field: string): number[] {
  return [...name(mod), ...name(field), 0x00, ...leb(0)];
}

/** An export section entry for a function. */
function funcExport(exportName: string, index = 0): number[] {
  return [...name(exportName), 0x00, ...leb(index)];
}

function customSection(customName: string, payloadBytes: number[] = []): number[] {
  return section(0, [...name(customName), ...payloadBytes]);
}

describe('hasWasmMagic', () => {
  it('accepts a real header', () => {
    expect(hasWasmMagic(emptyModuleBytes())).toBe(true);
  });

  it('rejects other content', () => {
    expect(hasWasmMagic(new Uint8Array([0x7f, 0x45, 0x4c, 0x46]))).toBe(false);
  });

  it('rejects a buffer too short to hold the magic', () => {
    expect(hasWasmMagic(new Uint8Array([0x00, 0x61]))).toBe(false);
  });
});

describe('analyzeWasm validation', () => {
  it('accepts a header-only module', () => {
    const info = analyzeWasm(emptyModuleBytes());

    expect(info.valid).toBe(true);
    expect(info.version).toBe(1);
    expect(info.sections).toEqual([]);
  });

  it('explains a non-WASM file instead of throwing', () => {
    const info = analyzeWasm(new TextEncoder().encode('#!/bin/sh\necho hi\n'));

    expect(info.valid).toBe(false);
    expect(info.error).toMatch(/magic number/i);
  });

  it('reports a truncated header', () => {
    const info = analyzeWasm(new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01]));

    expect(info.valid).toBe(false);
    expect(info.error).toMatch(/truncated/i);
  });

  it('rejects an unknown version', () => {
    const bytes = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x09, 0x00, 0x00, 0x00]);
    const info = analyzeWasm(bytes);

    expect(info.valid).toBe(false);
    expect(info.error).toMatch(/version 9/);
  });

  it('reports a section claiming more bytes than remain', () => {
    // A Type section declaring 200 bytes of payload with none present.
    const bytes = new Uint8Array([...emptyModuleBytes(), 0x01, ...leb(200)]);
    const info = analyzeWasm(bytes);

    expect(info.valid).toBe(false);
    expect(info.error).toMatch(/only 0 remain/);
  });

  it('never throws on random bytes that happen to start correctly', () => {
    const bytes = new Uint8Array([...emptyModuleBytes(), 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);

    expect(() => analyzeWasm(bytes)).not.toThrow();
    expect(analyzeWasm(bytes).valid).toBe(false);
  });
});

describe('section walking', () => {
  it('names sections by id', () => {
    const bytes = module(section(1, [0x00]), section(3, [0x00]), section(10, [0x00]));
    const info = analyzeWasm(bytes);

    expect(info.sections.map((s) => s.name)).toEqual(['Type', 'Function', 'Code']);
  });

  it('records each section size and offset', () => {
    const bytes = module(section(1, [0x01, 0x02, 0x03]));
    const [type] = analyzeWasm(bytes).sections;

    expect(type.size).toBe(3);
    expect(type.offset).toBe(10); // 8 header + 1 id + 1 length
  });

  it('reads the name out of a custom section', () => {
    const info = analyzeWasm(module(customSection('contractmetav0', [0x01])));

    expect(info.sections[0].name).toBe('Custom');
    expect(info.sections[0].customName).toBe('contractmetav0');
  });

  it('labels an unknown section id rather than dropping it', () => {
    const info = analyzeWasm(module(section(42, [0x00])));

    expect(info.sections[0].name).toBe('Unknown(42)');
  });
});

describe('imports', () => {
  it('parses module and field names', () => {
    const imports = [funcImport('env', 'ledger_get'), funcImport('env', 'obj_to_u64')];
    const bytes = module(section(2, [...leb(2), ...imports.flat()]));
    const info = analyzeWasm(bytes);

    expect(info.imports).toHaveLength(2);
    expect(info.imports[0]).toMatchObject({ module: 'env', field: 'ledger_get', kindName: 'func' });
  });

  it('picks out the Soroban host functions', () => {
    const imports = [funcImport('env', 'storage_get'), funcImport('other', 'thing')];
    const info = analyzeWasm(module(section(2, [...leb(2), ...imports.flat()])));

    expect(info.hostFunctions).toHaveLength(1);
    expect(info.hostFunctions[0].module).toBe(SOROBAN_HOST_MODULE);
  });

  it('handles a module with no imports at all', () => {
    expect(analyzeWasm(emptyModuleBytes()).hostFunctions).toEqual([]);
  });

  it('parses a memory import, whose descriptor differs from a function', () => {
    // kind 2 = memory, limits flag 0, initial pages 1
    const memImport = [...name('env'), ...name('memory'), 0x02, 0x00, ...leb(1)];
    const info = analyzeWasm(module(section(2, [...leb(1), ...memImport])));

    expect(info.imports[0]).toMatchObject({ field: 'memory', kindName: 'memory' });
  });
});

describe('exports', () => {
  it('parses exported function names', () => {
    const exports = [funcExport('hello'), funcExport('__constructor', 1)];
    const info = analyzeWasm(module(section(7, [...leb(2), ...exports.flat()])));

    expect(info.exports.map((e) => e.name)).toEqual(['hello', '__constructor']);
    expect(info.exports[0].kindName).toBe('func');
  });
});

describe('groupHostFunctions', () => {
  it('groups by the leading name segment', () => {
    const groups = groupHostFunctions([
      { module: 'env', field: 'ledger_get', kind: 0, kindName: 'func' },
      { module: 'env', field: 'ledger_put', kind: 0, kindName: 'func' },
      { module: 'env', field: 'map_new', kind: 0, kindName: 'func' },
    ]);

    expect(Object.keys(groups).sort()).toEqual(['ledger', 'map']);
    expect(groups.ledger).toHaveLength(2);
  });
});

describe('sectionBreakdown', () => {
  it('sorts sections largest first', () => {
    const bytes = module(section(1, [0x00]), section(10, new Array(50).fill(0x00)));
    const breakdown = sectionBreakdown(analyzeWasm(bytes));

    expect(breakdown[0].name).toBe('Code');
    expect(breakdown[0].bytes).toBe(50);
  });

  it('computes each share of the total', () => {
    const bytes = module(section(1, new Array(25).fill(0)), section(10, new Array(75).fill(0)));
    const breakdown = sectionBreakdown(analyzeWasm(bytes));

    expect(breakdown[0].share).toBeCloseTo(0.75, 5);
    expect(breakdown[1].share).toBeCloseTo(0.25, 5);
  });

  it('labels a custom section with its own name', () => {
    const breakdown = sectionBreakdown(analyzeWasm(module(customSection('name', [0x00]))));

    expect(breakdown[0].name).toBe('Custom: name');
  });

  it('does not divide by zero for a header-only module', () => {
    expect(sectionBreakdown(analyzeWasm(emptyModuleBytes()))).toEqual([]);
  });
});

describe('optimizationHints', () => {
  it('flags a surviving debug name section, with the bytes it costs', () => {
    const info = analyzeWasm(module(customSection('name', new Array(120).fill(0))));
    const hints = optimizationHints(info);
    const hint = hints.find((h) => h.title.includes('name section'));

    expect(hint).toBeDefined();
    expect(hint!.estimatedSaving).toBeGreaterThan(100);
  });

  it('flags DWARF debug sections', () => {
    const info = analyzeWasm(
      module(customSection('.debug_info', new Array(40).fill(0)), customSection('.debug_line', [0])),
    );
    const hint = optimizationHints(info).find((h) => h.title.includes('DWARF'));

    expect(hint).toBeDefined();
    expect(hint!.title).toContain('2');
  });

  it('says nothing about debug info for a clean release build', () => {
    const info = analyzeWasm(module(section(10, new Array(20).fill(0))));

    expect(optimizationHints(info).some((h) => h.title.includes('name section'))).toBe(false);
  });

  it('warns when the contract is large', () => {
    const info = analyzeWasm(module(section(10, new Array(70_000).fill(0))));

    expect(optimizationHints(info).some((h) => h.title === 'Large contract')).toBe(true);
  });

  it('notes when a valid module imports nothing from the host', () => {
    const hints = optimizationHints(analyzeWasm(emptyModuleBytes()));

    expect(hints.some((h) => h.title.includes('No Soroban host imports'))).toBe(true);
  });

  it('does not claim missing host imports for a contract that has them', () => {
    const info = analyzeWasm(
      module(section(2, [...leb(1), ...funcImport('env', 'storage_get')])),
    );

    expect(info.hostFunctions).toHaveLength(1);
    expect(optimizationHints(info).some((h) => h.title.includes('No Soroban host'))).toBe(false);
  });
});

describe('formatBytes', () => {
  it('renders bytes, KB and MB', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.00 MB');
  });
});
