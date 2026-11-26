'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CircuitArtifacts,
  CircuitInput,
  ProofStage,
  ZkProofResult,
  ZkProveRequest,
  ZkProverMessage,
} from '@/lib/zk/proverProgress';

export type ZkProofStatus = 'idle' | 'proving' | 'success' | 'error';

export interface UseZkProofOptions {
  /** Override for tests; defaults to the bundled `zk-prover.worker.ts`. */
  createWorker?: () => Worker;
}

export interface UseZkProofResult {
  status: ZkProofStatus;
  stage: ProofStage | null;
  /** Overall progress, 0–100. */
  progress: number;
  message: string | null;
  result: ZkProofResult | null;
  error: string | null;
  /** Starts proving off the main thread. Resolves with the proof or rejects. */
  generateProof: (input: CircuitInput, artifacts: CircuitArtifacts) => Promise<ZkProofResult>;
  /** Terminates the in-flight proof (if any) and resets state. */
  cancel: () => void;
}

function defaultCreateWorker(): Worker {
  return new Worker(new URL('../workers/zk-prover.worker.ts', import.meta.url), {
    type: 'module',
  });
}

/**
 * Generates Groth16 proofs in a dedicated Web Worker so witness calculation,
 * FFTs and multi-exponentiation never block the UI thread (FE-096).
 */
export function useZkProof({ createWorker = defaultCreateWorker }: UseZkProofOptions = {}): UseZkProofResult {
  const [status, setStatus] = useState<ZkProofStatus>('idle');
  const [stage, setStage] = useState<ProofStage | null>(null);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<ZkProofResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const pendingRef = useRef<{
    id: number;
    resolve: (value: ZkProofResult) => void;
    reject: (reason: Error) => void;
  } | null>(null);
  const createWorkerRef = useRef(createWorker);
  createWorkerRef.current = createWorker;

  const terminate = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  const handleMessage = useCallback(
    (event: MessageEvent<ZkProverMessage>) => {
      const data = event.data;
      const pending = pendingRef.current;
      // Ignore late messages from a cancelled or superseded request.
      if (!pending || data.id !== pending.id) return;

      if (data.type === 'progress') {
        setStage(data.stage);
        setProgress(data.progress);
        setMessage(data.message ?? null);
        return;
      }

      pendingRef.current = null;
      if (data.type === 'result') {
        const { proof, publicSignals, soroban } = data;
        const proofResult: ZkProofResult = { proof, publicSignals, soroban };
        setResult(proofResult);
        setStage('done');
        setProgress(100);
        setStatus('success');
        pending.resolve(proofResult);
      } else {
        setError(data.error);
        setStatus('error');
        pending.reject(new Error(data.error));
      }
    },
    [],
  );

  const ensureWorker = useCallback((): Worker => {
    if (!workerRef.current) {
      const worker = createWorkerRef.current();
      worker.onmessage = handleMessage;
      worker.onerror = (event: ErrorEvent) => {
        const pending = pendingRef.current;
        pendingRef.current = null;
        const reason = event.message || 'The prover worker crashed.';
        setError(reason);
        setStatus('error');
        terminate();
        pending?.reject(new Error(reason));
      };
      workerRef.current = worker;
    }
    return workerRef.current;
  }, [handleMessage, terminate]);

  const cancel = useCallback(() => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    // Terminating is the only way to stop snarkjs mid-proof.
    terminate();
    setStatus('idle');
    setStage(null);
    setProgress(0);
    setMessage(null);
    pending?.reject(new Error('Proof generation cancelled.'));
  }, [terminate]);

  const generateProof = useCallback(
    (input: CircuitInput, artifacts: CircuitArtifacts): Promise<ZkProofResult> => {
      if (pendingRef.current) cancel();

      const id = ++requestIdRef.current;
      setStatus('proving');
      setStage('loading');
      setProgress(0);
      setMessage(null);
      setResult(null);
      setError(null);

      return new Promise<ZkProofResult>((resolve, reject) => {
        pendingRef.current = { id, resolve, reject };
        const request: ZkProveRequest = { id, type: 'prove', input, artifacts };
        try {
          ensureWorker().postMessage(request);
        } catch (postError) {
          pendingRef.current = null;
          const reason = postError instanceof Error ? postError.message : 'Could not start the prover.';
          setError(reason);
          setStatus('error');
          reject(new Error(reason));
        }
      });
    },
    [cancel, ensureWorker],
  );

  useEffect(
    () => () => {
      const pending = pendingRef.current;
      pendingRef.current = null;
      terminate();
      pending?.reject(new Error('Proof generation cancelled.'));
    },
    [terminate],
  );

  return { status, stage, progress, message, result, error, generateProof, cancel };
}
