/**
 * In-browser WebAssembly disassembler (Issue #1784).
 *
 * This module walks a compiled `.wasm` binary — the same bytes the Soroban
 * playground uploads to the ledger — and turns the Code section into a flat,
 * addressable instruction listing. Every instruction carries its absolute byte
 * offset, which is what breakpoints are set on, and a static stack effect so the
 * step debugger can show the operand stack without instantiating the module.
 *
 * Why hand-rolled instead of wabt? wabt produces WAT text, which is excellent to
 * read but loses the byte offsets needed for a debugger and cannot be stepped
 * one operation at a time. The section format is small and stable, so decoding
 * it directly keeps the whole feature synchronous and testable.
 *
 * @see https://webassembly.github.io/spec/core/binary/modules.html
 */

export const WASM_MAGIC = [0x00, 0x61, 0x73, 0x6d];
export const WASM_VERSION = 1;

const VALUE_TYPE_NAMES: Record<number, string> = {
  0x7f: 'i32',
  0x7e: 'i64',
  0x7d: 'f32',
  0x7c: 'f64',
  0x7b: 'v128',
  0x70: 'funcref',
  0x6f: 'externref',
};

export type InstructionCategory =
  'control' | 'call' | 'const' | 'variable' | 'memory' | 'numeric' | 'reference' | 'other';

export interface WasmLocal {
  /** Absolute local index: parameters come first, then declared locals. */
  index: number;
  type: string;
  name: string;
  isParam: boolean;
}

export interface WasmInstruction {
  /** Absolute byte offset in the binary — the breakpoint key. */
  offset: number;
  /** Position inside the function's instruction list. */
  index: number;
  opcode: number;
  /** Sub-opcode for 0xFC/0xFD prefixed instructions. */
  subopcode?: number;
  mnemonic: string;
  /** Human-readable immediates, e.g. `local 3` or `offset=8 align=4`. */
  immediates: string;
  size: number;
  /** Control nesting depth, used for indentation. */
  depth: number;
  category: InstructionCategory;
  /** Static operand-stack effect. Control instructions stay at 0/0. */
  pop: number;
  push: number;
  /** For call instructions: the callee's function index. */
  targetIndex?: number;
  /** For branches: target instruction index in this function. */
  branchTarget?: number;
  /** For `if`: where to jump when the condition is zero. */
  ifFalseTarget?: number;
  /** Resolved constant, for i32/i64/f32/f64.const. */
  immediateValue?: number | bigint;
  /** True for `unreachable`, which traps immediately in the simulator. */
  trap?: boolean;
}

export interface WasmFunction {
  /** Function index in the module, imports included. */
  index: number;
  name: string;
  exportNames: string[];
  imported: boolean;
  importModule?: string;
  importField?: string;
  typeIndex: number;
  paramTypes: string[];
  resultTypes: string[];
  /** Parameters and declared locals — everything the stepper shows. */
  locals: WasmLocal[];
  /** Byte offset of the function body (0 for imports). */
  offset: number;
  bodySize: number;
  instructions: WasmInstruction[];
}

export interface WasmDisassembly {
  valid: boolean;
  error?: string;
  functions: WasmFunction[];
  totalBytes: number;
  totalInstructions: number;
  warnings: string[];
}

class Reader {
  constructor(
    private readonly bytes: Uint8Array,
    public offset = 0,
    private readonly end = bytes.length
  ) {}

  get remaining(): number {
    return this.end - this.offset;
  }

  u8(): number {
    if (this.offset >= this.end) throw new Error('Unexpected end of module');
    return this.bytes[this.offset++];
  }

  peek(): number {
    if (this.offset >= this.end) throw new Error('Unexpected end of module');
    return this.bytes[this.offset];
  }

  take(count: number): Uint8Array {
    if (count > this.remaining) throw new Error('Section runs past end of module');
    const slice = this.bytes.subarray(this.offset, this.offset + count);
    this.offset += count;
    return slice;
  }

  varuint(): number {
    let result = 0;
    let shift = 0;
    for (;;) {
      const byte = this.u8();
      result |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return result >>> 0;
      shift += 7;
      if (shift > 35) throw new Error('Malformed LEB128 integer');
    }
  }

  varint32(): number {
    let result = 0;
    let shift = 0;
    let byte = 0;
    do {
      byte = this.u8();
      result |= (byte & 0x7f) << shift;
      shift += 7;
      if (shift > 35) throw new Error('Malformed signed LEB128 integer');
    } while ((byte & 0x80) !== 0);
    if (shift < 32 && (byte & 0x40) !== 0) result |= -1 << shift;
    return result;
  }

