/**
 * Progress model for client-side Groth16 proving (FE-096).
 *
 * Proof generation runs in `workers/zk-prover.worker.ts` and is reported to the
 * UI as three user-visible stages:
 *
 *   witness   — Circom witness calculation (`snarkjs.wtns.calculate`)
 *   fft       — QAP construction: the IFFT/FFT passes over A, B and C
 *   synthesis — multi-exponentiations that assemble the proof points
 *
 * snarkjs does not expose progress callbacks, but `groth16.prove` reports each
 * phase through its logger. `classifyProverLog` maps those log lines onto the
 * stages above so the worker can stream monotonic progress to the main thread.
 */

import type { SnarkjsGroth16Proof, SorobanGroth16Call } from './sorobanProof';

export type ProofStage = 'loading' | 'witness' | 'fft' | 'synthesis' | 'done';

/** Stage order and the share of the overall progress bar each one covers. */
export const PROOF_STAGES: ReadonlyArray<{
  stage: Exclude<ProofStage, 'loading' | 'done'>;
  label: string;
  start: number;
  end: number;
}> = [
  { stage: 'witness', label: 'Witness generation', start: 0, end: 30 },
  { stage: 'fft', label: 'FFT computation', start: 30, end: 60 },
  { stage: 'synthesis', label: 'Proof synthesis', start: 60, end: 100 },
];

/**
 * Prover log checkpoints in the order `groth16.prove` emits them. Each one
 * advances its stage; a line that matches none is ignored.
 */
const PROVER_CHECKPOINTS: ReadonlyArray<{ pattern: RegExp; stage: 'fft' | 'synthesis' }> = [
  { pattern: /reading wtns/i, stage: 'fft' },
  { pattern: /reading coeffs/i, stage: 'fft' },
  { pattern: /building abc/i, stage: 'fft' },
  { pattern: /ifft a\b/i, stage: 'fft' },
  { pattern: /\bfft a\b/i, stage: 'fft' },
  { pattern: /ifft b\b/i, stage: 'fft' },
  { pattern: /\bfft b\b/i, stage: 'fft' },
  { pattern: /ifft c\b/i, stage: 'fft' },
  { pattern: /\bfft c\b/i, stage: 'fft' },
  { pattern: /join abc/i, stage: 'fft' },
  { pattern: /reading a points/i, stage: 'synthesis' },
  { pattern: /reading b1 points/i, stage: 'synthesis' },
  { pattern: /reading b2 points/i, stage: 'synthesis' },
  { pattern: /reading c points/i, stage: 'synthesis' },
  { pattern: /reading h points/i, stage: 'synthesis' },
  { pattern: /multiexp a\b/i, stage: 'synthesis' },
  { pattern: /multiexp b1\b/i, stage: 'synthesis' },
  { pattern: /multiexp b2\b/i, stage: 'synthesis' },
  { pattern: /multiexp c\b/i, stage: 'synthesis' },
  { pattern: /multiexp h\b/i, stage: 'synthesis' },
];

function stageBounds(stage: 'witness' | 'fft' | 'synthesis') {
  const found = PROOF_STAGES.find((entry) => entry.stage === stage);
  // PROOF_STAGES covers every stage passed in; the fallback only satisfies the type checker.
  return found ?? { start: 0, end: 100 };
}

/**
 * Maps a snarkjs prover log line to a stage and an overall percentage.
 * Returns `null` for lines that are not progress checkpoints.
 */
export function classifyProverLog(
  message: string,
): { stage: 'fft' | 'synthesis'; progress: number } | null {
  const index = PROVER_CHECKPOINTS.findIndex((checkpoint) => checkpoint.pattern.test(message));
  if (index === -1) return null;

  const { stage } = PROVER_CHECKPOINTS[index];
  const inStage = PROVER_CHECKPOINTS.filter((checkpoint) => checkpoint.stage === stage);
  const position = inStage.indexOf(PROVER_CHECKPOINTS[index]) + 1;
  const { start, end } = stageBounds(stage);
  const progress = Math.round(start + ((end - start) * position) / (inStage.length + 1));
  return { stage, progress };
}

/** Overall percentage at the beginning of a stage. */
export function stageStartProgress(stage: 'witness' | 'fft' | 'synthesis'): number {
  return stageBounds(stage).start;
}

// ── Worker message protocol ────────────────────────────────────────────────

/** Circom circuit artifacts. URLs are fetched inside the worker. */
export interface CircuitArtifacts {
  /** URL of the circuit's witness-calculator `.wasm`. */
  wasmUrl: string;
  /** URL of the Groth16 proving key `.zkey`. */
  zkeyUrl: string;
}

export type CircuitInput = Record<string, string | number | bigint | Array<string | number | bigint>>;

export interface ZkProveRequest {
  id: number;
  type: 'prove';
  input: CircuitInput;
  artifacts: CircuitArtifacts;
}

export interface ZkProofResult {
  proof: SnarkjsGroth16Proof;
  publicSignals: string[];
  /** Arguments ready for `verify_completion` on the Soroban verifier. */
  soroban: SorobanGroth16Call;
}

export type ZkProverMessage =
  | { id: number; type: 'progress'; stage: ProofStage; progress: number; message?: string }
  | ({ id: number; type: 'result' } & ZkProofResult)
  | { id: number; type: 'error'; error: string };
