/**
 * WASM AST Instruction Ceiling Enforcer — BE-074
 *
 * Counts the total weighted-instruction budget in a WASM binary's Code
 * section *before* the module is handed to `wasm-metering`. This protects
 * against two distinct attack surfaces:
 *
 *  1. The metering pass itself is a full AST walk. A binary that declares
 *     millions of instructions keeps a worker thread busy inside
 *     `metering.meterWASM()` far longer than any execution would take —
 *     effectively a pre-instantiation DoS.
 *
 *  2. Even after metering, deeply nested or pathologically branchy control
 *     flow can interact with V8's JIT in ways that exceed the wall-clock
 *     budget before the gas counter fires.
 *
 * The solution is a single-pass instruction scan at the binary level (no
 * AST is built; we just decode opcodes) that accumulates a weighted budget.
 * Weights are defined in `GAS_COST_TABLE` and are intentionally coarse —
 * the goal is a cheap, conservative upper-bound check, not exact costing.
 *
 * A module whose total weighted budget exceeds `MAX_WEIGHTED_INSTRUCTIONS`
 * is rejected with `'ast-too-complex'` before the metering worker is
 * spawned. Modules within budget proceed normally; their gas is metered
 * dynamically by the flat `i32`-decrement strategy already in place.
 *
 * Section IDs, opcode encoding and LEB128 format follow the WASM MVP spec:
 * https://webassembly.github.io/spec/core/binary/
 */

/** Weighted gas cost per opcode category, used by both the static ceiling check
 *  and surfaced to callers who want to understand the calibration. */
export const GAS_COST_TABLE = {
  /** Simple arithmetic, comparison, local.get/set — cheapest class. */
  trivial: 1,
  /** Memory load/store instructions — involve bounds-checks. */
  memory: 3,
  /** `call` / `call_indirect` — function call overhead. */
  call: 10,
  /** Branches (`br`, `br_if`, `br_table`) and loop back-edges. */
  branch: 5,
  /** `memory.grow` — may trigger system allocations. */
  memoryGrow: 100,
  /** `select`, `drop`, `nop`, `unreachable` — near-free. */
  misc: 1,
} as const;

/**
 * Hard ceiling on the total weighted instruction budget for a submitted
 * module. A module that exceeds this is rejected *before* the worker is
 * spawned, preventing the metering pass itself from becoming a DoS vector.
 *
 * Calibration rationale:
 *   - The runtime gas limit is 1,000,000 units.
 *   - Each basic block pays at least 1 unit, so a worst-case module that
 *     enters 1,000,000 blocks is already at the gas ceiling.
 *   - We set the static ceiling at 2× the runtime limit (2,000,000) to
 *     allow modules with large data/type sections but reasonable code,
 *     while still bounding the metering pass's work.
 */
export const MAX_WEIGHTED_INSTRUCTIONS = 2_000_000;

export interface AstInspectionResult {
  /** Total weighted budget consumed by all instructions in the Code section. */
  weightedCount: number;
  /** Raw instruction count (unweighted), for diagnostic logging. */
  rawCount: number;
  /** Whether the module exceeded the ceiling. */
  exceeded: boolean;
}

// ---------------------------------------------------------------------------
// Opcode tables
// ---------------------------------------------------------------------------

// All opcodes are single bytes in the MVP unless prefixed with 0xFC (misc)
// or 0xFD (simd/threads) — we do not special-case those; any 0xFC/0xFD
// byte makes the scan skip that instruction by reading the sub-opcode LEB128,
// and we charge it as `misc`.

const enum OpcodeClass {
  Trivial,
  Memory,
  Call,
  Branch,
  MemoryGrow,
  Misc,
  BlockEnter, // block / loop / if — just a structural marker
}

/** Build a lookup table: 256-entry Uint8Array mapping opcode → OpcodeClass. */
function buildOpcodeMap(): Uint8Array {
  const map = new Uint8Array(256).fill(OpcodeClass.Trivial);

  // Unreachable / nop
  map[0x00] = OpcodeClass.Misc; // unreachable
  map[0x01] = OpcodeClass.Misc; // nop

  // Block structure
  for (const op of [0x02, 0x03, 0x04]) map[op] = OpcodeClass.BlockEnter; // block loop if
  map[0x05] = OpcodeClass.Branch; // else
  map[0x0b] = OpcodeClass.Misc; // end
  map[0x0c] = OpcodeClass.Branch; // br
  map[0x0d] = OpcodeClass.Branch; // br_if
  map[0x0e] = OpcodeClass.Branch; // br_table
  map[0x0f] = OpcodeClass.Misc; // return

  // Calls
  map[0x10] = OpcodeClass.Call; // call
  map[0x11] = OpcodeClass.Call; // call_indirect

  // Drop / select
  map[0x1a] = OpcodeClass.Misc; // drop
  map[0x1b] = OpcodeClass.Misc; // select

  // Memory
  for (let op = 0x28; op <= 0x3e; op++) map[op] = OpcodeClass.Memory; // loads and stores
  map[0x3f] = OpcodeClass.Misc; // memory.size
  map[0x40] = OpcodeClass.MemoryGrow; // memory.grow

  // Everything else stays Trivial (locals, globals, constants, arithmetic).

  return map;
}

