'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { DiffResult, DiffWorkerRequest, DiffWorkerResponse } from '@/lib/diff/diffTypes';

/**
 * useDiffWorker — runs diff computation on a Web Worker so large multi-file
 * comparisons never block the UI thread.
 *
 * The worker is created lazily on first call (Next.js bundles `diff.worker.ts`
 * via the `new URL(..., import.meta.url)` pattern) and terminated on unmount.
 * Concurrent requests are matched by requestId; stale responses are dropped.
 *
 * @example
 * const computeDiff = useDiffWorker();
 * const result = await computeDiff(studentCode, solutionCode);
 */
export function useDiffWorker(): (original: string, modified: string) => Promise<DiffResult> {
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef(new Map<string, (result: DiffResult) => void>());
  const requestIdRef = useRef(0);

  const getWorker = useCallback((): Worker => {
    if (workerRef.current) return workerRef.current;
    const worker = new Worker(new URL('../lib/diff/diff.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.addEventListener('message', (event: MessageEvent<DiffWorkerResponse>) => {
      const msg = event.data;
      if (msg.type === 'diff-result') {
        const resolve = pendingRef.current.get(msg.requestId);
        if (resolve) {
          pendingRef.current.delete(msg.requestId);
          resolve(msg.result);
        }
      } else if (msg.type === 'diff-error') {
        const resolve = pendingRef.current.get(msg.requestId);
        if (resolve) {
          pendingRef.current.delete(msg.requestId);
          resolve({ chunks: [], identical: true });
        }
      }
    });
    workerRef.current = worker;
    return worker;
  }, []);

  // Terminate the worker on unmount so no work leaks into the next page.
  useEffect(() => {
    const worker = workerRef.current;
    return () => {
      worker?.terminate();
      pendingRef.current.clear();
    };
  }, []);

  return useCallback(
    (original: string, modified: string): Promise<DiffResult> => {
      if (original === modified) {
        return Promise.resolve({ chunks: [], identical: true });
      }
      const worker = getWorker();
      const requestId = `diff-${++requestIdRef.current}`;
      return new Promise<DiffResult>((resolve) => {
        pendingRef.current.set(requestId, resolve);
        const payload: DiffWorkerRequest = { type: 'diff', requestId, original, modified };
        worker.postMessage(payload);
      });
    },
    [getWorker]
  );
}
