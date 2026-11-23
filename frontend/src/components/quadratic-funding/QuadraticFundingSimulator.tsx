'use client';

import { useMemo, useState } from 'react';
import { scaleLinear } from 'd3';
import {
  collusionDemo,
  computePayouts,
  democracyDemo,
  quadraticWeight,
} from '@/lib/quadraticFunding/math';

interface ProjectState {
  id: string;
  label: string;
  donations: number[];
}

const DEFAULT_PROJECTS: ProjectState[] = [
  { id: 'A', label: 'Open-Source CLI', donations: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
  { id: 'B', label: 'Big Grant Proposal', donations: [10] },
];

function DonationEditor({
  project,
  onChange,
}: {
  project: ProjectState;
  onChange: (donations: number[]) => void;
}) {
  const update = (idx: number, value: number) => {
    const next = project.donations.map((d, i) => (i === idx ? value : d));
    onChange(next);
  };
  const add = () => onChange([...project.donations, 1]);
  const remove = (idx: number) => onChange(project.donations.filter((_, i) => i !== idx));

  return (
    <div className="rounded-xl border border-white/10 bg-zinc-950 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="font-mono text-xs tracking-widest text-red-400 uppercase">
          {project.label}
        </h4>
        <button
          onClick={add}
          className="rounded border border-white/10 px-2 py-1 text-[10px] text-gray-400 hover:border-red-500/50 hover:text-red-400"
        >
          + donor
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {project.donations.map((d, i) => (
          <div key={i} className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              step={1}
              value={d}
              onChange={(e) => update(i, Number(e.target.value) || 0)}
              className="w-16 rounded border border-white/10 bg-black px-2 py-1 font-mono text-xs text-white"
              aria-label={`Donation ${i + 1} to ${project.label}`}
            />
            <button
              onClick={() => remove(i)}
              className="text-[10px] text-gray-600 hover:text-red-400"
              aria-label={`Remove donor ${i + 1}`}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <p className="mt-2 font-mono text-[10px] text-gray-500">
        direct: ${project.donations.reduce((a, b) => a + b, 0)} · weight:{' '}
        {quadraticWeight(project.donations).toFixed(1)}
      </p>
    </div>
  );
}

export function QuadraticFundingSimulator() {
  const [projects, setProjects] = useState<ProjectState[]>(DEFAULT_PROJECTS);
  const [pool, setPool] = useState<number>(1000);

  const payouts = useMemo(
    () =>
      computePayouts(
        projects.map((p) => ({ id: p.id, donations: p.donations })),
        pool
      ),
    [projects, pool]
  );

  const maxPayout = Math.max(1, ...payouts.map((p) => p.payout));
  const x = useMemo(
    () => scaleLinear().domain([0, maxPayout]).range([0, 100]),
    [maxPayout]
  );

  const demo = useMemo(() => democracyDemo(1, 10), []);
  const collusion = useMemo(() => collusionDemo(100, 10), []);

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6 text-white">
      <header>
        <h1 className="text-3xl font-black uppercase tracking-tight">
          Quadratic Funding <span className="text-red-500">Simulator</span>
        </h1>
        <p className="mt-1 font-mono text-xs tracking-widest text-gray-500 uppercase">
          Matching = ( Σ √c )² — broad grassroots support wins
        </p>
      </header>

      {/* Interactive project list */}
      <section className="space-y-3">
        <div className="flex items-center gap-4">
          <label className="font-mono text-[10px] tracking-widest text-gray-500 uppercase">
            Matching pool ($)
          </label>
          <input
            type="number"
            min={0}
            value={pool}
            onChange={(e) => setPool(Number(e.target.value) || 0)}
            className="w-28 rounded border border-white/10 bg-black px-2 py-1 font-mono text-xs text-white"
          />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {projects.map((p) => (
            <DonationEditor
              key={p.id}
              project={p}
              onChange={(donations) =>
                setProjects((prev) => prev.map((q) => (q.id === p.id ? { ...q, donations } : q)))
              }
            />
          ))}
        </div>
      </section>

      {/* D3-powered allocation chart */}
      <section className="rounded-2xl border border-white/10 bg-zinc-950 p-6">
        <h3 className="mb-4 border-b border-white/10 pb-2 font-mono text-[10px] tracking-widest text-gray-400 uppercase">
          Live Matching Allocation
        </h3>
        <svg width="100%" height="220" role="img" aria-label="Matching allocation chart">
          {payouts.map((p, i) => {
            const y = 20 + i * 70;
            const label = projects.find((q) => q.id === p.id)?.label ?? p.id;
            return (
              <g key={p.id} transform={`translate(140, ${y})`}>
                <text x={-10} y={14} textAnchor="end" className="fill-gray-300" fontSize={11}>
                  {label}
                </text>
                <rect width="100%" height="28" y={0} fill="transparent" />
                <rect
                  x={0}
                  y={0}
                  height={28}
                  width={`${x(p.payout)}%`}
                  rx={4}
                  className="fill-red-500"
                />
                <text x={`${x(p.payout) + 1}%`} y={19} className="fill-white" fontSize={11}>
                  ${p.payout.toFixed(1)}
                </text>
              </g>
            );
          })}
        </svg>
      </section>

      {/* Democracy demonstration */}
      <section className="rounded-2xl border border-red-500/20 bg-red-950/10 p-6">
        <h3 className="mb-2 font-mono text-[10px] tracking-widest text-red-400 uppercase">
          Why Quadratic Funding Is Democratic
        </h3>
        <p className="text-sm text-gray-300">
          Ten donations of <b>$1</b> generate a match weight of{' '}
          <b>{demo.grassrootsWeight.toFixed(1)}</b>, while one donation of <b>$10</b> only
          generates <b>{demo.whaleWeight.toFixed(1)}</b>. Grassroots support wins by{' '}
          <b>{demo.advantage.toFixed(1)}×</b>.
        </p>
      </section>

      {/* Collusion demonstration */}
      <section className="rounded-2xl border border-white/10 bg-zinc-950 p-6">
        <h3 className="mb-2 font-mono text-[10px] tracking-widest text-gray-400 uppercase">
          Collusion & Pairwise Coordination Penalty
        </h3>
        <p className="text-sm text-gray-300">
          A puppet-master splitting <b>$100</b> across 10 sock-puppet addresses only earns a
          coordinated weight of <b>{collusion.colludingWeight.toFixed(1)}</b>, versus{' '}
          <b>{collusion.honestWeight.toFixed(1)}</b> if those 10 were distinct honest donors — a{' '}
          <b>{collusion.penaltyFactor.toFixed(1)}×</b> penalty. Pairwise coordination algorithms
          collapse puppet addresses to a single real contributor, so splitting stake never
          helps.
        </p>
      </section>
    </div>
  );
}

export default QuadraticFundingSimulator;