const OPCODE_MAP = buildOpcodeMap();
// 7 entries — one per OpcodeClass variant, in declaration order.
const COST_BY_CLASS: Readonly<[number, number, number, number, number, number, number]> = [
  GAS_COST_TABLE.trivial,    // Trivial = 0
  GAS_COST_TABLE.memory,     // Memory = 1
  GAS_COST_TABLE.call,       // Call = 2
  GAS_COST_TABLE.branch,     // Branch = 3
  GAS_COST_TABLE.memoryGrow, // MemoryGrow = 4
  GAS_COST_TABLE.misc,       // Misc = 5
  GAS_COST_TABLE.trivial,    // BlockEnter = 6 (structural, cheap)
];

// ---------------------------------------------------------------------------
// LEB128 helpers (inline to avoid a ByteReader allocation per call)
// ---------------------------------------------------------------------------

function skipVarUint(bytes: Uint8Array, pos: number): number {
  while (pos < bytes.length && ((bytes[pos] ?? 0) & 0x80) !== 0) pos++;
  return pos + 1; // skip the final byte (high bit clear)
}

function readVarUint(bytes: Uint8Array, pos: number): { value: number; next: number } {
  let value = 0;
  let shift = 0;
  while (pos < bytes.length) {
    const b = bytes[pos++] ?? 0;
    value |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) return { value, next: pos };
    shift += 7;
  }
  return { value, next: pos };
}

// ---------------------------------------------------------------------------
// Section-level scan
// ---------------------------------------------------------------------------

/**
 * Locates the Code section (id 10) in a WASM binary and returns its byte
 * range. Returns null when no Code section exists (e.g. a pure data module).
 * Assumes the first 8 bytes (magic + version) have already been validated.
 */
function findCodeSection(bytes: Uint8Array): { start: number; end: number } | null {
  let pos = 8;
  while (pos < bytes.length) {
    if (pos + 1 > bytes.length) break;
    const id = bytes[pos++] ?? 0;
    const sz = readVarUint(bytes, pos);
    const sectionEnd = sz.next + sz.value;
    if (sectionEnd > bytes.length) break;
    if (id === 10) return { start: sz.next, end: sectionEnd };
    pos = sectionEnd;
  }
  return null;
}

/**
 * Scans all instructions inside the Code section and accumulates a weighted
 * budget. Early-exits as soon as `MAX_WEIGHTED_INSTRUCTIONS` is exceeded so
 * this check is O(budget) rather than O(module size) for hostile inputs.
 *
 * The scan is intentionally **not** a full validator — it only reads opcode
 * bytes and skips their immediate operands according to known layouts. Any
 * byte that cannot be parsed (e.g. a custom-proposal opcode) is treated as
 * `misc` cost and the scan continues, so a module that uses unsupported
 * features will still be bounded.
 */
export function countWasmInstructions(bytes: Uint8Array): AstInspectionResult {
  const section = findCodeSection(bytes);
  if (section === null) {
    return { weightedCount: 0, rawCount: 0, exceeded: false };
  }

  let pos = section.start;
  const end = section.end;

  // Skip function count LEB128.
  const funcCount = readVarUint(bytes, pos);
  pos = funcCount.next;

  let weightedCount = 0;
  let rawCount = 0;

  for (let fi = 0; fi < funcCount.value && pos < end; fi++) {
    // Each function body: u32 body_size, then locals, then opcodes, ending with 0x0B.
    const bodySz = readVarUint(bytes, pos);
    const bodyEnd = bodySz.next + bodySz.value;
    pos = bodySz.next;

    // Skip local declarations.
    const localCount = readVarUint(bytes, pos);
    pos = localCount.next;
    for (let li = 0; li < localCount.value; li++) {
      pos = skipVarUint(bytes, pos); // count
      if (pos < bytes.length) pos++;  // valtype byte (safe increment)
    }

    // Scan instructions until body end.
    while (pos < bodyEnd && pos < end) {
      const opcode = bytes[pos++]!;

      const cls: OpcodeClass = (OPCODE_MAP[opcode] ?? OpcodeClass.Trivial) as OpcodeClass;
      weightedCount += COST_BY_CLASS[cls] ?? GAS_COST_TABLE.trivial;
      rawCount++;

      if (weightedCount >= MAX_WEIGHTED_INSTRUCTIONS) {
        return { weightedCount, rawCount, exceeded: true };
      }

      // Skip immediates so the next byte is an opcode, not an operand.
      pos = skipImmediates(bytes, pos, opcode);
    }

    if (pos < bodyEnd) {
      // Body size declared more bytes than we consumed — sync to end.
      pos = bodyEnd;
    }
  }

  return { weightedCount, rawCount, exceeded: false };
}

