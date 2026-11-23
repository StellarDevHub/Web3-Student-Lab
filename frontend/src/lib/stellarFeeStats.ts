/**
 * Stellar fee market — live Horizon `/fee_stats` domain logic (Issue #1156).
 *
 * The mempool simulator previously ran on a synthetic Ethereum-style gwei model
 * with randomly generated transactions. Stellar's fee market works differently:
 * fees are bid in **stroops per operation** (1 XLM = 10,000,000 stroops), and a
 * ledger has a hard ceiling on operations rather than a gas limit. When a ledger
 * is over-subscribed, validators keep the highest bids and the rest wait for the
 * next one — that surge pricing is exactly what students should be watching.
 *
 * Horizon publishes the outcome of that auction at `/fee_stats`, including the
 * charged-fee distribution across percentiles. This module turns that payload
 * into the numbers the UI needs. Everything here is pure so it can be unit
 * tested without a network.
 *
 * @see https://developers.stellar.org/api/aggregations/fee-stats/
 */

/** Percentiles Horizon reports in `fee_charged` / `max_fee`. */
export const FEE_PERCENTILES = [10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 99] as const;
export type FeePercentile = (typeof FEE_PERCENTILES)[number];

/** The percentiles the auction chart plots, per the issue. */
export const CHART_PERCENTILES: FeePercentile[] = [10, 50, 90, 99];

/** One fee distribution as Horizon reports it — every value is a stroop string. */
export interface RawFeeDistribution {
  max: string;
  min: string;
  mode: string;
  p10: string;
  p20: string;
  p30: string;
  p40: string;
  p50: string;
  p60: string;
  p70: string;
  p80: string;
  p90: string;
  p95: string;
  p99: string;
}

/** Shape of the Horizon `/fee_stats` response this module consumes. */
export interface RawFeeStats {
  last_ledger: string;
  last_ledger_base_fee: string;
  ledger_capacity_usage: string;
  fee_charged: RawFeeDistribution;
  max_fee: RawFeeDistribution;
}

/** Parsed distribution, in stroops. */
export interface FeeDistribution {
  min: number;
  max: number;
  mode: number;
  /** Percentile → fee in stroops. */
  percentiles: Record<FeePercentile, number>;
}

export interface FeeStats {
  /** Ledger sequence the stats were computed over. */
  lastLedger: number;
  /** Network base fee (stroops per operation) — the floor for any bid. */
  baseFee: number;
  /**
   * Fraction of the ledger's operation capacity consumed, 0–1.
   * Horizon reports this as a decimal string such as "0.97".
   */
  capacityUsage: number;
  /** What transactions actually paid. This is the auction's clearing price. */
  feeCharged: FeeDistribution;
  /** What transactions were *willing* to pay. Always ≥ feeCharged. */
  maxFee: FeeDistribution;
}

/** Stroops in one XLM. */
export const STROOPS_PER_XLM = 10_000_000;

/** Ledgers close roughly every 5 seconds on Stellar. */
export const LEDGER_CLOSE_SECONDS = 5;

/**
 * Operations a ledger accepts before it is full. Horizon does not publish the
 * limit directly; `ledger_capacity_usage` is a fraction of it, so the UI needs a
 * reference value to turn that fraction back into an operation count. This is
 * the current Stellar network value.
 */
export const DEFAULT_LEDGER_OP_CAPACITY = 1_000;

