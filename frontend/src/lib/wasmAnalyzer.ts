/**
 * Soroban WASM inspection (Issue #1160).
 *
 * A `.wasm` binary is a magic number, a version, then a flat sequence of
 * length-prefixed sections. That structure is simple enough to walk directly,
 * which is what this module does — no toolchain, no CLI, and no wabt needed to
 * answer the questions students actually have: what is in this contract, what
 * host functions does it call, and why is it this big.
 *
 * Disassembly to WAT is a separate job and a much heavier one; that runs through
 * wabt in a worker. Everything here is pure and synchronous so the structural
 * analysis is testable and cannot block the page.
 *
 * @see https://webassembly.github.io/spec/core/binary/modules.html
 */

/** Every `.wasm` file starts with "\0asm". */
export const WASM_MAGIC = [0x00, 0x61, 0x73, 0x6d];
/** The only module version in use. */
export const WASM_VERSION = 1;

/** Section ids, in the order the spec assigns them. */
export const SECTION_NAMES: Record<number, string> = {
  0: 'Custom',
  1: 'Type',
  2: 'Import',
  3: 'Function',
  4: 'Table',
  5: 'Memory',
  6: 'Global',
  7: 'Export',
  8: 'Start',
  9: 'Element',
  10: 'Code',
  11: 'Data',
  12: 'DataCount',
};

export interface WasmSection {
  id: number;
  name: string;
  /** Byte offset of the section's payload. */
  offset: number;
  /** Payload length in bytes, excluding the id and length prefix. */
  size: number;
  /** Custom sections carry their own name, e.g. "name" or "contractmetav0". */
  customName?: string;
}

export interface WasmImport {
  module: string;
  field: string;
  /** 0 func, 1 table, 2 memory, 3 global. */
  kind: number;
  kindName: string;
}

export interface WasmExport {
  name: string;
  kind: number;
  kindName: string;
}

/** A `limits` pair from a memory (or table) type: initial and optional maximum page count. */
export interface WasmMemoryLimits {
  min: number;
  max?: number;
}

/** One entry of the Data section — the static bytes the module ships pre-loaded into memory. */
export interface WasmDataSegment {
  /** False for a passive segment (loaded on demand via `memory.init`, no fixed address). */
  active: boolean;
  memoryIndex?: number;
  /** Constant byte offset into linear memory, when it could be statically resolved. */
  offset?: number;
  size: number;
}

export interface WasmModuleInfo {
  valid: boolean;
  version: number;
  totalBytes: number;
  sections: WasmSection[];
  imports: WasmImport[];
  exports: WasmExport[];
  /** Imports from the Soroban host environment. */
  hostFunctions: WasmImport[];
  /** Memories declared locally (Memory section) or imported. */
  memories: WasmMemoryLimits[];
  dataSegments: WasmDataSegment[];
  error?: string;
}

const IMPORT_KIND_NAMES: Record<number, string> = {
  0: 'func',
  1: 'table',
  2: 'memory',
  3: 'global',
};

/** The module name Soroban host functions are imported under. */
export const SOROBAN_HOST_MODULE = 'env';

/**
 * Reader for LEB128, the variable-length integer encoding WebAssembly uses for
 * every length and index in the binary.
 */
class Reader {
  constructor(
    private readonly bytes: Uint8Array,
    public offset = 0,
  ) {}

  get done(): boolean {
    return this.offset >= this.bytes.length;
  }

  get remaining(): number {
    return this.bytes.length - this.offset;
  }

  u8(): number {
    if (this.done) throw new Error('Unexpected end of module');
    return this.bytes[this.offset++];
  }

  /** Unsigned LEB128. */
  varuint(): number {
    let result = 0;
    let shift = 0;

    for (;;) {
      const byte = this.u8();
      result |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return result >>> 0;
      shift += 7;
      // Anything longer than five groups cannot be a valid u32 and means the
      // bytes are not really a module.
      if (shift > 35) throw new Error('Malformed LEB128 integer');
    }
  }

