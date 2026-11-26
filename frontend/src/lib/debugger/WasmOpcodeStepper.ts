/**
 * Opcode-level WASM stepper (Issue #1784).
 *
 * A real Soroban VM is not available in the browser, so this is an honest
 * static simulator: it executes the decoded instruction stream, tracks the
 * operand stack, locals and call frames, and resolves integer arithmetic and
 * branches when the operands are statically known. Values that can only come
 * from the host (storage, `env` imports, memory loads) are shown as `?` rather
 * than invented.
 *
 * The point is debugging control flow and stack discipline — the things that
 * make a panicking contract hard to reason about — not pretending to be a
 * ledger. Every step is recorded by `VMSnapshotManager`, which is what makes
 * stepping backwards exact instead of an attempted opcode inversion.
 */

import { VMSnapshotManager } from './SnapshotManager';
import type { WasmDisassembly, WasmFunction, WasmInstruction, WasmLocal } from './wasmDisassembler';

export type VmValueType =
  'i32' | 'i64' | 'f32' | 'f64' | 'v128' | 'funcref' | 'externref' | 'unknown';

export interface VmValue {
  type: VmValueType;
  value: number | bigint | string | null;
}

export interface VmLocal extends WasmLocal {
  value: VmValue;
}

export interface VmFrame {
  functionIndex: number;
  functionName: string;
  /** Index of the next instruction to execute in the function's listing. */
  pc: number;
  locals: VmLocal[];
  stack: VmValue[];
}

export interface WasmVmState {
  frames: VmFrame[];
  status: 'ready' | 'finished' | 'trapped';
  note: string;
  executed: number;
}

function normalizeType(type: string): VmValueType {
  return (
    ['i32', 'i64', 'f32', 'f64', 'v128', 'funcref', 'externref'].includes(type) ? type : 'unknown'
  ) as VmValueType;
}

function zeroValue(type: string): VmValue {
  const normalized = normalizeType(type);
  if (normalized === 'i32' || normalized === 'f32') return { type: normalized, value: 0 };
  if (normalized === 'i64') return { type: normalized, value: BigInt(0) };
  if (normalized === 'f64') return { type: normalized, value: 0 };
  return { type: normalized, value: null };
}

function cloneValue(value: VmValue): VmValue {
  return { ...value };
}

function cloneLocals(locals: VmLocal[]): VmLocal[] {
  return locals.map((local: VmLocal) => ({ ...local, value: cloneValue(local.value) }));
}

function cloneFrame(frame: VmFrame): VmFrame {
  return {
    ...frame,
    locals: cloneLocals(frame.locals),
    stack: frame.stack.map(cloneValue),
  };
}

function cloneState(state: WasmVmState): WasmVmState {
  return {
    ...state,
    frames: state.frames.map(cloneFrame),
  };
}

function pop(frame: VmFrame): VmValue {
  return frame.stack.pop() ?? { type: 'unknown', value: null };
}

function push(frame: VmFrame, value: VmValue): void {
  frame.stack.push(value);
}

function asI32(value: VmValue): number | null {
  return value.type === 'i32' && typeof value.value === 'number' ? value.value | 0 : null;
}

function asI64(value: VmValue): bigint | null {
  return value.type === 'i64' && typeof value.value === 'bigint' ? value.value : null;
}

function asF64(value: VmValue): number | null {
  return (value.type === 'f32' || value.type === 'f64') && typeof value.value === 'number'
    ? value.value
    : null;
}

function truthy(value: VmValue): boolean {
  if (typeof value.value === 'number') return value.value !== 0;
  if (typeof value.value === 'bigint') return value.value !== BigInt(0);
  return value.value !== null;
}

function unknownOf(type: string): VmValue {
  return { type: normalizeType(type), value: null };
}

/** Type a load/store mnemonic returns, e.g. `i64.load8_u` → i64. */
function memoryResultType(mnemonic: string): VmValueType {
  if (mnemonic.startsWith('i32.')) return 'i32';
  if (mnemonic.startsWith('i64.')) return 'i64';
  if (mnemonic.startsWith('f32.')) return 'f32';
  if (mnemonic.startsWith('f64.')) return 'f64';
  return 'unknown';
}

