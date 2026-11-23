import { describe, expect, it } from 'vitest';
import {
  collusionDemo,
  computePayouts,
  coordinationAdjustedWeight,
  democracyDemo,
  quadraticWeight,
  sqrtSum,
} from '@/lib/quadraticFunding/math';

describe('quadratic funding math', () => {
  it('computes the core (Σ√c)² weight', () => {
    // (sqrt(4)+sqrt(9))² = (2+3)² = 25
    expect(quadraticWeight([4, 9])).toBeCloseTo(25, 6);
  });

  it('sqrtSum adds square roots', () => {
    expect(sqrtSum([4, 9])).toBeCloseTo(5, 6);
  });

  it('distributes the pool proportionally to weights', () => {
    const out = computePayouts(
      [
        { id: 'A', donations: [100] }, // weight 100
        { id: 'B', donations: [25, 25, 25, 25] }, // weight (4*5)²=400
      ],
      500
    );
    // B should get 4x A's payout
    const a = out.find((p) => p.id === 'A')!;
    const b = out.find((p) => p.id === 'B')!;
    expect(b.payout / a.payout).toBeCloseTo(4, 4);
    expect(a.payout + b.payout).toBeCloseTo(500, 4);
  });

  it('demonstrates democratic advantage of many small donors', () => {
    const demo = democracyDemo(1, 10);
    expect(demo.grassrootsWeight).toBeGreaterThan(demo.whaleWeight);
    // 10×$1 => (10)² = 100 ; 1×$10 => (sqrt(10))² = 10 => 10x advantage
    expect(demo.advantage).toBeCloseTo(10, 4);
  });

  it('penalises collusion via coordination adjustment', () => {
    const honest = coordinationAdjustedWeight([
      [10],
      [10],
      [10],
      [10],
      [10],
      [10],
      [10],
      [10],
      [10],
      [10],
    ]);
    const colluding = coordinationAdjustedWeight([[100]]);
    expect(honest).toBeGreaterThan(colluding);
    expect(honest / colluding).toBeCloseTo(10, 4);

    const demo = collusionDemo(100, 10);
    expect(demo.penaltyFactor).toBeCloseTo(10, 4);
  });
});
