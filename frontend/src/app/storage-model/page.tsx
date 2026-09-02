'use client';

/**
 * Soroban storage model visualiser (Issue #1162).
 *
 * The lesson the page is built around: Temporary and Persistent are not "short"
 * and "long". They differ in what expiry *does* — deletion versus archival —
 * and that is what decides which one a given piece of state belongs in.
 */

import { useMemo, useState } from 'react';
import {
  CODE_EXAMPLES,
  DEFAULT_RENT_PARAMETERS,
  LEDGERS_PER_DAY,
  TIER_PROFILES,
  compareTiers,
  entryState,
  extendTtl,
  ledgersRemaining,
  quoteRentForDays,
  restoreEntry,
  type StorageEntry,
  type StorageTier,
} from '@/lib/soroban-storage-model';

const TIERS: StorageTier[] = ['instance', 'temporary', 'persistent'];

const INITIAL_ENTRIES: StorageEntry[] = [
  { id: 'e1', key: 'admin_address', tier: 'instance', sizeBytes: 56, createdAtLedger: 0, expiresAtLedger: LEDGERS_PER_DAY * 14 },
  { id: 'e2', key: 'price_cache::XLM', tier: 'temporary', sizeBytes: 32, createdAtLedger: 0, expiresAtLedger: LEDGERS_PER_DAY * 1 },
  { id: 'e3', key: 'balance::GABC…', tier: 'persistent', sizeBytes: 72, createdAtLedger: 0, expiresAtLedger: LEDGERS_PER_DAY * 20 },
];

function formatXlm(xlm: number): string {
  if (xlm === 0) return '0 XLM';
  if (xlm < 0.0000001) return '<0.0000001 XLM';
  return `${xlm.toFixed(7).replace(/0+$/, '').replace(/\.$/, '')} XLM`;
}

function formatLedgers(ledgers: number): string {
  const days = ledgers / LEDGERS_PER_DAY;
  if (days >= 1) return `${ledgers.toLocaleString()} (${days.toFixed(1)}d)`;
  const hours = (ledgers * 5) / 3600;
  return `${ledgers.toLocaleString()} (${hours.toFixed(1)}h)`;
}

