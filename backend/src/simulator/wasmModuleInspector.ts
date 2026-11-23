/**
 * WASM Module Inspector — Issue #1420
 *
 * Minimal, dependency-free parser for the WebAssembly binary format (MVP
 * subset) used to statically validate untrusted WASM modules *before* they
 * are ever instantiated.
 *
 * The JS `WebAssembly.Module.imports()` reflection API tells us the kind of
 * each import (func/table/memory/global) but does **not** expose declared
 * resource limits (e.g. a memory import/definition's `minimum`/`maximum`
 * page counts). To enforce a hard memory ceiling *before* instantiation —
 * rather than discovering a runaway allocation only after it happens — we
 * walk the raw binary ourselves and read the Import (id 2) and Memory
 * (id 5) sections directly.
 *
 * This intentionally only supports the WASM MVP encoding (single linear
 * memory, no multi-memory/threads proposals). Any module that fails to
 * parse under these rules is treated as untrusted / rejected — see
 * `wasmSandboxEngine.ts`.
 */

export type WasmImportKind = 'func' | 'table' | 'mem' | 'global';

export interface WasmImportDescriptor {
  module: string;
  name: string;
  kind: WasmImportKind;
}

export interface WasmMemoryLimits {
  /** True when the memory is imported from the host rather than defined locally. */
  imported: boolean;
  minPages: number;
  /** null means the module declared no upper bound — treated as unbounded/unsafe. */
  maxPages: number | null;
}

export interface WasmInspection {
  imports: WasmImportDescriptor[];
  /** null when the module neither imports nor defines a linear memory. */
  memory: WasmMemoryLimits | null;
}

const WASM_MAGIC = [0x00, 0x61, 0x73, 0x6d];
const WASM_VERSION = [0x01, 0x00, 0x00, 0x00];

export class WasmParseError extends Error {
  constructor(message: string) {
    super(`Invalid WASM module: ${message}`);
    this.name = 'WasmParseError';
  }
}

class ByteReader {
  private offset = 0;
  private readonly decoder = new TextDecoder('utf-8');

  constructor(private readonly bytes: Uint8Array) {}

  get position(): number {
    return this.offset;
  }

  get remaining(): number {
    return this.bytes.length - this.offset;
  }

  readByte(): number {
    if (this.offset >= this.bytes.length) {
      throw new WasmParseError('unexpected end of stream');
    }
    return this.bytes[this.offset++]!;
  }

  /** Reads an unsigned LEB128-encoded integer. */
  readVarUint(): number {
    let result = 0;
    let shift = 0;
    for (;;) {
      const byte = this.readByte();
      result |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) break;
      shift += 7;
      if (shift > 35) throw new WasmParseError('varuint too large');
    }
    // Coerce to unsigned 32-bit — page counts and section sizes fit comfortably.
    return result >>> 0;
  }

  readString(): string {
    const len = this.readVarUint();
    if (len > this.remaining) throw new WasmParseError('string length exceeds buffer');
    const slice = this.bytes.subarray(this.offset, this.offset + len);
    this.offset += len;
    return this.decoder.decode(slice);
  }

  skip(n: number): void {
    if (n > this.remaining) throw new WasmParseError('skip exceeds buffer');
    this.offset += n;
  }
}

function readLimits(reader: ByteReader): { min: number; max: number | null } {
  const flags = reader.readByte();
  const min = reader.readVarUint();
  const max = flags & 0x01 ? reader.readVarUint() : null;
  return { min, max };
}

const IMPORT_KIND_NAMES: Record<number, WasmImportKind> = {
  0: 'func',
  1: 'table',
  2: 'mem',
  3: 'global',
};

/**
 * Parses the header, Import section (id 2) and Memory section (id 5) of a
 * WASM binary, ignoring all other sections. Throws `WasmParseError` for
 * malformed input.
 */
export function inspectWasmModule(bytes: Uint8Array): WasmInspection {
  if (bytes.length < 8) throw new WasmParseError('too short to contain a header');
  for (let i = 0; i < 4; i++) {
    if (bytes[i] !== WASM_MAGIC[i]) throw new WasmParseError('bad magic number');
  }
  for (let i = 0; i < 4; i++) {
    if (bytes[i + 4] !== WASM_VERSION[i]) throw new WasmParseError('unsupported WASM version');
  }

  const reader = new ByteReader(bytes);
  reader.skip(8);

  const imports: WasmImportDescriptor[] = [];
  let memory: WasmMemoryLimits | null = null;

  while (reader.remaining > 0) {
    const sectionId = reader.readByte();
    const sectionSize = reader.readVarUint();
    const sectionEnd = reader.position + sectionSize;
    if (sectionEnd > bytes.length) throw new WasmParseError('section size exceeds buffer');

    if (sectionId === 2) {
      // Import section
      const count = reader.readVarUint();
      for (let i = 0; i < count; i++) {
        const moduleName = reader.readString();
        const fieldName = reader.readString();
        const kindByte = reader.readByte();
        const kind = IMPORT_KIND_NAMES[kindByte];
        if (!kind) throw new WasmParseError(`unknown import kind ${kindByte}`);

        if (kind === 'func') {
          reader.readVarUint(); // type index
        } else if (kind === 'table') {
          reader.readByte(); // elem type
          readLimits(reader);
        } else if (kind === 'mem') {
          const limits = readLimits(reader);
          memory = { imported: true, minPages: limits.min, maxPages: limits.max };
        } else if (kind === 'global') {
          reader.readByte(); // value type
          reader.readByte(); // mutability
        }

        imports.push({ module: moduleName, name: fieldName, kind });
      }
    } else if (sectionId === 5) {
      // Memory section (locally-defined memories)
      const count = reader.readVarUint();
      for (let i = 0; i < count; i++) {
        const limits = readLimits(reader);
        // MVP allows at most one memory; keep the first one we see.
        if (!memory) {
          memory = { imported: false, minPages: limits.min, maxPages: limits.max };
        }
      }
    }

    // Always resync to the section boundary — sections we don't specially
    // parse (code, data, custom, etc.) are simply skipped.
    if (reader.position !== sectionEnd) {
      reader.skip(sectionEnd - reader.position);
    }
  }

  return { imports, memory };
}

/** 64 KiB per WASM page, per spec. */
export const WASM_PAGE_SIZE_BYTES = 65_536;

export function pagesForBytes(bytes: number): number {
  return Math.ceil(bytes / WASM_PAGE_SIZE_BYTES);
}
