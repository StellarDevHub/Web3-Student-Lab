/// <reference lib="webworker" />

/**
 * Playground compile / simulation worker.
 *
 * All logic lives in `compileWorkerRuntime.ts`; this file only wires it to the
 * worker global. The page owns the worker's lifetime (see
 * `usePlaygroundExecution`): it terminates the worker on navigation, on
 * cancel, on watchdog timeout and after a fixed number of runs, which is the
 * only way to guarantee every WebAssembly instance and linear-memory buffer in
 * this thread is released.
 */

import type { CancellableWorkerInbound, CancellableWorkerResponse } from './cancellationTypes';
import { createCompileWorkerRuntime } from './compileWorkerRuntime';

type WorkerSelf = typeof self & {
  postMessage(message: unknown): void;
  close(): void;
};
const workerSelf = self as WorkerSelf;

const runtime = createCompileWorkerRuntime({
  post: (message: CancellableWorkerResponse) => workerSelf.postMessage(message),
  close: () => workerSelf.close(),
});

workerSelf.addEventListener('message', (event: MessageEvent<CancellableWorkerInbound>) => {
  void runtime.handle(event.data);
});

export {};