  varint64(): bigint {
    let result = BigInt(0);
    let shift = BigInt(0);
    let byte = 0;
    do {
      byte = this.u8();
      result |= BigInt(byte & 0x7f) << shift;
      shift += BigInt(7);
      if (shift > BigInt(70)) throw new Error('Malformed 64-bit signed LEB128 integer');
    } while ((byte & 0x80) !== 0);
    if (shift < BigInt(64) && (byte & 0x40) !== 0) result |= BigInt(-1) << shift;
    return BigInt.asIntN(64, result);
  }

  name(): string {
    const length = this.varuint();
    return new TextDecoder().decode(this.take(length));
  }
}

function readValueType(reader: Reader): string {
  const byte = reader.u8();
  return VALUE_TYPE_NAMES[byte] ?? `type${byte}`;
}

interface FuncType {
  params: string[];
  results: string[];
}

function parseTypeSection(payload: Uint8Array): FuncType[] {
  const reader = new Reader(payload);
  const count = reader.varuint();
  const types: FuncType[] = [];

  for (let i = 0; i < count; i++) {
    const form = reader.u8();
    if (form !== 0x60) throw new Error(`Unsupported type form 0x${form.toString(16)}`);
    const paramCount = reader.varuint();
    const params: string[] = [];
    for (let p = 0; p < paramCount; p++) params.push(readValueType(reader));
    const resultCount = reader.varuint();
    const results: string[] = [];
    for (let r = 0; r < resultCount; r++) results.push(readValueType(reader));
    types.push({ params, results });
  }

  return types;
}

interface RawImport {
  module: string;
  field: string;
  kind: number;
  typeIndex?: number;
}

function skipLimits(reader: Reader): void {
  const flags = reader.varuint();
  reader.varuint();
  if (flags & 1) reader.varuint();
}

function parseImportSection(payload: Uint8Array): RawImport[] {
  const reader = new Reader(payload);
  const count = reader.varuint();
  const imports: RawImport[] = [];

  for (let i = 0; i < count; i++) {
    const module = reader.name();
    const field = reader.name();
    const kind = reader.u8();

    if (kind === 0) imports.push({ module, field, kind, typeIndex: reader.varuint() });
    else if (kind === 1) {
      reader.u8(); // reference type
      skipLimits(reader);
      imports.push({ module, field, kind });
    } else if (kind === 2) {
      skipLimits(reader);
      imports.push({ module, field, kind });
    } else if (kind === 3) {
      reader.u8(); // value type
      reader.u8(); // mutability
      imports.push({ module, field, kind });
    } else if (kind === 4) {
      reader.u8(); // attribute
      reader.varuint(); // type index
      imports.push({ module, field, kind });
    } else {
      throw new Error(`Unknown import kind ${kind}`);
    }
  }

  return imports;
}

interface FunctionNameMaps {
  functions: Map<number, string>;
  locals: Map<number, Map<number, string>>;
}

/** The `name` custom section, which Rust keeps when debug names are enabled. */
function parseNameSection(payload: Uint8Array): FunctionNameMaps {
  const maps: FunctionNameMaps = { functions: new Map(), locals: new Map() };
  const reader = new Reader(payload);
  reader.name(); // section name, always "name"

  while (reader.remaining > 0) {
    const subsection = reader.u8();
    const size = reader.varuint();
    const sub = new Reader(reader.take(size));

    if (subsection === 1) {
      const count = sub.varuint();
      for (let i = 0; i < count; i++) {
        const index = sub.varuint();
        maps.functions.set(index, sub.name());
      }
    } else if (subsection === 2) {
      const count = sub.varuint();
      for (let i = 0; i < count; i++) {
        const functionIndex = sub.varuint();
        const localCount = sub.varuint();
        const localNames = new Map<number, string>();
        for (let l = 0; l < localCount; l++) {
          const localIndex = sub.varuint();
          localNames.set(localIndex, sub.name());
        }
        maps.locals.set(functionIndex, localNames);
      }
    }
  }

  return maps;
}

type ImmKind =
  | 'none'
  | 'block'
  | 'label'
  | 'br_table'
  | 'call'
  | 'call_indirect'
  | 'local'
  | 'global'
  | 'table'
  | 'memarg'
  | 'i32'
  | 'i64'
  | 'f32'
  | 'f64'
  | 'select_types'
  | 'memory_index'
  | 'ref_null'
  | 'ref_func';

interface OpInfo {
  name: string;
  imm: ImmKind;
  pop: number;
  push: number;
  category: InstructionCategory;
  trap?: boolean;
}

const OPCODES = new Map<number, OpInfo>();

function def(
  code: number,
  name: string,
  imm: ImmKind = 'none',
  pop = 0,
  push = 0,
  category: InstructionCategory = 'other'
): void {
  OPCODES.set(code, { name, imm, pop, push, category });
}