function conversionResultType(mnemonic: string): VmValueType {
  if (mnemonic.startsWith('i32.')) return 'i32';
  if (mnemonic.startsWith('i64.')) return 'i64';
  if (mnemonic.startsWith('f32.')) return 'f32';
  if (mnemonic.startsWith('f64.')) return 'f64';
  return 'unknown';
}

const I32_COMPARISONS: Record<string, (a: number, b: number) => boolean> = {
  'i32.eq': (a, b) => a === b,
  'i32.ne': (a, b) => a !== b,
  'i32.lt_s': (a, b) => a < b,
  'i32.lt_u': (a, b) => a >>> 0 < b >>> 0,
  'i32.gt_s': (a, b) => a > b,
  'i32.gt_u': (a, b) => a >>> 0 > b >>> 0,
  'i32.le_s': (a, b) => a <= b,
  'i32.le_u': (a, b) => a >>> 0 <= b >>> 0,
  'i32.ge_s': (a, b) => a >= b,
  'i32.ge_u': (a, b) => a >>> 0 >= b >>> 0,
};

const I64_COMPARISONS: Record<string, (a: bigint, b: bigint) => boolean> = {
  'i64.eq': (a, b) => a === b,
  'i64.ne': (a, b) => a !== b,
  'i64.lt_s': (a, b) => a < b,
  'i64.lt_u': (a, b) => BigInt.asUintN(64, a) < BigInt.asUintN(64, b),
  'i64.gt_s': (a, b) => a > b,
  'i64.gt_u': (a, b) => BigInt.asUintN(64, a) > BigInt.asUintN(64, b),
  'i64.le_s': (a, b) => a <= b,
  'i64.le_u': (a, b) => BigInt.asUintN(64, a) <= BigInt.asUintN(64, b),
  'i64.ge_s': (a, b) => a >= b,
  'i64.ge_u': (a, b) => BigInt.asUintN(64, a) >= BigInt.asUintN(64, b),
};

const FLOAT_COMPARISONS: Record<string, (a: number, b: number) => boolean> = {
  eq: (a, b) => a === b,
  ne: (a, b) => a !== b,
  lt: (a, b) => a < b,
  gt: (a, b) => a > b,
  le: (a, b) => a <= b,
  ge: (a, b) => a >= b,
};

function runI32Binary(op: string, a: number, b: number, state: WasmVmState): VmValue | null {
  switch (op) {
    case 'add':
      return { type: 'i32', value: (a + b) | 0 };
    case 'sub':
      return { type: 'i32', value: (a - b) | 0 };
    case 'mul':
      return { type: 'i32', value: Math.imul(a, b) };
    case 'div_s':
      if (b === 0) {
        state.status = 'trapped';
        state.note = 'integer divide by zero (i32.div_s)';
        return null;
      }
      return { type: 'i32', value: (a / b) | 0 };
    case 'div_u':
      if (b === 0) {
        state.status = 'trapped';
        state.note = 'integer divide by zero (i32.div_u)';
        return null;
      }
      return { type: 'i32', value: ((a >>> 0) / (b >>> 0)) | 0 };
    case 'rem_s':
      if (b === 0) {
        state.status = 'trapped';
        state.note = 'integer divide by zero (i32.rem_s)';
        return null;
      }
      return { type: 'i32', value: (a % b) | 0 };
    case 'rem_u':
      if (b === 0) {
        state.status = 'trapped';
        state.note = 'integer divide by zero (i32.rem_u)';
        return null;
      }
      return { type: 'i32', value: ((a >>> 0) % (b >>> 0)) | 0 };
    case 'and':
      return { type: 'i32', value: a & b };
    case 'or':
      return { type: 'i32', value: a | b };
    case 'xor':
      return { type: 'i32', value: a ^ b };
    case 'shl':
      return { type: 'i32', value: a << (b & 31) };
    case 'shr_s':
      return { type: 'i32', value: a >> (b & 31) };
    case 'shr_u':
      return { type: 'i32', value: (a >>> 0) >>> (b & 31) };
    case 'rotl':
      return { type: 'i32', value: (a << (b & 31)) | ((a >>> 0) >>> (32 - (b & 31))) | 0 };
    case 'rotr':
      return { type: 'i32', value: ((a >>> 0) >>> (b & 31)) | (a << (32 - (b & 31))) | 0 };
    default:
      return { type: 'i32', value: null };
  }
}

