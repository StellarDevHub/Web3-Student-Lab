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

export interface WasmModuleInfo {
  valid: boolean;
  version: number;
  totalBytes: number;
  sections: WasmSection[];
  imports: WasmImport[];
  exports: WasmExport[];
  /** Imports from the Soroban host environment. */
  hostFunctions: WasmImport[];
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

function parseImports(payload: Uint8Array): WasmImport[] {
  const reader = new Reader(payload);
  const count = reader.varuint();
  const imports: WasmImport[] = [];

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
      const limits = reader.u8();
      reader.varuint();
      if (limits === 1) reader.varuint();
    } else if (kind === 3) {
      reader.u8(); // value type
      reader.u8(); // mutability
    }
  }

  return imports;
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
        info.imports = parseImports(payload);
      } else if (id === 7) {
        info.exports = parseExports(payload);
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
