/**
 * Soroban WASM Simulation Engine — memory-governed execution sessions.
 *
 * Every guest WebAssembly module runs inside a `SimulationSession` that:
 *
 *  - Enforces a hard resident-memory budget (50 MB by default) by rewriting
 *    the module's declared memory limits *before* compilation, so
 *    `memory.grow` fails inside the guest instead of exhausting the tab.
 *    Imported memories are supplied as bounded `WebAssembly.Memory` objects.
 *  - Tracks every Module / Instance / Memory it creates and releases them all
 *    on `dispose()`, so linear-memory buffers become unreachable and can be
 *    garbage collected between runs.
 *  - Converts traps, link errors and out-of-memory conditions into
 *    student-friendly `SimulationDiagnostic`s.
 *
 * Runaway (infinite-loop) guests cannot be interrupted on the thread they run
 * on; sessions are therefore meant to run inside a dedicated worker that the
 * page terminates on timeout (see `usePlaygroundExecution`).
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** WebAssembly page size (64 KiB). */
export const WASM_PAGE_BYTES = 64 * 1024;

/** Maximum resident linear memory per execution session. */
export const MAX_SESSION_MEMORY_BYTES = 50 * 1024 * 1024;

/** Memory section id in the WebAssembly binary format. */
const SECTION_IMPORT = 2;
const SECTION_MEMORY = 5;
const IMPORT_KIND_MEMORY = 2;

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

export type SimulationDiagnosticCode =
  | 'out-of-memory'
  | 'memory-limit-exceeded'
  | 'trap'
  | 'stack-overflow'
  | 'compile-error'
  | 'link-error'
  | 'export-not-found'
  | 'unsupported-module'
  | 'session-disposed'
  | 'timeout'
  | 'worker-crashed'
  | 'unknown';

export interface SimulationDiagnostic {
  code: SimulationDiagnosticCode;
  /** One-sentence, student-friendly explanation. */
  message: string;
  /** What to try next. */
  hint: string;
  /** Raw engine message, kept for advanced users / bug reports. */
  details?: string;
}

const DIAGNOSTIC_COPY: Record<SimulationDiagnosticCode, { message: string; hint: string }> = {
  'out-of-memory': {
    message: 'The contract ran out of memory during simulation.',
    hint: 'Look for unbounded loops that push to a Vec/Map, or very large allocations. Each simulation is limited to 50 MB.',
  },
  'memory-limit-exceeded': {
    message: 'The contract asks for more memory than the 50 MB simulation limit allows.',
    hint: 'Reduce the initial memory size of the module (for example, smaller static buffers).',
  },
  trap: {
    message: 'The contract stopped with a runtime error (WebAssembly trap).',
    hint: 'This usually means a panic, failed assertion, integer overflow or out-of-bounds access in your contract.',
  },
  'stack-overflow': {
    message: 'The contract overflowed the call stack.',
    hint: 'Check for unbounded recursion and convert deep recursion into a loop.',
  },
  'compile-error': {
    message: 'The WebAssembly module is invalid and could not be compiled.',
    hint: 'Rebuild the contract for the wasm32-unknown-unknown target and try again.',
  },
  'link-error': {
    message: 'The contract imports host functions the simulator does not provide.',
    hint: 'Only the documented Soroban host functions are available in the browser simulator.',
  },
  'export-not-found': {
    message: 'The requested contract function is not exported by the module.',
    hint: 'Make sure the function is `pub` inside a `#[contractimpl]` block.',
  },
  'unsupported-module': {
    message: 'This module uses WebAssembly features the simulator does not support.',
    hint: 'Disable memory64 / multi-memory features and rebuild the contract.',
  },
  'session-disposed': {
    message: 'This simulation session has already been cleaned up.',
    hint: 'Start a new run.',
  },
  timeout: {
    message: 'The simulation took too long and was stopped to keep your browser responsive.',
    hint: 'Check for infinite loops or very expensive computations in the contract.',
  },
  'worker-crashed': {
    message: 'The simulation engine crashed, most likely because the browser ran low on memory.',
    hint: 'The engine has been restarted. Reduce memory usage in your contract and run it again.',
  },
  unknown: {
    message: 'The simulation failed unexpectedly.',
    hint: 'Try running it again. If the problem persists, report it with the details below.',
  },
};

export class SimulationError extends Error {
  readonly diagnostic: SimulationDiagnostic;

