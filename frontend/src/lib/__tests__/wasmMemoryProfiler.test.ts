import { describe, expect, it } from 'vitest';
import {
  DATA_SECTION_CRITICAL_BYTES,
  DATA_SECTION_WARN_BYTES,
  MEMORY_LIMIT_BYTES,
  buildBinarySunburst,
  buildFlamegraphTree,
  buildMemoryReport,
  buildMemorySunburst,
  toSnapshotJson,
  traceMemoryGrowth,
  type ProfileNode,
} from '../wasmMemoryProfiler';
import { emptyModuleBytes } from '../wasmAnalyzer';
import { buildModule, op, sorobanLikeContract } from './fixtures/wasmBuilder';

const KB = 1024;
const MB = 1024 * KB;

function find(node: ProfileNode, name: string): ProfileNode | undefined {
  if (node.name === name) return node;
  for (const child of node.children ?? []) {
    const hit = find(child, name);
    if (hit) return hit;
  }
  return undefined;
}

describe('buildMemoryReport', () => {
  const bytes = sorobanLikeContract();

  it('produces a valid module the engine accepts', () => {
    expect(WebAssembly.validate(bytes as BufferSource)).toBe(true);
  });

  it('profiles every function with names, frames, locals and calls', () => {
    const report = buildMemoryReport(bytes);
    expect(report.module).toMatchObject({ valid: true, functionCount: 5, importedFunctionCount: 1, exportCount: 3 });

    const byName = Object.fromEntries(report.functions.map((f) => [f.name, f]));
    expect(byName['env.log']).toMatchObject({ imported: true, importModule: 'env' });
    expect(byName.deposit).toMatchObject({ exported: true, shadowStackBytes: 256, calls: { 2: 1, 3: 1 } });
    expect(byName.helper).toMatchObject({ shadowStackBytes: 8192, localsBytes: 16, calls: { 0: 1 } });
    expect(byName.alloc.memoryGrowSites).toBe(1);
    expect(byName.recurse.calls).toEqual({ 4: 1 });
    expect(report.functions.every((f) => !f.partial)).toBe(true);
  });

  it('lays out stack, static data and heap from the stack pointer', () => {
    const report = buildMemoryReport(bytes);
    expect(report.memory.stackPointerGlobal).toBe(0);
    expect(report.memory.stackTop).toBe(1 * MB);
    const kinds = Object.fromEntries(report.memory.regions.map((r) => [r.kind, r]));
    expect(kinds.stack).toMatchObject({ start: 0, end: 1 * MB, bytes: 1 * MB });
    expect(kinds.data).toMatchObject({ start: 1 * MB, bytes: 1 * KB });
    // Heap begins right after static data and runs to the end of initial memory.
    expect(kinds.heap).toMatchObject({ start: 1 * MB + 1 * KB, end: 17 * 64 * KB });
    expect(report.memory.regions.reduce((s, r) => s + r.bytes, 0)).toBe(17 * 64 * KB);
    expect(kinds.free).toBeUndefined();
  });

  it('detects recursion and computes the worst-case static stack path', () => {
    const report = buildMemoryReport(bytes);
    expect(report.recursiveFunctions).toEqual([4]);
    // The recursive export makes the worst case unbounded.
    expect(report.worstCaseStackBytes).toBe(Infinity);
    expect(report.hotspots.some((h) => h.kind === 'recursion' && h.functionIndex === 4)).toBe(true);
  });

  it('computes a finite worst-case path when nothing recurses', () => {
    const noRecursion = buildModule({
      types: [{}],
      functions: [
        { type: 0, body: op.frame(0, 100, op.call(1)) },
        { type: 0, body: op.frame(0, 300) },
      ],
      memory: { min: 2, max: 4 },
      globals: [{ type: 'i32', mutable: true, init: 65536 }],
      exports: [{ name: 'main', kind: 'func', index: 0 }],
    });
    const report = buildMemoryReport(noRecursion);
    expect(report.worstCaseStackBytes).toBe(400);
    expect(report.worstCaseStackPath).toEqual(['main', 'func[1]']);
    expect(report.budgets.find((b) => b.id === 'worst-case-stack')?.status).toBe('ok');
  });

  it('highlights hotspots: large frames, memory.grow and missing maximum', () => {
    const report = buildMemoryReport(bytes);
    const helperHot = report.hotspots.find((h) => h.kind === 'stack-frame');
    expect(helperHot).toMatchObject({ functionIndex: 2, bytes: 8192, severity: 'warning' });
    expect(report.hotspots.some((h) => h.kind === 'memory-grow' && h.functionIndex === 3)).toBe(true);
    expect(report.budgets.find((b) => b.id === 'max-memory')?.status).toBe('warning');
    // Sorted: critical, then warnings, then info.
    const order = report.hotspots.map((h) => h.severity);
    expect([...order].sort((a, b) => ['critical', 'warning', 'info'].indexOf(a) - ['critical', 'warning', 'info'].indexOf(b))).toEqual(order);
  });

  it('warns when the data section exceeds the recommended budget', () => {
    const ok = buildMemoryReport(sorobanLikeContract({ dataBytes: 2 * KB }));
    expect(ok.budgets.find((b) => b.id === 'data-section')?.status).toBe('ok');

    const warn = buildMemoryReport(sorobanLikeContract({ dataBytes: DATA_SECTION_WARN_BYTES + 1 }));
    const warnCheck = warn.budgets.find((b) => b.id === 'data-section');
    expect(warnCheck?.status).toBe('warning');
    expect(warnCheck?.message).toMatch(/above the recommended 16\.0 KB budget/);
    expect(warn.hotspots[0]).toMatchObject({ kind: 'data-section' });

    const critical = buildMemoryReport(sorobanLikeContract({ dataBytes: DATA_SECTION_CRITICAL_BYTES + 1 }));
    expect(critical.budgets.find((b) => b.id === 'data-section')?.status).toBe('critical');
    expect(critical.hotspots[0]).toMatchObject({ kind: 'data-section', severity: 'critical' });
  });

  it('flags initial memory above the 50 MB execution limit', () => {
    const huge = buildModule({ types: [], memory: { min: 801 } });
    const report = buildMemoryReport(huge);
    expect(report.budgets.find((b) => b.id === 'initial-memory')).toMatchObject({
      status: 'critical',
      limitBytes: MEMORY_LIMIT_BYTES,
    });
  });

  it('handles empty and invalid modules without throwing', () => {
    expect(buildMemoryReport(emptyModuleBytes()).module.valid).toBe(true);
    const bad = buildMemoryReport(new Uint8Array([1, 2, 3]));
    expect(bad.module.valid).toBe(false);
    expect(bad.functions).toEqual([]);
  });
});

