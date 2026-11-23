'use client';

import { useMemo, useState } from 'react';

import {
  MemoryProfile,
  WASM_PAGE_BYTES,
  WasmModuleInfo,
  formatBytes,
  profileMemory,
  simulateAllocatorGrowth,
} from '@/lib/wasmAnalyzer';

/**
 * WASM memory profiler & allocator leak detector (Issue #1404).
 *
 * There is no VM here, so this cannot watch a real heap. What it does
 * instead: lay out every declared memory's pages against the module's own
 * Data section — the bytes it ships pre-loaded — and flag what is already
 * visible statically (an out-of-bounds write baked into the binary, an
 * unbounded memory) before it ever reaches the network. The growth
 * simulator below models the runtime symptom a leaking bump/arena allocator
 * produces: memory that only ever grows until the host's ceiling stops it.
 */
export function MemoryProfilerPanel({ info }: { info: WasmModuleInfo }) {
  const profiles = useMemo(() => profileMemory(info), [info]);
  const [selected, setSelected] = useState(0);
  const [growthPerStep, setGrowthPerStep] = useState(4);
  const [steps, setSteps] = useState(20);

  const profile = profiles[selected];

  const simulation = useMemo(
    () => (profile ? simulateAllocatorGrowth(profile, { growthPagesPerStep: growthPerStep, steps }) : []),
    [profile, growthPerStep, steps],
  );

  if (profiles.length === 0) {
    return (
      <section className="rounded-2xl border border-white/10 bg-zinc-950 p-6">
        <h2 className="mb-2 text-xs tracking-widest text-zinc-400 uppercase">
          Memory profiler & leak detector
        </h2>
        <p className="text-sm text-zinc-500">
          This module declares no memory (neither imported nor local) — nothing to profile.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-950 p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xs tracking-widest text-zinc-400 uppercase">
          Memory profiler & allocator leak detector
        </h2>
        {profiles.length > 1 && (
          <select
            value={selected}
            onChange={(e) => setSelected(Number(e.target.value))}
            className="rounded border border-white/10 bg-black px-2 py-1 text-xs text-white"
          >
            {profiles.map((p, i) => (
              <option key={p.memoryIndex} value={i}>
                memory[{p.memoryIndex}]
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Summary */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Initial" value={`${profile.minPages}pg / ${formatBytes(profile.minBytes)}`} />
        <Stat
          label="Maximum"
          value={profile.maxPages !== undefined ? `${profile.maxPages}pg / ${formatBytes(profile.maxBytes!)}` : 'unbounded'}
          warn={profile.maxPages === undefined}
        />
        <Stat label="Static data" value={formatBytes(profile.staticBytesUsed)} />
        <Stat
          label="Risks flagged"
          value={String(profile.risks.length)}
          warn={profile.risks.some((r) => r.severity === 'critical')}
        />
      </div>

      {/* Page map */}
      <div className="mb-6">
        <p className="mb-2 text-[10px] tracking-[0.2em] text-zinc-500 uppercase">
          Page map ({profile.pages.length} × {formatBytes(WASM_PAGE_BYTES)} pages)
        </p>
        <div className="flex flex-wrap gap-1" role="list" aria-label="Memory page map">
          {profile.pages.slice(0, 512).map((page) => {
            const fill = page.usedBytes / WASM_PAGE_BYTES;
            return (
              <div
                key={page.index}
                role="listitem"
                title={`page ${page.index}: ${formatBytes(page.usedBytes)} static data`}
                className="h-4 w-4 rounded-sm border border-white/10"
                style={{
                  backgroundColor:
                    fill === 0
                      ? 'rgba(255,255,255,0.04)'
                      : `rgba(239, 68, 68, ${Math.min(1, 0.25 + fill * 0.75)})`,
                }}
              />
            );
          })}
        </div>
        {profile.pages.length > 512 && (
          <p className="mt-2 text-[11px] text-zinc-600">
            Showing the first 512 of {profile.pages.length} pages.
          </p>
        )}
      </div>

      {/* Risks */}
      {profile.risks.length > 0 && (
        <div className="mb-6 space-y-3">
          {profile.risks.map((risk) => (
            <div
              key={risk.title}
              className={`rounded border-l-2 bg-black p-3 ${
                risk.severity === 'critical' ? 'border-red-500' : 'border-amber-500'
              }`}
            >
              <p
                className={`text-xs uppercase tracking-wide ${
                  risk.severity === 'critical' ? 'text-red-400' : 'text-amber-400'
                }`}
              >
                {risk.title}
              </p>
              <p className="mt-1 text-[11px] text-zinc-500">{risk.detail}</p>
            </div>
          ))}
        </div>
      )}

      {/* Allocator growth spike simulator */}
      <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
        <p className="mb-3 text-[10px] tracking-[0.2em] text-zinc-500 uppercase">
          Allocator growth simulator — models a bump/arena allocator that grows and never frees
        </p>
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="text-[11px] text-zinc-400">
            Pages grown per allocation spike: <span className="text-white">{growthPerStep}</span>
            <input
              type="range"
              min={1}
              max={64}
              value={growthPerStep}
              onChange={(e) => setGrowthPerStep(Number(e.target.value))}
              className="mt-1 h-1.5 w-full cursor-pointer accent-red-600"
            />
          </label>
          <label className="text-[11px] text-zinc-400">
            Spikes simulated: <span className="text-white">{steps}</span>
            <input
              type="range"
              min={1}
              max={100}
              value={steps}
              onChange={(e) => setSteps(Number(e.target.value))}
              className="mt-1 h-1.5 w-full cursor-pointer accent-red-600"
            />
          </label>
        </div>

        <div className="flex h-24 items-end gap-[2px] overflow-hidden rounded bg-black/60 p-2">
          {simulation.map((s) => {
            const ceiling = profile.maxPages ?? simulation[simulation.length - 1]?.pages ?? 1;
            const height = Math.max(4, (s.pages / ceiling) * 100);
            return (
              <div
                key={s.step}
                title={`step ${s.step}: ${s.pages} pages (${formatBytes(s.bytes)})`}
                className={`flex-1 rounded-t ${s.overMax ? 'bg-red-500' : 'bg-emerald-500/70'}`}
                style={{ height: `${height}%` }}
              />
            );
          })}
        </div>

        {simulation.some((s) => s.overMax) ? (
          <p className="mt-3 text-[11px] text-red-400">
            At this growth rate, allocation spike #{simulation.findIndex((s) => s.overMax) + 1} exceeds{' '}
            {profile.maxPages !== undefined ? 'the declared maximum' : 'wasm32\'s address space'} — the host
            traps the {'`memory.grow`'} call there. That trap is the runtime symptom of exactly the leak this
            panel is built to catch before deployment.
          </p>
        ) : (
          <p className="mt-3 text-[11px] text-zinc-500">
            Memory stays within {profile.maxPages !== undefined ? 'the declared maximum' : 'the address-space ceiling'}{' '}
            across all simulated spikes.
          </p>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <p className="text-[10px] tracking-[0.2em] text-zinc-500 uppercase">{label}</p>
      <p className={`font-mono text-lg ${warn ? 'text-amber-400' : 'text-white'}`}>{value}</p>
    </div>
  );
}

export type { MemoryProfile };
