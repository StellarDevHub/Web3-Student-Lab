import { BuybackIndexerUnavailableError, getBuybackDashboard } from '../src/tokenomics/buyback-indexer.service.js';

const indexerPayload = {
  records: [{ timestamp: 1767355200, purchaseAmount: '50', tokensPurchased: '10', transactionId: 'tx-1', explorerUrl: 'https://stellar.expert/explorer/public/tx/tx-1' }],
  config: { revenuePercentage: '15', frequency: '86400', minBuybackAmount: '10', maxBuybackAmount: '100', enabled: true },
  treasuryBalance: '250',
  supply: { initialSupply: '1000', history: [] },
};

describe('getBuybackDashboard', () => {
  it('validates and normalises an indexer payload without generating records', async () => {
    const fetcher = jest.fn().mockResolvedValue(new Response(JSON.stringify(indexerPayload), { status: 200 }));
    const result = await getBuybackDashboard('https://indexer.example/buybacks', fetcher);

    expect(result.records[0]).toMatchObject({ purchaseAmount: 50, tokensPurchased: 10, pricePerToken: 5 });
    expect(result.config.frequency).toBe(86400);
    expect(fetcher).toHaveBeenCalledWith('https://indexer.example/buybacks', { headers: { Accept: 'application/json' } });
  });

  it('fails explicitly when no indexer is configured', async () => {
    await expect(getBuybackDashboard(undefined, jest.fn())).rejects.toBeInstanceOf(BuybackIndexerUnavailableError);
  });

  it('rejects malformed indexer data instead of returning substitute data', async () => {
    const invalid = { ...indexerPayload, records: [{ ...indexerPayload.records[0], tokensPurchased: 0 }] };
    const fetcher = jest.fn().mockResolvedValue(new Response(JSON.stringify(invalid), { status: 200 }));
    await expect(getBuybackDashboard('https://indexer.example/buybacks', fetcher)).rejects.toThrow();
  });
});
