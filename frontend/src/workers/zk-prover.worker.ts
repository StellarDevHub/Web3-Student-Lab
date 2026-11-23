/**
 * Zero-knowledge prover worker (FE-096).
 *
 * Circom witness calculation and Groth16 proving are CPU-bound for seconds at
 * a time; on the main thread they freeze the page and trigger "Page
 * Unresponsive" dialogs. This worker runs both off-thread and streams
 * progress (witness → FFT → proof synthesis) back to the UI.
 *
 * snarkjs is imported lazily so it is only downloaded when a proof is
 * actually requested.
 */

import {
  classifyProverLog,
  stageStartProgress,
  type ProofStage,
  type ZkProveRequest,
  type ZkProverMessage,
} from '@/lib/zk/proverProgress';
import { toSorobanGroth16Call } from '@/lib/zk/sorobanProof';

type Snarkjs = typeof import(/* webpackIgnore: true */ 'snarkjs');

let snarkjsPromise: Promise<Snarkjs> | null = null;

function loadSnarkjs(): Promise<Snarkjs> {
  if (!snarkjsPromise) {
    snarkjsPromise = import(/* webpackIgnore: true */ 'snarkjs').catch((error: unknown) => {
      // Reset so a later request can retry rather than caching the failure.
      snarkjsPromise = null;
      throw error;
    });
  }
  return snarkjsPromise;
}

const scope = self as unknown as {
  postMessage: (message: ZkProverMessage) => void;
  onmessage: ((event: MessageEvent<ZkProveRequest>) => void) | null;
};

function post(message: ZkProverMessage) {
  scope.postMessage(message);
}

async function prove({ id, input, artifacts }: ZkProveRequest) {
  let lastProgress = 0;
  const report = (stage: ProofStage, progress: number, message?: string) => {
    // Never move the bar backwards, even if snarkjs repeats a log line.
    lastProgress = Math.max(lastProgress, progress);
    post({ id, type: 'progress', stage, progress: lastProgress, message });
  };

  report('loading', 0, 'Loading prover');
  const snarkjs = await loadSnarkjs();

  report('witness', stageStartProgress('witness'), 'Calculating witness');
  const witness: { type: 'mem'; data?: Uint8Array } = { type: 'mem' };
  await snarkjs.wtns.calculate(input, artifacts.wasmUrl, witness);

  report('fft', stageStartProgress('fft'), 'Witness ready');
  const logger = {
    debug: (message: string) => {
      const checkpoint = classifyProverLog(message);
      if (checkpoint) report(checkpoint.stage, checkpoint.progress, message);
    },
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
  const { proof, publicSignals } = await snarkjs.groth16.prove(
    artifacts.zkeyUrl,
    witness,
    logger,
  );

  const soroban = toSorobanGroth16Call(proof, publicSignals);
  report('done', 100, 'Proof generated');
  post({ id, type: 'result', proof, publicSignals, soroban });
}

scope.onmessage = (event: MessageEvent<ZkProveRequest>) => {
  const request = event.data;
  if (!request || request.type !== 'prove') return;

  prove(request).catch((error: unknown) => {
    post({
      id: request.id,
      type: 'error',
      error: error instanceof Error ? error.message : 'Proof generation failed.',
    });
  });
};

export {};