  constructor(code: SimulationDiagnosticCode, details?: string, cause?: unknown) {
    const copy = DIAGNOSTIC_COPY[code];
    super(copy.message, cause === undefined ? undefined : { cause });
    this.name = 'SimulationError';
    this.diagnostic = { code, ...copy, ...(details ? { details } : {}) };
  }
}

export function makeDiagnostic(
  code: SimulationDiagnosticCode,
  details?: string
): SimulationDiagnostic {
  return { code, ...DIAGNOSTIC_COPY[code], ...(details ? { details } : {}) };
}

/** Format a diagnostic as terminal lines. */
export function formatDiagnostic(diagnostic: SimulationDiagnostic): string[] {
  const lines = [`${diagnostic.message} ${diagnostic.hint}`];
  if (diagnostic.details) lines.push(`Details: ${diagnostic.details}`);
  return lines;
}

/**
 * Classify an error thrown while compiling, instantiating or running a guest.
 *
 * @param memoryNearLimit - whether the guest's memory was at (or within one
 *   growth step of) its cap when the error happened. Rust's allocator aborts
 *   with an `unreachable` trap when `memory.grow` fails, so a trap at the cap
 *   is reported as out-of-memory rather than a generic trap.
 */
export function classifySimulationError(
  error: unknown,
  { memoryNearLimit = false }: { memoryNearLimit?: boolean } = {}
): SimulationDiagnostic {
  if (error instanceof SimulationError) return error.diagnostic;

  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : '';

  if (
    (name === 'RangeError' && /memory|allocat|array buffer/i.test(message)) ||
    /out of memory/i.test(message)
  ) {
    return makeDiagnostic('out-of-memory', message);
  }

  if (/call stack|stack overflow|too much recursion/i.test(message)) {
    return makeDiagnostic('stack-overflow', message);
  }

  if (typeof WebAssembly !== 'undefined') {
    if (error instanceof WebAssembly.CompileError) return makeDiagnostic('compile-error', message);
    if (error instanceof WebAssembly.LinkError) return makeDiagnostic('link-error', message);
    // A missing import *module* surfaces as a TypeError during instantiation.
    if (name === 'TypeError' && /import/i.test(message)) return makeDiagnostic('link-error', message);
    if (error instanceof WebAssembly.RuntimeError) {
      return makeDiagnostic(memoryNearLimit ? 'out-of-memory' : 'trap', message);
    }
  }

  return makeDiagnostic('unknown', message);
}

// ---------------------------------------------------------------------------
// Binary helpers (LEB128 + memory limit rewriting)
// ---------------------------------------------------------------------------

function readU32(bytes: Uint8Array, offset: number): { value: number; next: number } {
  let result = 0;
  let shift = 0;
  let pos = offset;
  for (;;) {
    if (pos >= bytes.length) throw new SimulationError('compile-error', 'Truncated LEB128 value');
    const byte = bytes[pos++];
    result += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) break;
    shift += 7;
    if (shift > 35) throw new SimulationError('compile-error', 'LEB128 value too long');
  }
  return { value: result, next: pos };
}

function writeU32(value: number): number[] {
  const out: number[] = [];
  let v = value >>> 0;
  do {
    let byte = v & 0x7f;
    v >>>= 7;
    if (v !== 0) byte |= 0x80;
    out.push(byte);
  } while (v !== 0);
  return out;
}

export interface MemoryLimits {
  minPages: number;
  maxPages?: number;
  shared: boolean;
}

interface ParsedLimits extends MemoryLimits {
  next: number;
}

function readLimits(bytes: Uint8Array, offset: number): ParsedLimits {
  const flags = bytes[offset];
  if (flags === undefined) throw new SimulationError('compile-error', 'Truncated memory limits');
  if (flags > 3) {
    // 0x04+ are memory64 / custom page size proposals.
    throw new SimulationError('unsupported-module', `Unsupported memory limits flag 0x${flags.toString(16)}`);
  }
  const min = readU32(bytes, offset + 1);
  let next = min.next;
  let maxPages: number | undefined;
  if (flags & 0x01) {
    const max = readU32(bytes, next);
    maxPages = max.value;
    next = max.next;
  }
  return { minPages: min.value, maxPages, shared: (flags & 0x02) !== 0, next };
}

function encodeLimits(limits: MemoryLimits): number[] {
  const hasMax = limits.maxPages !== undefined;
  const flags = (hasMax ? 0x01 : 0) | (limits.shared ? 0x02 : 0);
  return [
    flags,
    ...writeU32(limits.minPages),
    ...(hasMax ? writeU32(limits.maxPages as number) : []),
  ];
}