// Control flow.
def(0x00, 'unreachable', 'none', 0, 0, 'control');
OPCODES.get(0x00)!.trap = true;
def(0x01, 'nop');
def(0x02, 'block', 'block', 0, 0, 'control');
def(0x03, 'loop', 'block', 0, 0, 'control');
def(0x04, 'if', 'block', 0, 0, 'control');
def(0x05, 'else', 'none', 0, 0, 'control');
def(0x0b, 'end', 'none', 0, 0, 'control');
def(0x0c, 'br', 'label', 0, 0, 'control');
def(0x0d, 'br_if', 'label', 1, 0, 'control');
def(0x0e, 'br_table', 'br_table', 1, 0, 'control');
def(0x0f, 'return', 'none', 0, 0, 'control');
def(0x10, 'call', 'call', 0, 0, 'call');
def(0x11, 'call_indirect', 'call_indirect', 0, 0, 'call');
def(0x12, 'return_call', 'call', 0, 0, 'call');
def(0x13, 'return_call_indirect', 'call_indirect', 0, 0, 'call');
def(0x14, 'call_ref', 'table', 0, 0, 'call');
def(0x15, 'return_call_ref', 'table', 0, 0, 'call');
def(0x1a, 'drop', 'none', 1, 0, 'variable');
def(0x1b, 'select', 'none', 3, 1, 'variable');
def(0x1c, 'select', 'select_types', 3, 1, 'variable');

// Variables.
def(0x20, 'local.get', 'local', 0, 1, 'variable');
def(0x21, 'local.set', 'local', 1, 0, 'variable');
def(0x22, 'local.tee', 'local', 1, 1, 'variable');
def(0x23, 'global.get', 'global', 0, 1, 'variable');
def(0x24, 'global.set', 'global', 1, 0, 'variable');
def(0x25, 'table.get', 'table', 1, 1, 'variable');
def(0x26, 'table.set', 'table', 2, 0, 'variable');

// Memory access.
const LOADS: Record<number, string> = {
  0x28: 'i32.load',
  0x29: 'i64.load',
  0x2a: 'f32.load',
  0x2b: 'f64.load',
  0x2c: 'i32.load8_s',
  0x2d: 'i32.load8_u',
  0x2e: 'i32.load16_s',
  0x2f: 'i32.load16_u',
  0x30: 'i64.load8_s',
  0x31: 'i64.load8_u',
  0x32: 'i64.load16_s',
  0x33: 'i64.load16_u',
  0x34: 'i64.load32_s',
  0x35: 'i64.load32_u',
};
for (const [code, name] of Object.entries(LOADS)) {
  def(Number(code), name, 'memarg', 1, 1, 'memory');
}

const STORES: Record<number, string> = {
  0x36: 'i32.store',
  0x37: 'i64.store',
  0x38: 'f32.store',
  0x39: 'f64.store',
  0x3a: 'i32.store8',
  0x3b: 'i32.store16',
  0x3c: 'i64.store8',
  0x3d: 'i64.store16',
  0x3e: 'i64.store32',
};
for (const [code, name] of Object.entries(STORES)) {
  def(Number(code), name, 'memarg', 2, 0, 'memory');
}
def(0x3f, 'memory.size', 'memory_index', 0, 1, 'memory');
def(0x40, 'memory.grow', 'memory_index', 1, 1, 'memory');

// Constants.
def(0x41, 'i32.const', 'i32', 0, 1, 'const');
def(0x42, 'i64.const', 'i64', 0, 1, 'const');
def(0x43, 'f32.const', 'f32', 0, 1, 'const');
def(0x44, 'f64.const', 'f64', 0, 1, 'const');

// Comparisons and numeric operations.
def(0x45, 'i32.eqz', 'none', 1, 1, 'numeric');
const I32_COMPARE = ['eq', 'ne', 'lt_s', 'lt_u', 'gt_s', 'gt_u', 'le_s', 'le_u', 'ge_s', 'ge_u'];
I32_COMPARE.forEach((suffix, i) => def(0x46 + i, `i32.${suffix}`, 'none', 2, 1, 'numeric'));

def(0x50, 'i64.eqz', 'none', 1, 1, 'numeric');
I32_COMPARE.forEach((suffix, i) => def(0x51 + i, `i64.${suffix}`, 'none', 2, 1, 'numeric'));

const FLOAT_COMPARE = ['eq', 'ne', 'lt', 'gt', 'le', 'ge'];
FLOAT_COMPARE.forEach((suffix, i) => def(0x5b + i, `f32.${suffix}`, 'none', 2, 1, 'numeric'));
FLOAT_COMPARE.forEach((suffix, i) => def(0x61 + i, `f64.${suffix}`, 'none', 2, 1, 'numeric'));

['clz', 'ctz', 'popcnt'].forEach((suffix, i) =>
  def(0x67 + i, `i32.${suffix}`, 'none', 1, 1, 'numeric')
);
[
  'add',
  'sub',
  'mul',
  'div_s',
  'div_u',
  'rem_s',
  'rem_u',
  'and',
  'or',
  'xor',
  'shl',
  'shr_s',
  'shr_u',
  'rotl',
  'rotr',
].forEach((suffix, i) => def(0x6a + i, `i32.${suffix}`, 'none', 2, 1, 'numeric'));

