'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  calculateGasEstimate,
  DEFAULT_CONTRACT_SAMPLE,
  GAS_BUDGET_PRESETS,
  validateSourceCode,
  type GasBudgetPreset,
  type GasCalculatorResult,
} from '@/lib/open-source/gasCalculator';

export function useGasCalculator() {
  const [sourceCode, setSourceCode] = useState(DEFAULT_CONTRACT_SAMPLE);
  const [budgetPreset, setBudgetPreset] = useState<GasBudgetPreset>('classroom');
  const [result, setResult] = useState<GasCalculatorResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);

  const estimate = useCallback(() => {
    const validation = validateSourceCode(sourceCode);
    if (!validation.valid) {
      setError(validation.error ?? 'Invalid source');
      setResult(null);
      return;
    }

    setIsCalculating(true);
    setError(null);

    try {
      const computed = calculateGasEstimate(sourceCode, budgetPreset);
      setResult(computed);
    } catch {
      setError('Failed to calculate gas estimate.');
      setResult(null);
    } finally {
      setIsCalculating(false);
    }
  }, [sourceCode, budgetPreset]);

  const budgetOptions = useMemo(
    () =>
      (Object.keys(GAS_BUDGET_PRESETS) as GasBudgetPreset[]).map((key) => ({
        key,
        limit: GAS_BUDGET_PRESETS[key],
      })),
    []
  );

  return {
    sourceCode,
    setSourceCode,
    budgetPreset,
    setBudgetPreset,
    result,
    error,
    isCalculating,
    estimate,
    budgetOptions,
  };
}
