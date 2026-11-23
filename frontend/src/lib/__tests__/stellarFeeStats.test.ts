import { describe, it, expect, vi, afterEach } from 'vitest';

import {
  DEFAULT_LEDGER_OP_CAPACITY,
  expectedLedgerWait,
  expectedWaitSeconds,
  feeCurve,
  feeStatsUrl,
  fetchFeeStats,
  inclusionProbability,
  ledgerCapacity,
  parseFeeStats,
  percentileRank,
  stroopsToXlm,
  suggestedBid,
  type RawFeeStats,
} from '@/lib/stellarFeeStats';

/** A Horizon payload shaped exactly as the API returns it — all strings. */
function rawStats(overrides: Partial<RawFeeStats> = {}): RawFeeStats {
  const distribution = {
    max: '1000',
    min: '100',
    mode: '100',
    p10: '100',
    p20: '150',
    p30: '200',
    p40: '250',
    p50: '300',
    p60: '400',
    p70: '500',
    p80: '600',
    p90: '800',
    p95: '900',
    p99: '1000',
  };

  return {
    last_ledger: '52000000',
    last_ledger_base_fee: '100',
    ledger_capacity_usage: '0.5',
    fee_charged: { ...distribution },
    max_fee: { ...distribution, max: '2000', p99: '2000' },
    ...overrides,
  };
}

describe('parseFeeStats', () => {
  it('converts Horizon strings into numbers', () => {
    const stats = parseFeeStats(rawStats());

    expect(stats.lastLedger).toBe(52_000_000);
    expect(stats.baseFee).toBe(100);
    expect(stats.capacityUsage).toBe(0.5);
    expect(stats.feeCharged.percentiles[50]).toBe(300);
    expect(stats.feeCharged.percentiles[99]).toBe(1000);
  });

  it('clamps capacity usage into 0–1', () => {
    expect(parseFeeStats(rawStats({ ledger_capacity_usage: '1.4' })).capacityUsage).toBe(1);
    expect(parseFeeStats(rawStats({ ledger_capacity_usage: '-0.2' })).capacityUsage).toBe(0);
  });

  it('falls back to zero rather than NaN for unparseable values', () => {
    const stats = parseFeeStats(rawStats({ ledger_capacity_usage: 'not-a-number' }));

    expect(stats.capacityUsage).toBe(0);
    expect(Number.isNaN(stats.capacityUsage)).toBe(false);
  });

  it('defaults the base fee to 100 stroops when Horizon omits it', () => {
    const raw = rawStats();
    delete (raw as Partial<RawFeeStats>).last_ledger_base_fee;

    expect(parseFeeStats(raw).baseFee).toBe(100);
  });

  it('survives a payload with no distributions at all', () => {
    const stats = parseFeeStats({ last_ledger: '1' } as RawFeeStats);

    expect(stats.feeCharged.percentiles[50]).toBe(0);
    expect(stats.feeCharged.min).toBe(0);
  });
});

describe('stroopsToXlm', () => {
  it('converts using 10^7 stroops per XLM', () => {
    expect(stroopsToXlm(10_000_000)).toBe(1);
    expect(stroopsToXlm(100)).toBeCloseTo(0.00001, 10);
  });
});

describe('percentileRank', () => {
  const { feeCharged } = parseFeeStats(rawStats());

  it('places a value sitting exactly on a percentile', () => {
    expect(percentileRank(300, feeCharged)).toBeCloseTo(0.5, 5);
    expect(percentileRank(800, feeCharged)).toBeCloseTo(0.9, 5);
  });

  it('interpolates between two published percentiles', () => {
    // Halfway between p50 (300) and p60 (400) is p55.
    expect(percentileRank(350, feeCharged)).toBeCloseTo(0.55, 5);
  });

  it('returns 1 at or above the top percentile', () => {
    expect(percentileRank(1000, feeCharged)).toBe(1);
    expect(percentileRank(5000, feeCharged)).toBe(1);
  });

  it('never exceeds the tenth percentile below p10', () => {
    expect(percentileRank(100, feeCharged)).toBeLessThanOrEqual(0.1);
    expect(percentileRank(0, feeCharged)).toBeGreaterThanOrEqual(0);
  });
});

describe('inclusionProbability', () => {
  it('is certain on an uncongested ledger, whatever the bid', () => {
    const stats = parseFeeStats(rawStats({ ledger_capacity_usage: '0.4' }));

    expect(inclusionProbability(100, stats)).toBe(1);
    expect(inclusionProbability(900, stats)).toBe(1);
  });

  it('is zero for a bid below the network base fee', () => {
    const stats = parseFeeStats(rawStats());

    expect(inclusionProbability(99, stats)).toBe(0);
  });

  it('competes on a saturated ledger', () => {
    const stats = parseFeeStats(rawStats({ ledger_capacity_usage: '1' }));

    expect(inclusionProbability(300, stats)).toBeCloseTo(0.5, 5);
    expect(inclusionProbability(800, stats)).toBeCloseTo(0.9, 5);
  });

  it('rewards a higher bid once the ledger is full', () => {
    const stats = parseFeeStats(rawStats({ ledger_capacity_usage: '1' }));

    expect(inclusionProbability(800, stats)).toBeGreaterThan(inclusionProbability(300, stats));
  });
});