['clz', 'ctz', 'popcnt'].forEach((suffix, i) =>
  def(0x79 + i, `i64.${suffix}`, 'none', 1, 1, 'numeric')
);
[
  'add',
  'sub',
  'mul',
  'div_s',
  'div_u',
  'rem_s',
  'rem_u',
  'and',
  'or',
  'xor',
  'shl',
  'shr_s',
  'shr_u',
  'rotl',
  'rotr',
].forEach((suffix, i) => def(0x7c + i, `i64.${suffix}`, 'none', 2, 1, 'numeric'));

['abs', 'neg', 'ceil', 'floor', 'trunc', 'nearest', 'sqrt'].forEach((suffix, i) =>
  def(0x8b + i, `f32.${suffix}`, 'none', 1, 1, 'numeric')
);
['add', 'sub', 'mul', 'div', 'min', 'max', 'copysign'].forEach((suffix, i) =>
  def(0x92 + i, `f32.${suffix}`, 'none', 2, 1, 'numeric')
);
['abs', 'neg', 'ceil', 'floor', 'trunc', 'nearest', 'sqrt'].forEach((suffix, i) =>
  def(0x99 + i, `f64.${suffix}`, 'none', 1, 1, 'numeric')
);
['add', 'sub', 'mul', 'div', 'min', 'max', 'copysign'].forEach((suffix, i) =>
  def(0xa0 + i, `f64.${suffix}`, 'none', 2, 1, 'numeric')
);

const CONVERSIONS = [
  'i32.wrap_i64',
  'i32.trunc_f32_s',
  'i32.trunc_f32_u',
  'i32.trunc_f64_s',
  'i32.trunc_f64_u',
  'i64.extend_i32_s',
  'i64.extend_i32_u',
  'i64.trunc_f32_s',
  'i64.trunc_f32_u',
  'i64.trunc_f64_s',
  'i64.trunc_f64_u',
  'f32.convert_i32_s',
  'f32.convert_i32_u',
  'f32.convert_i64_s',
  'f32.convert_i64_u',
  'f32.demote_f64',
  'f64.convert_i32_s',
  'f64.convert_i32_u',
  'f64.convert_i64_s',
  'f64.convert_i64_u',
  'f64.promote_f32',
  'i32.reinterpret_f32',
  'i64.reinterpret_f64',
  'f32.reinterpret_i32',
  'f64.reinterpret_i64',
  'i32.extend8_s',
  'i32.extend16_s',
  'i64.extend8_s',
  'i64.extend16_s',
  'i64.extend32_s',
];
CONVERSIONS.forEach((name, i) => def(0xa7 + i, name, 'none', 1, 1, 'numeric'));

// Reference types.
def(0xd0, 'ref.null', 'ref_null', 0, 1, 'reference');
def(0xd1, 'ref.is_null', 'none', 1, 1, 'reference');
def(0xd2, 'ref.func', 'ref_func', 0, 1, 'reference');

interface ControlFrame {
  kind: 'block' | 'loop' | 'if';
  instructionIndex: number;
  endIndex: number;
  elseIndex: number;
}

interface PendingBranch {
  instructionIndex: number;
  frame: ControlFrame;
}

function parseBlockType(reader: Reader): string {
  const value = reader.varint32();
  if (value === -64) return '';
  const asByte = value & 0x7f;
  if (VALUE_TYPE_NAMES[asByte]) return VALUE_TYPE_NAMES[asByte];
  return `type${value}`;
}

function heapTypeName(value: number): string {
  if (value === -16) return 'funcref';
  if (value === -17) return 'externref';
  return `heaptype${value}`;
}

