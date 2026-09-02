import { describe, it, expect } from 'vitest';

function calculateCompoundInterest(
  principal: number,
  apy: number,
  frequencyVal: number,
  durationYears: number,
  multiplier: number
) {
  const r = (apy / 100) * multiplier;
  const n = frequencyVal;
  const t = durationYears;
  const futureValue = principal * Math.pow(1 + r / n, n * t);
  const totalInterest = futureValue - principal;
  return { futureValue, totalInterest };
}

describe('Compounding Yield Calculator Mathematics', () => {
  it('calculates annual compounding correctly', () => {
    // P = 10000, APY = 10% (0.10), Compounded Annually (n=1), Duration = 1 year, Multiplier = 1.0x
    const res = calculateCompoundInterest(10000, 10, 1, 1, 1.0);
    expect(res.futureValue).toBeCloseTo(11000, 2);
    expect(res.totalInterest).toBeCloseTo(1000, 2);
  });

  it('calculates monthly compounding correctly', () => {
    // P = 10000, APY = 12% (0.12), Compounded Monthly (n=12), Duration = 2 years, Multiplier = 1.0x
    const res = calculateCompoundInterest(10000, 12, 12, 2, 1.0);
    // FV = 10000 * (1 + 0.12/12)^(12*2) = 10000 * (1.01)^24 = 12697.35
    expect(res.futureValue).toBeCloseTo(12697.35, 2);
    expect(res.totalInterest).toBeCloseTo(2697.35, 2);
  });

  it('applies lock-up multipliers correctly', () => {
    // P = 10000, APY = 10% (0.10), Compounded Annually (n=1), Duration = 1 year, Multiplier = 2.0x (365 days lock)
    // Effective Rate = 10% * 2 = 20%
    const res = calculateCompoundInterest(10000, 10, 1, 1, 2.0);
    expect(res.futureValue).toBeCloseTo(12000, 2);
    expect(res.totalInterest).toBeCloseTo(2000, 2);
  });
});
