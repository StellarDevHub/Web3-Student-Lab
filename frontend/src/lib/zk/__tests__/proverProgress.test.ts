import { describe, expect, it } from 'vitest';
import { classifyProverLog, PROOF_STAGES, stageStartProgress } from '../proverProgress';

// Log lines emitted by snarkjs groth16.prove, in order.
const SNARKJS_PROVE_LOG = [
  'Reading Wtns',
  'Reading Coeffs',
  'Building ABC',
  'IFFT A',
  'FFT A',
  'IFFT B',
  'FFT B',
  'IFFT C',
  'FFT C',
  'Join ABC',
  'Reading A Points',
  'Reading B1 Points',
  'Reading B2 Points',
  'Reading C Points',
  'Reading H Points',
  'Multiexp A',
  'Multiexp B1',
  'Multiexp B2',
  'Multiexp C',
  'Multiexp H',
];

describe('classifyProverLog', () => {
  it('maps FFT/QAP lines to the fft stage and multiexp lines to synthesis', () => {
    expect(classifyProverLog('IFFT A')?.stage).toBe('fft');
    expect(classifyProverLog('FFT C')?.stage).toBe('fft');
    expect(classifyProverLog('Join ABC')?.stage).toBe('fft');
    expect(classifyProverLog('Reading H Points')?.stage).toBe('synthesis');
    expect(classifyProverLog('Multiexp B2')?.stage).toBe('synthesis');
  });

  it('ignores lines that are not checkpoints', () => {
    expect(classifyProverLog('Start Proving')).toBeNull();
    expect(classifyProverLog('')).toBeNull();
  });

  it('produces strictly increasing progress inside the fft and synthesis bands', () => {
    const steps = SNARKJS_PROVE_LOG.map((line) => classifyProverLog(line));
    expect(steps.every(Boolean)).toBe(true);

    const values = steps.map((step) => step!.progress);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }

    const fft = PROOF_STAGES.find((s) => s.stage === 'fft')!;
    const synthesis = PROOF_STAGES.find((s) => s.stage === 'synthesis')!;
    for (const step of steps) {
      const band = step!.stage === 'fft' ? fft : synthesis;
      expect(step!.progress).toBeGreaterThan(band.start);
      expect(step!.progress).toBeLessThan(band.end);
    }
  });
});

describe('PROOF_STAGES', () => {
  it('covers 0–100 contiguously in witness → fft → synthesis order', () => {
    expect(PROOF_STAGES.map((s) => s.stage)).toEqual(['witness', 'fft', 'synthesis']);
    expect(PROOF_STAGES[0].start).toBe(0);
    expect(PROOF_STAGES[PROOF_STAGES.length - 1].end).toBe(100);
    for (let i = 1; i < PROOF_STAGES.length; i += 1) {
      expect(PROOF_STAGES[i].start).toBe(PROOF_STAGES[i - 1].end);
    }
    expect(stageStartProgress('fft')).toBe(30);
  });
});