export default function StorageModelPage() {
  const [entries, setEntries] = useState<StorageEntry[]>(INITIAL_ENTRIES);
  const [currentLedger, setCurrentLedger] = useState(0);
  const [selectedTier, setSelectedTier] = useState<StorageTier>('persistent');
  const [log, setLog] = useState<string[]>([]);

  // Rent calculator inputs.
  const [calcBytes, setCalcBytes] = useState(1024);
  const [calcDays, setCalcDays] = useState(30);

  const maxLedger = LEDGERS_PER_DAY * 35;

  const comparison = useMemo(
    () => compareTiers(calcBytes, Math.round(calcDays * LEDGERS_PER_DAY), DEFAULT_RENT_PARAMETERS),
    [calcBytes, calcDays]
  );

  function note(message: string) {
    setLog((prev) => [message, ...prev].slice(0, 8));
  }

  function handleExtend(entry: StorageEntry) {
    const result = extendTtl(entry, currentLedger, LEDGERS_PER_DAY * 30);
    if (!result.ok) {
      note(`extend_ttl on ${entry.key} refused — ${result.reason}`);
      return;
    }
    setEntries((prev) => prev.map((e) => (e.id === entry.id ? result.entry : e)));
    note(
      result.quote && result.quote.ledgers > 0
        ? `extend_ttl on ${entry.key}: +${formatLedgers(result.quote.ledgers)} for ${formatXlm(result.quote.totalXlm)}`
        : `extend_ttl on ${entry.key}: ${result.reason}`
    );
  }

  function handleRestore(entry: StorageEntry) {
    const result = restoreEntry(entry, currentLedger, LEDGERS_PER_DAY * 30);
    if (!result.ok) {
      note(`restore on ${entry.key} refused — ${result.reason}`);
      return;
    }
    setEntries((prev) => prev.map((e) => (e.id === entry.id ? result.entry : e)));
    note(`restore on ${entry.key}: ${formatXlm(result.costXlm ?? 0)}`);
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-white">Soroban Storage Model</h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-400">
          Instance, Temporary and Persistent are not &ldquo;short&rdquo; and &ldquo;long&rdquo;. All
          three expire. What separates them is what expiry <em>does</em> — and that is what decides
          where a given piece of state belongs.
        </p>
      </header>

      {/* ── Tier cards ──────────────────────────────────────────────────── */}
      <section className="mb-10 grid gap-4 md:grid-cols-3">
        {TIERS.map((tier) => {
          const profile = TIER_PROFILES[tier];
          const active = selectedTier === tier;
          return (
            <button
              key={tier}
              type="button"
              onClick={() => setSelectedTier(tier)}
              className={`rounded-xl border p-4 text-left transition-colors ${
                active ? 'border-emerald-400/60 bg-emerald-500/10' : 'border-white/10 bg-white/5 hover:bg-white/10'
              }`}
            >
              <div className="flex items-baseline justify-between">
                <h2 className="text-base font-semibold text-white">{profile.label}</h2>
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                    profile.expiryBehaviour === 'deleted'
                      ? 'bg-red-500/20 text-red-200'
                      : 'bg-amber-500/20 text-amber-200'
                  }`}
                >
                  {profile.expiryBehaviour}
                </span>
              </div>
              <p className="mt-2 text-xs text-zinc-400">{profile.description}</p>
              <dl className="mt-3 space-y-1 text-[11px] text-zinc-500">
                <div><span className="text-zinc-400">Use for:</span> {profile.useWhen}</div>
                <div><span className="text-zinc-400">Not for:</span> {profile.avoidWhen}</div>
              </dl>
            </button>
          );
        })}
      </section>

      {/* ── Live TTL timeline ───────────────────────────────────────────── */}
      <section className="mb-10 rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Entry lifecycles</h2>
          <div className="text-xs text-zinc-400">
            ledger <span className="font-mono text-zinc-200">{currentLedger.toLocaleString()}</span>{' '}
            (~day {(currentLedger / LEDGERS_PER_DAY).toFixed(1)})
          </div>
        </div>

        <label htmlFor="ledger" className="block text-xs text-zinc-500">
          Advance the ledger to watch entries expire
        </label>
        <input
          id="ledger"
          type="range"
          min={0}
          max={maxLedger}
          step={LEDGERS_PER_DAY / 4}
          value={currentLedger}
          onChange={(e) => setCurrentLedger(Number(e.target.value))}
          className="mt-1 w-full accent-emerald-400"
        />

        <div className="mt-5 space-y-3">
          {entries.map((entry) => {
            const state = entryState(entry, currentLedger);
            const remaining = ledgersRemaining(entry, currentLedger);
            const profile = TIER_PROFILES[entry.tier];
            const pct = Math.max(0, Math.min(100, (remaining / profile.maxTtlLedgers) * 100));

            return (
              <div key={entry.id} className="rounded-lg border border-white/10 bg-zinc-950/60 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <code className="text-xs text-zinc-200">{entry.key}</code>
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-zinc-500">
                      {profile.label} · {entry.sizeBytes}B
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-medium ${
                        state === 'live'
                          ? 'bg-emerald-500/20 text-emerald-200'
                          : state === 'expired-archived'
                            ? 'bg-amber-500/20 text-amber-200'
                            : 'bg-red-500/20 text-red-200'
                      }`}
                    >
                      {state === 'live'
                        ? `live · ${formatLedgers(remaining)} left`
                        : state === 'expired-archived'
                          ? 'archived — restorable'
                          : 'deleted — unrecoverable'}
                    </span>

                    <button
                      type="button"
                      onClick={() => handleExtend(entry)}
                      className="rounded border border-white/15 px-2 py-1 text-[11px] text-zinc-200 hover:bg-white/10"
                    >
                      extend_ttl
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRestore(entry)}
                      className="rounded border border-white/15 px-2 py-1 text-[11px] text-zinc-200 hover:bg-white/10"
                    >
                      restore
                    </button>
                  </div>
                </div>

                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full transition-all ${
                      state === 'live'
                        ? 'bg-emerald-400'
                        : state === 'expired-archived'
                          ? 'bg-amber-400'
                          : 'bg-red-400'
                    }`}
                    style={{ width: `${state === 'live' ? pct : 100}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {log.length > 0 && (
          <ul className="mt-4 space-y-1 text-[11px] text-zinc-500">
            {log.map((line, i) => (
              <li key={`${line}-${i}`} className="font-mono">
                {line}
              </li>
            ))}
          </ul>
        )}

        <p className="mt-4 text-xs text-zinc-500">
          Try advancing past day 1, then pressing <code>restore</code> on the temporary cache entry.
          It refuses — the data is gone. The persistent balance at the same moment restores fine.
          That single difference is the whole choice between the two tiers.
        </p>
      </section>

      {/* ── Rent calculator ─────────────────────────────────────────────── */}
      <section className="mb-10 rounded-xl border border-white/10 bg-white/5 p-5">
        <h2 className="text-lg font-semibold text-white">Rent calculator</h2>
        <p className="mt-1 text-xs text-zinc-400">
          Cost of holding one entry for a period, per tier. Fee rates are network parameters and
          change between protocol versions — treat these as a projection, not a quote.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="bytes" className="block text-xs text-zinc-500">
              Entry size: {calcBytes} bytes (+{DEFAULT_RENT_PARAMETERS.entryOverheadBytes}B overhead)
            </label>
            <input
              id="bytes"
              type="range"
              min={16}
              max={8192}
              step={16}
              value={calcBytes}
              onChange={(e) => setCalcBytes(Number(e.target.value))}
              className="mt-1 w-full accent-emerald-400"
            />
          </div>
          <div>
            <label htmlFor="days" className="block text-xs text-zinc-500">
              Lifespan: {calcDays} days ({Math.round(calcDays * LEDGERS_PER_DAY).toLocaleString()} ledgers)
            </label>
            <input
              id="days"
              type="range"
              min={1}
              max={30}
              value={calcDays}
              onChange={(e) => setCalcDays(Number(e.target.value))}
              className="mt-1 w-full accent-emerald-400"
            />
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-xs">
            <thead className="text-zinc-500">
              <tr>
                <th className="pb-2 font-medium">Tier</th>
                <th className="pb-2 font-medium">Rent</th>
                <th className="pb-2 font-medium">+ write</th>
                <th className="pb-2 font-medium">Total</th>
                <th className="pb-2 font-medium">On expiry</th>
              </tr>
            </thead>
            <tbody className="text-zinc-300">
              {comparison.map(({ tier, quote, expiryBehaviour, restorable }) => (
                <tr key={tier} className="border-t border-white/5">
                  <td className="py-2 capitalize">{tier}</td>
                  <td className="py-2 font-mono">{formatXlm(quote.rentStroops / 10_000_000)}</td>
                  <td className="py-2 font-mono text-zinc-500">
                    {formatXlm(quote.writeStroops / 10_000_000)}
                  </td>
                  <td className="py-2 font-mono text-emerald-300">{formatXlm(quote.totalXlm)}</td>
                  <td className="py-2">
                    <span className={expiryBehaviour === 'deleted' ? 'text-red-300' : 'text-amber-300'}>
                      {expiryBehaviour}
                    </span>
                    <span className="text-zinc-600">{restorable ? ' (restorable)' : ' (gone)'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs text-zinc-500">
          Temporary looks like the obvious saving until the last column: you are not buying a
          discount, you are declining archival. For anything you cannot recompute, that is not a
          trade you can make.
        </p>
      </section>

      {/* ── Code examples ───────────────────────────────────────────────── */}
      <section className="rounded-xl border border-white/10 bg-white/5 p-5">
        <h2 className="text-lg font-semibold text-white">
          TTL maintenance — {TIER_PROFILES[selectedTier].label}
        </h2>
        <p className="mt-1 text-xs text-zinc-400">{CODE_EXAMPLES[selectedTier].note}</p>
        <pre className="mt-3 overflow-x-auto rounded-lg border border-white/10 bg-zinc-950 p-4 text-[11px] leading-relaxed text-zinc-300">
          <code>{CODE_EXAMPLES[selectedTier].extend}</code>
        </pre>
        <p className="mt-3 text-xs text-zinc-500">
          Select a tier above to see its maintenance pattern.
        </p>
      </section>
    </main>
  );
}
