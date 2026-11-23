import { NextFunction, Request, Response } from 'express';
import logger from '../utils/logger.js';
import { getRedisClient } from '../utils/redis.js';

/**
 * Per-student daily fee sponsorship quota for the gas station (#1593).
 *
 * The quota is denominated in USD (default $0.50/day) and converted to
 * stroops with the configured XLM/USD rate. Reservations are atomic in Redis,
 * and unlike the legacy relayer quota this fails CLOSED: if Redis can't be
 * reached nothing is sponsored, so an outage can't be used to drain the
 * relayer account.
 */

const STROOPS_PER_XLM = 10_000_000;
const DAILY_QUOTA_USD = parseFloat(process.env.GAS_STATION_DAILY_QUOTA_USD || '0.50');
const XLM_USD_RATE = parseFloat(process.env.GAS_STATION_XLM_USD_RATE || '0.10');

export function dailyQuotaStroops(quotaUsd = DAILY_QUOTA_USD, xlmUsdRate = XLM_USD_RATE): number {
  if (!(xlmUsdRate > 0) || !(quotaUsd >= 0)) return 0;
  return Math.floor((quotaUsd / xlmUsdRate) * STROOPS_PER_XLM);
}

function quotaKey(studentId: string): string {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
  return `gas-station:quota:${studentId}:${today}`;
}

function secondsUntilMidnightUTC(): number {
  const now = new Date();
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return Math.ceil((midnight.getTime() - now.getTime()) / 1000);
}

// Check-and-increment in one round trip so concurrent requests can't both
// fit into the same remaining budget.
const RESERVE_SCRIPT = `
local used = tonumber(redis.call('GET', KEYS[1]) or '0')
local amount = tonumber(ARGV[1])
if used + amount > tonumber(ARGV[2]) then
  return -1
end
local total = redis.call('INCRBY', KEYS[1], amount)
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]))
return total
`;

export class GasQuotaExceededError extends Error {
  constructor(
    public used: number,
    public limit: number,
    public requested: number
  ) {
    super(`Daily gas sponsorship quota exceeded (used ${used} + ${requested} > ${limit} stroops)`);
    this.name = 'GasQuotaExceededError';
  }
}

export interface GasQuotaUsage {
  used: number;
  limit: number;
  remaining: number;
  quotaUsd: number;
  xlmUsdRate: number;
}

export async function getGasQuotaUsage(studentId: string): Promise<GasQuotaUsage> {
  const raw = await getRedisClient().get(quotaKey(studentId));
  const used = raw ? parseInt(raw, 10) : 0;
  const limit = dailyQuotaStroops();
  return { used, limit, remaining: Math.max(0, limit - used), quotaUsd: DAILY_QUOTA_USD, xlmUsdRate: XLM_USD_RATE };
}

/** Atomically reserve `feeStroops` of today's quota; throws if it doesn't fit. */
export async function reserveGasQuota(studentId: string, feeStroops: number): Promise<void> {
  const limit = dailyQuotaStroops();
  const key = quotaKey(studentId);
  const result = Number(
    await getRedisClient().eval(RESERVE_SCRIPT, 1, key, feeStroops, limit, secondsUntilMidnightUTC())
  );
  if (result < 0) {
    const raw = await getRedisClient().get(key);
    throw new GasQuotaExceededError(raw ? parseInt(raw, 10) : 0, limit, feeStroops);
  }
}

/** Return a reservation when the sponsored transaction was never accepted. */
export async function refundGasQuota(studentId: string, feeStroops: number): Promise<void> {
  try {
    await getRedisClient().decrby(quotaKey(studentId), feeStroops);
  } catch (err) {
    logger.warn(`Gas station quota refund failed for ${studentId}:`, err);
  }
}

/**
 * Reject requests from students who have already used up today's quota
 * before any XDR parsing or signing work happens. The exact fee is reserved
 * atomically later by the gas station service.
 */
export const gasQuotaMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const studentId = req.user?.id;
  if (!studentId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  let usage: GasQuotaUsage;
  try {
    usage = await getGasQuotaUsage(studentId);
  } catch (err) {
    logger.error(`Gas station quota check failed for ${studentId}:`, err);
    res.status(503).json({ error: 'Gas sponsorship is temporarily unavailable' });
    return;
  }

  if (usage.remaining <= 0) {
    res.status(429).json({ error: 'Daily gas sponsorship quota exhausted', quota: usage });
    return;
  }

  res.locals.gasQuota = usage;
  next();
};

export default gasQuotaMiddleware;
