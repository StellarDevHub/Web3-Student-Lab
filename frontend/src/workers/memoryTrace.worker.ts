/// <reference lib="webworker" />

/**
 * Executes a contract's exports in a memory-capped session and records
 * linear-memory growth (FE-071). Runs off the main thread so a guest that
 * loops forever can be terminated by the page without freezing the UI.
 */

import { traceMemoryGrowth, type GrowthTrace, type TraceOptions } from '../lib/wasmMemoryProfiler';

export interface MemoryTraceRequest {
  id: number;
  bytes: ArrayBuffer;
  options?: TraceOptions;
}

export type MemoryTraceResponse =
  | { id: number; ok: true; trace: GrowthTrace }
  | { id: number; ok: false; error: string };

self.onmessage = async (event: MessageEvent<MemoryTraceRequest>) => {
  const { id, bytes, options } = event.data;
  try {
    const trace = await traceMemoryGrowth(new Uint8Array(bytes), options);
    const response: MemoryTraceResponse = { id, ok: true, trace };
    self.postMessage(response);
  } catch (err) {
    const response: MemoryTraceResponse = {
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(response);
  }
};

export {};