function skipName(bytes: Uint8Array, offset: number): number {
  const len = readU32(bytes, offset);
  return len.next + len.value;
}

export interface ModuleMemoryInfo {
  /** Memories defined inside the module. */
  defined: MemoryLimits[];
  /** Memories imported from the host, keyed by `module.name`. */
  imported: Array<MemoryLimits & { module: string; name: string }>;
}

function decodeName(bytes: Uint8Array, offset: number): { value: string; next: number } {
  const len = readU32(bytes, offset);
  const value = new TextDecoder().decode(bytes.subarray(len.next, len.next + len.value));
  return { value, next: len.next + len.value };
}

function assertWasmHeader(bytes: Uint8Array) {
  if (
    bytes.length < 8 ||
    bytes[0] !== 0x00 ||
    bytes[1] !== 0x61 ||
    bytes[2] !== 0x73 ||
    bytes[3] !== 0x6d
  ) {
    throw new SimulationError('compile-error', 'Missing \\0asm magic header');
  }
}

/** Read the memory limits a module declares and imports. */
export function inspectModuleMemory(input: ArrayBuffer | Uint8Array): ModuleMemoryInfo {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  assertWasmHeader(bytes);
  const info: ModuleMemoryInfo = { defined: [], imported: [] };

  let pos = 8;
  while (pos < bytes.length) {
    const id = bytes[pos];
    const size = readU32(bytes, pos + 1);
    const start = size.next;
    const end = start + size.value;

    if (id === SECTION_MEMORY) {
      const count = readU32(bytes, start);
      let p = count.next;
      for (let i = 0; i < count.value; i++) {
        const limits = readLimits(bytes, p);
        info.defined.push({ minPages: limits.minPages, maxPages: limits.maxPages, shared: limits.shared });
        p = limits.next;
      }
    } else if (id === SECTION_IMPORT) {
      const count = readU32(bytes, start);
      let p = count.next;
      for (let i = 0; i < count.value; i++) {
        const mod = decodeName(bytes, p);
        const field = decodeName(bytes, mod.next);
        const kind = bytes[field.next];
        p = field.next + 1;
        switch (kind) {
          case 0: // func: typeidx
            p = readU32(bytes, p).next;
            break;
          case 1: {
            // table: reftype + limits
            p = readLimits(bytes, p + 1).next;
            break;
          }
          case IMPORT_KIND_MEMORY: {
            const limits = readLimits(bytes, p);
            info.imported.push({
              module: mod.value,
              name: field.value,
              minPages: limits.minPages,
              maxPages: limits.maxPages,
              shared: limits.shared,
            });
            p = limits.next;
            break;
          }
          case 3: // global: valtype + mut
            p += 2;
            break;
          case 4: // tag: attribute + typeidx
            p = readU32(bytes, p + 1).next;
            break;
          default:
            throw new SimulationError('unsupported-module', `Unknown import kind ${kind}`);
        }
      }
    }
    pos = end;
  }
  return info;
}

/**
 * Return a copy of the module whose defined memories are capped at
 * `maxPages`. Throws `memory-limit-exceeded` when a memory's *initial* size
 * already exceeds the cap. Modules without a memory section are returned as-is.
 */