  /** Signed LEB128 (up to 32 bits), used by i32.const and offset expressions. */
  sleb32(): number {
    let result = 0;
    let shift = 0;
    let byte: number;

    do {
      byte = this.u8();
      result |= (byte & 0x7f) << shift;
      shift += 7;
      if (shift > 35) throw new Error('Malformed signed LEB128 integer');
    } while ((byte & 0x80) !== 0);

    // Sign-extend if the sign bit of the last group is set and we haven't
    // filled all 32 bits yet.
    if (shift < 32 && (byte & 0x40) !== 0) {
      result |= -1 << shift;
    }
    return result;
  }

  /** Signed LEB128 as a bigint, for i64.const and 64-bit offsets. */
  sleb64(): bigint {
    let result = 0n;
    let shift = 0n;
    let byte: number;

    do {
      byte = this.u8();
      result |= BigInt(byte & 0x7f) << shift;
      shift += 7n;
      if (shift > 70n) throw new Error('Malformed 64-bit signed LEB128 integer');
    } while ((byte & 0x80) !== 0);

    if (shift < 64n && (byte & 0x40) !== 0) {
      result |= -1n << shift;
    }
    return BigInt.asIntN(64, result);
  }

  /** A length-prefixed UTF-8 name. */
  name(): string {
    const length = this.varuint();
    if (length > this.remaining) throw new Error('Name runs past end of module');
    const slice = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return new TextDecoder().decode(slice);
  }

  skip(count: number): void {
    if (count > this.remaining) throw new Error('Section runs past end of module');
    this.offset += count;
  }
}

/** Does this buffer start with the WebAssembly magic number? */
export function hasWasmMagic(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  return WASM_MAGIC.every((byte, i) => bytes[i] === byte);
}

function parseImports(payload: Uint8Array): { imports: WasmImport[]; memories: WasmMemoryLimits[] } {
  const reader = new Reader(payload);
  const count = reader.varuint();
  const imports: WasmImport[] = [];
  const memories: WasmMemoryLimits[] = [];

  for (let i = 0; i < count; i++) {
    const module = reader.name();
    const field = reader.name();
    const kind = reader.u8();

    imports.push({ module, field, kind, kindName: IMPORT_KIND_NAMES[kind] ?? `kind${kind}` });

    // Skip the type description; its shape depends on the kind.
    if (kind === 0) reader.varuint(); // type index
    else if (kind === 1) {
      reader.u8(); // element type
      const limits = reader.u8();
      reader.varuint();
      if (limits === 1) reader.varuint();
    } else if (kind === 2) {
      const limitsFlag = reader.u8();
      const min = reader.varuint();
      const max = limitsFlag === 1 ? reader.varuint() : undefined;
      memories.push({ min, max });
    } else if (kind === 3) {
      reader.u8(); // value type
      reader.u8(); // mutability
    }
  }

  return { imports, memories };
}

/** Memory section (id 5): `vec(limits)` — every memory the module declares itself. */
function parseMemorySection(payload: Uint8Array): WasmMemoryLimits[] {
  const reader = new Reader(payload);
  const count = reader.varuint();
  const memories: WasmMemoryLimits[] = [];

  for (let i = 0; i < count; i++) {
    const limitsFlag = reader.u8();
    const min = reader.varuint();
    const max = limitsFlag === 1 ? reader.varuint() : undefined;
    memories.push({ min, max });
  }

  return memories;
}

/**
 * A constant expression, as used for a data (or element) segment's offset:
 * one instruction producing a value, terminated by `end` (0x0B). Real modules
 * emit `i32.const <n> end`; `global.get <idx> end` is legal too (e.g. an
 * imported base-address global) but not statically resolvable here, so it
 * reports no fixed offset rather than guessing.
 */