function decodeBody(
  body: Uint8Array,
  bodyOffset: number,
  functionIndex: number,
  types: FuncType[],
  functionTypeIndices: number[],
  functionNames: Map<number, string>,
  warnings: string[]
): { instructions: WasmInstruction[]; declaredLocals: { type: string }[] } {
  const reader = new Reader(body);
  const localGroupCount = reader.varuint();
  const declaredLocals: { type: string }[] = [];
  for (let i = 0; i < localGroupCount; i++) {
    const count = reader.varuint();
    const type = readValueType(reader);
    for (let c = 0; c < count; c++) declaredLocals.push({ type });
  }

  const instructions: WasmInstruction[] = [];
  const controlStack: ControlFrame[] = [];
  const pendingBranches: PendingBranch[] = [];
  const elseInstructions: { instructionIndex: number; frame: ControlFrame }[] = [];
  let controlDepth = 0;
  let maxInstructions = 1_000_000;

  const calleeType = (index: number): FuncType | undefined => {
    const typeIndex = functionTypeIndices[index];
    return typeIndex === undefined ? undefined : types[typeIndex];
  };

  while (reader.remaining > 0) {
    if (maxInstructions-- <= 0) {
      warnings.push(`Function ${functionIndex} exceeded the instruction decode limit.`);
      break;
    }

    const instructionIndex = instructions.length;
    const offset = bodyOffset + reader.offset;
    const opcode = reader.u8();
    let info = OPCODES.get(opcode);
    let subopcode: number | undefined;
    let mnemonic = info?.name ?? `opcode_0x${opcode.toString(16)}`;
    let immediates = '';
    let pop = info?.pop ?? 0;
    let push = info?.push ?? 0;
    let category: InstructionCategory = info?.category ?? 'other';
    let targetIndex: number | undefined;
    let immediateValue: number | bigint | undefined;
    let trap = info?.trap;
    let imm: ImmKind = info?.imm ?? 'none';

    if (opcode === 0xfc) {
      const sub = reader.varuint();
      subopcode = sub;
      category = 'numeric';
      const saturating = [
        'i32.trunc_sat_f32_s',
        'i32.trunc_sat_f32_u',
        'i32.trunc_sat_f64_s',
        'i32.trunc_sat_f64_u',
        'i64.trunc_sat_f32_s',
        'i64.trunc_sat_f32_u',
        'i64.trunc_sat_f64_s',
        'i64.trunc_sat_f64_u',
      ];
      if (sub < 8) {
        mnemonic = saturating[sub];
        pop = 1;
        push = 1;
        imm = 'none';
      } else if (sub === 8) {
        mnemonic = 'memory.init';
        const dataIndex = reader.varuint();
        const memoryIndex = reader.varuint();
        immediates = `data=${dataIndex} memory=${memoryIndex}`;
        pop = 3;
        imm = 'none';
      } else if (sub === 9) {
        mnemonic = 'data.drop';
        immediates = `${reader.varuint()}`;
        imm = 'none';
      } else if (sub === 10) {
        mnemonic = 'memory.copy';
        immediates = `dst=${reader.varuint()} src=${reader.varuint()}`;
        pop = 3;
        imm = 'none';
      } else if (sub === 11) {
        mnemonic = 'memory.fill';
        immediates = `memory=${reader.varuint()}`;
        pop = 3;
        imm = 'none';
      } else if (sub === 12) {
        mnemonic = 'table.init';
        immediates = `elem=${reader.varuint()} table=${reader.varuint()}`;
        pop = 3;
        category = 'variable';
        imm = 'none';
      } else if (sub === 13) {
        mnemonic = 'elem.drop';
        immediates = `${reader.varuint()}`;
        category = 'variable';
        imm = 'none';
      } else if (sub === 14) {
        mnemonic = 'table.copy';
        immediates = `dst=${reader.varuint()} src=${reader.varuint()}`;
        pop = 3;
        category = 'variable';
        imm = 'none';
      } else if (sub === 15) {
        mnemonic = 'table.grow';
        immediates = `table=${reader.varuint()}`;
        pop = 2;
        push = 1;
        category = 'variable';
        imm = 'none';
      } else if (sub === 16) {
        mnemonic = 'table.size';
        immediates = `table=${reader.varuint()}`;
        push = 1;
        category = 'variable';
        imm = 'none';
      } else if (sub === 17) {
        mnemonic = 'table.fill';
        immediates = `table=${reader.varuint()}`;
        pop = 3;
        category = 'variable';
        imm = 'none';
      } else {
        mnemonic = `misc_0x${sub.toString(16)}`;
        imm = 'none';
      }
    } else if (opcode === 0xfd) {
      const sub = reader.varuint();
      subopcode = sub;
      category = 'numeric';
      mnemonic = `simd_0x${sub.toString(16)}`;
      imm = 'none';
      pop = 0;
      push = 0;

      if (sub === 0x0b) {
        mnemonic = 'v128.const';
        reader.take(16);
        push = 1;
        immediates = '16-byte vector';
      } else if (sub === 0x0c) {
        mnemonic = 'i8x16.shuffle';
        reader.take(16);
        pop = 2;
        push = 1;
        immediates = '16 lanes';
      } else if ([0x15, 0x16, 0x18, 0x19, 0x1b, 0x1d, 0x1f, 0x21].includes(sub)) {
        mnemonic = 'simd.extract_lane';
        immediates = `lane=${reader.u8()}`;
        pop = 1;
        push = 1;
      } else if ([0x17, 0x1a, 0x1c, 0x1e, 0x20, 0x22].includes(sub)) {
        mnemonic = 'simd.replace_lane';
        immediates = `lane=${reader.u8()}`;
        pop = 2;
        push = 1;
      }
    } else if (opcode === 0xfb) {
      const sub = reader.varuint();
      subopcode = sub;
      mnemonic = `gc_0x${sub.toString(16)}`;
      warnings.push(
        `Function ${functionIndex} uses a GC-prefixed instruction at offset 0x${offset.toString(16)}; decoding stopped there.`
      );
      instructions.push({
        offset,
        index: instructionIndex,
        opcode,
        subopcode,
        mnemonic,
        immediates: '',
        size: reader.offset - (offset - bodyOffset),
        depth: controlDepth,
        category: 'other',
        pop: 0,
        push: 0,
      });
      break;
    }

    // Immediates.
    if (imm === 'block') {
      const blockType = parseBlockType(reader);
      if (blockType) immediates = `(result ${blockType})`;
      controlStack.push({
        kind: opcode === 0x03 ? 'loop' : opcode === 0x04 ? 'if' : 'block',
        instructionIndex,
        endIndex: -1,
        elseIndex: -1,
      });
    } else if (imm === 'label') {
      const label = reader.varuint();
      immediates = String(label);
      const frame = controlStack[controlStack.length - 1 - label];
      if (frame) pendingBranches.push({ instructionIndex, frame });
      else warnings.push(`Branch at 0x${offset.toString(16)} targets an unknown label.`);
    } else if (imm === 'br_table') {
      const count = reader.varuint();
      const labels: number[] = [];
      for (let i = 0; i < count; i++) labels.push(reader.varuint());
      const fallback = reader.varuint();
      immediates = `${labels.join(', ')} → default ${fallback}`;
      const frame = controlStack[controlStack.length - 1 - fallback];
      if (frame) pendingBranches.push({ instructionIndex, frame });
    } else if (imm === 'call') {
      const callee = reader.varuint();
      targetIndex = callee;
      const type = calleeType(callee);
      if (type) {
        pop = type.params.length;
        push = type.results.length;
      }
      const calleeName = functionNames.get(callee);
      immediates = calleeName ? `${callee} <${calleeName}>` : String(callee);
    } else if (imm === 'call_indirect') {
      const typeIndex = reader.varuint();
      const tableIndex = reader.varuint();
      const type = types[typeIndex];
      if (type) {
        pop = type.params.length + 1;
        push = type.results.length;
      }
      immediates = `type=${typeIndex} table=${tableIndex}`;
    } else if (imm === 'local') {
      const localIndex = reader.varuint();
      immediates = String(localIndex);
    } else if (imm === 'global' || imm === 'table' || imm === 'ref_func') {
      immediates = String(reader.varuint());
    } else if (imm === 'memarg') {
      const align = reader.varuint();
      const memOffset = reader.varuint();
      immediates = `offset=${memOffset} align=${2 ** align}`;
    } else if (imm === 'i32') {
      const value = reader.varint32();
      immediateValue = value;
      immediates = String(value);
    } else if (imm === 'i64') {
      const value = reader.varint64();
      immediateValue = value;
      immediates = `${value}n`;
    } else if (imm === 'f32') {
      const bytes = reader.take(4);
      const value = new DataView(bytes.buffer, bytes.byteOffset, 4).getFloat32(0, true);
      immediateValue = value;
      immediates = String(value);
    } else if (imm === 'f64') {
      const bytes = reader.take(8);
      const value = new DataView(bytes.buffer, bytes.byteOffset, 8).getFloat64(0, true);
      immediateValue = value;
      immediates = String(value);
    } else if (imm === 'select_types') {
      const count = reader.varuint();
      const valueTypes: string[] = [];
      for (let i = 0; i < count; i++) valueTypes.push(readValueType(reader));
      immediates = valueTypes.join(', ');
    } else if (imm === 'memory_index') {
      immediates = String(reader.u8());
    } else if (imm === 'ref_null') {
      immediates = heapTypeName(reader.varint32());
    }

    // `end` closes a frame; the function-level end has depth 0.
    let depthForInstruction = controlDepth;
    if (opcode === 0x0b) {
      const closed = controlStack.pop();
      depthForInstruction = controlDepth > 0 ? controlDepth - 1 : 0;
      controlDepth = depthForInstruction;
      if (closed) {
        closed.endIndex = instructionIndex;
        for (const pending of pendingBranches) {
          if (pending.frame !== closed) continue;
          const instruction = instructions[pending.instructionIndex];
          if (instruction) {
            instruction.branchTarget =
              closed.kind === 'loop' ? closed.instructionIndex + 1 : closed.endIndex + 1;
          }
        }
        if (closed.kind === 'if') {
          const ifInstruction = instructions[closed.instructionIndex];
          if (ifInstruction) {
            ifInstruction.ifFalseTarget =
              closed.elseIndex >= 0 ? closed.elseIndex + 1 : closed.endIndex + 1;
          }
        }
        for (const pendingElse of elseInstructions) {
          if (pendingElse.frame !== closed) continue;
          const elseInstruction = instructions[pendingElse.instructionIndex];
          if (elseInstruction) elseInstruction.branchTarget = closed.endIndex;
        }
      }
    } else if (opcode === 0x05) {
      depthForInstruction = controlDepth > 0 ? controlDepth - 1 : 0;
      const frame = controlStack[controlStack.length - 1];
      if (frame) {
        frame.elseIndex = instructionIndex;
        elseInstructions.push({ instructionIndex, frame });
      }
    } else if (opcode === 0x02 || opcode === 0x03 || opcode === 0x04) {
      depthForInstruction = controlDepth;
      controlDepth += 1;
    }

    instructions.push({
      offset,
      index: instructionIndex,
      opcode,
      subopcode,
      mnemonic,
      immediates,
      size: reader.offset - (offset - bodyOffset),
      depth: depthForInstruction,
      category,
      pop,
      push,
      targetIndex,
      immediateValue,
      trap,
    });
  }

  return { instructions, declaredLocals };
}