function runI64Binary(op: string, a: bigint, b: bigint, state: WasmVmState): VmValue | null {
  if (['div_s', 'div_u', 'rem_s', 'rem_u'].includes(op) && b === BigInt(0)) {
    state.status = 'trapped';
    state.note = `integer divide by zero (i64.${op})`;
    return null;
  }

  switch (op) {
    case 'add':
      return { type: 'i64', value: BigInt.asIntN(64, a + b) };
    case 'sub':
      return { type: 'i64', value: BigInt.asIntN(64, a - b) };
    case 'mul':
      return { type: 'i64', value: BigInt.asIntN(64, a * b) };
    case 'div_s':
      return { type: 'i64', value: BigInt.asIntN(64, a / b) };
    case 'div_u':
      return {
        type: 'i64',
        value: BigInt.asIntN(64, BigInt.asUintN(64, a) / BigInt.asUintN(64, b)),
      };
    case 'rem_s':
      return { type: 'i64', value: BigInt.asIntN(64, a % b) };
    case 'rem_u':
      return {
        type: 'i64',
        value: BigInt.asIntN(64, BigInt.asUintN(64, a) % BigInt.asUintN(64, b)),
      };
    case 'and':
      return { type: 'i64', value: BigInt.asIntN(64, a & b) };
    case 'or':
      return { type: 'i64', value: BigInt.asIntN(64, a | b) };
    case 'xor':
      return { type: 'i64', value: BigInt.asIntN(64, a ^ b) };
    case 'shl':
      return { type: 'i64', value: BigInt.asIntN(64, a << (b & BigInt(63))) };
    case 'shr_s':
      return { type: 'i64', value: BigInt.asIntN(64, a >> (b & BigInt(63))) };
    case 'shr_u':
      return { type: 'i64', value: BigInt.asIntN(64, BigInt.asUintN(64, a) >> (b & BigInt(63))) };
    default:
      return { type: 'i64', value: null };
  }
}

export class WasmOpcodeStepper {
  private readonly functionMap = new Map<number, WasmFunction>();
  private readonly history: VMSnapshotManager<WasmVmState>;
  private activeFunctionIndex: number;

  constructor(
    private readonly disassembly: WasmDisassembly,
    functionIndex?: number
  ) {
    for (const fn of disassembly.functions) this.functionMap.set(fn.index, fn);

    const initialIndex =
      functionIndex ??
      disassembly.functions.find((fn) => !fn.imported && fn.instructions.length > 0)?.index ??
      disassembly.functions[0]?.index ??
      0;

    this.activeFunctionIndex = initialIndex;
    this.history = new VMSnapshotManager<WasmVmState>(this.buildInitialState(initialIndex));
  }

  get state(): WasmVmState {
    return this.history.current;
  }

  get activeFunction(): WasmFunction | undefined {
    return this.functionMap.get(this.activeFunctionIndex);
  }

  get currentFunction(): WasmFunction | undefined {
    const frame = this.state.frames[this.state.frames.length - 1];
    return frame ? this.functionMap.get(frame.functionIndex) : undefined;
  }

  get currentInstruction(): WasmInstruction | undefined {
    const frame = this.state.frames[this.state.frames.length - 1];
    const fn = frame ? this.functionMap.get(frame.functionIndex) : undefined;
    return frame && fn ? fn.instructions[frame.pc] : undefined;
  }

  get canStepBackward(): boolean {
    return this.history.canGoBack;
  }

  get canStepForward(): boolean {
    return this.state.status === 'ready';
  }

  get stepCount(): number {
    return this.history.currentIndex;
  }

  private buildInitialState(functionIndex: number): WasmVmState {
    const fn = this.functionMap.get(functionIndex);
    if (!fn) {
      return { frames: [], status: 'finished', note: 'No function selected.', executed: 0 };
    }

    const frame: VmFrame = {
      functionIndex,
      functionName: fn.name,
      pc: 0,
      locals: fn.locals.map((local) => ({
        ...local,
        value: zeroValue(local.type),
      })),
      stack: [],
    };

    return {
      frames: [frame],
      status: fn.imported || fn.instructions.length === 0 ? 'finished' : 'ready',
      note:
        fn.imported || fn.instructions.length === 0
          ? 'This function is imported from the host, so it has no body to step through.'
          : '',
      executed: 0,
    };
  }

