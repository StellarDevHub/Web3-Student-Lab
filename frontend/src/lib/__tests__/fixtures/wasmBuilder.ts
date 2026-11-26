/**
 * Tiny WebAssembly binary builder for tests. Produces real, validatable
 * modules so the profiler is exercised against the same bytes a compiler
 * would emit.
 */

type Val = 'i32' | 'i64';
const VT: Record<Val, number> = { i32: 0x7f, i64: 0x7e };

export function uleb(value: number): number[] {
  const out: number[] = [];
  let v = value >>> 0;
  do {
    let byte = v & 0x7f;
    v >>>= 7;
    if (v) byte |= 0x80;
    out.push(byte);
  } while (v);
  return out;
}

export function sleb(value: number): number[] {
  const out: number[] = [];
  let v = value | 0;
  for (;;) {
    const byte = v & 0x7f;
    v >>= 7;
    const done = (v === 0 && (byte & 0x40) === 0) || (v === -1 && (byte & 0x40) !== 0);
    out.push(done ? byte : byte | 0x80);
    if (done) return out;
  }
}

const str = (s: string) => [...uleb(s.length), ...Array.from(new TextEncoder().encode(s))];
const vec = (items: number[][]) => [...uleb(items.length), ...items.flat()];
const section = (id: number, body: number[]) => [id, ...uleb(body.length), ...body];

export interface ModuleSpec {
  types: Array<{ params?: Val[]; results?: Val[] }>;
  imports?: Array<{ module: string; field: string; type: number }>;
  functions?: Array<{ type: number; locals?: Array<[number, Val]>; body: number[] }>;
  memory?: { min: number; max?: number };
  globals?: Array<{ type: Val; mutable: boolean; init: number }>;
  exports?: Array<{ name: string; kind: 'func' | 'memory' | 'global'; index: number }>;
  data?: Array<{ offset: number; size: number; fill?: number }>;
  names?: { functions?: Record<number, string>; globals?: Record<number, string> };
}

export function buildModule(spec: ModuleSpec): Uint8Array {
  const out: number[] = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];

  out.push(
    ...section(
      1,
      vec(
        spec.types.map((t) => [
          0x60,
          ...vec((t.params ?? []).map((p) => [VT[p]])),
          ...vec((t.results ?? []).map((r) => [VT[r]])),
        ])
      )
    )
  );

  if (spec.imports?.length) {
    out.push(...section(2, vec(spec.imports.map((i) => [...str(i.module), ...str(i.field), 0x00, ...uleb(i.type)]))));
  }

  const fns = spec.functions ?? [];
  if (fns.length) out.push(...section(3, vec(fns.map((f) => uleb(f.type)))));

  if (spec.memory) {
    const { min, max } = spec.memory;
    out.push(...section(5, vec([max === undefined ? [0x00, ...uleb(min)] : [0x01, ...uleb(min), ...uleb(max)]])));
  }

  if (spec.globals?.length) {
    out.push(
      ...section(
        6,
        vec(spec.globals.map((g) => [VT[g.type], g.mutable ? 1 : 0, g.type === 'i32' ? 0x41 : 0x42, ...sleb(g.init), 0x0b]))
      )
    );
  }

  if (spec.exports?.length) {
    const kind = { func: 0, memory: 2, global: 3 } as const;
    out.push(...section(7, vec(spec.exports.map((e) => [...str(e.name), kind[e.kind], ...uleb(e.index)]))));
  }

  if (fns.length) {
    out.push(
      ...section(
        10,
        vec(
          fns.map((f) => {
            const locals = vec((f.locals ?? []).map(([n, t]) => [...uleb(n), VT[t]]));
            const body = [...locals, ...f.body, 0x0b];
            return [...uleb(body.length), ...body];
          })
        )
      )
    );
  }

  if (spec.data?.length) {
    out.push(
      ...section(
        11,
        vec(
          spec.data.map((d) => [
            0x00,
            0x41,
            ...sleb(d.offset),
            0x0b,
            ...uleb(d.size),
            ...new Array(d.size).fill(d.fill ?? 0),
          ])
        )
      )
    );
  }

  if (spec.names) {
    const subs: number[] = [];
    const nameMap = (map: Record<number, string>) =>
      vec(
        Object.entries(map)
          .map(([k, v]) => [Number(k), v] as const)
          .sort((a, b) => a[0] - b[0])
          .map(([k, v]) => [...uleb(k), ...str(v)])
      );
    if (spec.names.functions) subs.push(...section(1, nameMap(spec.names.functions)));
    if (spec.names.globals) subs.push(...section(7, nameMap(spec.names.globals)));
    out.push(...section(0, [...str('name'), ...subs]));
  }

  return new Uint8Array(out);
}