function parseConstOffsetExpr(reader: Reader): number | undefined {
  const opcode = reader.u8();
  let value: number | undefined;

  if (opcode === 0x41) {
    value = reader.sleb32(); // i32.const
  } else if (opcode === 0x23) {
    reader.varuint(); // global.get <idx> — not statically known
    value = undefined;
  } else {
    value = undefined;
  }

  // Drain any further bytes up to `end` defensively (extended-const proposal
  // allows i32.add/i32.mul chains); we only need the terminator's position.
  let guard = 0;
  while (reader.u8() !== 0x0b) {
    guard++;
    if (guard > 64) throw new Error('Runaway offset expression in data segment');
  }

  return value;
}

/** Data section (id 11): the segments the module pre-loads into linear memory. */
function parseDataSection(payload: Uint8Array): WasmDataSegment[] {
  const reader = new Reader(payload);
  const count = reader.varuint();
  const segments: WasmDataSegment[] = [];

  for (let i = 0; i < count; i++) {
    const flags = reader.varuint();

    if (flags === 1) {
      // Passive: no address until `memory.init` runs.
      const size = reader.varuint();
      reader.skip(size);
      segments.push({ active: false, size });
      continue;
    }

    const memoryIndex = flags === 2 ? reader.varuint() : 0;
    const offset = parseConstOffsetExpr(reader);
    const size = reader.varuint();
    reader.skip(size);
    segments.push({ active: true, memoryIndex, offset, size });
  }

  return segments;
}

function parseExports(payload: Uint8Array): WasmExport[] {
  const reader = new Reader(payload);
  const count = reader.varuint();
  const exports: WasmExport[] = [];

  for (let i = 0; i < count; i++) {
    const name = reader.name();
    const kind = reader.u8();
    reader.varuint(); // index
    exports.push({ name, kind, kindName: IMPORT_KIND_NAMES[kind] ?? `kind${kind}` });
  }

  return exports;
}

/**
 * Walk a `.wasm` binary and describe it.
 *
 * Never throws: a truncated or non-WASM buffer comes back with `valid: false`
 * and a message, because a student who drags in the wrong file deserves an
 * explanation rather than a stack trace.
 */
export function analyzeWasm(bytes: Uint8Array): WasmModuleInfo {
  const info: WasmModuleInfo = {
    valid: false,
    version: 0,
    totalBytes: bytes.length,
    sections: [],
    imports: [],
    exports: [],
    hostFunctions: [],
    memories: [],
    dataSegments: [],
  };

  if (!hasWasmMagic(bytes)) {
    return { ...info, error: 'Not a WebAssembly module — missing the \\0asm magic number.' };
  }

  if (bytes.length < 8) {
    return { ...info, error: 'Module is truncated before the version header.' };
  }

  const version = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true);
  info.version = version;

  if (version !== WASM_VERSION) {
    return { ...info, error: `Unsupported WebAssembly version ${version}.` };
  }

  const reader = new Reader(bytes, 8);

  try {
    while (!reader.done) {
      const id = reader.u8();
      const size = reader.varuint();
      const offset = reader.offset;

      if (size > reader.remaining) {
        info.error = `Section ${SECTION_NAMES[id] ?? id} claims ${size} bytes but only ${reader.remaining} remain.`;
        break;
      }

      const payload = bytes.subarray(offset, offset + size);
      const section: WasmSection = { id, name: SECTION_NAMES[id] ?? `Unknown(${id})`, offset, size };

      if (id === 0) {
        // A custom section's payload starts with its own name.
        try {
          section.customName = new Reader(payload).name();
        } catch {
          section.customName = '(unreadable)';
        }
      } else if (id === 2) {
        const { imports, memories } = parseImports(payload);
        info.imports = imports;
        info.memories.push(...memories);
      } else if (id === 5) {
        info.memories.push(...parseMemorySection(payload));
      } else if (id === 7) {
        info.exports = parseExports(payload);
      } else if (id === 11) {
        info.dataSegments = parseDataSection(payload);
      }

      info.sections.push(section);
      reader.skip(size);
    }

    info.valid = !info.error;
  } catch (err) {
    info.error = err instanceof Error ? err.message : 'Failed to parse module';
  }

  info.hostFunctions = info.imports.filter((i) => i.module === SOROBAN_HOST_MODULE);

  return info;
}

