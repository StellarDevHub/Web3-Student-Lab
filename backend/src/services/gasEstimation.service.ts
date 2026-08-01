/**
 * Gas Estimation Service — Open Source Contribution Trainer backend.
 *
 * Server-side Soroban resource estimation for PR review workflows.
 */

export interface GasEstimateRequest {
  sourceCode: string;
  budgetPreset?: 'classroom' | 'testnet' | 'production';
}

export interface EstimatorWarning {
  metric: 'cpu' | 'ram' | 'storage' | 'gas';
  level: 'safe' | 'warning' | 'critical';
  message: string;
}

export interface GasEstimateResponse {
  cpu: number;
  ram: number;
  storage: number;
  gas: number;
  confidence: number;
  warnings: EstimatorWarning[];
  benchmarkVersion: string;
  budget: {
    preset: string;
    limit: number;
    withinBudget: boolean;
    headroom: number;
    percentUsed: number;
  };
  recommendation: string;
}

const BUDGETS = { classroom: 8500, testnet: 12000, production: 18000 } as const;

const BENCHMARK = {
  version: 'soroban-testnet-2026q1',
  baseCpu: 16,
  baseRam: 14,
  baseStorage: 8,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function countMatches(source: string, pattern: RegExp): number {
  return (source.match(pattern) || []).length;
}

function estimateFromSource(sourceCode: string): Omit<GasEstimateResponse, 'budget' | 'recommendation'> {
  const source = sourceCode.toLowerCase();
  const lines = sourceCode.split('\n').filter((l) => l.trim()).length;
  const loops = countMatches(source, /\b(for|while|loop)\b/g);
  const nestedLoops = countMatches(source, /\bfor\b[\s\S]{0,140}\bfor\b/g);
  const storageWrites = countMatches(source, /\b(set|put|persistent\(\)\.set)\b/g);
  const crossCalls = countMatches(source, /\binvoke|contractclient|call\b/g);

  const cpu = clamp(Math.round(BENCHMARK.baseCpu + lines * 0.24 + loops * 12 + nestedLoops * 30 + storageWrites * 6), 2, 100);
  const ram = clamp(Math.round(BENCHMARK.baseRam + lines * 0.18 + loops * 2), 2, 100);
  const storage = clamp(Math.round(BENCHMARK.baseStorage + storageWrites * 17), 1, 100);
  const gas = Math.round(cpu * 52 + ram * 34 + storage * 88 + crossCalls * 220);

  const warnings: EstimatorWarning[] = [];
  if (cpu >= 75) {
    warnings.push({ metric: 'cpu', level: cpu >= 90 ? 'critical' : 'warning', message: 'High CPU usage detected.' });
  }
  if (gas >= 8500) {
    warnings.push({ metric: 'gas', level: gas >= 11000 ? 'critical' : 'warning', message: 'Gas exceeds typical classroom budget.' });
  }

  const confidence = clamp(Math.round(60 + Math.min(lines, 120) * 0.25), 62, 93);

  return { cpu, ram, storage, gas, confidence, warnings, benchmarkVersion: BENCHMARK.version };
}

export function estimateGas(request: GasEstimateRequest): GasEstimateResponse {
  const preset = request.budgetPreset ?? 'classroom';
  const limit = BUDGETS[preset];
  const core = estimateFromSource(request.sourceCode);
  const withinBudget = core.gas <= limit;
  const headroom = Math.max(0, limit - core.gas);
  const percentUsed = Math.min(100, Math.round((core.gas / limit) * 100));

  let recommendation = 'Gas estimate is within budget. Ready for contribution review.';
  if (!withinBudget) {
    recommendation = 'Gas exceeds budget — optimize storage writes and nested loops before submitting a PR.';
  } else if (core.warnings.length > 0) {
    recommendation = `Within budget but review ${core.warnings[0]!.metric} warnings before merge.`;
  }

  return {
    ...core,
    budget: { preset, limit, withinBudget, headroom, percentUsed },
    recommendation,
  };
}

export function validateGasRequest(sourceCode: unknown): { valid: boolean; error?: string } {
  if (typeof sourceCode !== 'string' || !sourceCode.trim()) {
    return { valid: false, error: 'sourceCode is required.' };
  }
  if (sourceCode.length > 20_000) {
    return { valid: false, error: 'sourceCode exceeds 20,000 character limit.' };
  }
  return { valid: true };
}
