/**
 * Gas Estimation Calculator — Open Source Contribution Trainer.
 *
 * Pure logic for estimating Soroban resource usage and comparing optimization
 * strategies. Wraps the shared soroban estimator and adds OSCT-specific budget
 * analysis for contribution workflows.
 */

import {
  buildStrategyComparisons,
  estimateSorobanResources,
  type SorobanEstimate,
  type StrategyComparison,
} from '@/lib/simulator/sorobanEstimator';

export const DEFAULT_CONTRACT_SAMPLE = `#![no_std]
use soroban_sdk::{contract, contractimpl, Env, Map, Symbol};

#[contract]
pub struct TokenVault;

#[contractimpl]
impl TokenVault {
    pub fn deposit(env: Env, user: Symbol, amount: i128) {
        let mut balances: Map<Symbol, i128> = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, "balances"))
            .unwrap_or(Map::new(&env));
        let current = balances.get(user.clone()).unwrap_or(0);
        balances.set(user, current + amount);
        env.storage().persistent().set(&Symbol::new(&env, "balances"), &balances);
        env.events().publish((Symbol::new(&env, "deposit"), user), amount);
    }
}`;

export const GAS_BUDGET_PRESETS = {
  classroom: 8500,
  testnet: 12000,
  production: 18000,
} as const;

export type GasBudgetPreset = keyof typeof GAS_BUDGET_PRESETS;

export interface GasBudgetAnalysis {
  preset: GasBudgetPreset;
  budget: number;
  withinBudget: boolean;
  headroom: number;
  percentUsed: number;
}

export interface GasCalculatorResult {
  estimate: SorobanEstimate;
  strategies: StrategyComparison[];
  budget: GasBudgetAnalysis;
  recommendation: string;
}

export function analyzeGasBudget(
  gas: number,
  preset: GasBudgetPreset = 'classroom'
): GasBudgetAnalysis {
  const budget = GAS_BUDGET_PRESETS[preset];
  const withinBudget = gas <= budget;
  const headroom = Math.max(0, budget - gas);
  const percentUsed = Math.min(100, Math.round((gas / budget) * 100));

  return { preset, budget, withinBudget, headroom, percentUsed };
}

export function buildGasRecommendation(
  estimate: SorobanEstimate,
  budget: GasBudgetAnalysis
): string {
  if (budget.withinBudget && estimate.warnings.length === 0) {
    return 'Gas estimate is within budget with no critical warnings. Safe to submit for review.';
  }
  if (!budget.withinBudget) {
    return 'Estimated gas exceeds the selected budget. Apply an optimization strategy before opening a PR.';
  }
  const topWarning = estimate.warnings[0];
  return topWarning
    ? `Within budget but ${topWarning.metric.toUpperCase()} needs attention: ${topWarning.message}`
    : 'Review optimization strategies to improve headroom before merging.';
}

export function calculateGasEstimate(
  sourceCode: string,
  budgetPreset: GasBudgetPreset = 'classroom'
): GasCalculatorResult {
  const estimate = estimateSorobanResources(sourceCode);
  const strategies = buildStrategyComparisons(estimate);
  const budget = analyzeGasBudget(estimate.gas, budgetPreset);
  const recommendation = buildGasRecommendation(estimate, budget);

  return { estimate, strategies, budget, recommendation };
}

export function validateSourceCode(sourceCode: string): { valid: boolean; error?: string } {
  const trimmed = sourceCode.trim();
  if (!trimmed) {
    return { valid: false, error: 'Paste contract source code to estimate gas.' };
  }
  if (trimmed.length > 20_000) {
    return { valid: false, error: 'Source exceeds 20,000 character limit.' };
  }
  return { valid: true };
}
