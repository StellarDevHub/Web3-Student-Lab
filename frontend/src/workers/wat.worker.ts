/**
 * WAT disassembly worker (Issue #1160).
 *
 * wabt is a WebAssembly build of the C++ toolkit; instantiating it and
 * disassembling a contract takes long enough to drop frames, so it runs off the
 * main thread. The structural analysis in `lib/wasmAnalyzer` stays synchronous
 * on the main thread — it walks section headers and finishes in microseconds.
 *
 * wabt is loaded lazily and treated as optional: if it is not installed the
 * worker reports that rather than failing to start, and the analyzer half of
 * the page keeps working.
 */

export interface WatRequest {
  id: number;
  bytes: ArrayBuffer;
}

export type WatResponse =
  | { id: number; ok: true; wat: string }
  | { id: number; ok: false; error: string };

type WabtModule = {
  readWasm: (bytes: Uint8Array, options: { readDebugNames: boolean }) => {
    toText: (options: { foldExprs: boolean; inlineExport: boolean }) => string;
    destroy: () => void;
  };
};

let wabtPromise: Promise<WabtModule> | null = null;

async function loadWabt(): Promise<WabtModule> {
  if (!wabtPromise) {
    wabtPromise = import(/* webpackIgnore: true */ 'wabt')
      .then((mod) => (mod.default ?? mod)())
      .catch(() => {
        // Reset so a later attempt can retry rather than caching the failure.
        wabtPromise = null;
        throw new Error(
          'wabt is not available. Install it with `npm install wabt` to enable WAT disassembly; structural analysis works without it.',
        );
      }) as Promise<WabtModule>;
  }

  return wabtPromise;
}

self.onmessage = async (event: MessageEvent<WatRequest>) => {
  const { id, bytes } = event.data;

  try {
    const wabt = await loadWabt();
    const wasmModule = wabt.readWasm(new Uint8Array(bytes), { readDebugNames: true });

    try {
      // foldExprs makes the output read as nested s-expressions rather than a
      // flat stack machine, which is far easier to follow.
      const wat = wasmModule.toText({ foldExprs: true, inlineExport: false });
      const response: WatResponse = { id, ok: true, wat };
      self.postMessage(response);
    } finally {
      // wabt allocates in its own heap; without this each disassembly leaks.
      wasmModule.destroy();
    }
  } catch (err) {
    const response: WatResponse = {
      id,
      ok: false,
      error: err instanceof Error ? err.message : 'Disassembly failed',
    };
    self.postMessage(response);
  }
};
