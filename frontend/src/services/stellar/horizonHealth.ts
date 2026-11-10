export type NetworkCongestionLevel = 'optimal' | 'moderate' | 'congested';

export interface HorizonFeeStatsResponse {
  last_ledger: string;
  last_ledger_base_fee: string;
  ledger_capacity_usage: string;
  fee_charged: {
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
  };
}

export interface NetworkTelemetryMetrics {
  lastLedger: number;
  baseFeeStroops: number;
  recommendedPriorityFeeStroops: number;
  p99FeeStroops: number;
  baseReserveXlm: number;
  baseReserveStroops: number;
  avgCloseTimeSec: number;
  capacityUsageRatio: number;
  latencyMs: number;
  isHighLatency: boolean;
  congestionLevel: NetworkCongestionLevel;
  feeRecommendationTooltip: string;
  updatedAtIso: string;
}

export const STELLAR_BASE_RESERVE_XLM = 0.5;
export const STELLAR_BASE_RESERVE_STROOPS = 5_000_000;
export const HIGH_LATENCY_THRESHOLD_MS = 3_000;
export const DEFAULT_POLL_INTERVAL_MS = 30_000;
export const MAX_BACKOFF_DELAY_MS = 300_000;

export function computeBackoffDelayMs(
  retryCount: number,
  baseIntervalMs: number = DEFAULT_POLL_INTERVAL_MS,
  maxDelayMs: number = MAX_BACKOFF_DELAY_MS
): number {
  if (retryCount <= 0) return baseIntervalMs;
  const exponential = baseIntervalMs * Math.pow(2, Math.min(retryCount, 6));
  return Math.min(exponential, maxDelayMs);
}

export function classifyCongestionLevel(
  capacityUsageRatio: number,
  p90FeeStroops: number,
  latencyMs: number
): NetworkCongestionLevel {
  if (
    latencyMs > HIGH_LATENCY_THRESHOLD_MS ||
    capacityUsageRatio >= 0.85 ||
    p90FeeStroops >= 5_000
  ) {
    return 'congested';
  }
  if (capacityUsageRatio >= 0.55 || p90FeeStroops >= 500 || latencyMs >= 1_500) {
    return 'moderate';
  }
  return 'optimal';
}

export function buildFeeRecommendationTooltip(
  baseFeeStroops: number,
  p90FeeStroops: number,
  p99FeeStroops: number,
  congestionLevel: NetworkCongestionLevel
): string {
  if (congestionLevel === 'congested') {
    return `Surge pricing active: set max fee >= ${p99FeeStroops} stroops (p99) for priority ledger inclusion (base: ${baseFeeStroops} stroops).`;
  }
  if (congestionLevel === 'moderate') {
    return `Moderate traffic: set max fee >= ${p90FeeStroops} stroops (p90) for reliable next-ledger inclusion (base: ${baseFeeStroops} stroops).`;
  }
  return `Optimal network conditions: standard base fee (${baseFeeStroops} stroops) or p90 (${p90FeeStroops} stroops) is sufficient for immediate inclusion.`;
}

export function parseHorizonTelemetry(
  feeStats: HorizonFeeStatsResponse,
  latencyMs: number,
  avgCloseTimeSec: number = 5.1
): NetworkTelemetryMetrics {
  const lastLedger = Number(feeStats.last_ledger) || 0;
  const baseFeeStroops = Number(feeStats.last_ledger_base_fee) || 100;
  const p90FeeStroops = Number(feeStats.fee_charged?.p90) || baseFeeStroops;
  const p99FeeStroops = Number(feeStats.fee_charged?.p99) || p90FeeStroops;
  const capacityUsageRatio = Math.min(
    1,
    Math.max(0, Number(feeStats.ledger_capacity_usage) || 0)
  );
  const safeLatencyMs = Math.max(0, Math.round(latencyMs));
  const isHighLatency = safeLatencyMs > HIGH_LATENCY_THRESHOLD_MS;
  const congestionLevel = classifyCongestionLevel(
    capacityUsageRatio,
    p90FeeStroops,
    safeLatencyMs
  );

  return {
    lastLedger,
    baseFeeStroops,
    recommendedPriorityFeeStroops: p90FeeStroops,
    p99FeeStroops,
    baseReserveXlm: STELLAR_BASE_RESERVE_XLM,
    baseReserveStroops: STELLAR_BASE_RESERVE_STROOPS,
    avgCloseTimeSec: Number(avgCloseTimeSec.toFixed(2)),
    capacityUsageRatio,
    latencyMs: safeLatencyMs,
    isHighLatency,
    congestionLevel,
    feeRecommendationTooltip: buildFeeRecommendationTooltip(
      baseFeeStroops,
      p90FeeStroops,
      p99FeeStroops,
      congestionLevel
    ),
    updatedAtIso: new Date().toISOString(),
  };
}

export async function fetchHorizonHealthMetrics(
  horizonUrl: string = 'https://horizon.stellar.org',
  fetchImpl: typeof fetch = fetch
): Promise<NetworkTelemetryMetrics> {
  const base = horizonUrl.replace(/\/+$/, '');
  const startedAt = Date.now();
  const response = await fetchImpl(`${base}/fee_stats`, {
    headers: { Accept: 'application/json' },
  });
  const latencyMs = Date.now() - startedAt;

  if (!response.ok) {
    throw new Error(`Horizon fee_stats request failed with HTTP ${response.status}`);
  }

  const feeStats = (await response.json()) as HorizonFeeStatsResponse;
  return parseHorizonTelemetry(feeStats, latencyMs);
}