/**
 * Decode a WebAssembly binary into functions and addressable instructions.
 *
 * Never throws: malformed input comes back with `valid: false` and a message,
 * so a student who drops the wrong file gets an explanation rather than a
 * stack trace.
 */
export function disassembleWasm(bytes: Uint8Array): WasmDisassembly {
  const result: WasmDisassembly = {
    valid: false,
    functions: [],
    totalBytes: bytes.length,
    totalInstructions: 0,
    warnings: [],
  };

  if (bytes.length < 8 || !WASM_MAGIC.every((byte, i) => bytes[i] === byte)) {
    return { ...result, error: 'Not a WebAssembly module — missing the \\0asm magic number.' };
  }

  const version = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true);
  if (version !== WASM_VERSION) {
    return { ...result, error: `Unsupported WebAssembly version ${version}.` };
  }

  const reader = new Reader(bytes, 8);
  const types: FuncType[] = [];
  const imports: RawImport[] = [];
  const definedTypeIndices: number[] = [];
  const exportNames = new Map<number, string[]>();
  const bodies: { body: Uint8Array; offset: number }[] = [];
  let nameMaps: FunctionNameMaps = { functions: new Map(), locals: new Map() };

  try {
    while (reader.remaining > 0) {
      const id = reader.u8();
      const size = reader.varuint();
      if (size > reader.remaining) {
        return {
          ...result,
          error: `Section ${id} claims ${size} bytes but only ${reader.remaining} remain.`,
        };
      }
      const offset = reader.offset;
      const payload = reader.take(size);

      if (id === 0) {
        const nameReader = new Reader(payload);
        const sectionName = nameReader.name();
        if (sectionName === 'name') {
          try {
            nameMaps = parseNameSection(payload);
          } catch {
            result.warnings.push('The debug name section could not be parsed.');
          }
        }
      } else if (id === 1) {
        types.push(...parseTypeSection(payload));
      } else if (id === 2) {
        imports.push(...parseImportSection(payload));
      } else if (id === 3) {
        const functionReader = new Reader(payload);
        const count = functionReader.varuint();
        for (let i = 0; i < count; i++) definedTypeIndices.push(functionReader.varuint());
      } else if (id === 7) {
        const exportReader = new Reader(payload);
        const count = exportReader.varuint();
        for (let i = 0; i < count; i++) {
          const name = exportReader.name();
          const kind = exportReader.u8();
          const index = exportReader.varuint();
          if (kind === 0) {
            exportNames.set(index, [...(exportNames.get(index) ?? []), name]);
          }
        }
      } else if (id === 10) {
        const codeReader = new Reader(payload);
        const count = codeReader.varuint();
        for (let i = 0; i < count; i++) {
          const bodySize = codeReader.varuint();
          const bodyOffset = offset + codeReader.offset;
          bodies.push({ body: codeReader.take(bodySize), offset: bodyOffset });
        }
      }
    }
  } catch (err) {
    return {
      ...result,
      error: err instanceof Error ? err.message : 'Failed to parse module',
    };
  }

  const importedFunctions = imports.filter((entry) => entry.kind === 0);
  const functionTypeIndices = [
    ...importedFunctions.map((entry) => entry.typeIndex ?? 0),
    ...definedTypeIndices,
  ];

  const functions: WasmFunction[] = [];

  importedFunctions.forEach((entry, index) => {
    const type = types[entry.typeIndex ?? 0];
    functions.push({
      index,
      name: nameMaps.functions.get(index) ?? `${entry.module}.${entry.field}`,
      exportNames: exportNames.get(index) ?? [],
      imported: true,
      importModule: entry.module,
      importField: entry.field,
      typeIndex: entry.typeIndex ?? 0,
      paramTypes: type?.params ?? [],
      resultTypes: type?.results ?? [],
      locals: (type?.params ?? []).map((localType, localIndex) => ({
        index: localIndex,
        type: localType,
        name: nameMaps.locals.get(index)?.get(localIndex) ?? `param_${localIndex}`,
        isParam: true,
      })),
      offset: 0,
      bodySize: 0,
      instructions: [],
    });
  });

  const predecodedNames = new Map<number, string>();
  functionTypeIndices.forEach((_, index) => {
    const name =
      nameMaps.functions.get(index) ??
      exportNames.get(index)?.[0] ??
      (index < importedFunctions.length
        ? `${importedFunctions[index].module}.${importedFunctions[index].field}`
        : `func_${index}`);
    predecodedNames.set(index, name);
  });

  definedTypeIndices.forEach((typeIndex, definedIndex) => {
    const functionIndex = importedFunctions.length + definedIndex;
    const type = types[typeIndex];
    const body = bodies[definedIndex];

    if (!body) {
      result.warnings.push(`No code body found for function ${functionIndex}.`);
      return;
    }

    let decoded: { instructions: WasmInstruction[]; declaredLocals: { type: string }[] } = {
      instructions: [],
      declaredLocals: [],
    };

    try {
      decoded = decodeBody(
        body.body,
        body.offset,
        functionIndex,
        types,
        functionTypeIndices,
        predecodedNames,
        result.warnings
      );
    } catch (err) {
      result.warnings.push(
        `Function ${predecodedNames.get(functionIndex) ?? functionIndex} could not be decoded: ${
          err instanceof Error ? err.message : 'unknown error'
        }`
      );
    }

    const params = type?.params ?? [];
    const locals: WasmLocal[] = params.map((localType, localIndex) => ({
      index: localIndex,
      type: localType,
      name: nameMaps.locals.get(functionIndex)?.get(localIndex) ?? `param_${localIndex}`,
      isParam: true,
    }));

    decoded.declaredLocals.forEach((declared, declaredIndex) => {
      const localIndex = params.length + declaredIndex;
      locals.push({
        index: localIndex,
        type: declared.type,
        name: nameMaps.locals.get(functionIndex)?.get(localIndex) ?? `local_${declaredIndex}`,
        isParam: false,
      });
    });

    functions.push({
      index: functionIndex,
      name: predecodedNames.get(functionIndex) ?? `func_${functionIndex}`,
      exportNames: exportNames.get(functionIndex) ?? [],
      imported: false,
      typeIndex,
      paramTypes: params,
      resultTypes: type?.results ?? [],
      locals,
      offset: body.offset,
      bodySize: body.body.length,
      instructions: decoded.instructions,
    });

    result.totalInstructions += decoded.instructions.length;
  });

  // Sort by function index; imports and definitions were appended in order
  // already, but a malformed module can leave gaps.
  functions.sort((a, b) => a.index - b.index);

  return {
    ...result,
    valid: !result.error,
    functions,
  };
}