// ---------------------------------------------------------------------------
// Immediate operand skipping
// ---------------------------------------------------------------------------

/**
 * Advances `pos` past the immediate bytes of `opcode`. This does not need to
 * be exhaustive — unknown opcodes default to 0 immediate bytes, which is
 * safe (the next loop iteration reads whatever byte comes next as an opcode,
 * which may mis-classify it, but weighted counting remains conservative).
 *
 * The important invariant: we never read *past* the buffer boundary, only
 * past what we confidently know.
 */
function skipImmediates(bytes: Uint8Array, pos: number, opcode: number): number {
  switch (opcode) {
    // -----------------------------------------------------------------------
    // Block structures — blocktype is a single signed LEB128 (usually -64..127)
    // -----------------------------------------------------------------------
    case 0x02: // block
    case 0x03: // loop
    case 0x04: // if
      return skipVarUint(bytes, pos); // blocktype (usually 1 byte: 0x40 / valtype)

    // -----------------------------------------------------------------------
    // Branches
    // -----------------------------------------------------------------------
    case 0x0c: // br
    case 0x0d: // br_if
      return skipVarUint(bytes, pos); // label index

    case 0x0e: // br_table
    {
      const tbl = readVarUint(bytes, pos);
      let p = tbl.next;
      // Skip target_count+1 label indices (targets + default).
      for (let i = 0; i <= tbl.value; i++) p = skipVarUint(bytes, p);
      return p;
    }

    // -----------------------------------------------------------------------
    // Calls
    // -----------------------------------------------------------------------
    case 0x10: // call
      return skipVarUint(bytes, pos); // function index

    case 0x11: // call_indirect
    {
      let p = skipVarUint(bytes, pos); // type index
      p = skipVarUint(bytes, p);       // table index (0x00 in MVP)
      return p;
    }

    // -----------------------------------------------------------------------
    // Variable access
    // -----------------------------------------------------------------------
    case 0x20: // local.get
    case 0x21: // local.set
    case 0x22: // local.tee
    case 0x23: // global.get
    case 0x24: // global.set
      return skipVarUint(bytes, pos); // index

    // -----------------------------------------------------------------------
    // Memory instructions — alignment and offset immediates
    // -----------------------------------------------------------------------
    case 0x28: case 0x29: case 0x2a: case 0x2b:
    case 0x2c: case 0x2d: case 0x2e: case 0x2f:
    case 0x30: case 0x31: case 0x32: case 0x33:
    case 0x34: case 0x35: case 0x36: case 0x37:
    case 0x38: case 0x39: case 0x3a: case 0x3b:
    case 0x3c: case 0x3d: case 0x3e: // loads and stores
    case 0x3f: // memory.size
    case 0x40: // memory.grow
    {
      let p = skipVarUint(bytes, pos); // alignment hint
      if (opcode !== 0x3f && opcode !== 0x40) p = skipVarUint(bytes, p); // offset
      return p;
    }

    // -----------------------------------------------------------------------
    // Constants
    // -----------------------------------------------------------------------
    case 0x41: // i32.const
    case 0x42: // i64.const
      return skipVarUint(bytes, pos); // value (LEB128 signed, same byte count)

    case 0x43: // f32.const
      return pos + 4;

    case 0x44: // f64.const
      return pos + 8;

    // -----------------------------------------------------------------------
    // 0xFC prefix — miscellaneous / bulk-memory proposal opcodes
    // -----------------------------------------------------------------------
    case 0xfc:
      return skipVarUint(bytes, pos); // sub-opcode

    default:
      // All zero-immediate opcodes (arithmetic, comparison, conversions).
      return pos;
  }
}
