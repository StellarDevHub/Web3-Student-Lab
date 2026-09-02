import { z } from 'zod';

const decimal = (minimum = 0) =>
  z.union([z.number().finite(), z.string().regex(/^\d+(?:\.\d+)?$/)])
    .transform(Number)
    .pipe(z.number().finite().min(minimum));
const timestamp = z.union([z.number().positive(), z.string().min(1)]);

const recordSchema = z.object({
  timestamp,
  purchaseAmount: decimal(),
  tokensPurchased: decimal(Number.EPSILON),
  pricePerToken: decimal().optional(),
  transactionId: z.string().min(1).optional(),
  explorerUrl: z.string().url().refine(url => /^https?:$/.test(new URL(url).protocol), 'Explorer URL must be HTTP(S)').optional(),
}).transform(record => ({
  ...record,
  pricePerToken: record.pricePerToken ?? record.purchaseAmount / record.tokensPurchased,
}));

const sourceSchema = z.object({
  records: z.array(recordSchema),
  config: z.object({
    revenuePercentage: decimal(),
    frequency: decimal(),
    minBuybackAmount: decimal(),
    maxBuybackAmount: decimal(),
    enabled: z.boolean(),
  }).refine(config => config.minBuybackAmount <= config.maxBuybackAmount, {
    message: 'minBuybackAmount cannot exceed maxBuybackAmount',
  }),
  treasuryBalance: decimal(),
  supply: z.object({
    initialSupply: decimal(),
    history: z.array(z.object({
      timestamp,
      supply: decimal(),
      burned: decimal(),
    })),
  }),
});

export type BuybackDashboardPayload = z.output<typeof sourceSchema>;

export class BuybackIndexerUnavailableError extends Error {}

/**
 * Adapts an indexer's buyback read model to the API contract consumed by the UI.
 * The indexer URL is intentionally server-only so API keys and upstream topology
 * are never exposed to the browser.
 */
export async function getBuybackDashboard(
  indexerUrl = process.env.BUYBACK_INDEXER_URL,
  fetcher: typeof fetch = fetch,
): Promise<BuybackDashboardPayload> {
  if (!indexerUrl) {
    throw new BuybackIndexerUnavailableError('Buyback indexer is not configured.');
  }

  let response: Response;
  try {
    response = await fetcher(indexerUrl, { headers: { Accept: 'application/json' } });
  } catch {
    throw new BuybackIndexerUnavailableError('Buyback indexer could not be reached.');
  }

  if (!response.ok) {
    throw new BuybackIndexerUnavailableError(`Buyback indexer returned ${response.status}.`);
  }

  const payload: unknown = await response.json();
  return sourceSchema.parse(payload);
}