  /** Restart simulation at the selected function with a clean history. */
  public reset(functionIndex = this.activeFunctionIndex): WasmVmState {
    this.activeFunctionIndex = functionIndex;
    const initial = this.buildInitialState(functionIndex);
    this.history.reset(
      initial,
      `start ${this.functionMap.get(functionIndex)?.name ?? functionIndex}`
    );
    return initial;
  }

  public stepBackward(): WasmVmState {
    return this.history.back();
  }

  public stepForward(): WasmVmState {
    const current = this.history.current;
    if (current.status !== 'ready') return current;

    const next = cloneState(current);
    const frame = next.frames[next.frames.length - 1];
    const fn = this.functionMap.get(frame.functionIndex);
    const instruction = fn?.instructions[frame.pc];

    if (!fn || !instruction) {
      next.status = 'finished';
      next.note = 'Reached the end of the instruction listing.';
      this.history.push(next, 'end');
      return next;
    }

    next.executed += 1;
    this.execute(next, frame, fn, instruction);
    this.history.push(next, `${fn.name} @0x${instruction.offset.toString(16)}`);
    return next;
  }

  /**
   * Continue until the instruction pointer lands on a breakpoint. The
   * breakpoint instruction is paused *before* execution, then executed on the
   * next single step.
   */
  public runToBreakpoint(breakpoints: Set<number>, maxSteps = 20_000): WasmVmState {
    if (breakpoints.size === 0) return this.state;

    let state = this.stepForward();
    for (let i = 0; i < maxSteps && state.status === 'ready'; i++) {
      const instruction = this.instructionAt(state);
      if (instruction && breakpoints.has(instruction.offset)) return state;
      state = this.stepForward();
    }
    return state;
  }

  private instructionAt(state: WasmVmState): WasmInstruction | undefined {
    const frame = state.frames[state.frames.length - 1];
    const fn = frame ? this.functionMap.get(frame.functionIndex) : undefined;
    return frame && fn ? fn.instructions[frame.pc] : undefined;
  }

