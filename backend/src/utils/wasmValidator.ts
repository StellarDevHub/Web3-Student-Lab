/**
 * WASM Submission Validator — BE-010
 *
 * Static, pre-instantiation checks for untrusted student contract bytecode.
 * Nothing in here ever compiles-and-runs guest code: it only parses the
 * binary (via `wasmModuleInspector`) and asks the engine whether the bytes
 * are a structurally valid module.
 *
 * A module that passes this validator is guaranteed to:
 *  - be at most `MAX_WASM_MODULE_BYTES` long,
 *  - import nothing except (optionally) a linear memory that the sandbox
 *    supplies itself — so guest code has no reachable host functions and
 *    therefore no filesystem, network, process or environment access,
 *  - declare a memory maximum that fits inside the sandbox RAM budget,
 *  - export every function the evaluation harness intends to call.
 */

import {
  inspectWasmModule,
  WasmParseError,
  WASM_PAGE_SIZE_BYTES,
  type WasmInspection,
} from '../simulator/wasmModuleInspector.js';

// tsconfig targets lib ES2022 without DOM, which carries no WebAssembly typings;
// declare just the static surface this module uses (the runtime always has it).
declare const WebAssembly: {
  validate(bytes: Uint8Array): boolean;
  Module: {
    new (bytes: Uint8Array): object;
    exports(module: object): Array<{ name: string; kind: string }>;
  };
};

/** Upper bound on submitted bytecode size; metering a huge module is itself a DoS vector. */
export const MAX_WASM_MODULE_BYTES = 1024 * 1024;

/** Import module/field names reserved for the sandbox's gas hook. Guests must not declare them. */
export const METERING_IMPORT_MODULE = 'metering';

export type WasmValidationCode =
  | 'empty-module'
  | 'module-too-large'
  | 'invalid-encoding'
  | 'invalid-module'
  | 'host-import-forbidden'
  | 'memory-unbounded'
  | 'memory-limit-exceeded'
  | 'unsupported-feature'
  | 'missing-export';

export interface WasmValidationIssue {
  code: WasmValidationCode;
  message: string;
}

export interface WasmValidationSuccess {
  valid: true;
  bytes: Uint8Array;
  inspection: WasmInspection;
  /** True when the module imports its memory and the sandbox must provide a capped one. */
  importsMemory: boolean;
  /** Page ceiling the sandbox will enforce for this module. */
  memoryLimitPages: number;
  exportedFunctions: string[];
}

export interface WasmValidationFailure {
  valid: false;
  issue: WasmValidationIssue;
}

export type WasmValidationResult = WasmValidationSuccess | WasmValidationFailure;

export interface WasmValidationOptions {
  memoryLimitBytes: number;
  /** Exported function names the caller intends to invoke. */
  requiredExports?: string[];
  maxModuleBytes?: number;
}

const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

const MEMORY_SECTION_ID = 5;
/** Exception-handling proposal: would let guest code catch the out-of-gas trap and keep spinning. */
const TAG_SECTION_ID = 13;

function readVarUint(bytes: Uint8Array, offset: number): { value: number; next: number } {
  let value = 0;
  let shift = 0;
  let pos = offset;
  for (;;) {
    if (pos >= bytes.length) throw new Error('unexpected end of stream');
    const byte = bytes[pos++]!;
    value += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) return { value, next: pos };
    shift += 7;
    if (shift > 35) throw new Error('varuint too long');
  }
}

/**
 * Counts locally-defined memories and detects post-MVP sections the inspector
 * deliberately ignores. Assumes the header was already checked by the inspector.
 */
function scanSections(bytes: Uint8Array): { localMemories: number; hasTagSection: boolean } {
  let localMemories = 0;
  let hasTagSection = false;
  let pos = 8;
  while (pos < bytes.length) {
    const id = bytes[pos++]!;
    const size = readVarUint(bytes, pos);
    const end = size.next + size.value;
    if (id === MEMORY_SECTION_ID) localMemories += readVarUint(bytes, size.next).value;
    if (id === TAG_SECTION_ID) hasTagSection = true;
    pos = end;
  }
  return { localMemories, hasTagSection };
}

const fail = (code: WasmValidationCode, message: string): WasmValidationFailure => ({
  valid: false,
  issue: { code, message },
});

