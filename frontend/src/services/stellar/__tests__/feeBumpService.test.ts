import { describe, expect, it } from 'vitest';
import {
  calculateFeeBreakdown,
  DEFAULT_RELAYER_CONFIG,
  wrapWithFeeBumpEnvelope,
} from '../feeBumpService';

describe('Stellar Fee Bump & Sponsored Transaction Service (#1561)', () => {
  it('enables zero-XLM students to submit sponsored fee-bump transactions', () => {
    const res = wrapWithFeeBumpEnvelope('AAAA_SIGNED_INNER_XDR', true, 100, 0);
    expect(res.isFeeBumpWrapped).toBe(true);
    expect(res.breakdown.mode).toBe('sponsored');
    expect(res.breakdown.studentCostStroops).toBe(0);
    expect(res.breakdown.sponsorAddress).toBe(DEFAULT_RELAYER_CONFIG.sponsorAddress);
    expect(res.breakdown.maxFeeLimitStroops).toBe(200);
  });

  it('falls back gracefully to self-pay when relayer sponsor budget is exhausted', () => {
    const exhaustedRelayer = {
      ...DEFAULT_RELAYER_CONFIG,
      remainingBudgetStroops: 50,
    };
    const res = wrapWithFeeBumpEnvelope(
      'AAAA_SIGNED_INNER_XDR',
      true,
      100,
      12.5,
      exhaustedRelayer
    );
    expect(res.isFeeBumpWrapped).toBe(false);
    expect(res.envelopeXdr).toBe('AAAA_SIGNED_INNER_XDR');
    expect(res.breakdown.mode).toBe('self-pay');
    expect(res.breakdown.fallbackReason).toContain('Relayer sponsor budget exhausted');
  });

  it('calculates self-pay breakdown when sponsorship toggle is disabled', () => {
    const breakdown = calculateFeeBreakdown(false, 150, 5);
    expect(breakdown.mode).toBe('self-pay');
    expect(breakdown.sponsorAddress).toBeNull();
    expect(breakdown.studentCostStroops).toBe(150);
  });
});
