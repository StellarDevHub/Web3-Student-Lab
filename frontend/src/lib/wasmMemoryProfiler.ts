/**
 * Client-side WASM contract memory profiler (Issue FE-071).
 *
 * Builds on the structural walk in `wasmAnalyzer.ts` and goes one level
 * deeper: it decodes every function body to find what each function reserves
 * on the stack, what it calls, and where it allocates or grows memory. From
 * that it derives
 *
 *  - a flamegraph tree (exports → callees) weighted by stack bytes or code size,
 *  - sunburst hierarchies of the binary and of initial linear memory
 *    (shadow stack / static data / heap),
 *  - hotspots and budget warnings (data section, 50 MB memory limit, stack),
 *  - a linear-memory growth trace recorded by actually executing each export
 *    inside the 50 MB `SimulationSession`, with Soroban host functions stubbed,
 *  - a JSON snapshot for sharing/diagnostics.
 *
 * Everything except `traceMemoryGrowth` is pure and synchronous.
 */

import {
  SECTION_NAMES,
  WASM_PAGE_BYTES,
  WasmReader,
  analyzeWasm,
  formatBytes,
  type WasmModuleInfo,
} from './wasmAnalyzer';
import {
  MAX_SESSION_MEMORY_BYTES,
  SimulationSession,
  classifySimulationError,
  type SimulationDiagnostic,
  type SimulationImports,
} from '../services/stellar/simulator';

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

/** Soroban execution memory limit enforced by the playground simulator. */
export const MEMORY_LIMIT_BYTES = MAX_SESSION_MEMORY_BYTES;

/**
 * Data segments are parsed and copied into memory on every VM instantiation,
 * which Soroban meters per byte. Above these sizes instantiation cost becomes
 * a noticeable share of a transaction's CPU budget.
 */
export const DATA_SECTION_WARN_BYTES = 16 * 1024;
export const DATA_SECTION_CRITICAL_BYTES = 64 * 1024;

/** A single function reserving more than this on the shadow stack is a hotspot. */
export const STACK_FRAME_HOTSPOT_BYTES = 4 * 1024;

/** Functions larger than this share of the Code section are flagged. */
export const CODE_HOTSPOT_SHARE = 0.1;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ValType = 'i32' | 'i64' | 'f32' | 'f64' | 'v128' | 'funcref' | 'externref' | 'unknown';

const VALTYPE: Record<number, ValType> = {
  0x7f: 'i32',
  0x7e: 'i64',
  0x7d: 'f32',
  0x7c: 'f64',
  0x7b: 'v128',
  0x70: 'funcref',
  0x6f: 'externref',
};

const VALTYPE_BYTES: Record<ValType, number> = {
  i32: 4,
  i64: 8,
  f32: 4,
  f64: 8,
  v128: 16,
  funcref: 8,
  externref: 8,
  unknown: 8,
};

export interface FuncType {
  params: ValType[];
  results: ValType[];
}

export interface FunctionProfile {
  /** Index in the module's function index space (imports first). */
  index: number;
  name: string;
  imported: boolean;
  importModule?: string;
  exported: boolean;
  exportNames: string[];
  typeIndex: number;
  /** Body size in bytes (0 for imports). */
  codeBytes: number;
  /** Engine stack used by declared locals + params. */
  localsBytes: number;
  /** Bytes reserved on the linear-memory shadow stack by the prologue. */
  shadowStackBytes: number;
  instructionCount: number;
  /** Direct callees → call-site count. */
  calls: Record<number, number>;
  callIndirectCount: number;
  memoryGrowSites: number;
  loadCount: number;
  storeCount: number;
  bulkMemoryOps: number;
  /** True when the decoder hit an instruction it does not understand (e.g. SIMD). */
  partial: boolean;
}

export interface MemoryRegion {
  kind: 'stack' | 'data' | 'heap' | 'free';
  label: string;
  start: number;
  end: number;
  bytes: number;
}

export type HotspotKind =
  | 'data-section'
  | 'memory-limit'
  | 'stack-frame'
  | 'stack-depth'
  | 'recursion'
  | 'code-size'
  | 'memory-grow'
  | 'allocation';

export interface Hotspot {
  kind: HotspotKind;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  bytes?: number;
  functionIndex?: number;
}

export interface BudgetCheck {
  id: 'data-section' | 'initial-memory' | 'max-memory' | 'worst-case-stack';
  label: string;
  bytes: number;
  limitBytes: number;
  status: 'ok' | 'warning' | 'critical';
  message: string;
}

export interface MemoryReport {
  generatedAt: string;
  module: {
    totalBytes: number;
    valid: boolean;
    error?: string;
    functionCount: number;
    importedFunctionCount: number;
    exportCount: number;
  };
  dataSection: { bytes: number; segments: number };
  memory: {
    initialBytes: number;
    maxBytes?: number;
    stackPointerGlobal?: number;
    stackTop?: number;
    heapBase?: number;
    regions: MemoryRegion[];
  };
  functions: FunctionProfile[];
  /** Worst-case static shadow-stack depth from any export (Infinity if recursive). */
  worstCaseStackBytes: number;
  worstCaseStackPath: string[];
  recursiveFunctions: number[];
  hotspots: Hotspot[];
  budgets: BudgetCheck[];
}

/** Generic tree consumed by the D3 flamegraph and sunburst components. */
export interface ProfileNode {
  name: string;
  /** Exclusive weight of this node (children add their own). */
  value: number;
  functionIndex?: number;
  hotspot?: boolean;
  recursive?: boolean;
  /** Free-form tooltip lines. */
  detail?: string;
  children?: ProfileNode[];
}

// ---------------------------------------------------------------------------
// Low-level module parsing
// ---------------------------------------------------------------------------

