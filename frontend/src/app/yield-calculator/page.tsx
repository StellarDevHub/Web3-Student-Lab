'use client';

import React, { useState, useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  type ChartOptions,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { HelpCircle, RefreshCw, Calculator, TrendingUp, DollarSign, Percent, Clock } from 'lucide-react';

// Register ChartJS modules
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

type FrequencyKey = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'semi-annually' | 'annually';

const FREQUENCIES: Record<FrequencyKey, { label: string; value: number }> = {
  daily: { label: 'Daily (365/yr)', value: 365 },
  weekly: { label: 'Weekly (52/yr)', value: 52 },
  monthly: { label: 'Monthly (12/yr)', value: 12 },
  quarterly: { label: 'Quarterly (4/yr)', value: 4 },
  'semi-annually': { label: 'Semi-Annually (2/yr)', value: 2 },
  annually: { label: 'Annually (1/yr)', value: 1 },
};

const LOCK_UP_TIERS = [
  { label: 'No Lock-up (1.0x)', multiplier: 1.0 },
  { label: '30 Days (1.25x)', multiplier: 1.25 },
  { label: '90 Days (1.50x)', multiplier: 1.50 },
  { label: '180 Days (1.75x)', multiplier: 1.75 },
  { label: '365 Days (2.0x)', multiplier: 2.00 },
];

export default function YieldCalculatorPage() {
  const [principal, setPrincipal] = useState<number>(10000);
  const [apy, setApy] = useState<number>(12);
  const [frequency, setFrequency] = useState<FrequencyKey>('monthly');
  const [duration, setDuration] = useState<number>(10);
  const [lockTierIndex, setLockTierIndex] = useState<number>(0);

  // Reset inputs
  const resetForm = () => {
    setPrincipal(10000);
    setApy(12);
    setFrequency('monthly');
    setDuration(10);
    setLockTierIndex(0);
  };

  // Computations
  const stats = useMemo(() => {
    const r = (apy / 100) * LOCK_UP_TIERS[lockTierIndex].multiplier;
    const n = FREQUENCIES[frequency].value;
    const t = duration;

    // A = P(1 + r/n)^(nt)
    const futureValue = principal * Math.pow(1 + r / n, n * t);
    const totalInterest = futureValue - principal;

    // Effective Annual Rate (EAR) = (1 + r/n)^n - 1
    const ear = (Math.pow(1 + r / n, n) - 1) * 100;

    // Generate series over time
    const chartLabels: string[] = [];
    const principalData: number[] = [];
    const interestData: number[] = [];

    for (let year = 0; year <= t; year++) {
      chartLabels.push(`Yr ${year}`);
      const val = principal * Math.pow(1 + r / n, n * year);
      principalData.push(principal);
      interestData.push(Math.max(0, val - principal));
    }

    return {
      futureValue,
      totalInterest,
      ear,
      chartLabels,
      principalData,
      interestData,
    };
  }, [principal, apy, frequency, duration, lockTierIndex]);

  // Chart data configuration
  const chartData = {
    labels: stats.chartLabels,
    datasets: [
      {
        label: 'Interest Earned',
        data: stats.interestData,
        borderColor: '#f97316', // Orange
        backgroundColor: 'rgba(249, 115, 22, 0.2)', // Orange fill
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#ea580c',
        pointHoverRadius: 7,
      },
      {
        label: 'Principal Deposit',
        data: stats.principalData,
        borderColor: '#64748b', // Slate
        backgroundColor: 'rgba(100, 116, 139, 0.1)', // Slate fill
        fill: true,
        tension: 0.1,
        pointBackgroundColor: '#475569',
      },
    ],
  };

  const chartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: '#e2e8f0', // slate-200
          font: {
            family: 'monospace',
            size: 11,
          },
        },
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: '#09090b',
        borderColor: '#3f3f46',
        borderWidth: 1,
        titleColor: '#f4f4f5',
        bodyColor: '#a1a1aa',
        callbacks: {
          label: (context) => {
            const val = context.parsed.y;
            return ` ${context.dataset.label}: $${val.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: {
          color: 'rgba(63, 63, 70, 0.3)',
        },
        ticks: {
          color: '#94a3b8',
          font: {
            family: 'monospace',
          },
        },
      },
      y: {
        grid: {
          color: 'rgba(63, 63, 70, 0.3)',
        },
        ticks: {
          color: '#94a3b8',
          font: {
            family: 'monospace',
          },
          callback: (value) => `$${Number(value).toLocaleString()}`,
        },
      },
    },
  };

  return (
    <div className="relative min-h-[calc(100vh-80px)] bg-black p-6 font-mono text-white md:p-12">
      {/* Background Accent Grid */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#8080800d_1px,transparent_1px),linear-gradient(to_bottom,#8080800d_1px,transparent_1px)] bg-[size:30px_30px]" />

      <div className="relative z-10 mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-10 flex flex-col items-start justify-between gap-6 md:flex-row md:items-end border-l-4 border-red-600 pl-6">
          <div>
            <h1 className="mb-2 text-3xl font-black tracking-tighter uppercase sm:text-4xl">
              Yield <span className="text-red-500">Calculator</span>
            </h1>
            <p className="text-xs tracking-widest text-zinc-500 uppercase">
              Compounding yield simulator & lock-up tier validator
            </p>
          </div>
          <button
            onClick={resetForm}
            className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-2.5 text-xs font-black tracking-widest uppercase transition hover:border-red-500/50 hover:bg-red-500/10"
          >
            <RefreshCw className="h-4 w-4" /> Reset
          </button>
        </div>

        {/* Top Summary Cards */}
        <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-6 backdrop-blur-xl shadow-lg">
            <p className="text-xs text-zinc-500 uppercase">Total Deposit</p>
            <p className="mt-2 text-2xl font-bold text-slate-300">
              ${principal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-6 backdrop-blur-xl shadow-lg">
            <p className="text-xs text-zinc-500 uppercase">Future Value</p>
            <p className="mt-2 text-2xl font-bold text-red-500">
              ${stats.futureValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-6 backdrop-blur-xl shadow-lg">
            <p className="text-xs text-zinc-500 uppercase">Total Interest Earned</p>
            <p className="mt-2 text-2xl font-bold text-orange-500">
              ${stats.totalInterest.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-6 backdrop-blur-xl shadow-lg">
            <p className="text-xs text-zinc-500 uppercase">Effective APY (EAR)</p>
            <p className="mt-2 text-2xl font-bold text-emerald-500">
              {stats.ear.toFixed(2)}%
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Controls Panel */}
          <div className="flex flex-col gap-6 rounded-3xl border border-zinc-800 bg-zinc-950/90 p-8 shadow-2xl lg:col-span-1">
            <h2 className="flex items-center gap-2 border-b border-zinc-800 pb-4 text-sm font-bold tracking-widest uppercase">
              <Calculator className="text-red-500" /> Simulator Controls
            </h2>

            {/* Slider 1: Principal */}
            <div>
              <div className="mb-2 flex items-center justify-between text-xs font-bold text-zinc-400 uppercase">
                <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" /> Principal</span>
                <span className="text-white">${principal.toLocaleString()}</span>
              </div>
              <input
                type="range"
                min={100}
                max={100000}
                step={100}
                value={principal}
                onChange={(e) => setPrincipal(Number(e.target.value))}
                className="h-1.5 w-full cursor-pointer accent-red-600 rounded bg-zinc-800"
              />
            </div>

            {/* Slider 2: APY */}
            <div>
              <div className="mb-2 flex items-center justify-between text-xs font-bold text-zinc-400 uppercase">
                <span className="flex items-center gap-1"><Percent className="h-3 w-3" /> Base APY</span>
                <span className="text-white">{apy}%</span>
              </div>
              <input
                type="range"
                min={1}
                max={50}
                step={0.5}
                value={apy}
                onChange={(e) => setApy(Number(e.target.value))}
                className="h-1.5 w-full cursor-pointer accent-red-600 rounded bg-zinc-800"
              />
            </div>

            {/* lockup tier multipliers */}
            <div>
              <label className="mb-2 block text-xs font-bold text-zinc-400 uppercase">
                Lock-up Term Multiplier
              </label>
              <select
                value={lockTierIndex}
                onChange={(e) => setLockTierIndex(Number(e.target.value))}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-xs text-white outline-none focus:border-red-500/50"
              >
                {LOCK_UP_TIERS.map((tier, idx) => (
                  <option key={idx} value={idx}>
                    {tier.label}
                  </option>
                ))}
              </select>
            </div>

            {/* compounding frequency */}
            <div>
              <label className="mb-2 block text-xs font-bold text-zinc-400 uppercase">
                Compounding Frequency
              </label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as FrequencyKey)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-xs text-white outline-none focus:border-red-500/50"
              >
                {(Object.keys(FREQUENCIES) as FrequencyKey[]).map((key) => (
                  <option key={key} value={key}>
                    {FREQUENCIES[key].label}
                  </option>
                ))}
              </select>
            </div>

            {/* Slider 3: Duration */}
            <div>
              <div className="mb-2 flex items-center justify-between text-xs font-bold text-zinc-400 uppercase">
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Duration</span>
                <span className="text-white">{duration} Years</span>
              </div>
              <input
                type="range"
                min={1}
                max={30}
                step={1}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="h-1.5 w-full cursor-pointer accent-red-600 rounded bg-zinc-800"
              />
            </div>
          </div>

          {/* Graphical Visualization */}
          <div className="flex flex-col rounded-3xl border border-zinc-800 bg-zinc-950/90 p-8 shadow-2xl lg:col-span-2">
            <h2 className="mb-6 flex items-center gap-2 border-b border-zinc-800 pb-4 text-sm font-bold tracking-widest uppercase">
              <TrendingUp className="text-red-500" /> Yield Projection Over Time
            </h2>
            <div className="relative h-[300px] w-full flex-grow md:h-[400px]">
              <Line data={chartData} options={chartOptions} />
            </div>
          </div>
        </div>

        {/* Information Panel */}
        <div className="mt-8 rounded-3xl border border-zinc-900 bg-zinc-950/40 p-8 backdrop-blur-sm">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-bold tracking-widest text-zinc-300 uppercase">
            <HelpCircle className="h-4 w-4 text-red-500" /> Understanding Yield Compounding
          </h3>
          <p className="text-[11px] leading-relaxed text-zinc-500">
            Yield compounding is the process of generating returns on your asset's previously accumulated returns.
            By locking tokens for longer terms (tiers), you receive a dynamic staking multiplier that accelerates
            the compounding effect. Staking multipliers scale your APY up to 2.0x under Platinum lock-up.
            Calculations are modeled under standard time-weighted ledger accruals where future value is evaluated as{' '}
            <span className="font-mono text-zinc-300">P * (1 + r/n)^(n*t)</span>.
          </p>
        </div>
      </div>
    </div>
  );
}
