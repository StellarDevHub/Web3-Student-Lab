import { describe, expect, it, vi } from 'vitest';
import {
  computeBackoffDelayMs,
  fetchHorizonHealthMetrics,
  HorizonFeeStatsResponse,
  parseHorizonTelemetry,
} from '../horizonHealth';

const SAMPLE_FEE_STATS: HorizonFeeStatsResponse = {
  last_ledger: '54910234',
  last_ledger_base_fee: '100',
  ledger_capacity_usage: '0.42',
  fee_charged: {
    max: '10000',
    min: '100',
    mode: '100',
    p10: '100',
    p20: '100',
    p30: '100',
    p40: '100',
    p50: '120',
    p60: '150',
    p70: '200',
    p80: '250',
    p90: '350',
    p95: '800',
    p99: '2500',
  },
};

describe('horizonHealth telemetry service (#1566)', () => {
  it('parses Horizon /fee_stats metrics and base reserve accurately', () => {
    const metrics = parseHorizonTelemetry(SAMPLE_FEE_STATS, 240, 5.2);
    expect(metrics.baseFeeStroops).toBe(100);
    expect(metrics.recommendedPriorityFeeStroops).toBe(350);
    expect(metrics.baseReserveXlm).toBe(0.5);
    expect(metrics.isHighLatency).toBe(false);
    expect(metrics.congestionLevel).toBe('optimal');
    expect(metrics.feeRecommendationTooltip).toContain('100 stroops');
  });

  it('flags high latency and congested state when RPC latency exceeds 3,000ms', () => {
    const metrics = parseHorizonTelemetry(SAMPLE_FEE_STATS, 3450, 5.8);
    expect(metrics.isHighLatency).toBe(true);
    expect(metrics.congestionLevel).toBe('congested');
    expect(metrics.feeRecommendationTooltip).toContain('Surge pricing active');
  });

  it('computes exponential backoff delays bounded at max cap', () => {
    expect(computeBackoffDelayMs(0, 30_000)).toBe(30_000);
    expect(computeBackoffDelayMs(1, 30_000)).toBe(60_000);
    expect(computeBackoffDelayMs(2, 30_000)).toBe(120_000);
    expect(computeBackoffDelayMs(5, 30_000, 300_000)).toBe(300_000);
  });

  it('fetches /fee_stats from Horizon endpoint and handles HTTP failures', async () => {
    const okFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => SAMPLE_FEE_STATS,
    });
    const res = await fetchHorizonHealthMetrics('https://horizon.stellar.org/', okFetch as unknown as typeof fetch);
    expect(okFetch).toHaveBeenCalledWith(
      'https://horizon.stellar.org/fee_stats',
      expect.any(Object)
    );
    expect(res.lastLedger).toBe(54910234);

    const failFetch = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    await expect(
      fetchHorizonHealthMetrics('https://horizon.stellar.org', failFetch as unknown as typeof fetch)
    ).rejects.toThrow('HTTP 503');
  });
});