interface RawModule {
  types: FuncType[];
  imports: Array<{ module: string; field: string; kind: number; typeIndex?: number; global?: { type: ValType; mutable: boolean } }>;
  functionTypeIndices: number[];
  globals: Array<{ type: ValType; mutable: boolean; init?: number }>;
  importedGlobalCount: number;
  exports: Array<{ name: string; kind: number; index: number }>;
  bodies: Array<{ start: number; end: number }>;
  functionNames: Map<number, string>;
  globalNames: Map<number, string>;
}

function readValType(reader: WasmReader): ValType {
  return VALTYPE[reader.u8()] ?? 'unknown';
}

function readInitExpr(reader: WasmReader): number | undefined {
  const opcode = reader.u8();
  let value: number | undefined;
  if (opcode === 0x41) value = reader.sleb32();
  else if (opcode === 0x42) value = Number(reader.sleb64());
  else if (opcode === 0x23) reader.varuint();
  else if (opcode === 0x43) reader.skip(4);
  else if (opcode === 0x44) reader.skip(8);
  else if (opcode === 0xd0) reader.u8();
  else if (opcode === 0xd2) reader.varuint();
  let guard = 0;
  while (reader.u8() !== 0x0b) {
    if (++guard > 64) throw new Error('Runaway init expression');
  }
  return value;
}

function parseNameSection(payload: Uint8Array, raw: RawModule) {
  const reader = new WasmReader(payload);
  reader.name(); // "name"
  while (!reader.done) {
    const id = reader.u8();
    const size = reader.varuint();
    const end = reader.offset + size;
    if (id === 1 || id === 7) {
      const target = id === 1 ? raw.functionNames : raw.globalNames;
      const count = reader.varuint();
      for (let i = 0; i < count; i++) {
        const index = reader.varuint();
        target.set(index, reader.name());
      }
    }
    reader.offset = end;
  }
}

function parseRawModule(bytes: Uint8Array): RawModule {
  const raw: RawModule = {
    types: [],
    imports: [],
    functionTypeIndices: [],
    globals: [],
    importedGlobalCount: 0,
    exports: [],
    bodies: [],
    functionNames: new Map(),
    globalNames: new Map(),
  };
  const reader = new WasmReader(bytes, 8);

  while (!reader.done) {
    const id = reader.u8();
    const size = reader.varuint();
    const start = reader.offset;
    const end = start + size;
    const payload = bytes.subarray(start, end);
    const r = new WasmReader(payload);

    switch (id) {
      case 0: {
        try {
          if (new WasmReader(payload).name() === 'name') parseNameSection(payload, raw);
        } catch {
          // A malformed name section only costs us labels.
        }
        break;
      }
      case 1: {
        const count = r.varuint();
        for (let i = 0; i < count; i++) {
          const form = r.u8();
          if (form !== 0x60) throw new Error(`Unsupported type form 0x${form.toString(16)}`);
          const params = Array.from({ length: r.varuint() }, () => readValType(r));
          const results = Array.from({ length: r.varuint() }, () => readValType(r));
          raw.types.push({ params, results });
        }
        break;
      }
      case 2: {
        const count = r.varuint();
        for (let i = 0; i < count; i++) {
          const module = r.name();
          const field = r.name();
          const kind = r.u8();
          if (kind === 0) {
            raw.imports.push({ module, field, kind, typeIndex: r.varuint() });
          } else if (kind === 1) {
            r.u8();
            const flags = r.u8();
            r.varuint();
            if (flags & 1) r.varuint();
            raw.imports.push({ module, field, kind });
          } else if (kind === 2) {
            const flags = r.u8();
            r.varuint();
            if (flags & 1) r.varuint();
            raw.imports.push({ module, field, kind });
          } else if (kind === 3) {
            const type = readValType(r);
            const mutable = r.u8() === 1;
            raw.imports.push({ module, field, kind, global: { type, mutable } });
            raw.importedGlobalCount++;
          } else {
            throw new Error(`Unknown import kind ${kind}`);
          }
        }
        break;
      }
      case 3: {
        const count = r.varuint();
        for (let i = 0; i < count; i++) raw.functionTypeIndices.push(r.varuint());
        break;
      }
      case 6: {
        const count = r.varuint();
        for (let i = 0; i < count; i++) {
          const type = readValType(r);
          const mutable = r.u8() === 1;
          raw.globals.push({ type, mutable, init: readInitExpr(r) });
        }
        break;
      }
      case 7: {
        const count = r.varuint();
        for (let i = 0; i < count; i++) {
          const name = r.name();
          const kind = r.u8();
          raw.exports.push({ name, kind, index: r.varuint() });
        }
        break;
      }
      case 10: {
        const count = r.varuint();
        for (let i = 0; i < count; i++) {
          const bodySize = r.varuint();
          raw.bodies.push({ start: start + r.offset, end: start + r.offset + bodySize });
          r.skip(bodySize);
        }
        break;
      }
      default:
        break;
    }
    reader.offset = end;
  }
  return raw;
}

// ---------------------------------------------------------------------------
// Function body decoding
// ---------------------------------------------------------------------------

interface BodyStats {
  localsBytes: number;
  shadowStackBytes: number;
  instructionCount: number;
  calls: Record<number, number>;
  callIndirectCount: number;
  memoryGrowSites: number;
  loadCount: number;
  storeCount: number;
  bulkMemoryOps: number;
  partial: boolean;
}

function skipBlockType(reader: WasmReader) {
  const byte = reader.u8();
  if (byte === 0x40 || VALTYPE[byte]) return;
  // s33 type index: we've consumed its first byte already.
  let b = byte;
  while (b & 0x80) b = reader.u8();
}

function skipMemarg(reader: WasmReader) {
  const align = reader.varuint();
  if (align & 0x40) reader.varuint(); // multi-memory index
  reader.varuint();
}