  private execute(
    state: WasmVmState,
    frame: VmFrame,
    fn: WasmFunction,
    instruction: WasmInstruction
  ): void {
    const advance = () => {
      frame.pc = instruction.index + 1;
    };

    switch (instruction.opcode) {
      case 0x00: // unreachable
        state.status = 'trapped';
        state.note = `trapped at 0x${instruction.offset.toString(16)}: unreachable instruction executed`;
        return;

      case 0x02: // block
      case 0x03: // loop
      case 0x01: // nop
        advance();
        return;

      case 0x04: {
        // if
        const condition = pop(frame);
        if (truthy(condition)) {
          advance();
        } else if (instruction.ifFalseTarget !== undefined) {
          frame.pc = instruction.ifFalseTarget;
        } else {
          frame.pc = fn.instructions.length;
        }
        return;
      }

      case 0x05: // else — skip to the end of the if
        frame.pc = instruction.branchTarget ?? fn.instructions.length;
        return;

      case 0x0b: // end
        if (instruction.depth === 0) this.returnFromFunction(state, frame, fn);
        else advance();
        return;

      case 0x0c: // br
        if (instruction.branchTarget !== undefined) frame.pc = instruction.branchTarget;
        else this.returnFromFunction(state, frame, fn);
        return;

      case 0x0d: {
        // br_if
        const condition = pop(frame);
        if (truthy(condition) && instruction.branchTarget !== undefined) {
          frame.pc = instruction.branchTarget;
        } else {
          advance();
        }
        return;
      }

      case 0x0e: {
        // br_table
        pop(frame);
        if (instruction.branchTarget !== undefined) frame.pc = instruction.branchTarget;
        else this.returnFromFunction(state, frame, fn);
        return;
      }

      case 0x0f: // return
        this.returnFromFunction(state, frame, fn);
        return;

      case 0x10: // call
      case 0x12: // return_call
        this.performCall(state, frame, fn, instruction);
        return;

      case 0x11: // call_indirect
      case 0x13: {
        // return_call_indirect
        const dropped = Math.max(0, instruction.pop);
        for (let i = 0; i < dropped; i++) pop(frame);
        for (let i = 0; i < instruction.push; i++) push(frame, { type: 'unknown', value: null });
        state.note =
          'Indirect calls are simulated: arguments were popped and the return values are unknown.';
        advance();
        return;
      }

      case 0x1a: // drop
        pop(frame);
        advance();
        return;

      case 0x1b: // select
      case 0x1c: {
        const condition = pop(frame);
        const b = pop(frame);
        const a = pop(frame);
        push(frame, truthy(condition) ? a : b);
        advance();
        return;
      }

      case 0x20: {
        // local.get
        const local = frame.locals[parseInt(instruction.immediates, 10)];
        push(frame, local ? cloneValue(local.value) : { type: 'unknown', value: null });
        advance();
        return;
      }

      case 0x21: {
        // local.set
        const local = frame.locals[parseInt(instruction.immediates, 10)];
        const value = pop(frame);
        if (local) local.value = value;
        advance();
        return;
      }

      case 0x22: {
        // local.tee
        const local = frame.locals[parseInt(instruction.immediates, 10)];
        const value = pop(frame);
        if (local) local.value = value;
        push(frame, value);
        advance();
        return;
      }

      case 0x23: // global.get
        push(frame, { type: 'unknown', value: null });
        state.note = 'Globals live in the module instance and are not statically known.';
        advance();
        return;

      case 0x24: // global.set
        pop(frame);
        advance();
        return;

      case 0x25: // table.get
      case 0x26: // table.set
        if (instruction.opcode === 0x25) {
          pop(frame);
          push(frame, { type: 'funcref', value: null });
        } else {
          pop(frame);
          pop(frame);
        }
        advance();
        return;

      case 0x28:
      case 0x29:
      case 0x2a:
      case 0x2b:
      case 0x2c:
      case 0x2d:
      case 0x2e:
      case 0x2f:
      case 0x30:
      case 0x31:
      case 0x32:
      case 0x33:
      case 0x34:
      case 0x35:
        pop(frame); // address
        push(frame, unknownOf(memoryResultType(instruction.mnemonic)));
        state.note = 'Memory reads are not modelled; the loaded value is shown as unknown.';
        advance();
        return;

      case 0x36:
      case 0x37:
      case 0x38:
      case 0x39:
      case 0x3a:
      case 0x3b:
      case 0x3c:
      case 0x3d:
      case 0x3e:
        pop(frame); // value
        pop(frame); // address
        advance();
        return;

      case 0x3f: // memory.size
        push(frame, { type: 'i32', value: null });
        advance();
        return;

      case 0x40: // memory.grow
        pop(frame);
        push(frame, { type: 'i32', value: null });
        advance();
        return;

      case 0x41: // i32.const
        push(frame, { type: 'i32', value: Number(instruction.immediateValue ?? 0) | 0 });
        advance();
        return;

      case 0x42: // i64.const
        push(frame, {
          type: 'i64',
          value:
            typeof instruction.immediateValue === 'bigint' ? instruction.immediateValue : BigInt(0),
        });
        advance();
        return;

      case 0x43: // f32.const
        push(frame, { type: 'f32', value: Number(instruction.immediateValue ?? 0) });
        advance();
        return;

      case 0x44: // f64.const
        push(frame, { type: 'f64', value: Number(instruction.immediateValue ?? 0) });
        advance();
        return;

      case 0x45:
      case 0x50: {
        // i32.eqz / i64.eqz
        const value = pop(frame);
        const compare = instruction.opcode === 0x45 ? asI32(value) : asI64(value);
        push(frame, {
          type: 'i32',
          value: compare === null ? null : compare === 0 || compare === BigInt(0) ? 1 : 0,
        });
        advance();
        return;
      }

      case 0xd0: // ref.null
        push(frame, { type: 'funcref', value: null });
        advance();
        return;

      case 0xd1: {
        // ref.is_null
        const value = pop(frame);
        push(frame, { type: 'i32', value: value.value === null ? 1 : 0 });
        advance();
        return;
      }

      case 0xd2: // ref.func
        push(frame, { type: 'funcref', value: instruction.immediates });
        advance();
        return;

      default:
        break;
    }

    // Numeric ranges.
    if (instruction.opcode >= 0x46 && instruction.opcode <= 0x4f) {
      const b = pop(frame);
      const a = pop(frame);
      const x = asI32(a);
      const y = asI32(b);
      const compare = I32_COMPARISONS[instruction.mnemonic];
      push(frame, {
        type: 'i32',
        value: x === null || y === null || !compare ? null : compare(x, y) ? 1 : 0,
      });
      advance();
      return;
    }

    if (instruction.opcode >= 0x51 && instruction.opcode <= 0x5a) {
      const b = pop(frame);
      const a = pop(frame);
      const x = asI64(a);
      const y = asI64(b);
      const compare = I64_COMPARISONS[instruction.mnemonic];
      push(frame, {
        type: 'i32',
        value: x === null || y === null || !compare ? null : compare(x, y) ? 1 : 0,
      });
      advance();
      return;
    }

    if (instruction.opcode >= 0x5b && instruction.opcode <= 0x66) {
      const b = pop(frame);
      const a = pop(frame);
      const x = asF64(a);
      const y = asF64(b);
      const suffix = instruction.mnemonic.split('.').pop() ?? '';
      const compare = FLOAT_COMPARISONS[suffix];
      push(frame, {
        type: 'i32',
        value: x === null || y === null || !compare ? null : compare(x, y) ? 1 : 0,
      });
      advance();
      return;
    }

    if (instruction.opcode >= 0x67 && instruction.opcode <= 0x69) {
      const value = pop(frame);
      const x = asI32(value);
      if (x === null) {
        push(frame, { type: 'i32', value: null });
        advance();
        return;
      }
      const suffix = instruction.mnemonic.split('.')[1];
      const result =
        suffix === 'clz'
          ? Math.clz32(x)
          : suffix === 'ctz'
            ? x === 0
              ? 32
              : 31 - Math.clz32(x & -x)
            : x.toString(2).replace(/0/g, '').length;
      push(frame, { type: 'i32', value: result });
      advance();
      return;
    }

    if (instruction.opcode >= 0x6a && instruction.opcode <= 0x78) {
      const b = pop(frame);
      const a = pop(frame);
      const x = asI32(a);
      const y = asI32(b);
      const suffix = instruction.mnemonic.split('.')[1];
      const computed = x === null || y === null ? null : runI32Binary(suffix, x, y, state);
      if (state.status === 'trapped') return;
      push(frame, computed ?? { type: 'i32', value: null });
      advance();
      return;
    }

    if (instruction.opcode >= 0x79 && instruction.opcode <= 0x7b) {
      const value = pop(frame);
      const x = asI64(value);
      if (x === null) {
        push(frame, { type: 'i64', value: null });
        advance();
        return;
      }
      const suffix = instruction.mnemonic.split('.')[1];
      const unsigned = BigInt.asUintN(64, x);
      const result =
        suffix === 'clz'
          ? BigInt(unsigned === BigInt(0) ? 64 : 64 - unsigned.toString(2).length)
          : suffix === 'ctz'
            ? BigInt(unsigned === BigInt(0) ? 64 : (unsigned & -unsigned).toString(2).length - 1)
            : BigInt(unsigned.toString(2).replace(/0/g, '').length);
      push(frame, { type: 'i64', value: BigInt.asIntN(64, result) });
      advance();
      return;
    }

    if (instruction.opcode >= 0x7c && instruction.opcode <= 0x8a) {
      const b = pop(frame);
      const a = pop(frame);
      const x = asI64(a);
      const y = asI64(b);
      const suffix = instruction.mnemonic.split('.')[1];
      const computed = x === null || y === null ? null : runI64Binary(suffix, x, y, state);
      if (state.status === 'trapped') return;
      push(frame, computed ?? { type: 'i64', value: null });
      advance();
      return;
    }

    if (
      (instruction.opcode >= 0x8b && instruction.opcode <= 0x91) ||
      (instruction.opcode >= 0x99 && instruction.opcode <= 0x9f)
    ) {
      const value = pop(frame);
      const x = asF64(value);
      const suffix = instruction.mnemonic.split('.')[1];
      const type = instruction.opcode < 0x99 ? 'f32' : 'f64';
      const unary: Record<string, (v: number) => number> = {
        abs: Math.abs,
        neg: (v) => -v,
        ceil: Math.ceil,
        floor: Math.floor,
        trunc: Math.trunc,
        nearest: Math.round,
        sqrt: Math.sqrt,
      };
      push(frame, { type, value: x === null ? null : unary[suffix](x) });
      advance();
      return;
    }

    if (
      (instruction.opcode >= 0x92 && instruction.opcode <= 0x98) ||
      (instruction.opcode >= 0xa0 && instruction.opcode <= 0xa6)
    ) {
      const b = pop(frame);
      const a = pop(frame);
      const x = asF64(a);
      const y = asF64(b);
      const suffix = instruction.mnemonic.split('.')[1];
      const type = instruction.opcode < 0x99 ? 'f32' : 'f64';
      const binary: Record<string, (m: number, n: number) => number> = {
        add: (m, n) => m + n,
        sub: (m, n) => m - n,
        mul: (m, n) => m * n,
        div: (m, n) => m / n,
        min: Math.min,
        max: Math.max,
        copysign: (m, n) => (n < 0 || Object.is(n, -0) ? -Math.abs(m) : Math.abs(m)),
      };
      push(frame, { type, value: x === null || y === null ? null : binary[suffix](x, y) });
      advance();
      return;
    }

    if (instruction.opcode >= 0xa7 && instruction.opcode <= 0xc4) {
      const value = pop(frame);
      const resultType = conversionResultType(instruction.mnemonic);
      let converted: VmValue = { type: resultType, value: null };

      if (instruction.mnemonic === 'i32.wrap_i64' && asI64(value) !== null) {
        converted = { type: 'i32', value: Number(BigInt.asIntN(32, asI64(value)!)) };
      } else if (instruction.mnemonic === 'i64.extend_i32_s' && asI32(value) !== null) {
        converted = { type: 'i64', value: BigInt(asI32(value)!) };
      } else if (instruction.mnemonic === 'i64.extend_i32_u' && asI32(value) !== null) {
        converted = { type: 'i64', value: BigInt(asI32(value)! >>> 0) };
      } else if (instruction.mnemonic === 'f64.promote_f32' && asF64(value) !== null) {
        converted = { type: 'f64', value: asF64(value)! };
      } else if (instruction.mnemonic === 'f32.demote_f64' && asF64(value) !== null) {
        converted = { type: 'f32', value: Math.fround(asF64(value)!) };
      }

      push(frame, converted);
      advance();
      return;
    }

    advance();
  }

