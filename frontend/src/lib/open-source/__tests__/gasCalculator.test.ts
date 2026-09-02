import { describe, it, expect } from 'vitest';
import {
  analyzeGasBudget,
  calculateGasEstimate,
  validateSourceCode,
  DEFAULT_CONTRACT_SAMPLE,
} from '../gasCalculator';

describe('gasCalculator', () => {
  it('validates empty source code', () => {
    expect(validateSourceCode('').valid).toBe(false);
    expect(validateSourceCode(DEFAULT_CONTRACT_SAMPLE).valid).toBe(true);
  });

  it('calculates gas estimate with budget analysis', () => {
    const result = calculateGasEstimate(DEFAULT_CONTRACT_SAMPLE, 'classroom');
    expect(result.estimate.gas).toBeGreaterThan(0);
    expect(result.strategies.length).toBeGreaterThan(1);
    expect(result.budget.preset).toBe('classroom');
    expect(result.recommendation.length).toBeGreaterThan(0);
  });

  it('analyzes budget headroom', () => {
    const within = analyzeGasBudget(5000, 'classroom');
    expect(within.withinBudget).toBe(true);
    expect(within.headroom).toBe(3500);

    const over = analyzeGasBudget(15000, 'classroom');
    expect(over.withinBudget).toBe(false);
  });
});