/**
 * Decode one function body. Recognises the LLVM shadow-stack prologue
 * `global.get $sp; i32.const N; i32.sub` to measure the frame size.
 */
function decodeBody(bytes: Uint8Array, start: number, end: number, stackPointer?: number): BodyStats {
  const reader = new WasmReader(bytes.subarray(start, end));
  const stats: BodyStats = {
    localsBytes: 0,
    shadowStackBytes: 0,
    instructionCount: 0,
    calls: {},
    callIndirectCount: 0,
    memoryGrowSites: 0,
    loadCount: 0,
    storeCount: 0,
    bulkMemoryOps: 0,
    partial: false,
  };

  const declCount = reader.varuint();
  for (let i = 0; i < declCount; i++) {
    const n = reader.varuint();
    stats.localsBytes += n * VALTYPE_BYTES[readValType(reader)];
  }

  // Sliding window for the prologue pattern.
  let lastGlobalGet = -1;
  let pendingConst: number | null = null;
  let sawSpGet = false;

  try {
    while (!reader.done) {
      const op = reader.u8();
      stats.instructionCount++;
      const wasSpGet = sawSpGet;
      const constVal = pendingConst;
      sawSpGet = false;
      pendingConst = null;

      switch (true) {
        case op === 0x02 || op === 0x03 || op === 0x04:
          skipBlockType(reader);
          break;
        case op === 0x0c || op === 0x0d:
          reader.varuint();
          break;
        case op === 0x0e: {
          const n = reader.varuint();
          for (let i = 0; i <= n; i++) reader.varuint();
          break;
        }
        case op === 0x10 || op === 0x12: {
          const callee = reader.varuint();
          stats.calls[callee] = (stats.calls[callee] ?? 0) + 1;
          break;
        }
        case op === 0x11 || op === 0x13:
          reader.varuint();
          reader.varuint();
          stats.callIndirectCount++;
          break;
        case op === 0x1c: {
          const n = reader.varuint();
          reader.skip(n);
          break;
        }
        case op >= 0x20 && op <= 0x22:
          reader.varuint();
          break;
        case op === 0x23: {
          const idx = reader.varuint();
          lastGlobalGet = idx;
          sawSpGet = stackPointer !== undefined && idx === stackPointer;
          break;
        }
        case op === 0x24 || op === 0x25 || op === 0x26:
          reader.varuint();
          break;
        case op >= 0x28 && op <= 0x35:
          skipMemarg(reader);
          stats.loadCount++;
          break;
        case op >= 0x36 && op <= 0x3e:
          skipMemarg(reader);
          stats.storeCount++;
          break;
        case op === 0x3f:
          reader.varuint();
          break;
        case op === 0x40:
          reader.varuint();
          stats.memoryGrowSites++;
          break;
        case op === 0x41: {
          const value = reader.sleb32();
          if (wasSpGet) pendingConst = value;
          break;
        }
        case op === 0x42:
          reader.sleb64();
          break;
        case op === 0x43:
          reader.skip(4);
          break;
        case op === 0x44:
          reader.skip(8);
          break;
        case op === 0x6b: // i32.sub
          if (constVal !== null && stats.shadowStackBytes === 0 && constVal > 0) {
            stats.shadowStackBytes = constVal;
          }
          break;
        case op === 0xd0:
          reader.u8();
          break;
        case op === 0xd2:
          reader.varuint();
          break;
        case op === 0xfc: {
          const sub = reader.varuint();
          if (sub <= 7) break;
          if (sub === 8) {
            reader.varuint();
            reader.varuint();
            stats.bulkMemoryOps++;
          } else if (sub === 9 || sub === 13 || (sub >= 15 && sub <= 17)) reader.varuint();
          else if (sub === 10) {
            reader.varuint();
            reader.varuint();
            stats.bulkMemoryOps++;
          } else if (sub === 11) {
            reader.varuint();
            stats.bulkMemoryOps++;
          } else if (sub === 12 || sub === 14) {
            reader.varuint();
            reader.varuint();
          } else {
            stats.partial = true;
            return stats;
          }
          break;
        }
        case (op >= 0x00 && op <= 0x01) ||
          op === 0x05 ||
          op === 0x0b ||
          op === 0x0f ||
          op === 0x1a ||
          op === 0x1b ||
          op === 0xd1 ||
          (op >= 0x45 && op <= 0xc4):
          break;
        default:
          // SIMD (0xfd), threads (0xfe), GC proposals… stop decoding this body.
          stats.partial = true;
          return stats;
      }
    }
  } catch {
    stats.partial = true;
  }
  void lastGlobalGet;
  return stats;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function findStackPointer(raw: RawModule): number | undefined {
  for (const [index, name] of Array.from(raw.globalNames.entries())) {
    if (name === '__stack_pointer') return index;
  }
  // LLVM convention: the first defined mutable i32 global is the stack pointer.
  const local = raw.globals.findIndex((g) => g.mutable && g.type === 'i32' && g.init !== undefined);
  return local === -1 ? undefined : raw.importedGlobalCount + local;
}

function globalInit(raw: RawModule, index: number): number | undefined {
  const local = index - raw.importedGlobalCount;
  return local >= 0 ? raw.globals[local]?.init : undefined;
}

function exportedGlobalValue(raw: RawModule, name: string): number | undefined {
  const exp = raw.exports.find((e) => e.kind === 3 && e.name === name);
  return exp ? globalInit(raw, exp.index) : undefined;
}

function buildFunctions(bytes: Uint8Array, raw: RawModule, stackPointer?: number): FunctionProfile[] {
  const funcImports = raw.imports.filter((i) => i.kind === 0);
  const exportsByIndex = new Map<number, string[]>();
  for (const exp of raw.exports) {
    if (exp.kind !== 0) continue;
    exportsByIndex.set(exp.index, [...(exportsByIndex.get(exp.index) ?? []), exp.name]);
  }

  const profiles: FunctionProfile[] = funcImports.map((imp, index) => ({
    index,
    name: raw.functionNames.get(index) ?? `${imp.module}.${imp.field}`,
    imported: true,
    importModule: imp.module,
    exported: exportsByIndex.has(index),
    exportNames: exportsByIndex.get(index) ?? [],
    typeIndex: imp.typeIndex ?? 0,
    codeBytes: 0,
    localsBytes: 0,
    shadowStackBytes: 0,
    instructionCount: 0,
    calls: {},
    callIndirectCount: 0,
    memoryGrowSites: 0,
    loadCount: 0,
    storeCount: 0,
    bulkMemoryOps: 0,
    partial: false,
  }));

  raw.functionTypeIndices.forEach((typeIndex, i) => {
    const index = funcImports.length + i;
    const body = raw.bodies[i];
    const stats = body
      ? decodeBody(bytes, body.start, body.end, stackPointer)
      : ({ partial: true } as Partial<BodyStats>);
    const type = raw.types[typeIndex];
    const paramBytes = (type?.params ?? []).reduce((s, t) => s + VALTYPE_BYTES[t], 0);
    const names = exportsByIndex.get(index) ?? [];
    profiles.push({
      index,
      name: raw.functionNames.get(index) ?? names[0] ?? `func[${index}]`,
      imported: false,
      exported: names.length > 0,
      exportNames: names,
      typeIndex,
      codeBytes: body ? body.end - body.start : 0,
      localsBytes: (stats.localsBytes ?? 0) + paramBytes,
      shadowStackBytes: stats.shadowStackBytes ?? 0,
      instructionCount: stats.instructionCount ?? 0,
      calls: stats.calls ?? {},
      callIndirectCount: stats.callIndirectCount ?? 0,
      memoryGrowSites: stats.memoryGrowSites ?? 0,
      loadCount: stats.loadCount ?? 0,
      storeCount: stats.storeCount ?? 0,
      bulkMemoryOps: stats.bulkMemoryOps ?? 0,
      partial: stats.partial ?? false,
    });
  });

  return profiles;
}

/** Strongly connected components (Tarjan) to find recursion. */
function findRecursive(functions: FunctionProfile[]): Set<number> {
  const index = new Map<number, number>();
  const low = new Map<number, number>();
  const onStack = new Set<number>();
  const stack: number[] = [];
  const recursive = new Set<number>();
  let counter = 0;

  const strong = (v: number) => {
    // Iterative Tarjan to survive deep call graphs.
    const work: Array<{ v: number; edges: number[]; i: number }> = [];
    const push = (node: number) => {
      index.set(node, counter);
      low.set(node, counter);
      counter++;
      stack.push(node);
      onStack.add(node);
      work.push({ v: node, edges: Object.keys(functions[node]?.calls ?? {}).map(Number), i: 0 });
    };
    push(v);
    while (work.length) {
      const frame = work[work.length - 1];
      if (frame.i < frame.edges.length) {
        const w = frame.edges[frame.i++];
        if (!functions[w]) continue;
        if (!index.has(w)) push(w);
        else if (onStack.has(w)) low.set(frame.v, Math.min(low.get(frame.v)!, index.get(w)!));
        continue;
      }
      work.pop();
      if (work.length) {
        const parent = work[work.length - 1].v;
        low.set(parent, Math.min(low.get(parent)!, low.get(frame.v)!));
      }
      if (low.get(frame.v) === index.get(frame.v)) {
        const component: number[] = [];
        let w: number;
        do {
          w = stack.pop()!;
          onStack.delete(w);
          component.push(w);
        } while (w !== frame.v);
        const selfLoop = component.length === 1 && functions[w].calls[w] !== undefined;
        if (component.length > 1 || selfLoop) component.forEach((c) => recursive.add(c));
      }
    }
  };

  functions.forEach((f) => {
    if (!index.has(f.index)) strong(f.index);
  });
  return recursive;
}

const frameBytes = (f: FunctionProfile) => f.shadowStackBytes;

function worstCaseStack(
  functions: FunctionProfile[],
  roots: number[],
  recursive: Set<number>
): { bytes: number; path: number[] } {
  const memo = new Map<number, { bytes: number; path: number[] }>();
  const visiting = new Set<number>();

  const visit = (i: number): { bytes: number; path: number[] } => {
    const cached = memo.get(i);
    if (cached) return cached;
    if (recursive.has(i) || visiting.has(i)) return { bytes: Infinity, path: [i] };
    visiting.add(i);
    let best = { bytes: 0, path: [] as number[] };
    for (const callee of Object.keys(functions[i].calls).map(Number)) {
      if (!functions[callee]) continue;
      const sub = visit(callee);
      if (sub.bytes > best.bytes) best = sub;
    }
    visiting.delete(i);
    const result = { bytes: frameBytes(functions[i]) + best.bytes, path: [i, ...best.path] };
    memo.set(i, result);
    return result;
  };

  let worst = { bytes: 0, path: [] as number[] };
  for (const root of roots) {
    const r = visit(root);
    if (r.bytes > worst.bytes) worst = r;
  }
  return worst;
}

function memoryRegions(
  info: WasmModuleInfo,
  stackTop: number | undefined,
  heapBaseExport: number | undefined
): { regions: MemoryRegion[]; heapBase?: number } {
  const mem = info.memories[0];
  if (!mem) return { regions: [] };
  const initialBytes = mem.min * WASM_PAGE_BYTES;

  const segments = info.dataSegments
    .filter((s): s is typeof s & { offset: number } => s.active && s.offset !== undefined && (s.memoryIndex ?? 0) === 0)
    .map((s) => ({ start: s.offset, end: s.offset + s.size }))
    .sort((a, b) => a.start - b.start);

  const regions: MemoryRegion[] = [];
  const clamp = (n: number) => Math.max(0, Math.min(initialBytes, n));

  let stackBase: number | undefined;
  if (stackTop !== undefined) {
    // Stack occupies the gap that ends at the stack pointer's initial value.
    stackBase = segments.filter((s) => s.end <= stackTop).reduce((m, s) => Math.max(m, s.end), 0);
    regions.push({
      kind: 'stack',
      label: 'Shadow stack',
      start: clamp(stackBase),
      end: clamp(stackTop),
      bytes: clamp(stackTop) - clamp(stackBase),
    });
  }

  segments.forEach((s, i) =>
    regions.push({
      kind: 'data',
      label: `Data segment #${i}`,
      start: clamp(s.start),
      end: clamp(s.end),
      bytes: clamp(s.end) - clamp(s.start),
    })
  );

  const dataEnd = segments.reduce((m, s) => Math.max(m, s.end), 0);
  const heapBase = heapBaseExport ?? Math.max(stackTop ?? 0, dataEnd);
  if (heapBase < initialBytes) {
    regions.push({
      kind: 'heap',
      label: 'Heap (initial)',
      start: heapBase,
      end: initialBytes,
      bytes: initialBytes - heapBase,
    });
  }

  const used = regions.reduce((s, r) => s + r.bytes, 0);
  if (used < initialBytes) {
    regions.push({
      kind: 'free',
      label: 'Unassigned',
      start: 0,
      end: initialBytes,
      bytes: initialBytes - used,
    });
  }

  return { regions: regions.filter((r) => r.bytes > 0), heapBase };
}

/**
 * Build the full memory report for a module.
 *
 * Never throws: invalid modules come back with `module.valid === false`.
 */
export function buildMemoryReport(bytes: Uint8Array, now: Date = new Date()): MemoryReport {
  const info = analyzeWasm(bytes);
  const dataBytes = info.dataSegments.reduce((s, d) => s + d.size, 0);
  const base: MemoryReport = {
    generatedAt: now.toISOString(),
    module: {
      totalBytes: info.totalBytes,
      valid: info.valid,
      error: info.error,
      functionCount: 0,
      importedFunctionCount: 0,
      exportCount: info.exports.length,
    },
    dataSection: { bytes: dataBytes, segments: info.dataSegments.length },
    memory: {
      initialBytes: (info.memories[0]?.min ?? 0) * WASM_PAGE_BYTES,
      maxBytes: info.memories[0]?.max !== undefined ? info.memories[0].max * WASM_PAGE_BYTES : undefined,
      regions: [],
    },
    functions: [],
    worstCaseStackBytes: 0,
    worstCaseStackPath: [],
    recursiveFunctions: [],
    hotspots: [],
    budgets: [],
  };
  if (!info.valid) return base;

  let raw: RawModule;
  try {
    raw = parseRawModule(bytes);
  } catch (err) {
    return { ...base, module: { ...base.module, valid: false, error: (err as Error).message } };
  }

  const stackPointer = findStackPointer(raw);
  const stackTop = stackPointer !== undefined ? globalInit(raw, stackPointer) : undefined;
  const functions = buildFunctions(bytes, raw, stackPointer);
  const defined = functions.filter((f) => !f.imported);
  const recursive = findRecursive(functions);

  const roots = defined.filter((f) => f.exported).map((f) => f.index);
  const worst = worstCaseStack(functions, roots.length ? roots : defined.map((f) => f.index), recursive);
  const { regions, heapBase } = memoryRegions(
    info,
    stackTop,
    exportedGlobalValue(raw, '__heap_base')
  );

  const report: MemoryReport = {
    ...base,
    module: {
      ...base.module,
      functionCount: functions.length,
      importedFunctionCount: functions.length - defined.length,
    },
    memory: {
      ...base.memory,
      stackPointerGlobal: stackPointer,
      stackTop,
      heapBase,
      regions,
    },
    functions,
    worstCaseStackBytes: worst.bytes,
    worstCaseStackPath: worst.path.map((i) => functions[i]?.name ?? `func[${i}]`),
    recursiveFunctions: Array.from(recursive).sort((a, b) => a - b),
  };

  report.budgets = budgetChecks(report);
  report.hotspots = findHotspots(report, info);
  return report;
}

function budgetChecks(report: MemoryReport): BudgetCheck[] {
  const checks: BudgetCheck[] = [];
  const data = report.dataSection.bytes;
  checks.push({
    id: 'data-section',
    label: 'Data section',
    bytes: data,
    limitBytes: DATA_SECTION_WARN_BYTES,
    status: data > DATA_SECTION_CRITICAL_BYTES ? 'critical' : data > DATA_SECTION_WARN_BYTES ? 'warning' : 'ok',
    message:
      data > DATA_SECTION_WARN_BYTES
        ? `Static data is ${formatBytes(data)}, above the recommended ${formatBytes(DATA_SECTION_WARN_BYTES)} budget. It is copied into memory on every instantiation, which Soroban meters per byte.`
        : `Static data (${formatBytes(data)}) is within the recommended ${formatBytes(DATA_SECTION_WARN_BYTES)} budget.`,
  });

  const initial = report.memory.initialBytes;
  checks.push({
    id: 'initial-memory',
    label: 'Initial linear memory',
    bytes: initial,
    limitBytes: MEMORY_LIMIT_BYTES,
    status: initial > MEMORY_LIMIT_BYTES ? 'critical' : initial > MEMORY_LIMIT_BYTES / 2 ? 'warning' : 'ok',
    message:
      initial > MEMORY_LIMIT_BYTES
        ? `The module starts with ${formatBytes(initial)} of memory — more than the ${formatBytes(MEMORY_LIMIT_BYTES)} execution limit. It cannot run.`
        : `Starts with ${formatBytes(initial)} of the ${formatBytes(MEMORY_LIMIT_BYTES)} execution limit.`,
  });

  if (report.memory.maxBytes === undefined) {
    checks.push({
      id: 'max-memory',
      label: 'Maximum linear memory',
      bytes: Infinity,
      limitBytes: MEMORY_LIMIT_BYTES,
      status: 'warning',
      message: `No maximum declared — runaway allocation is only stopped by the ${formatBytes(MEMORY_LIMIT_BYTES)} host limit.`,
    });
  } else {
    const max = report.memory.maxBytes;
    checks.push({
      id: 'max-memory',
      label: 'Maximum linear memory',
      bytes: max,
      limitBytes: MEMORY_LIMIT_BYTES,
      status: max > MEMORY_LIMIT_BYTES ? 'warning' : 'ok',
      message:
        max > MEMORY_LIMIT_BYTES
          ? `Declares a ${formatBytes(max)} maximum, but execution is capped at ${formatBytes(MEMORY_LIMIT_BYTES)}.`
          : `Maximum of ${formatBytes(max)} is within the execution limit.`,
    });
  }

  const stackRegion = report.memory.regions.find((r) => r.kind === 'stack');
  if (stackRegion) {
    const worst = report.worstCaseStackBytes;
    checks.push({
      id: 'worst-case-stack',
      label: 'Worst-case shadow stack',
      bytes: worst,
      limitBytes: stackRegion.bytes,
      status: !Number.isFinite(worst) ? 'warning' : worst > stackRegion.bytes ? 'critical' : worst > stackRegion.bytes * 0.75 ? 'warning' : 'ok',
      message: !Number.isFinite(worst)
        ? 'Recursion makes the worst-case stack depth unbounded; deep inputs can overflow the stack.'
        : `Deepest static call path reserves ${formatBytes(worst)} of a ${formatBytes(stackRegion.bytes)} stack.`,
    });
  }

  return checks;
}

function findHotspots(report: MemoryReport, info: WasmModuleInfo): Hotspot[] {
  const hotspots: Hotspot[] = [];
  for (const check of report.budgets) {
    if (check.status === 'ok') continue;
    if (check.id === 'data-section') {
      hotspots.push({ kind: 'data-section', severity: check.status, title: 'Data section over budget', detail: check.message, bytes: check.bytes });
    } else if (check.id === 'initial-memory' || check.id === 'max-memory') {
      hotspots.push({ kind: 'memory-limit', severity: check.status, title: check.label, detail: check.message, bytes: Number.isFinite(check.bytes) ? check.bytes : undefined });
    } else if (check.id === 'worst-case-stack' && Number.isFinite(check.bytes)) {
      hotspots.push({
        kind: 'stack-depth',
        severity: check.status,
        title: 'Deep call path',
        detail: `${check.message} Path: ${report.worstCaseStackPath.join(' → ')}`,
        bytes: check.bytes,
      });
    }
  }

  const largestSegment = info.dataSegments.reduce((m, s) => Math.max(m, s.size), 0);
  if (largestSegment > DATA_SECTION_WARN_BYTES / 2 && report.dataSection.segments > 1) {
    hotspots.push({
      kind: 'data-section',
      severity: 'info',
      title: 'Large static data segment',
      detail: `One segment holds ${formatBytes(largestSegment)}; large lookup tables or embedded strings are the usual cause.`,
      bytes: largestSegment,
    });
  }

  const defined = report.functions.filter((f) => !f.imported);
  const codeTotal = defined.reduce((s, f) => s + f.codeBytes, 0) || 1;

  for (const f of defined) {
    if (f.shadowStackBytes >= STACK_FRAME_HOTSPOT_BYTES) {
      hotspots.push({
        kind: 'stack-frame',
        severity: f.shadowStackBytes >= STACK_FRAME_HOTSPOT_BYTES * 4 ? 'critical' : 'warning',
        title: `Large stack frame in ${f.name}`,
        detail: `Reserves ${formatBytes(f.shadowStackBytes)} on the shadow stack per call — usually a big array or struct held by value. Box it or pass a reference.`,
        bytes: f.shadowStackBytes,
        functionIndex: f.index,
      });
    }
    if (f.memoryGrowSites > 0) {
      hotspots.push({
        kind: 'memory-grow',
        severity: 'info',
        title: `memory.grow in ${f.name}`,
        detail: `${f.memoryGrowSites} growth site(s). This is where the allocator requests new 64 KB pages.`,
        functionIndex: f.index,
      });
    }
    if (defined.length > 3 && f.codeBytes / codeTotal >= CODE_HOTSPOT_SHARE) {
      hotspots.push({
        kind: 'code-size',
        severity: 'info',
        title: `${f.name} is ${((f.codeBytes / codeTotal) * 100).toFixed(0)}% of code`,
        detail: `${formatBytes(f.codeBytes)} body. Heavy generic instantiation or inlining often lands here.`,
        bytes: f.codeBytes,
        functionIndex: f.index,
      });
    }
  }

  const allocators = defined.filter((f) => /alloc|malloc|__rust_alloc|dlmalloc/i.test(f.name));
  for (const alloc of allocators) {
    const callers = defined.filter((f) => f.calls[alloc.index] !== undefined);
    if (callers.length === 0) continue;
    const sites = callers.reduce((s, c) => s + c.calls[alloc.index], 0);
    hotspots.push({
      kind: 'allocation',
      severity: 'info',
      title: `${sites} allocation site(s) via ${alloc.name}`,
      detail: `Called from ${callers.slice(0, 5).map((c) => c.name).join(', ')}${callers.length > 5 ? '…' : ''}.`,
      functionIndex: alloc.index,
    });
  }

  for (const i of report.recursiveFunctions) {
    hotspots.push({
      kind: 'recursion',
      severity: 'warning',
      title: `Recursion in ${report.functions[i].name}`,
      detail: 'Stack usage grows with input size; very deep inputs can overflow the shadow stack.',
      functionIndex: i,
    });
  }

  const rank = { critical: 0, warning: 1, info: 2 } as const;
  return hotspots.sort((a, b) => rank[a.severity] - rank[b.severity] || (b.bytes ?? 0) - (a.bytes ?? 0));
}

// ---------------------------------------------------------------------------
// Visualization trees
// ---------------------------------------------------------------------------

export type FlameMetric = 'stack' | 'code';

const MAX_FLAME_DEPTH = 24;
const MAX_FLAME_NODES = 4000;

/**
 * Flamegraph tree: one root per export, children are callees. A node's own
 * value is its shadow-stack frame (`stack`) or body size (`code`). Recursive
 * edges are cut and marked; the tree is bounded in depth and node count.
 */
export function buildFlamegraphTree(report: MemoryReport, metric: FlameMetric = 'stack'): ProfileNode {
  const fns = report.functions;
  const hotspotFns = new Set(report.hotspots.filter((h) => h.severity !== 'info').map((h) => h.functionIndex));
  const recursive = new Set(report.recursiveFunctions);
  const weight = (f: FunctionProfile) => (metric === 'stack' ? f.shadowStackBytes : f.codeBytes);
  let budget = MAX_FLAME_NODES;

  const build = (i: number, depth: number, ancestors: Set<number>): ProfileNode => {
    const f = fns[i];
    budget--;
    const node: ProfileNode = {
      name: f.name,
      value: weight(f),
      functionIndex: i,
      hotspot: hotspotFns.has(i),
      detail: `${metric === 'stack' ? `frame ${formatBytes(f.shadowStackBytes)}` : `code ${formatBytes(f.codeBytes)}`}`,
    };
    if (depth >= MAX_FLAME_DEPTH) return node;
    const children: ProfileNode[] = [];
    for (const callee of Object.keys(f.calls).map(Number)) {
      const target = fns[callee];
      if (!target || target.imported || budget <= 0) continue;
      if (ancestors.has(callee)) {
        children.push({ name: `↻ ${target.name}`, value: 0, functionIndex: callee, recursive: true, hotspot: true, detail: 'recursive call (cut)' });
        continue;
      }
      ancestors.add(callee);
      children.push(build(callee, depth + 1, ancestors));
      ancestors.delete(callee);
    }
    if (children.length) node.children = children;
    if (recursive.has(i)) node.recursive = true;
    return node;
  };

  const defined = fns.filter((f) => !f.imported);
  const rootIndices = defined.filter((f) => f.exported).map((f) => f.index);
  const roots = (rootIndices.length ? rootIndices : defined.map((f) => f.index)).map((i) =>
    build(i, 1, new Set([i]))
  );
  return { name: 'contract', value: 0, children: roots };
}

/** Sunburst of the module binary: sections → functions / segments / custom sections. */
export function buildBinarySunburst(bytes: Uint8Array, report: MemoryReport, topFunctions = 12): ProfileNode {
  const info = analyzeWasm(bytes);
  const children: ProfileNode[] = info.sections.map((s) => {
    const name = s.customName ? `custom: ${s.customName}` : s.name;
    if (s.id === 10) {
      const defined = report.functions.filter((f) => !f.imported).sort((a, b) => b.codeBytes - a.codeBytes);
      const top = defined.slice(0, topFunctions);
      const rest = defined.slice(topFunctions).reduce((sum, f) => sum + f.codeBytes, 0);
      const fnChildren: ProfileNode[] = top.map((f) => ({ name: f.name, value: f.codeBytes, functionIndex: f.index }));
      if (rest > 0) fnChildren.push({ name: `${defined.length - top.length} other functions`, value: rest });
      const overhead = Math.max(0, s.size - fnChildren.reduce((sum, c) => sum + c.value, 0));
      return { name, value: overhead, children: fnChildren };
    }
    if (s.id === 11) {
      const segs = info.dataSegments.map((d, i) => ({ name: `segment #${i}`, value: d.size }));
      const overhead = Math.max(0, s.size - segs.reduce((sum, c) => sum + c.value, 0));
      const hot = report.dataSection.bytes > DATA_SECTION_WARN_BYTES;
      return { name, value: overhead, children: segs, hotspot: hot };
    }
    return { name, value: s.size };
  });
  return { name: `module ${formatBytes(bytes.length)}`, value: 0, children };
}

/** Sunburst of initial linear memory: stack / data / heap. */
export function buildMemorySunburst(report: MemoryReport): ProfileNode {
  const groups: Record<MemoryRegion['kind'], ProfileNode> = {
    stack: { name: 'Shadow stack', value: 0, children: [] },
    data: { name: 'Static data', value: 0, children: [], hotspot: report.dataSection.bytes > DATA_SECTION_WARN_BYTES },
    heap: { name: 'Heap', value: 0, children: [] },
    free: { name: 'Unassigned', value: 0, children: [] },
  };
  for (const region of report.memory.regions) {
    groups[region.kind].children!.push({
      name: region.label,
      value: region.bytes,
      detail: `${formatBytes(region.start)} – ${formatBytes(region.end)}`,
    });
  }
  return {
    name: `memory ${formatBytes(report.memory.initialBytes)}`,
    value: 0,
    children: Object.values(groups).filter((g) => g.children!.length > 0),
  };
}

// ---------------------------------------------------------------------------
// Execution trace
// ---------------------------------------------------------------------------

export interface GrowthTraceStep {
  step: number;
  exportName: string;
  label: string;
  bytes: number;
}

export interface ExportTraceResult {
  exportName: string;
  ok: boolean;
  diagnostic?: SimulationDiagnostic;
  hostCalls: number;
  startBytes: number;
  peakBytes: number;
}

export interface GrowthTrace {
  limitBytes: number;
  steps: GrowthTraceStep[];
  exports: ExportTraceResult[];
  /** Host functions are stubbed, so results approximate real execution. */
  approximate: true;
}

export interface TraceOptions {
  maxExports?: number;
  maxHostCallsPerExport?: number;
  maxSteps?: number;
  maxMemoryBytes?: number;
}

function defaultValue(t: ValType): number | bigint | null {
  if (t === 'i64') return BigInt(0);
  if (t === 'funcref' || t === 'externref') return null;
  return 0;
}

class HostBudgetExceeded extends Error {
  constructor() {
    super('Host-call budget exhausted');
    this.name = 'HostBudgetExceeded';
  }
}

/**
 * Execute every exported function (with zero-valued arguments) in a fresh,
 * memory-capped session and record linear-memory size at each host call.
 * Soroban host functions return `Val::VOID` (2) / 0, so contracts that depend
 * on real ledger data may trap early — those traps are reported per export.
 *
 * Runaway loops that never call the host cannot be pre-empted here: run this
 * inside a worker and terminate it on timeout.
 */
export async function traceMemoryGrowth(bytes: Uint8Array, options: TraceOptions = {}): Promise<GrowthTrace> {
  const {
    maxExports = 20,
    maxHostCallsPerExport = 5_000,
    maxSteps = 2_000,
    maxMemoryBytes = MEMORY_LIMIT_BYTES,
  } = options;
  const raw = parseRawModule(bytes);
  const funcImports = raw.imports.filter((i) => i.kind === 0);
  const exports = raw.exports.filter((e) => e.kind === 0).slice(0, maxExports);
  const trace: GrowthTrace = { limitBytes: maxMemoryBytes, steps: [], exports: [], approximate: true };
  let step = 0;

  for (const exp of exports) {
    const session = new SimulationSession({ maxMemoryBytes });
    let hostCalls = 0;
    let lastBytes = -1;
    let peak = 0;
    const record = (label: string, force = false) => {
      const bytesNow = session.getMemoryUsage().residentBytes;
      peak = Math.max(peak, bytesNow);
      if ((force || bytesNow !== lastBytes) && trace.steps.length < maxSteps) {
        trace.steps.push({ step: step++, exportName: exp.name, label, bytes: bytesNow });
      }
      lastBytes = bytesNow;
    };

    const imports: SimulationImports = {};
    for (const imp of raw.imports) {
      if (imp.kind === 0) {
        const results = raw.types[imp.typeIndex ?? 0]?.results ?? [];
        const ret = results.map((t) => (t === 'i64' ? BigInt(2) : defaultValue(t)));
        (imports[imp.module] ??= {})[imp.field] = (() => {
          hostCalls++;
          if (hostCalls > maxHostCallsPerExport) throw new HostBudgetExceeded();
          record(`${imp.module}.${imp.field}`);
          return ret.length === 0 ? undefined : ret.length === 1 ? ret[0] : ret;
        }) as WebAssembly.ImportValue;
      } else if (imp.kind === 3 && imp.global) {
        const value = imp.global.type === 'i64' ? BigInt(0) : 0;
        (imports[imp.module] ??= {})[imp.field] = new WebAssembly.Global(
          { value: imp.global.type as 'i32', mutable: imp.global.mutable },
          value as number
        );
      } else if (imp.kind === 1) {
        (imports[imp.module] ??= {})[imp.field] = new WebAssembly.Table({ element: 'anyfunc', initial: 1 });
      }
    }

    let result: ExportTraceResult;
    try {
      const contract = await session.load(bytes, imports);
      record('instantiate', true);
      const startBytes = lastBytes;
      const fnIndex = exp.index - funcImports.length;
      const typeIndex = fnIndex >= 0 ? raw.functionTypeIndices[fnIndex] : funcImports[exp.index]?.typeIndex;
      const args = (raw.types[typeIndex ?? 0]?.params ?? []).map(defaultValue);
      const outcome = session.invoke(contract, exp.name, args);
      record('return', true);
      const budgetHit =
        !outcome.ok && /Host-call budget/.test(outcome.diagnostic.details ?? '');
      result = {
        exportName: exp.name,
        ok: outcome.ok,
        diagnostic: outcome.ok
          ? undefined
          : budgetHit
            ? { ...outcome.diagnostic, code: 'timeout', message: `Stopped after ${maxHostCallsPerExport} host calls.`, hint: 'The trace is truncated for this entry point.' }
            : outcome.diagnostic,
        hostCalls,
        startBytes,
        peakBytes: Math.max(peak, outcome.memory.peakBytes),
      };
    } catch (err) {
      result = {
        exportName: exp.name,
        ok: false,
        diagnostic: classifySimulationError(err),
        hostCalls,
        startBytes: 0,
        peakBytes: peak,
      };
    } finally {
      session.dispose();
    }
    trace.exports.push(result);
  }
  return trace;
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

export interface ProfilingSnapshot {
  schema: 'web3-student-lab/wasm-memory-profile@1';
  fileName?: string;
  report: MemoryReport;
  trace?: GrowthTrace;
}

/** Serialise a report (and optional trace) as a JSON diagnostic snapshot. */
export function toSnapshotJson(report: MemoryReport, extras: { fileName?: string; trace?: GrowthTrace } = {}): string {
  const snapshot: ProfilingSnapshot = {
    schema: 'web3-student-lab/wasm-memory-profile@1',
    ...(extras.fileName ? { fileName: extras.fileName } : {}),
    report,
    ...(extras.trace ? { trace: extras.trace } : {}),
  };
  return JSON.stringify(
    snapshot,
    (_key, value) => {
      if (typeof value === 'bigint') return value.toString();
      if (value === Infinity) return 'Infinity';
      return value;
    },
    2
  );
}

export { SECTION_NAMES };
