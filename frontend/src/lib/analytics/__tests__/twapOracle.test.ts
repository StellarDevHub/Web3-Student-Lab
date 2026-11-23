import { describe, it, expect } from 'vitest';

import {
  applyManipulationAttack,
  computeArithmeticTwap,
  computeDeviation,
  computeGeometricTwap,
  generatePriceSeries,
  mulberry32,
  runTwapBacktest,
} from '@/lib/analytics/twapOracle';

describe('mulberry32', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect(a()).toBe(b());
    expect(a()).toBe(b());
  });

  it('produces values in [0, 1)', () => {
    const rand = mulberry32(7);
    for (let i = 0; i < 50; i++) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('generatePriceSeries', () => {
  it('starts at the configured price', () => {
    const series = generatePriceSeries({ length: 10, startPrice: 100, volatility: 0.01, seed: 1 });
    expect(series[0]).toBe(100);
    expect(series).toHaveLength(10);
  });

  it('is deterministic for the same seed', () => {
    const a = generatePriceSeries({ length: 20, startPrice: 50, volatility: 0.02, seed: 99 });
    const b = generatePriceSeries({ length: 20, startPrice: 50, volatility: 0.02, seed: 99 });
    expect(a).toEqual(b);
  });

  it('differs for different seeds', () => {
    const a = generatePriceSeries({ length: 20, startPrice: 50, volatility: 0.02, seed: 1 });
    const b = generatePriceSeries({ length: 20, startPrice: 50, volatility: 0.02, seed: 2 });
    expect(a).not.toEqual(b);
  });

  it('never produces a non-positive price', () => {
    const series = generatePriceSeries({ length: 200, startPrice: 10, volatility: 0.2, seed: 3 });
    expect(series.every((p) => p > 0)).toBe(true);
  });
});

describe('applyManipulationAttack', () => {
  it('multiplies price only within the attack window', () => {
    const clean = [100, 100, 100, 100, 100];
    const attacked = applyManipulationAttack(clean, { startIndex: 1, durationTicks: 2, magnitude: 3 });

    expect(attacked).toEqual([100, 300, 300, 100, 100]);
  });

  it('clips the window at the end of the series', () => {
    const clean = [100, 100, 100];
    const attacked = applyManipulationAttack(clean, { startIndex: 2, durationTicks: 5, magnitude: 2 });

    expect(attacked).toEqual([100, 100, 200]);
  });
});

describe('computeArithmeticTwap', () => {
  it('equals the plain average once the window is full', () => {
    const twap = computeArithmeticTwap([10, 20, 30, 40], 2);
    // window=2: [10], [10,20]->15, [20,30]->25, [30,40]->35
    expect(twap).toEqual([10, 15, 25, 35]);
  });

  it('a flat price series has a flat TWAP equal to that price', () => {
    const twap = computeArithmeticTwap(new Array(10).fill(50), 4);
    expect(twap.every((v) => v === 50)).toBe(true);
  });

  it('rejects a window smaller than 1', () => {
    expect(() => computeArithmeticTwap([1, 2], 0)).toThrow();
  });
});

describe('computeGeometricTwap', () => {
  it('matches the arithmetic mean of logs, exponentiated', () => {
    const prices = [10, 20, 40];
    const twap = computeGeometricTwap(prices, 3);
    // geometric mean of [10,20,40] = (10*20*40)^(1/3) = 8000^(1/3)
    expect(twap[2]).toBeCloseTo(Math.pow(8000, 1 / 3), 6);
  });

  it('a flat price series has a flat geometric TWAP equal to that price', () => {
    const twap = computeGeometricTwap(new Array(6).fill(25), 3);
    expect(twap.every((v) => Math.abs(v - 25) < 1e-9)).toBe(true);
  });
});

describe('computeDeviation', () => {
  it('reports zero deviation for identical series', () => {
    const stats = computeDeviation([10, 20, 30], [10, 20, 30]);
    expect(stats.maxAbsDeviationPct).toBe(0);
    expect(stats.meanAbsDeviationPct).toBe(0);
  });

  it('finds the index and magnitude of the largest deviation', () => {
    const stats = computeDeviation([100, 100, 100], [100, 150, 100]);
    expect(stats.maxAbsDeviationIndex).toBe(1);
    expect(stats.maxAbsDeviationPct).toBeCloseTo(0.5, 6);
  });

  it('throws on mismatched lengths', () => {
    expect(() => computeDeviation([1, 2], [1])).toThrow();
  });
});

describe('runTwapBacktest', () => {
  it('shows the TWAP deviating less than raw spot price under a manipulation attack', () => {
    const result = runTwapBacktest(
      { length: 100, startPrice: 100, volatility: 0.001, seed: 5 },
      { startIndex: 50, durationTicks: 1, magnitude: 5 },
      20,
    );

    expect(result.spotDeviation.maxAbsDeviationPct).toBeGreaterThan(3); // spot roughly quintuples for one tick
    expect(result.arithmeticTwapDeviation.maxAbsDeviationPct).toBeLessThan(
      result.spotDeviation.maxAbsDeviationPct,
    );
    expect(result.resistanceRatio).toBeLessThan(1);
    expect(result.resistanceRatio).toBeGreaterThan(0);
  });

  it('gives a longer TWAP window more resistance to a short attack than a short window', () => {
    const seriesOptions = { length: 100, startPrice: 100, volatility: 0.001, seed: 11 };
    const attack = { startIndex: 50, durationTicks: 1, magnitude: 5 };

    const shortWindow = runTwapBacktest(seriesOptions, attack, 5);
    const longWindow = runTwapBacktest(seriesOptions, attack, 50);

    expect(longWindow.arithmeticTwapDeviation.maxAbsDeviationPct).toBeLessThan(
      shortWindow.arithmeticTwapDeviation.maxAbsDeviationPct,
    );
  });

  it('reports zero deviation for both curves when there is no attack', () => {
    const result = runTwapBacktest(
      { length: 30, startPrice: 100, volatility: 0, seed: 1 },
      { startIndex: 0, durationTicks: 0, magnitude: 1 },
      10,
    );

    expect(result.spotDeviation.maxAbsDeviationPct).toBe(0);
    expect(result.arithmeticTwapDeviation.maxAbsDeviationPct).toBe(0);
  });
});