/** Group the Soroban host imports by the subsystem their name prefix implies. */
export function groupHostFunctions(imports: WasmImport[]): Record<string, WasmImport[]> {
  const groups: Record<string, WasmImport[]> = {};

  for (const imported of imports) {
    // Soroban host functions are exported under short mangled names; the
    // leading segment identifies the module (l = ledger, m = map, v = vec…).
    const key = imported.field.includes('_') ? imported.field.split('_')[0] : imported.field[0] ?? '?';
    (groups[key] ??= []).push(imported);
  }

  return groups;
}

export interface SectionBreakdown {
  name: string;
  bytes: number;
  /** Share of the module, 0–1. */
  share: number;
}

/** Section sizes, largest first — where the bytes actually went. */
export function sectionBreakdown(info: WasmModuleInfo): SectionBreakdown[] {
  const total = info.sections.reduce((sum, s) => sum + s.size, 0) || 1;

  return info.sections
    .map((s) => ({
      name: s.customName ? `${s.name}: ${s.customName}` : s.name,
      bytes: s.size,
      share: s.size / total,
    }))
    .sort((a, b) => b.bytes - a.bytes);
}

export interface OptimizationHint {
  severity: 'info' | 'warning';
  title: string;
  detail: string;
  /** Rough bytes recoverable, when it can be estimated. */
  estimatedSaving?: number;
}

/** Soroban charges for contract size at upload, so bytes are money. */
export const SOROBAN_SIZE_WARN_BYTES = 64 * 1024;

/**
 * Suggest ways to shrink the binary.
 *
 * Every hint is derived from something actually present in the module — a debug
 * section that survived a release build, a name table, an unusually large code
 * section — rather than generic advice, so the estimate can be traced back to
 * bytes on disk.
 */
export function optimizationHints(info: WasmModuleInfo): OptimizationHint[] {
  const hints: OptimizationHint[] = [];
  const bySection = new Map(info.sections.map((s) => [s.customName ?? s.name, s]));

  const nameSection = info.sections.find((s) => s.id === 0 && s.customName === 'name');
  if (nameSection) {
    hints.push({
      severity: 'warning',
      title: 'Debug name section present',
      detail:
        'The "name" custom section maps indices back to source identifiers. It is useful locally and dead weight on-chain — `wasm-strip` or a release profile with `strip = true` removes it.',
      estimatedSaving: nameSection.size,
    });
  }

  const debugSections = info.sections.filter(
    (s) => s.id === 0 && s.customName?.startsWith('.debug'),
  );
  if (debugSections.length > 0) {
    const bytes = debugSections.reduce((sum, s) => sum + s.size, 0);
    hints.push({
      severity: 'warning',
      title: `${debugSections.length} DWARF debug section(s)`,
      detail:
        'Debug info shipped in the deployed binary. Set `debug = false` in the release profile.',
      estimatedSaving: bytes,
    });
  }

  const code = bySection.get('Code');
  if (code && code.size / (info.totalBytes || 1) > 0.7) {
    hints.push({
      severity: 'info',
      title: 'Code dominates the binary',
      detail:
        'Most of the module is executable code, so size work means less code: prefer `opt-level = "z"`, enable LTO, and check for generic functions instantiated many times over.',
    });
  }

  if (info.totalBytes > SOROBAN_SIZE_WARN_BYTES) {
    hints.push({
      severity: 'warning',
      title: 'Large contract',
      detail: `At ${(info.totalBytes / 1024).toFixed(1)} KB this costs meaningfully more to upload, and upload is charged per byte. Consider splitting rarely-used logic into a second contract.`,
    });
  }

  if (info.hostFunctions.length === 0 && info.valid) {
    hints.push({
      severity: 'info',
      title: 'No Soroban host imports',
      detail:
        'This module imports nothing from `env`, so it never touches ledger state. That is expected for a pure library, and surprising for a contract.',
    });
  }

  return hints;
}

