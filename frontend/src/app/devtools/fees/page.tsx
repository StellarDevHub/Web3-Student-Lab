'use client';

import { FeeStats, fetchFeeStats } from '@/lib/soroban-tools';
import { useEffect, useState } from 'react';
import { LazyFeeChart as FeeChart } from '@/components/charts/LazyCharts';

const MAX_HISTORY = 36; // 6 minutes at 10s intervals

export default function FeesPage() {
  const [history, setHistory] = useState<FeeStats[]>([]);
  const [latest, setLatest] = useState<FeeStats | null>(null);
  const [feeSlider, setFeeSlider] = useState(100);
  const [isSurge, setIsSurge] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const stats = await fetchFeeStats();
        setLatest(stats);
        setHistory((prev) => [...prev, stats].slice(-MAX_HISTORY));
        setIsSurge(stats.p99 > stats.p50 * 3);
      } catch (e) {
        console.error('Fee fetch failed:', e);
      }
    };
    load();
    const interval = setInterval(load, 10_000);
    return () => clearInterval(interval);
  }, []);

  const inclusionProbability = latest
    ? Math.min(100, Math.round((feeSlider / latest.p50) * 50))
    : 0;

  const probColor =
    inclusionProbability >= 80
      ? 'text-green-400'
      : inclusionProbability >= 50
        ? 'text-yellow-400'
        : 'text-red-400';

  return (
    <div className="min-h-screen bg-black p-6 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-black text-red-500">FEE DASHBOARD</h1>
          {isSurge && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500 bg-red-900/40 px-4 py-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
              <span className="text-sm font-bold text-red-400">SURGE PRICING ACTIVE</span>
            </div>
          )}
        </div>

        {/* Stats Row */}
        <div className="mb-6 grid grid-cols-4 gap-4">
          {[
            { label: 'MIN', value: latest?.min, color: 'text-green-400' },
            { label: 'P50 (AVG)', value: latest?.p50, color: 'text-yellow-400' },
            { label: 'P99', value: latest?.p99, color: 'text-orange-400' },
            { label: 'MAX', value: latest?.max, color: 'text-red-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-lg border border-white/10 bg-zinc-900 p-4">
              <div className="mb-1 text-xs font-bold text-gray-400">{label}</div>
              <div className={`font-mono text-2xl font-black ${color}`}>{value ?? '—'}</div>
              <div className="text-xs text-gray-500">stroops</div>
            </div>
          ))}
        </div>

        {/* Chart */}
        <div className="mb-6 rounded-lg border border-white/10 bg-zinc-900 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-bold text-gray-400">FEE HISTORY (last 6 min)</span>
            <div className="flex gap-4 text-xs">
              <span className="text-green-400">— Min</span>
              <span className="text-yellow-400">— Avg</span>
              <span className="text-red-400">— Max</span>
            </div>
          </div>
          {history.length >= 2 ? (
            <FeeChart data={history} />
          ) : (
            <div className="flex h-[220px] items-center justify-center text-sm text-gray-500">
              Collecting data...
            </div>
          )}
        </div>

        {/* Fee Slider */}
        <div className="rounded-lg border border-white/10 bg-zinc-900 p-6">
          <div className="mb-4 text-xs font-bold text-gray-400">
            FEE SLIDER — INCLUSION PROBABILITY
          </div>
          <div className="flex items-center gap-6">
            <div className="flex-1">
              <input
                type="range"
                min={latest?.min ?? 100}
                max={latest?.max ?? 10000}
                value={feeSlider}
                onChange={(e) => setFeeSlider(Number(e.target.value))}
                className="w-full accent-red-500"
              />
              <div className="mt-1 flex justify-between text-xs text-gray-500">
                <span>{latest?.min ?? 100} stroops</span>
                <span>{latest?.max ?? 10000} stroops</span>
              </div>
            </div>
            <div className="min-w-[120px] text-center">
              <div className="mb-1 text-xs text-gray-400">YOUR FEE</div>
              <div className="font-mono text-2xl font-black text-white">{feeSlider}</div>
              <div className="text-xs text-gray-500">stroops</div>
            </div>
            <div className="min-w-[120px] text-center">
              <div className="mb-1 text-xs text-gray-400">INCLUSION PROB.</div>
              <div className={`font-mono text-2xl font-black ${probColor}`}>
                {inclusionProbability}%
              </div>
              <div className="text-xs text-gray-500">estimated</div>
            </div>
          </div>
          <div className="mt-4 text-xs text-gray-500">
            {inclusionProbability >= 80
              ? '✅ High probability — your transaction should be included in the next ledger.'
              : inclusionProbability >= 50
                ? '⚠️ Moderate probability — consider increasing the fee during congestion.'
                : '❌ Low probability — increase your fee to ensure inclusion.'}
          </div>
        </div>
      </div>
    </div>
  );
}