/** Strictly decodes base64 — `Buffer.from` silently drops invalid characters, which we don't want. */
export function decodeWasmBase64(wasmBase64: string): Uint8Array | null {
  const normalized = wasmBase64.replace(/\s+/g, '');
  if (normalized.length === 0 || normalized.length % 4 !== 0 || !BASE64_PATTERN.test(normalized)) {
    return null;
  }
  return new Uint8Array(Buffer.from(normalized, 'base64'));
}

export function validateWasmModule(
  input: Uint8Array | string,
  options: WasmValidationOptions
): WasmValidationResult {
  const maxBytes = options.maxModuleBytes ?? MAX_WASM_MODULE_BYTES;

  if (typeof input === 'string' && input.length > Math.ceil((maxBytes * 4) / 3) + 4) {
    return fail('module-too-large', `Module exceeds the ${maxBytes}-byte size limit.`);
  }

  const bytes = typeof input === 'string' ? decodeWasmBase64(input) : input;
  if (bytes === null) {
    return fail('invalid-encoding', 'wasmBase64 is not valid base64.');
  }
  if (bytes.byteLength === 0) {
    return fail('empty-module', 'Module is empty.');
  }
  if (bytes.byteLength > maxBytes) {
    return fail('module-too-large', `Module is ${bytes.byteLength} bytes; the limit is ${maxBytes}.`);
  }

  let inspection: WasmInspection;
  try {
    inspection = inspectWasmModule(bytes);
  } catch (err) {
    const message = err instanceof WasmParseError ? err.message : String(err);
    return fail('invalid-module', message);
  }

  // Validation only — this does not compile or execute anything.
  if (!WebAssembly.validate(bytes)) {
    return fail('invalid-module', 'Module failed WebAssembly structural validation.');
  }

  const sections = scanSections(bytes);
  const importedMemories = inspection.imports.filter((imp) => imp.kind === 'mem').length;
  if (sections.localMemories + importedMemories > 1) {
    return fail('unsupported-feature', 'Modules may declare at most one linear memory.');
  }
  if (sections.hasTagSection) {
    return fail('unsupported-feature', 'The exception-handling proposal (tag section) is not permitted.');
  }

  let importsMemory = false;
  for (const imp of inspection.imports) {
    if (imp.kind === 'mem') {
      importsMemory = true;
      continue;
    }
    const reserved = imp.module === METERING_IMPORT_MODULE ? ' (the metering namespace is reserved)' : '';
    return fail(
      'host-import-forbidden',
      `Module imports '${imp.module}.${imp.name}' (${imp.kind})${reserved}. ` +
        'The sandbox exposes no host functions, tables or globals to guest code.'
    );
  }

  const memoryLimitPages = Math.max(1, Math.floor(options.memoryLimitBytes / WASM_PAGE_SIZE_BYTES));

  if (inspection.memory && !inspection.memory.imported) {
    // A locally-defined memory's ceiling is baked into the binary, so it must
    // already be within budget — we cannot clamp it after the fact.
    if (inspection.memory.maxPages === null) {
      return fail(
        'memory-unbounded',
        'Module defines a memory without a declared maximum; unbounded growth is not permitted.'
      );
    }
    if (inspection.memory.maxPages > memoryLimitPages) {
      return fail(
        'memory-limit-exceeded',
        `Declared memory maximum of ${inspection.memory.maxPages} pages ` +
          `(${inspection.memory.maxPages * WASM_PAGE_SIZE_BYTES} bytes) exceeds the sandbox limit of ` +
          `${memoryLimitPages} pages (${options.memoryLimitBytes} bytes).`
      );
    }
  }

  if (inspection.memory && inspection.memory.minPages > memoryLimitPages) {
    return fail(
      'memory-limit-exceeded',
      `Initial memory of ${inspection.memory.minPages} pages exceeds the sandbox limit of ${memoryLimitPages} pages.`
    );
  }

  const exportedFunctions = WebAssembly.Module.exports(new WebAssembly.Module(bytes))
    .filter((exp) => exp.kind === 'function')
    .map((exp) => exp.name);

  for (const name of options.requiredExports ?? []) {
    if (!exportedFunctions.includes(name)) {
      return fail('missing-export', `Module does not export a function named '${name}'.`);
    }
  }

  return { valid: true, bytes, inspection, importsMemory, memoryLimitPages, exportedFunctions };
}