// ─── Memory profiler & allocator leak detector (Issue #1404) ──────────────
//
// There is no VM here — nothing executes, so this cannot watch a live heap.
// What it can do, honestly: read the module's declared memories and its Data
// section (the bytes the module ships pre-loaded into linear memory), lay
// them out page by page, and flag the two classes of bug that are visible
// *before* a single instruction runs: a data segment that writes past the
// memory the module itself declared (an out-of-bounds pointer risk baked
// into the binary), and a memory with no `max`, which is the shape every
// "leaks forever" allocator bug takes once it reaches the host's own ceiling
// instead of Wasm's. Simulated growth (below) models the runtime spike a
// bump/arena allocator produces when it grows without ever freeing.

/** Every WebAssembly page is exactly 64 KiB, fixed by the spec. */
export const WASM_PAGE_BYTES = 64 * 1024;

export interface MemoryPageUsage {
  index: number;
  /** Bytes of static data landing in this page, from resolvable data segments. */
  usedBytes: number;
  segments: { start: number; end: number }[];
}

export interface MemoryRisk {
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
}

export interface MemoryProfile {
  memoryIndex: number;
  minPages: number;
  maxPages?: number;
  minBytes: number;
  maxBytes?: number;
  pages: MemoryPageUsage[];
  /** Bytes claimed by data segments that could be statically resolved. */
  staticBytesUsed: number;
  /** Data segments whose offset could not be resolved statically (e.g. `global.get`). */
  unresolvedSegments: number;
  /** Segments loaded on demand via `memory.init`, with no fixed address. */
  passiveSegments: number;
  risks: MemoryRisk[];
}

/**
 * Lay out every declared memory page by page against the module's Data
 * section, and flag what is visible statically: out-of-bounds writes,
 * overlapping segments, and unbounded growth.
 */