describe('expected wait', () => {
  it('is one ledger when inclusion is certain', () => {
    const stats = parseFeeStats(rawStats({ ledger_capacity_usage: '0.3' }));

    expect(expectedLedgerWait(200, stats)).toBe(1);
    expect(expectedWaitSeconds(200, stats)).toBe(5);
  });

  it('grows as the bid falls on a saturated ledger', () => {
    const stats = parseFeeStats(rawStats({ ledger_capacity_usage: '1' }));

    expect(expectedLedgerWait(300, stats)).toBeCloseTo(2, 5); // p50 → 1/0.5
    expect(expectedLedgerWait(300, stats)).toBeGreaterThan(expectedLedgerWait(800, stats));
  });

  it('is infinite for a bid that can never be included', () => {
    const stats = parseFeeStats(rawStats());

    expect(expectedLedgerWait(50, stats)).toBe(Infinity);
    expect(expectedWaitSeconds(50, stats)).toBe(Infinity);
  });
});

describe('ledgerCapacity', () => {
  it('turns the usage fraction into an operation count', () => {
    const stats = parseFeeStats(rawStats({ ledger_capacity_usage: '0.25' }));
    const capacity = ledgerCapacity(stats);

    expect(capacity.limit).toBe(DEFAULT_LEDGER_OP_CAPACITY);
    expect(capacity.operations).toBe(250);
    expect(capacity.saturated).toBe(false);
  });

  it('flags saturation at full usage', () => {
    const stats = parseFeeStats(rawStats({ ledger_capacity_usage: '1' }));

    expect(ledgerCapacity(stats).saturated).toBe(true);
  });

  it('accepts a custom ledger limit', () => {
    const stats = parseFeeStats(rawStats({ ledger_capacity_usage: '0.5' }));

    expect(ledgerCapacity(stats, 200).operations).toBe(100);
  });
});

describe('feeCurve', () => {
  it('plots p10, p50, p90 and p99 by default', () => {
    const { feeCharged } = parseFeeStats(rawStats());
    const curve = feeCurve(feeCharged);

    expect(curve.map((p) => p.percentile)).toEqual([10, 50, 90, 99]);
    expect(curve[1].stroops).toBe(300);
    expect(curve[1].xlm).toBeCloseTo(0.00003, 10);
  });

  it('rises monotonically across percentiles', () => {
    const { feeCharged } = parseFeeStats(rawStats());
    const curve = feeCurve(feeCharged);

    for (let i = 1; i < curve.length; i++) {
      expect(curve[i].stroops).toBeGreaterThanOrEqual(curve[i - 1].stroops);
    }
  });
});

describe('suggestedBid', () => {
  it('returns the base fee on an uncongested ledger', () => {
    const stats = parseFeeStats(rawStats({ ledger_capacity_usage: '0.2' }));

    expect(suggestedBid(stats, 0.99)).toBe(100);
  });

  it('reads the distribution at the requested confidence when saturated', () => {
    const stats = parseFeeStats(rawStats({ ledger_capacity_usage: '1' }));

    expect(suggestedBid(stats, 0.5)).toBe(300);
    expect(suggestedBid(stats, 0.9)).toBe(800);
  });

  it('never suggests less than the base fee', () => {
    const stats = parseFeeStats(
      rawStats({ ledger_capacity_usage: '1', last_ledger_base_fee: '5000' }),
    );

    expect(suggestedBid(stats, 0.5)).toBe(5000);
  });
});

describe('feeStatsUrl', () => {
  it('appends the endpoint', () => {
    expect(feeStatsUrl('https://horizon-testnet.stellar.org')).toBe(
      'https://horizon-testnet.stellar.org/fee_stats',
    );
  });

  it('tolerates a trailing slash', () => {
    expect(feeStatsUrl('https://horizon-testnet.stellar.org/')).toBe(
      'https://horizon-testnet.stellar.org/fee_stats',
    );
  });
});

describe('fetchFeeStats', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses a successful response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(rawStats()) }),
    );

    const stats = await fetchFeeStats();

    expect(stats.baseFee).toBe(100);
    expect(stats.feeCharged.percentiles[90]).toBe(800);
  });

  it('throws with the status when Horizon rejects the request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    await expect(fetchFeeStats()).rejects.toThrow(/503/);
  });
});