describe('visualization trees', () => {
  const bytes = sorobanLikeContract();
  const report = buildMemoryReport(bytes);

  it('builds a stack flamegraph rooted at exports with recursion cut', () => {
    const tree = buildFlamegraphTree(report, 'stack');
    expect(tree.children?.map((c) => c.name)).toEqual(['deposit', 'recurse']);
    const deposit = find(tree, 'deposit')!;
    expect(deposit.value).toBe(256);
    expect(find(deposit, 'helper')).toMatchObject({ value: 8192, hotspot: true });
    // Imported host functions are not part of the tree.
    expect(find(tree, 'env.log')).toBeUndefined();
    const recurse = find(tree, 'recurse')!;
    expect(recurse.children?.[0]).toMatchObject({ name: '↻ recurse', recursive: true });
  });

  it('builds a code-size flamegraph', () => {
    const tree = buildFlamegraphTree(report, 'code');
    const helper = report.functions.find((f) => f.name === 'helper')!;
    expect(find(tree, 'helper')?.value).toBe(helper.codeBytes);
  });

  it('builds binary and memory sunbursts whose leaves add up', () => {
    const binary = buildBinarySunburst(bytes, report);
    const sum = (n: ProfileNode): number => n.value + (n.children ?? []).reduce((s, c) => s + sum(c), 0);
    const sectionPayload = 8; // header is not part of any section
    expect(sum(binary)).toBeLessThanOrEqual(bytes.length - sectionPayload);
    expect(find(binary, 'Code')?.children?.map((c) => c.name)).toContain('helper');
    expect(find(binary, 'Data')?.children).toHaveLength(1);

    const memory = buildMemorySunburst(report);
    expect(memory.children?.map((c) => c.name)).toEqual(['Shadow stack', 'Static data', 'Heap']);
    expect(sum(memory)).toBe(17 * 64 * KB);
  });
});

