/**
 * Test-only helper: compiles WAT source to raw WASM bytes using `wabt`.
 * Kept out of `src/` since it's purely a test fixture factory, not part of
 * the sandbox engine itself.
 */
import wabtInit from 'wabt';

let wabtPromise: ReturnType<typeof wabtInit> | null = null;

async function getWabt() {
  if (!wabtPromise) wabtPromise = wabtInit();
  return wabtPromise;
}

export async function compileWat(wat: string): Promise<Buffer> {
  const wabt = await getWabt();
  const module = wabt.parseWat('fixture.wat', wat);
  const { buffer } = module.toBinary({});
  module.destroy();
  return Buffer.from(buffer);
}

export async function compileWatToBase64(wat: string): Promise<string> {
  const buf = await compileWat(wat);
  return buf.toString('base64');
}

/** Simple pure function: add(a, b) -> a + b. No memory, no imports. */
export const WAT_ADD = `(module
  (func (export "add") (param i32 i32) (result i32)
    local.get 0
    local.get 1
    i32.add))`;

/** Infinite loop that never returns on its own — must be caught by gas metering. */
export const WAT_INFINITE_LOOP = `(module
  (func (export "run") (result i32)
    (local $i i32)
    (loop $top
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      br $top)
    (i32.const 0)))`;

/** Defines a local memory with an explicit maximum that fits the sandbox budget. */
export const WAT_MEMORY_WITHIN_BUDGET = `(module
  (memory (export "memory") 1 16)
  (func (export "touch") (result i32)
    (i32.load (i32.const 0))))`;

/** Defines a local memory whose maximum exceeds the 128MB sandbox budget (4096 pages = 256MB). */
export const WAT_MEMORY_OVER_BUDGET = `(module
  (memory (export "memory") 1 4096)
  (func (export "touch") (result i32)
    (i32.load (i32.const 0))))`;

/** Defines a local memory with NO declared maximum — unbounded, must be rejected. */
export const WAT_MEMORY_UNBOUNDED = `(module
  (memory (export "memory") 1)
  (func (export "touch") (result i32)
    (i32.load (i32.const 0))))`;

/** Imports memory from the host so the sandbox can supply a capped instance. */
export const WAT_IMPORTED_MEMORY = `(module
  (import "env" "memory" (memory 1))
  (func (export "touch") (result i32)
    (i32.load (i32.const 0))))`;

/** Attempts to import a disallowed host function — must be rejected pre-instantiation. */
export const WAT_DISALLOWED_IMPORT = `(module
  (import "env" "print" (func $print (param i32)))
  (func (export "run")
    (call $print (i32.const 42))))`;

/** Traps deliberately (unreachable) to exercise the "trap" termination path. */
export const WAT_TRAP = `(module
  (func (export "run") (result i32)
    unreachable))`;