export function capModuleMemory(input: ArrayBuffer | Uint8Array, maxPages: number): Uint8Array {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  assertWasmHeader(bytes);

  const out: number[] = Array.from(bytes.subarray(0, 8));
  let pos = 8;
  while (pos < bytes.length) {
    const id = bytes[pos];
    const size = readU32(bytes, pos + 1);
    const start = size.next;
    const end = start + size.value;
    if (end > bytes.length) throw new SimulationError('compile-error', 'Section exceeds module size');

    if (id !== SECTION_MEMORY) {
      for (let i = pos; i < end; i++) out.push(bytes[i]);
      pos = end;
      continue;
    }

    const count = readU32(bytes, start);
    let p = count.next;
    const body: number[] = writeU32(count.value);
    for (let i = 0; i < count.value; i++) {
      const limits = readLimits(bytes, p);
      p = limits.next;
      if (limits.minPages > maxPages) {
        throw new SimulationError(
          'memory-limit-exceeded',
          `Module requests ${limits.minPages} initial pages (${formatBytes(limits.minPages * WASM_PAGE_BYTES)}); limit is ${maxPages} pages`
        );
      }
      body.push(
        ...encodeLimits({
          minPages: limits.minPages,
          maxPages: Math.min(limits.maxPages ?? maxPages, maxPages),
          shared: limits.shared,
        })
      );
    }
    out.push(SECTION_MEMORY, ...writeU32(body.length), ...body);
    pos = end;
  }
  return new Uint8Array(out);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export interface MemoryUsage {
  /** Bytes currently held by live linear memories in this session. */
  residentBytes: number;
  /** Highest resident value observed during the session. */
  peakBytes: number;
  /** Session budget. */
  limitBytes: number;
}

export interface SimulationSessionOptions {
  /** Resident linear-memory budget for the whole session. Default: 50 MB. */
  maxMemoryBytes?: number;
}

export type SimulationImports = Record<string, Record<string, WebAssembly.ImportValue>>;

export interface LoadedContract {
  readonly id: number;
  readonly exports: string[];
}

export type InvocationResult =
  | { ok: true; value: unknown; memory: MemoryUsage; durationMs: number }
  | { ok: false; diagnostic: SimulationDiagnostic; memory: MemoryUsage; durationMs: number };

interface TrackedContract {
  instance: WebAssembly.Instance;
  memories: WebAssembly.Memory[];
  maxPages: number;
}

export class SimulationSession {
  readonly limitBytes: number;
  private contracts = new Map<number, TrackedContract>();
  private nextId = 1;
  private peakBytes = 0;
  private reservedPages = 0;
  private disposed = false;

  constructor(options: SimulationSessionOptions = {}) {
    this.limitBytes = Math.max(
      WASM_PAGE_BYTES,
      Math.min(options.maxMemoryBytes ?? MAX_SESSION_MEMORY_BYTES, MAX_SESSION_MEMORY_BYTES)
    );
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  /** Number of contracts (instances) currently held by the session. */
  get liveContracts(): number {
    return this.contracts.size;
  }

  private get limitPages(): number {
    return Math.floor(this.limitBytes / WASM_PAGE_BYTES);
  }

  private assertLive() {
    if (this.disposed) throw new SimulationError('session-disposed');
  }

  /** Bytes currently held by every live memory in the session. */
  getMemoryUsage(): MemoryUsage {
    let resident = 0;
    this.contracts.forEach((contract) => {
      for (const memory of contract.memories) resident += memory.buffer.byteLength;
    });
    this.peakBytes = Math.max(this.peakBytes, resident);
    return { residentBytes: resident, peakBytes: this.peakBytes, limitBytes: this.limitBytes };
  }

  /**
   * Compile and instantiate a guest module with its memory capped to the
   * remaining session budget.
   *
   * @throws SimulationError
   */
  async load(wasm: ArrayBuffer | Uint8Array, imports: SimulationImports = {}): Promise<LoadedContract> {
    this.assertLive();
    const remainingPages = this.limitPages - this.reservedPages;
    if (remainingPages <= 0) {
      throw new SimulationError('memory-limit-exceeded', 'Session memory budget fully reserved');
    }

    const info = inspectModuleMemory(wasm);
    if (info.defined.length + info.imported.length > 1) {
      throw new SimulationError('unsupported-module', 'Multiple memories are not supported');
    }
    if ([...info.defined, ...info.imported].some((m) => m.shared)) {
      throw new SimulationError('unsupported-module', 'Shared memories are not supported');
    }

    const capped = capModuleMemory(wasm, remainingPages);
    const finalImports: SimulationImports = { ...imports };
    const providedMemories: WebAssembly.Memory[] = [];
    let maxPages = 0;

    for (const imp of info.imported) {
      if (imp.minPages > remainingPages) {
        throw new SimulationError(
          'memory-limit-exceeded',
          `Imported memory needs ${imp.minPages} pages; ${remainingPages} available`
        );
      }
      maxPages = Math.min(imp.maxPages ?? remainingPages, remainingPages);
      let memory: WebAssembly.Memory;
      try {
        memory = new WebAssembly.Memory({ initial: imp.minPages, maximum: maxPages });
      } catch (err) {
        throw new SimulationError('out-of-memory', (err as Error)?.message, err);
      }
      providedMemories.push(memory);
      finalImports[imp.module] = { ...(finalImports[imp.module] ?? {}), [imp.name]: memory };
    }

    if (info.defined.length === 1) {
      maxPages = Math.min(info.defined[0].maxPages ?? remainingPages, remainingPages);
    }

    let instance: WebAssembly.Instance;
    try {
      const module = await WebAssembly.compile(capped as BufferSource);
      instance = await WebAssembly.instantiate(module, finalImports);
    } catch (err) {
      throw new SimulationError(
        classifySimulationError(err).code,
        err instanceof Error ? err.message : String(err),
        err
      );
    }

    const memories = [
      ...providedMemories,
      ...Object.values(instance.exports).filter(
        (v): v is WebAssembly.Memory => v instanceof WebAssembly.Memory && !providedMemories.includes(v)
      ),
    ];

    const id = this.nextId++;
    this.contracts.set(id, { instance, memories, maxPages });
    this.reservedPages += maxPages;
    this.getMemoryUsage();

    return {
      id,
      exports: Object.entries(instance.exports)
        .filter(([, v]) => typeof v === 'function')
        .map(([name]) => name),
    };
  }

  /**
   * Call an exported function. Never throws for guest failures — they are
   * returned as diagnostics.
   */
  invoke(contract: LoadedContract, exportName: string, args: unknown[] = []): InvocationResult {
    const started = now();
    if (this.disposed) {
      return this.fail('session-disposed', started);
    }
    const tracked = this.contracts.get(contract.id);
    if (!tracked) return this.fail('session-disposed', started);

    const fn = tracked.instance.exports[exportName];
    if (typeof fn !== 'function') {
      return this.fail('export-not-found', started, `Export "${exportName}" not found`);
    }

    try {
      const value = (fn as (...a: unknown[]) => unknown)(...args);
      const memory = this.getMemoryUsage();
      if (memory.residentBytes > this.limitBytes) {
        return this.fail('out-of-memory', started, `Resident memory ${formatBytes(memory.residentBytes)}`);
      }
      return { ok: true, value, memory, durationMs: now() - started };
    } catch (error) {
      const near = this.isNearLimit(tracked);
      return {
        ok: false,
        diagnostic: classifySimulationError(error, { memoryNearLimit: near }),
        memory: this.getMemoryUsage(),
        durationMs: now() - started,
      };
    }
  }

  private isNearLimit(tracked: TrackedContract): boolean {
    if (tracked.maxPages === 0) return false;
    const pages = tracked.memories.reduce((sum, m) => sum + m.buffer.byteLength / WASM_PAGE_BYTES, 0);
    // Within ~1 MB (16 pages) of the cap counts as exhausted: allocators grow in chunks.
    return pages >= tracked.maxPages - 16;
  }

  private fail(code: SimulationDiagnosticCode, started: number, details?: string): InvocationResult {
    return {
      ok: false,
      diagnostic: makeDiagnostic(code, details),
      memory: this.disposed
        ? { residentBytes: 0, peakBytes: this.peakBytes, limitBytes: this.limitBytes }
        : this.getMemoryUsage(),
      durationMs: now() - started,
    };
  }

  /** Release one contract (its instance and memories). */
  unload(contract: LoadedContract): void {
    const tracked = this.contracts.get(contract.id);
    if (!tracked) return;
    this.reservedPages -= tracked.maxPages;
    tracked.memories.length = 0;
    this.contracts.delete(contract.id);
  }

  /**
   * Drop every reference to modules, instances and linear memories so their
   * buffers can be collected. Idempotent.
   */
  dispose(): MemoryUsage {
    const final = this.disposed
      ? { residentBytes: 0, peakBytes: this.peakBytes, limitBytes: this.limitBytes }
      : { ...this.getMemoryUsage(), residentBytes: 0 };
    this.contracts.forEach((tracked) => {
      tracked.memories.length = 0;
    });
    this.contracts.clear();
    this.reservedPages = 0;
    this.disposed = true;
    return final;
  }
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * Convenience: load a module, invoke one export, and always dispose the
 * session — the pattern every playground run should use.
 */
export async function runIsolatedSimulation({
  wasm,
  exportName,
  args = [],
  imports,
  maxMemoryBytes,
}: {
  wasm: ArrayBuffer | Uint8Array;
  exportName: string;
  args?: unknown[];
  imports?: SimulationImports;
  maxMemoryBytes?: number;
}): Promise<InvocationResult & { exports: string[] }> {
  const session = new SimulationSession({ maxMemoryBytes });
  const started = now();
  try {
    const contract = await session.load(wasm, imports);
    const result = session.invoke(contract, exportName, args);
    return { ...result, exports: contract.exports };
  } catch (error) {
    return {
      ok: false,
      diagnostic: classifySimulationError(error),
      memory: session.getMemoryUsage(),
      durationMs: now() - started,
      exports: [],
    };
  } finally {
    session.dispose();
  }
}
