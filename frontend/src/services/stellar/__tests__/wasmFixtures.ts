/**
 * Hand-assembled WebAssembly modules for simulator tests.
 *
 * GROWING_MODULE (memory defined, min 1 page, no max):
 *   (func (export "grow") (param i32) (result i32) local.get 0 memory.grow)
 *   (func (export "oom")  loop: memory.grow 16 until it returns -1, then `unreachable`
 *                         — mimics a Rust allocator abort on allocation failure)
 *   (func (export "add")  (param i32 i32) (result i32))
 *   (memory (export "memory") 1)
 *
 * IMPORTED_MEMORY_MODULE:
 *   (import "env" "memory" (memory 1))
 *   (func (export "grow") (param i32) (result i32) local.get 0 memory.grow)
 */

const MAGIC = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];

function section(id: number, body: number[]): number[] {
  // All fixture sections are < 128 bytes, so the size fits in one LEB byte.
  if (body.length > 127) throw new Error('fixture section too large');
  return [id, body.length, ...body];
}

function name(value: string): number[] {
  return [value.length, ...Array.from(value, (c) => c.charCodeAt(0))];
}

const TYPES = section(0x01, [
  0x03,
  0x60, 0x01, 0x7f, 0x01, 0x7f, // t0: (i32) -> i32
  0x60, 0x00, 0x00, //             t1: () -> ()
  0x60, 0x02, 0x7f, 0x7f, 0x01, 0x7f, // t2: (i32, i32) -> i32
]);

const GROW_BODY = [0x00, 0x20, 0x00, 0x40, 0x00, 0x0b];
const OOM_BODY = [
  0x00, //             no locals
  0x02, 0x40, //       block
  0x03, 0x40, //         loop
  0x41, 0x10, //           i32.const 16
  0x40, 0x00, //           memory.grow
  0x41, 0x7f, //           i32.const -1
  0x46, //                 i32.eq
  0x0d, 0x01, //           br_if 1 (exit block)
  0x0c, 0x00, //           br 0 (continue loop)
  0x0b, //               end loop
  0x0b, //             end block
  0x00, //             unreachable
  0x0b,
];
const ADD_BODY = [0x00, 0x20, 0x00, 0x20, 0x01, 0x6a, 0x0b];

function body(bytes: number[]): number[] {
  return [bytes.length, ...bytes];
}

export function memoryModule({ minPages = 1, maxPages }: { minPages?: number; maxPages?: number } = {}) {
  const limits = maxPages === undefined ? [0x00, minPages] : [0x01, minPages, maxPages];
  return new Uint8Array([
    ...MAGIC,
    ...TYPES,
    ...section(0x03, [0x03, 0x00, 0x01, 0x02]),
    ...section(0x05, [0x01, ...limits]),
    ...section(0x07, [
      0x04,
      ...name('grow'), 0x00, 0x00,
      ...name('oom'), 0x00, 0x01,
      ...name('add'), 0x00, 0x02,
      ...name('memory'), 0x02, 0x00,
    ]),
    ...section(0x0a, [0x03, ...body(GROW_BODY), ...body(OOM_BODY), ...body(ADD_BODY)]),
  ]);
}

export const GROWING_MODULE = memoryModule();

export const IMPORTED_MEMORY_MODULE = new Uint8Array([
  ...MAGIC,
  ...section(0x01, [0x01, 0x60, 0x01, 0x7f, 0x01, 0x7f]),
  ...section(0x02, [0x01, ...name('env'), ...name('memory'), 0x02, 0x00, 0x01]),
  ...section(0x03, [0x01, 0x00]),
  ...section(0x07, [0x01, ...name('grow'), 0x00, 0x00]),
  ...section(0x0a, [0x01, ...body(GROW_BODY)]),
]);

/** Module importing a host function the simulator does not provide. */
export const HOST_IMPORT_MODULE = new Uint8Array([
  ...MAGIC,
  ...section(0x01, [0x01, 0x60, 0x00, 0x00]),
  ...section(0x02, [0x01, ...name('x'), ...name('missing'), 0x00, 0x00]),
]);