describe('traceMemoryGrowth', () => {
  it('records linear memory growth over execution steps for each export', async () => {
    const trace = await traceMemoryGrowth(sorobanLikeContract({ growPages: 3 }));
    expect(trace.approximate).toBe(true);
    expect(trace.limitBytes).toBe(MEMORY_LIMIT_BYTES);

    const deposit = trace.exports.find((e) => e.exportName === 'deposit')!;
    expect(deposit).toMatchObject({ ok: true, hostCalls: 1, startBytes: 17 * 64 * KB });
    expect(deposit.peakBytes).toBe(20 * 64 * KB);

    const depositSteps = trace.steps.filter((s) => s.exportName === 'deposit');
    expect(depositSteps.map((s) => s.label)).toEqual(['instantiate', 'env.log', 'return']);
    expect(depositSteps.map((s) => s.bytes)).toEqual([17 * 64 * KB, 20 * 64 * KB, 20 * 64 * KB]);
    // Steps are globally ordered.
    expect(trace.steps.map((s) => s.step)).toEqual(trace.steps.map((_, i) => i));
  });

  it('reports a runaway recursive export as a stack overflow diagnostic', async () => {
    const trace = await traceMemoryGrowth(sorobanLikeContract());
    const recurse = trace.exports.find((e) => e.exportName === 'recurse')!;
    expect(recurse.ok).toBe(false);
    expect(recurse.diagnostic?.code).toBe('stack-overflow');
  });

  it('never exceeds the 50 MB budget even when the guest grows aggressively', async () => {
    const trace = await traceMemoryGrowth(sorobanLikeContract({ growPages: 2000 }));
    const deposit = trace.exports.find((e) => e.exportName === 'deposit')!;
    expect(deposit.peakBytes).toBeLessThanOrEqual(MEMORY_LIMIT_BYTES);
    expect(Math.max(...trace.steps.map((s) => s.bytes))).toBeLessThanOrEqual(MEMORY_LIMIT_BYTES);
  });

  it('stops exports that exhaust the host-call budget', async () => {
    const chatty = buildModule({
      types: [{ params: ['i64'], results: ['i64'] }, {}],
      imports: [{ module: 'env', field: 'log', type: 0 }],
      functions: [{ type: 1, body: [0x03, 0x40, ...op.i64(1), ...op.call(0), 0x1a, 0x0c, 0x00, 0x0b] }],
      memory: { min: 1 },
      exports: [{ name: 'spin', kind: 'func', index: 1 }, { name: 'memory', kind: 'memory', index: 0 }],
    });
    const trace = await traceMemoryGrowth(chatty, { maxHostCallsPerExport: 25 });
    expect(trace.exports[0]).toMatchObject({ ok: false, hostCalls: 26, diagnostic: expect.objectContaining({ code: 'timeout' }) });
  });
});

describe('snapshot export', () => {
  it('serialises the report and trace as versioned JSON', async () => {
    const bytes = sorobanLikeContract();
    const report = buildMemoryReport(bytes, new Date('2026-01-01T00:00:00Z'));
    const trace = await traceMemoryGrowth(bytes);
    const json = toSnapshotJson(report, { fileName: 'counter.wasm', trace });
    const parsed = JSON.parse(json);
    expect(parsed.schema).toBe('web3-student-lab/wasm-memory-profile@1');
    expect(parsed.fileName).toBe('counter.wasm');
    expect(parsed.report.generatedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(parsed.report.worstCaseStackBytes).toBe('Infinity');
    expect(parsed.trace.exports).toHaveLength(2);
  });
});
