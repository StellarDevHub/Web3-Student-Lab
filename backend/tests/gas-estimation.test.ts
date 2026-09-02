import { describe, expect, it } from '@jest/globals';
import { estimateGas, validateGasRequest } from '../src/services/gasEstimation.service.js';

describe('Gas Estimation Service', () => {
  const sampleSource = `#![no_std]
use soroban_sdk::{contract, contractimpl, Env};

#[contract]
pub struct Token;

#[contractimpl]
impl Token {
    pub fn transfer(env: Env) {
        env.storage().persistent().set(&(), &1i128);
    }
}`;

  it('validates source code input', () => {
    expect(validateGasRequest('').valid).toBe(false);
    expect(validateGasRequest(sampleSource).valid).toBe(true);
  });

  it('returns gas estimate with budget analysis', () => {
    const result = estimateGas({ sourceCode: sampleSource, budgetPreset: 'classroom' });
    expect(result.gas).toBeGreaterThan(0);
    expect(result.budget.preset).toBe('classroom');
    expect(result.recommendation).toBeTruthy();
    expect(result.benchmarkVersion).toBeTruthy();
  });

  it('flags over-budget estimates', () => {
    const heavy = sampleSource + '\n'.repeat(500) + 'for x in loop { invoke(); }';
    const result = estimateGas({ sourceCode: heavy, budgetPreset: 'classroom' });
    expect(result.budget.withinBudget).toBe(false);
  });
});