function toNumber(value: string | undefined, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseDistribution(raw: RawFeeDistribution | undefined): FeeDistribution {
  const percentiles = {} as Record<FeePercentile, number>;
  for (const p of FEE_PERCENTILES) {
    percentiles[p] = toNumber(raw?.[`p${p}` as keyof RawFeeDistribution]);
  }

  return {
    min: toNumber(raw?.min),
    max: toNumber(raw?.max),
    mode: toNumber(raw?.mode),
    percentiles,
  };
}

/**
 * Normalise a Horizon `/fee_stats` payload.
 *
 * Horizon sends every number as a string, and a quiet network can omit fields
 * entirely, so anything unparseable becomes 0 rather than NaN — a chart axis of
 * NaN is worse than a chart axis of zero.
 */
export function parseFeeStats(raw: RawFeeStats): FeeStats {
  return {
    lastLedger: toNumber(raw?.last_ledger),
    baseFee: toNumber(raw?.last_ledger_base_fee, 100),
    capacityUsage: Math.min(1, Math.max(0, toNumber(raw?.ledger_capacity_usage))),
    feeCharged: parseDistribution(raw?.fee_charged),
    maxFee: parseDistribution(raw?.max_fee),
  };
}

/** Convert stroops to XLM. */
export function stroopsToXlm(stroops: number): number {
  return stroops / STROOPS_PER_XLM;
}

/**
 * Probability that a bid of `bidStroops` makes the next ledger, 0–1.
 *
 * Two regimes, because they behave completely differently:
 *
 * - **Ledger not full** (`capacityUsage < 1`): there is room for everything that
 *   clears the base fee, so any valid bid gets in. Bidding more buys nothing,
 *   which is the single most useful thing for a student to discover.
 * - **Ledger full**: the bid competes. Its position in the charged-fee
 *   distribution is the share of recent traffic it would have outbid, which is a
 *   direct read of its inclusion odds.
 *
 * A bid below the base fee is invalid and can never be included.
 */
export function inclusionProbability(bidStroops: number, stats: FeeStats): number {
  if (bidStroops < stats.baseFee) return 0;

  // Surge only begins once the ledger is actually saturated.
  if (stats.capacityUsage < 1) return 1;

  return percentileRank(bidStroops, stats.feeCharged);
}

/**
 * Share of the distribution at or below `value`, 0–1.
 *
 * Interpolates between the published percentiles, since Horizon reports eleven
 * points rather than a full curve.
 */
export function percentileRank(value: number, distribution: FeeDistribution): number {
  const points = FEE_PERCENTILES.map((p) => ({ p, fee: distribution.percentiles[p] }));

  if (value <= points[0].fee) {
    // Below the tenth percentile: scale linearly down to the distribution floor.
    const floor = distribution.min || 0;
    if (points[0].fee <= floor) return 0.1;
    const share = (value - floor) / (points[0].fee - floor);
    return Math.max(0, Math.min(0.1, share * 0.1));
  }

  const last = points[points.length - 1];
  if (value >= last.fee) return 1;

  for (let i = 0; i < points.length - 1; i++) {
    const lo = points[i];
    const hi = points[i + 1];
    if (value >= lo.fee && value <= hi.fee) {
      const span = hi.fee - lo.fee;
      const ratio = span === 0 ? 1 : (value - lo.fee) / span;
      return (lo.p + (hi.p - lo.p) * ratio) / 100;
    }
  }

  return 1;
}

/**
 * Estimated ledgers a bid waits before inclusion.
 *
 * With per-ledger inclusion probability `p`, the wait is geometric with mean
 * `1/p`. A bid that cannot be included at all returns `Infinity` — the UI shows
 * that as "never", which is the honest answer for a sub-base-fee bid.
 */
export function expectedLedgerWait(bidStroops: number, stats: FeeStats): number {
  const p = inclusionProbability(bidStroops, stats);
  if (p <= 0) return Infinity;
  return 1 / p;
}

/** Estimated seconds until inclusion, from the ledger wait. */
export function expectedWaitSeconds(bidStroops: number, stats: FeeStats): number {
  const ledgers = expectedLedgerWait(bidStroops, stats);
  return ledgers === Infinity ? Infinity : ledgers * LEDGER_CLOSE_SECONDS;
}

export interface LedgerCapacity {
  /** Fraction of capacity used, 0–1. */
  usage: number;
  /** Operations in the ledger, derived from the usage fraction. */
  operations: number;
  /** Ceiling used for the derivation. */
  limit: number;
  /** True once the ledger is saturated and bids start competing. */
  saturated: boolean;
}

/** Turn the reported usage fraction back into an operations-against-limit meter. */
export function ledgerCapacity(
  stats: FeeStats,
  limit: number = DEFAULT_LEDGER_OP_CAPACITY,
): LedgerCapacity {
  const usage = Math.min(1, Math.max(0, stats.capacityUsage));
  return {
    usage,
    operations: Math.round(usage * limit),
    limit,
    saturated: usage >= 1,
  };
}

/** One plotted point of the fee distribution. */
export interface FeeCurvePoint {
  percentile: FeePercentile;
  stroops: number;
  xlm: number;
}

/** The percentile curve the D3 auction chart draws. */
export function feeCurve(
  distribution: FeeDistribution,
  percentiles: FeePercentile[] = CHART_PERCENTILES,
): FeeCurvePoint[] {
  return percentiles.map((percentile) => {
    const stroops = distribution.percentiles[percentile];
    return { percentile, stroops, xlm: stroopsToXlm(stroops) };
  });
}

/**
 * Suggested bid to reach a target inclusion probability on a saturated ledger.
 *
 * Reads the charged-fee distribution at the requested confidence. On an
 * uncongested ledger the base fee already gives certainty, so that is what comes
 * back — the point being that overbidding a quiet network is wasted money.
 */
export function suggestedBid(stats: FeeStats, targetProbability: number): number {
  const target = Math.min(1, Math.max(0, targetProbability));
  if (stats.capacityUsage < 1) return stats.baseFee;

  const wanted = target * 100;
  const points = FEE_PERCENTILES.map((p) => ({ p, fee: stats.feeCharged.percentiles[p] }));

  for (let i = 0; i < points.length; i++) {
    if (points[i].p >= wanted) return Math.max(stats.baseFee, points[i].fee);
  }

  return Math.max(stats.baseFee, stats.feeCharged.max);
}

/** Horizon endpoint for the configured network. */
export function feeStatsUrl(horizonUrl: string): string {
  return `${horizonUrl.replace(/\/+$/, '')}/fee_stats`;
}

export const TESTNET_HORIZON_URL = 'https://horizon-testnet.stellar.org';

/**
 * Fetch and parse live fee stats.
 *
 * Deliberately has no retry or caching of its own — the polling hook owns that,
 * so this stays a single honest request that either resolves or throws.
 */
export async function fetchFeeStats(
  horizonUrl: string = TESTNET_HORIZON_URL,
  init?: RequestInit,
): Promise<FeeStats> {
  const response = await fetch(feeStatsUrl(horizonUrl), {
    ...init,
    headers: { Accept: 'application/json', ...(init?.headers ?? {}) },
  });

  if (!response.ok) {
    throw new Error(`Horizon /fee_stats responded ${response.status}`);
  }

  return parseFeeStats((await response.json()) as RawFeeStats);
}
