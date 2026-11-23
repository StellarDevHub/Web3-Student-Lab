import { describe, expect, it } from 'vitest';
import { calculateBuybackAggregates, mapBuybackDashboardResponse } from './buyback-data';

const response = {
  records: [
    { timestamp: '2026-01-02T12:00:00.000Z', purchaseAmount: '50', tokensPurchased: '10', transactionId: 'abc', explorerUrl: 'https://stellar.expert/explorer/public/tx/abc' },
    { timestamp: 1767355200, purchaseAmount: 45, tokensPurchased: 15, pricePerToken: 3 },
  ],
  config: { revenuePercentage: '15', frequency: '86400', minBuybackAmount: '10', maxBuybackAmount: 100, enabled: true },
  treasuryBalance: '250.5',
  supply: { initialSupply: '1000', history: [{ timestamp: 1767355200, supply: 975, burned: 25 }] },
};

describe('mapBuybackDashboardResponse', () => {
  it('normalises indexer values, timestamps, optional price, and chronological order', () => {
    const result = mapBuybackDashboardResponse(response);
    expect(result.records).toHaveLength(2);
    expect(result.records[0]).toMatchObject({ purchaseAmount: 50, tokensPurchased: 10, pricePerToken: 5, transactionId: 'abc' });
    expect(result.records[1].timestamp).toBe(1767355200000);
    expect(result.config.frequency).toBe(86400);
    expect(result.supplyHistory[0].timestamp).toBe(1767355200000);
  });

  it('rejects malformed source data rather than rendering invented values', () => {
    expect(() => mapBuybackDashboardResponse({ ...response, records: [{ ...response.records[0], tokensPurchased: 0 }] })).toThrow('tokensPurchased');
    expect(() => mapBuybackDashboardResponse({ ...response, config: { ...response.config, enabled: 'true' } })).toThrow('config.enabled');
  });
});

describe('calculateBuybackAggregates', () => {
  it('derives dashboard totals from the exact history used by charts', () => {
    const records = mapBuybackDashboardResponse(response).records;
    expect(calculateBuybackAggregates(records)).toEqual({
      totalSpent: 95,
      totalTokensBought: 25,
      buybackCount: 2,
      averagePrice: 3.8,
      lastBuybackTime: 1767355200000,
    });
  });

  it('returns safe zero values when there are no buybacks', () => {
    expect(calculateBuybackAggregates([])).toEqual({ totalSpent: 0, totalTokensBought: 0, buybackCount: 0, averagePrice: 0, lastBuybackTime: undefined });
  });
});