// ── Instruction helpers ─────────────────────────────────────────────────────

export const op = {
  call: (i: number) => [0x10, ...uleb(i)],
  globalGet: (i: number) => [0x23, ...uleb(i)],
  globalSet: (i: number) => [0x24, ...uleb(i)],
  localGet: (i: number) => [0x20, ...uleb(i)],
  localTee: (i: number) => [0x22, ...uleb(i)],
  i32: (v: number) => [0x41, ...sleb(v)],
  i64: (v: number) => [0x42, ...sleb(v)],
  i32Sub: [0x6b],
  i32Add: [0x6a],
  drop: [0x1a],
  memoryGrow: [0x40, 0x00],
  /** LLVM shadow-stack prologue + epilogue around `inner`. */
  frame: (sp: number, bytes: number, inner: number[] = []) => [
    0x23, ...uleb(sp), 0x41, ...sleb(bytes), 0x6b, 0x24, ...uleb(sp),
    ...inner,
    0x23, ...uleb(sp), 0x41, ...sleb(bytes), 0x6a, 0x24, ...uleb(sp),
  ],
};

/**
 * A Soroban-shaped contract:
 *   imports env.log (i64)->i64
 *   0 env.log (import)
 *   1 deposit (export)  — 256 B frame, calls 3 (alloc) and 2 (helper)
 *   2 helper            — 8 KB frame (hotspot), calls env.log
 *   3 alloc             — grows memory by `growPages`
 *   4 recurse (export)  — calls itself
 * memory 17 pages (stack-first: 1 MB stack, data at 1 MB), global 0 = __stack_pointer
 */
export function sorobanLikeContract({
  dataBytes = 1024,
  growPages = 1,
}: { dataBytes?: number; growPages?: number } = {}): Uint8Array {
  const SP = 0;
  const STACK_TOP = 1024 * 1024;
  return buildModule({
    types: [{ params: ['i64'], results: ['i64'] }, { results: ['i64'] }, {}],
    imports: [{ module: 'env', field: 'log', type: 0 }],
    functions: [
      { type: 1, body: op.frame(SP, 256, [...op.call(3), ...op.call(2), ...op.i64(2)]) },
      { type: 2, locals: [[2, 'i64']], body: op.frame(SP, 8192, [...op.i64(1), ...op.call(0), ...op.drop]) },
      { type: 2, body: [...op.i32(growPages), ...op.memoryGrow, ...op.drop] },
      { type: 2, body: [...op.call(4)] },
    ],
    memory: { min: 17 },
    globals: [{ type: 'i32', mutable: true, init: STACK_TOP }],
    exports: [
      { name: 'memory', kind: 'memory', index: 0 },
      { name: 'deposit', kind: 'func', index: 1 },
      { name: 'recurse', kind: 'func', index: 4 },
    ],
    data: dataBytes ? [{ offset: STACK_TOP, size: dataBytes, fill: 0x61 }] : [],
    names: {
      functions: { 0: 'env.log', 1: 'deposit', 2: 'helper', 3: 'alloc', 4: 'recurse' },
      globals: { 0: '__stack_pointer' },
    },
  });
}