  private performCall(
    state: WasmVmState,
    callerFrame: VmFrame,
    _callerFunction: WasmFunction,
    instruction: WasmInstruction
  ): void {
    const calleeIndex = instruction.targetIndex;
    const callee = calleeIndex === undefined ? undefined : this.functionMap.get(calleeIndex);
    const argumentCount = Math.max(0, instruction.pop);
    const args: VmValue[] = [];
    for (let i = 0; i < argumentCount; i++) args.unshift(pop(callerFrame));

    if (!callee || callee.imported || callee.instructions.length === 0) {
      for (let i = 0; i < instruction.push; i++) {
        push(callerFrame, { type: 'unknown', value: null });
      }
      state.note = callee
        ? `${callee.name} is a host import; its result is unknown in the browser simulator.`
        : 'Call target is outside this module; the result is unknown.';
      callerFrame.pc = instruction.index + 1;
      return;
    }

    callerFrame.pc = instruction.index + 1;

    const calleeFrame: VmFrame = {
      functionIndex: callee.index,
      functionName: callee.name,
      pc: 0,
      locals: callee.locals.map((local, localIndex) => ({
        ...local,
        value: localIndex < args.length ? cloneValue(args[localIndex]) : zeroValue(local.type),
      })),
      stack: [],
    };

    state.frames.push(calleeFrame);
    state.note = '';
  }

  private returnFromFunction(state: WasmVmState, frame: VmFrame, fn: WasmFunction): void {
    const results = frame.stack.slice(-fn.resultTypes.length);
    state.frames.pop();

    const caller = state.frames[state.frames.length - 1];
    if (!caller) {
      state.status = 'finished';
      state.note = `Returned from ${fn.name} with ${results.length} result value(s).`;
      return;
    }

    for (const value of results) push(caller, cloneValue(value));
    state.note = `Returned from ${fn.name}.`;
  }
}
