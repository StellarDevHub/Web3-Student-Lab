import { API_BASE_URL } from './api-config';

/**
 * Public read-model returned by GET /api/v1/tokenomics/buybacks.
 * Monetary/token amounts are accepted as JSON numbers or decimal strings from the
 * indexer, then validated and normalised before they reach the dashboard.
 */
export interface BuybackRecord {
  timestamp: number;
  purchaseAmount: number;
  tokensPurchased: number;
  pricePerToken: number;
  transactionId?: string;
  explorerUrl?: string;
}

export interface BuybackConfig {
  revenuePercentage: number;
  frequency: number;
  minBuybackAmount: number;
  maxBuybackAmount: number;
  enabled: boolean;
}

export interface BuybackSupplyPoint {
  timestamp: number;
  supply: number;
  burned: number;
}

export interface BuybackDashboardData {
  records: BuybackRecord[];
  config: BuybackConfig;
  treasuryBalance: number;
  initialSupply: number;
  supplyHistory: BuybackSupplyPoint[];
}

type UnknownRecord = Record<string, unknown>;

function isObject(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberValue(value: unknown, field: string, minimum = 0): number {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(number) || number < minimum) {
    throw new Error(`Invalid buyback API response: ${field} must be a finite number${minimum ? ` >= ${minimum}` : ''}.`);
  }
  return number;
}

function timestampValue(value: unknown, field: string): number {
  const timestamp = typeof value === 'string' && !/^\d+$/.test(value) ? Date.parse(value) : Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    throw new Error(`Invalid buyback API response: ${field} must be a valid timestamp.`);
  }
  // Indexers commonly return Unix seconds; charts and Date use milliseconds.
  return timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new Error(`Invalid buyback API response: ${field} must be a string.`);
  return value;
}

function parseRecord(value: unknown, index: number): BuybackRecord {
  if (!isObject(value)) throw new Error(`Invalid buyback API response: records[${index}] must be an object.`);
  const purchaseAmount = numberValue(value.purchaseAmount, `records[${index}].purchaseAmount`);
  const tokensPurchased = numberValue(value.tokensPurchased, `records[${index}].tokensPurchased`, Number.EPSILON);
  const price = value.pricePerToken === undefined
    ? purchaseAmount / tokensPurchased
    : numberValue(value.pricePerToken, `records[${index}].pricePerToken`);

  return {
    timestamp: timestampValue(value.timestamp, `records[${index}].timestamp`),
    purchaseAmount,
    tokensPurchased,
    pricePerToken: price,
    transactionId: optionalString(value.transactionId, `records[${index}].transactionId`),
    explorerUrl: optionalString(value.explorerUrl, `records[${index}].explorerUrl`),
  };
}

/** Validates the backend/indexer boundary and normalises it for the UI. */
export function mapBuybackDashboardResponse(payload: unknown): BuybackDashboardData {
  if (!isObject(payload)) throw new Error('Invalid buyback API response: expected an object.');
  if (!Array.isArray(payload.records)) throw new Error('Invalid buyback API response: records must be an array.');
  if (!isObject(payload.config)) throw new Error('Invalid buyback API response: config must be an object.');
  if (!isObject(payload.supply)) throw new Error('Invalid buyback API response: supply must be an object.');
  if (!Array.isArray(payload.supply.history)) throw new Error('Invalid buyback API response: supply.history must be an array.');

  const config = payload.config;
  if (typeof config.enabled !== 'boolean') throw new Error('Invalid buyback API response: config.enabled must be a boolean.');

  const records = payload.records.map(parseRecord).sort((a, b) => a.timestamp - b.timestamp);
  const supplyHistory = payload.supply.history.map((value, index) => {
    if (!isObject(value)) throw new Error(`Invalid buyback API response: supply.history[${index}] must be an object.`);
    return {
      timestamp: timestampValue(value.timestamp, `supply.history[${index}].timestamp`),
      supply: numberValue(value.supply, `supply.history[${index}].supply`),
      burned: numberValue(value.burned, `supply.history[${index}].burned`),
    };
  }).sort((a, b) => a.timestamp - b.timestamp);

  return {
    records,
    config: {
      revenuePercentage: numberValue(config.revenuePercentage, 'config.revenuePercentage'),
      frequency: numberValue(config.frequency, 'config.frequency'),
      minBuybackAmount: numberValue(config.minBuybackAmount, 'config.minBuybackAmount'),
      maxBuybackAmount: numberValue(config.maxBuybackAmount, 'config.maxBuybackAmount'),
      enabled: config.enabled,
    },
    treasuryBalance: numberValue(payload.treasuryBalance, 'treasuryBalance'),
    initialSupply: numberValue(payload.supply.initialSupply, 'supply.initialSupply'),
    supplyHistory,
  };
}

export function calculateBuybackAggregates(records: BuybackRecord[]) {
  const totalSpent = records.reduce((sum, record) => sum + record.purchaseAmount, 0);
  const totalTokensBought = records.reduce((sum, record) => sum + record.tokensPurchased, 0);
  return {
    totalSpent,
    totalTokensBought,
    buybackCount: records.length,
    averagePrice: totalTokensBought === 0 ? 0 : totalSpent / totalTokensBought,
    lastBuybackTime: records.length ? Math.max(...records.map(record => record.timestamp)) : undefined,
  };
}

export async function fetchBuybackDashboard(signal?: AbortSignal): Promise<BuybackDashboardData> {
  const response = await fetch(`${API_BASE_URL}/tokenomics/buybacks`, {
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!response.ok) throw new Error(`Could not load buyback data (${response.status}).`);
  return mapBuybackDashboardResponse(await response.json());
}

export const formatAmount = (amount: number, maximumFractionDigits = 2) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits }).format(amount);

export const formatCurrency = (amount: number) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(amount);

export const formatDate = (timestamp: number) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp);
