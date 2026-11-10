'use client';

import React, { useState } from 'react';
import { useNetworkTelemetry } from '../../hooks/useNetworkTelemetry';
import { NetworkCongestionLevel } from '../../services/stellar/horizonHealth';

const DOT_COLOR_MAP: Record<NetworkCongestionLevel, string> = {
  optimal: 'bg-emerald-500',
  moderate: 'bg-amber-500',
  congested: 'bg-rose-500',
};

export interface NetworkStatusWidgetProps {
  horizonUrl?: string;
  pollIntervalMs?: number;
}

export const NetworkStatusWidget: React.FC<NetworkStatusWidgetProps> = ({
  horizonUrl,
  pollIntervalMs = 30_000,
}) => {
  const { metrics, loading, error, retryCount, isHighLatency, refresh } =
    useNetworkTelemetry({ horizonUrl, pollIntervalMs });
  const [showTooltip, setShowTooltip] = useState(false);

  const level: NetworkCongestionLevel = metrics?.congestionLevel ?? 'optimal';
  const dotClass = error ? 'bg-rose-600' : DOT_COLOR_MAP[level];

  return (
    <div className="relative inline-flex flex-col items-end">
      <button
        type="button"
        onClick={() => refresh()}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onFocus={() => setShowTooltip(true)}
        onBlur={() => setShowTooltip(false)}
        aria-label="Stellar Network Telemetry Status"
        className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/90 px-3 py-1.5 text-xs font-medium text-slate-100 shadow-sm"
      >
        <span
          data-testid="network-status-dot"
          className={`h-2.5 w-2.5 rounded-full ${dotClass}`}
        />
        <span>
          Fee: <strong>{metrics?.baseFeeStroops ?? 100} stroops</strong>
        </span>
        <span className="text-slate-400">|</span>
        <span>
          Close: <strong>{metrics?.avgCloseTimeSec ?? 5.0}s</strong>
        </span>
        <span className="text-slate-400">|</span>
        <span>
          Reserve: <strong>{metrics?.baseReserveXlm ?? 0.5} XLM</strong>
        </span>
        <span className="text-slate-400">|</span>
        <span data-testid="network-latency-value">
          {loading && !metrics ? 'Polling...' : `${metrics?.latencyMs ?? 0}ms`}
        </span>
      </button>

      {isHighLatency && (
        <div
          role="alert"
          data-testid="high-latency-alert"
          className="mt-1 rounded border border-rose-500/60 bg-rose-950/90 px-2.5 py-1 text-[11px] font-semibold text-rose-200"
        >
          High network latency detected ({metrics?.latencyMs}ms &gt; 3,000ms). Consider increasing priority fee.
        </div>
      )}

      {error && (
        <div
          role="status"
          data-testid="telemetry-backoff-notice"
          className="mt-1 text-[11px] text-amber-300"
        >
          Horizon unreachable (retry #{retryCount} with exponential backoff)
        </div>
      )}

      {showTooltip && metrics && (
        <div
          role="tooltip"
          data-testid="fee-recommendation-tooltip"
          className="absolute right-0 top-full z-50 mt-2 w-72 rounded-lg border border-slate-700 bg-slate-950 p-3 text-xs text-slate-200 shadow-xl"
        >
          <p className="font-semibold text-white">Priority Fee Recommendation</p>
          <p className="mt-1 text-slate-300">{metrics.feeRecommendationTooltip}</p>
          <div className="mt-2 flex justify-between text-[11px] text-slate-400">
            <span>p90: {metrics.recommendedPriorityFeeStroops} stroops</span>
            <span>p99: {metrics.p99FeeStroops} stroops</span>
          </div>
        </div>
      )}
    </div>
  );
};