export function profileMemory(info: WasmModuleInfo): MemoryProfile[] {
  return info.memories.map((mem, memoryIndex) => {
    const minBytes = mem.min * WASM_PAGE_BYTES;
    const maxBytes = mem.max !== undefined ? mem.max * WASM_PAGE_BYTES : undefined;
    const pages: MemoryPageUsage[] = Array.from({ length: mem.min }, (_, index) => ({
      index,
      usedBytes: 0,
      segments: [],
    }));
    const risks: MemoryRisk[] = [];

    const ownSegments = info.dataSegments.filter((s) => (s.memoryIndex ?? 0) === memoryIndex);
    const passiveSegments = ownSegments.filter((s) => !s.active).length;
    const unresolvedSegments = ownSegments.filter((s) => s.active && s.offset === undefined).length;

    const resolved = ownSegments
      .filter((s): s is WasmDataSegment & { offset: number } => s.active && s.offset !== undefined)
      .map((s) => ({ start: s.offset, end: s.offset + s.size }))
      .sort((a, b) => a.start - b.start);

    let staticBytesUsed = 0;
    let prevEnd = 0;
    let overlapFlagged = false;
    let oobFlagged = false;

    for (const seg of resolved) {
      if (seg.start < prevEnd && !overlapFlagged) {
        risks.push({
          severity: 'critical',
          title: 'Overlapping data segments',
          detail: `A data segment starting at byte ${seg.start} overlaps another ending at byte ${prevEnd}. The module would corrupt its own static data the moment it is instantiated.`,
        });
        overlapFlagged = true;
      }

      if (seg.end > minBytes && !oobFlagged) {
        risks.push({
          severity: 'critical',
          title: 'Data segment writes past declared memory',
          detail: `A data segment ends at byte ${seg.end}, past the ${formatBytes(minBytes)} (${mem.min}-page) initial memory this module declares. Instantiation traps unless something grows memory first — an out-of-bounds pointer baked directly into the binary.`,
        });
        oobFlagged = true;
      }

      staticBytesUsed += seg.end - seg.start;
      prevEnd = Math.max(prevEnd, seg.end);

      const firstPage = Math.floor(seg.start / WASM_PAGE_BYTES);
      const lastPage = Math.floor(Math.max(seg.start, seg.end - 1) / WASM_PAGE_BYTES);
      for (let p = firstPage; p <= lastPage && p >= 0 && p < pages.length; p++) {
        const pageStart = p * WASM_PAGE_BYTES;
        const pageEnd = pageStart + WASM_PAGE_BYTES;
        const overlapStart = Math.max(seg.start, pageStart);
        const overlapEnd = Math.min(seg.end, pageEnd);
        pages[p].usedBytes += Math.max(0, overlapEnd - overlapStart);
        pages[p].segments.push({ start: seg.start, end: seg.end });
      }
    }

    if (maxBytes === undefined) {
      risks.push({
        severity: 'warning',
        title: 'Unbounded memory growth',
        detail: 'This memory declares no maximum, so `memory.grow` can succeed until the host enforces its own ceiling. Paired with a bump/arena allocator that never frees, this is exactly the shape an allocator leak takes — set an explicit `max` so runaway growth fails fast instead of quietly consuming ledger resources.',
      });
    }

    const staticRatio = minBytes > 0 ? staticBytesUsed / minBytes : 0;
    if (staticRatio > 0.9) {
      risks.push({
        severity: 'warning',
        title: 'Static data nearly fills initial memory',
        detail: `Data segments occupy ${(staticRatio * 100).toFixed(1)}% of the ${mem.min}-page initial memory, leaving almost no room for a stack or heap before the first allocation forces a page grow.`,
      });
    }

    return {
      memoryIndex,
      minPages: mem.min,
      maxPages: mem.max,
      minBytes,
      maxBytes,
      pages,
      staticBytesUsed,
      unresolvedSegments,
      passiveSegments,
      risks,
    };
  });
}

export interface GrowthSimulationStep {
  step: number;
  pages: number;
  bytes: number;
  /** True once simulated growth would exceed the declared `max` (or, absent a `max`, a very large heuristic ceiling). */
  overMax: boolean;
}

/**
 * Simulate a bump/arena allocator that only ever grows memory and never
 * frees — the standard shape of a WASM allocator leak — and report when that
 * pattern would exceed the module's declared `max` (or, for an unbounded
 * memory, a generous 4 GiB heuristic ceiling representing wasm32's real
 * address-space limit). Purely arithmetic: no bytes are actually allocated.
 */
export function simulateAllocatorGrowth(
  profile: MemoryProfile,
  options: { growthPagesPerStep: number; steps: number },
): GrowthSimulationStep[] {
  const ceilingPages = profile.maxPages ?? 65536; // wasm32 address space, in pages
  const steps: GrowthSimulationStep[] = [];
  let pages = profile.minPages;

  for (let i = 1; i <= options.steps; i++) {
    pages += Math.max(0, options.growthPagesPerStep);
    const overMax = pages > ceilingPages;
    steps.push({ step: i, pages, bytes: pages * WASM_PAGE_BYTES, overMax });
    if (overMax) break; // the host traps the grow call here; nothing further can happen
  }

  return steps;
}

/** Human-readable byte size. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** Build the smallest valid module — the header alone. Used by tests and demos. */
export function emptyModuleBytes(): Uint8Array {
  return new Uint8Array([...WASM_MAGIC, 0x01, 0x00, 0x00, 0x00]);
}
