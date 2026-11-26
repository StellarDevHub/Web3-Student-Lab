import { describe, expect, it } from 'vitest';

import { createDemoModule, disassembleWasm } from '../wasmDisassembler';
import { WasmOpcodeStepper, type VmValue } from '../WasmOpcodeStepper';

function display(value: VmValue): string {
  return `${value.type}:${String(value.value)}`;
}

describe('WasmOpcodeStepper', () => {
  const disassembly = disassembleWasm(createDemoModule());
  const main = disassembly.functions.find((fn) => fn.name === 'main')!;
  const add = disassembly.functions.find((fn) => fn.name === 'add')!;

  it('advances the operand stack one instruction at a time', () => {
    const stepper = new WasmOpcodeStepper(disassembly, main.index);

    expect(stepper.state.status).toBe('ready');
    expect(stepper.state.frames).toHaveLength(1);
    expect(stepper.state.frames[0].stack).toHaveLength(0);

    stepper.stepForward();
    stepper.stepForward();
    expect(stepper.state.frames[0].stack.map(display)).toEqual(['i32:2', 'i32:3']);
  });

  it('enters a callee frame and returns its result to the caller', () => {
    const stepper = new WasmOpcodeStepper(disassembly, main.index);

    // i32.const 2, i32.const 3, call add
    stepper.stepForward();
    stepper.stepForward();
    stepper.stepForward();

    expect(stepper.state.frames.map((frame) => frame.functionName)).toEqual(['main', 'add']);
    const callee = stepper.state.frames[1];
    expect(callee.locals.map((local) => String(local.value.value))).toEqual(['2', '3']);

    stepper.stepForward();
    stepper.stepForward();
    stepper.stepForward();
    expect(stepper.state.frames[1].stack.map(display)).toEqual(['i32:5']);

    stepper.stepForward(); // function-level end returns to main
    expect(stepper.state.frames.map((frame) => frame.functionName)).toEqual(['main']);
    expect(stepper.state.frames[0].stack.map(display)).toEqual(['i32:5']);
  });

  it('writes the returned value into a local register', () => {
    const stepper = new WasmOpcodeStepper(disassembly, main.index);
    for (let i = 0; i < 8; i++) stepper.stepForward();

    expect(stepper.state.frames[0].locals[0].value).toMatchObject({ type: 'i32', value: 5 });
    expect(stepper.state.frames[0].stack).toHaveLength(0);

    stepper.stepForward(); // local.get
    expect(stepper.state.frames[0].stack.map(display)).toEqual(['i32:5']);

    stepper.stepForward(); // end
    expect(stepper.state.status).toBe('finished');
    expect(stepper.state.frames).toHaveLength(0);
  });

  it('steps backwards exactly through recorded snapshots', () => {
    const stepper = new WasmOpcodeStepper(disassembly, main.index);
    stepper.stepForward();
    stepper.stepForward();
    const beforeBack = stepper.state.frames[0].stack.map(display);

    stepper.stepBackward();
    expect(stepper.state.frames[0].stack.map(display)).toEqual(['i32:2']);
    expect(stepper.canStepBackward).toBe(true);

    stepper.stepBackward();
    expect(stepper.state.frames[0].stack).toHaveLength(0);
    expect(stepper.canStepBackward).toBe(false);
    expect(beforeBack).toEqual(['i32:2', 'i32:3']);
  });

  it('pauses before executing the next breakpoint instruction', () => {
    const stepper = new WasmOpcodeStepper(disassembly, main.index);
    const localSet = main.instructions.find((instruction) => instruction.mnemonic === 'local.set')!;
    const breakpoints = new Set([localSet.offset]);

    const state = stepper.runToBreakpoint(breakpoints);

    expect(state.status).toBe('ready');
    expect(stepper.currentInstruction?.offset).toBe(localSet.offset);
    expect(state.frames[0].stack.map(display)).toEqual(['i32:5']);
  });

  it('resets to a clean initial frame', () => {
    const stepper = new WasmOpcodeStepper(disassembly, main.index);
    stepper.stepForward();
    stepper.stepForward();

    const state = stepper.reset(add.index);
    expect(state.executed).toBe(0);
    expect(state.frames[0].functionName).toBe('add');
    expect(state.frames[0].stack).toHaveLength(0);
    expect(stepper.canStepBackward).toBe(false);
  });
});
