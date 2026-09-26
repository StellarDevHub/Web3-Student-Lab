'use client';

import { useMemo, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
  type ChartOptions,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

import { runTwapBacktest } from '@/lib/analytics/twapOracle';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

/**
 * TWAP oracle curve backtesting canvas (Issue #1405).
 *
 * Simulates a flash-loan-style manipulation attack against a synthetic
 * price history and plots the raw spot price a naive oracle would report
 * next to the arithmetic- and geometric-mean TWAP curves, so students can
 * see — not just be told — why DeFi protocols price against a
 * time-weighted average instead of the last trade.
 */
export function TwapBacktestCanvas() {
  const [volatility, setVolatility] = useState(0.01);
  const [seed, setSeed] = useState(1337);
  const [windowSize, setWindowSize] = useState(20);
  const [attackTick, setAttackTick] = useState(60);
  const [attackDuration, setAttackDuration] = useState(3);
  const [attackMagnitude, setAttackMagnitude] = useState(4);

  const result = useMemo(
    () =>
      runTwapBacktest(
        { length: 120, startPrice: 100, volatility, seed },
        { startIndex: attackTick, durationTicks: attackDuration, magnitude: attackMagnitude },
        windowSize,
      ),
    [volatility, seed, windowSize, attackTick, attackDuration, attackMagnitude],
  );

  const labels = useMemo(() => result.spot.map((_, i) => i), [result]);

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Spot price (naive oracle)',
        data: result.spot,
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239, 68, 68, 0.08)',
        pointRadius: 0,
        borderWidth: 1.5,
        tension: 0,
      },
      {
        label: 'Arithmetic TWAP',
        data: result.arithmeticTwap,
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34, 197, 94, 0.08)',
        pointRadius: 0,
        borderWidth: 2,
        tension: 0.15,
      },
      {
        label: 'Geometric TWAP',
        data: result.geometricTwap,
        borderColor: '#3b82f6',
        backgroundColor: 'transparent',
        pointRadius: 0,
        borderWidth: 1.5,
        borderDash: [4, 3],
        tension: 0.15,
      },
      {
        label: 'Unmanipulated (clean) price',
        data: result.clean,
        borderColor: 'rgba(148, 163, 184, 0.6)',
        backgroundColor: 'transparent',
        pointRadius: 0,
        borderWidth: 1,
        borderDash: [1, 3],
        tension: 0,
      },
    ],
  };

  const chartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'top', labels: { color: '#e2e8f0', font: { family: 'monospace', size: 10 } } },
      tooltip: {
        backgroundColor: '#09090b',
        borderColor: '#3f3f46',
        borderWidth: 1,
        titleColor: '#f4f4f5',
        bodyColor: '#a1a1aa',
      },
    },
    scales: {
      x: { grid: { color: 'rgba(63, 63, 70, 0.3)' }, ticks: { color: '#94a3b8', font: { family: 'monospace' }, maxTicksLimit: 12 } },
      y: { grid: { color: 'rgba(63, 63, 70, 0.3)' }, ticks: { color: '#94a3b8', font: { family: 'monospace' } } },
    },
  };

  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-950/90 p-8 shadow-2xl">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-bold tracking-widest text-zinc-300 uppercase">
        TWAP oracle manipulation backtester
      </h2>
      <p className="mb-6 text-[11px] text-zinc-500">
        Simulates a flash-loan-style price spike against a synthetic ledger and compares how far a
        naive spot-price oracle vs. a TWAP-averaged oracle actually moves.
      </p>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <SliderControl label="Volatility" value={volatility} min={0} max={0.05} step={0.001} onChange={setVolatility} format={(v) => v.toFixed(3)} />
        <SliderControl label="TWAP window" value={windowSize} min={2} max={60} step={1} onChange={setWindowSize} format={(v) => `${v} ticks`} />
        <SliderControl label="Attack start" value={attackTick} min={0} max={110} step={1} onChange={setAttackTick} format={(v) => `t=${v}`} />
        <SliderControl label="Attack duration" value={attackDuration} min={1} max={30} step={1} onChange={setAttackDuration} format={(v) => `${v} ticks`} />
        <SliderControl label="Attack magnitude" value={attackMagnitude} min={1} max={10} step={0.5} onChange={setAttackMagnitude} format={(v) => `${v}x`} />
        <SliderControl label="Seed" value={seed} min={1} max={9999} step={1} onChange={setSeed} format={(v) => `#${v}`} />
      </div>

      <div className="relative mb-6 h-[320px] w-full md:h-[380px]">
        <Line data={chartData} options={chartOptions} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Spot price max deviation"
          value={`${(result.spotDeviation.maxAbsDeviationPct * 100).toFixed(1)}%`}
          accent="text-red-500"
        />
        <StatCard
          label="Arithmetic TWAP max deviation"
          value={`${(result.arithmeticTwapDeviation.maxAbsDeviationPct * 100).toFixed(1)}%`}
          accent="text-emerald-500"
        />
        <StatCard
          label="Attack absorbed"
          value={`${((1 - result.resistanceRatio) * 100).toFixed(1)}%`}
          accent="text-blue-400"
        />
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-zinc-500">
        A spot-price feed reports the manipulated price directly — that is the red line's spike. A
        TWAP oracle only ever sees that same manipulated spot feed, but averages it over{' '}
        <span className="text-zinc-300">{windowSize}</span> ticks, so a {attackDuration}-tick attack
        can only move the reported price by roughly{' '}
        <span className="text-zinc-300">{attackDuration}/{windowSize}</span> of what it moved spot —
        the averaging window is the actual security parameter, not the oracle's existence.
      </p>
    </div>
  );
}

function SliderControl({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
}) {
  return (
    <label className="block text-[10px] text-zinc-400 uppercase tracking-wide">
      <div className="mb-1 flex items-center justify-between">
        <span>{label}</span>
        <span className="font-mono text-white">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer accent-red-600 rounded bg-zinc-800"
      />
    </label>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-black/40 p-4">
      <p className="text-[10px] tracking-widest text-zinc-500 uppercase">{label}</p>
      <p className={`mt-1 text-xl font-bold ${accent}`}>{value}</p>
    </div>
  );
}