/** Little-endian unsigned LEB128, used by the demo module builder. */
function uleb(value: number): number[] {
  const bytes: number[] = [];
  let remaining = value >>> 0;
  do {
    let byte = remaining & 0x7f;
    remaining >>>= 7;
    if (remaining !== 0) byte |= 0x80;
    bytes.push(byte);
  } while (remaining !== 0);
  return bytes;
}

function wasmName(value: string): number[] {
  const encoded = Array.from(new TextEncoder().encode(value));
  return [...uleb(encoded.length), ...encoded];
}

function section(id: number, payload: number[]): number[] {
  return [id, ...uleb(payload.length), ...payload];
}

/**
 * A tiny valid module used by the pane before a student uploads anything:
 *
 *   fn add(a: i32, b: i32) -> i32 { a + b }
 *   fn main() -> i32 { let sum = add(2, 3); sum }
 *
 * Two functions is enough to demonstrate breakpoints and a non-empty call
 * stack, and every byte is generated here so the demo needs no network fetch.
 */
export function createDemoModule(): Uint8Array {
  const typeSection = section(1, [2, 0x60, 2, 0x7f, 0x7f, 1, 0x7f, 0x60, 0, 1, 0x7f]);
  const functionSection = section(3, [2, 0, 1]);
  const exportSection = section(7, [2, ...wasmName('add'), 0, 0, ...wasmName('main'), 0, 1]);
  const addBody = [
    7, // body size
    0, // no local declarations
    0x20,
    0,
    0x20,
    1,
    0x6a,
    0x0b,
  ];
  const mainBody = [
    14, // body size
    1,
    1,
    0x7f, // one i32 local
    0x41,
    2,
    0x41,
    3,
    0x10,
    0,
    0x21,
    0,
    0x20,
    0,
    0x0b,
  ];
  const codeSection = section(10, [2, ...addBody, ...mainBody]);

  return new Uint8Array([
    ...WASM_MAGIC,
    0x01,
    0x00,
    0x00,
    0x00,
    ...typeSection,
    ...functionSection,
    ...exportSection,
    ...codeSection,
  ]);
}
