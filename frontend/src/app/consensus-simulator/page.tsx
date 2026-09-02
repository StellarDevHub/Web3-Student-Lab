'use client';

/**
 * Reorg and finality simulator (Issue #1163).
 *
 * Distinct from `/chain-reorg`, which animates two racing chains with random
 * hashes and declares a winner. This one models branches concretely, so a
 * reorg names the transactions it reverted, and contrasts that with SCP, where
 * the same attack cannot be attempted at all.
 */

import { useMemo, useState } from 'react';
import {
  BLOCK_TIME_SECONDS,
  branchWork,
  branches,
  canonicalChain,
  confirmationDepth,
  confirmationsForRisk,
  createChain,
  forkChain,
  mineBlock,
  reversalProbability,
  simulateDoubleSpend,
  stateAtTick,
  type ChainState,
  type ConsensusModel,
} from '@/lib/consensus-simulator';

const HONEST_TX = 'tx-payment';

export default function ConsensusSimulatorPage() {
  const [model, setModel] = useState<ConsensusModel>('pow');
  const [chain, setChain] = useState<ChainState>(() => createChain('pow'));
  const [scrubTick, setScrubTick] = useState<number | null>(null);
  const [hashPower, setHashPower] = useState(0.3);
  const [confirmations, setConfirmations] = useState(6);

  // Scrubbing replays history rather than showing a snapshot, so the scrubbed
  // view and the live view come from the same fork-choice code.
  const view = useMemo(
    () => (scrubTick === null ? chain : stateAtTick(chain, scrubTick)),
    [chain, scrubTick]
  );

  const canonical = canonicalChain(view);
  const allBranches = branches(view);
  const depth = confirmationDepth(view, HONEST_TX);

  const attack = useMemo(
    () => simulateDoubleSpend(model, { hashPower, merchantConfirmations: confirmations, amount: 100 }),
    [model, hashPower, confirmations]
  );

  function reset(next: ConsensusModel) {
    setModel(next);
    setChain(createChain(next));
    setScrubTick(null);
  }

  function act(fn: (s: ChainState) => ChainState) {
    setChain((prev) => fn(prev));
    setScrubTick(null); // return to live after acting
  }

  const safeConfirmations = confirmationsForRisk(hashPower);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-white">Reorg &amp; Finality Simulator</h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-400">
          &ldquo;Confirmed&rdquo; and &ldquo;final&rdquo; are not the same thing. Under
          proof-of-work a block is only ever <em>probably</em> permanent; under SCP a closed ledger
          cannot be rewritten at all. Build both and see what an attacker can actually do to each.
        </p>
      </header>

      {/* ── Model switch ────────────────────────────────────────────────── */}
      <section className="mb-8 flex flex-wrap gap-3">
        {(['pow', 'scp'] as ConsensusModel[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => reset(m)}
            className={`rounded-xl border px-4 py-3 text-left transition-colors ${
              model === m
                ? 'border-emerald-400/60 bg-emerald-500/10'
                : 'border-white/10 bg-white/5 hover:bg-white/10'
            }`}
          >
            <div className="text-sm font-semibold text-white">
              {m === 'pow' ? 'Proof of Work (Nakamoto)' : 'Stellar Consensus Protocol'}
            </div>
            <div className="mt-1 text-xs text-zinc-400">
              {m === 'pow'
                ? `~${BLOCK_TIME_SECONDS.pow / 60} min blocks · probabilistic finality`
                : `~${BLOCK_TIME_SECONDS.scp}s ledgers · deterministic finality`}
            </div>
          </button>
        ))}
      </section>

      {/* ── Chain controls ──────────────────────────────────────────────── */}
      <section className="mb-8 rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => act((s) => mineBlock(s))}
            className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-zinc-950"
          >
            {model === 'pow' ? 'Mine block' : 'Close ledger'}
          </button>
          <button
            type="button"
            onClick={() => act((s) => mineBlock(s, { txIds: [HONEST_TX] }))}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-zinc-200"
          >
            Include payment
          </button>
          <button
            type="button"
            onClick={() => act((s) => forkChain(s, 'attacker', 0))}
            className="rounded-lg border border-amber-400/40 px-3 py-1.5 text-xs text-amber-200"
          >
            Fork from genesis
          </button>
          <button
            type="button"
            onClick={() => act((s) => mineBlock(s, { branch: 'attacker', work: 3 }))}
            className="rounded-lg border border-red-400/40 px-3 py-1.5 text-xs text-red-200"
          >
            Mine on attacker branch (3× work)
          </button>
          <button
            type="button"
            onClick={() => reset(model)}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-zinc-400"
          >
            Reset
          </button>
        </div>

        {/* Branch views */}
        <div className="space-y-4">
          {(allBranches.length ? allBranches : ['main']).map((branch) => {
            const isCanonical = branch === view.canonicalBranch;
            const blocks = view.blocks
              .filter((b) => b.branch === branch || b.id === 'genesis')
              .sort((a, b) => a.height - b.height);

            return (
              <div key={branch}>
                <div className="mb-1 flex items-center gap-2 text-xs">
                  <span className={isCanonical ? 'text-emerald-300' : 'text-zinc-500'}>
                    {branch}
                  </span>
                  {isCanonical && (
                    <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-200">
                      canonical
                    </span>
                  )}
                  <span className="text-zinc-600">work {branchWork(view, branch)}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {blocks.map((block) => (
                    <div
                      key={block.id}
                      className={`rounded-md border px-2 py-1 font-mono text-[11px] ${
                        isCanonical
                          ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
                          : 'border-white/10 bg-white/5 text-zinc-500 line-through'
                      }`}
                      title={`${block.id} · ${block.hash}`}
                    >
                      #{block.height}
                      {block.txIds.length > 0 && (
                        <span className="ml-1 text-amber-300">◆{block.txIds.length}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 rounded-lg border border-white/10 bg-zinc-950/60 p-3 text-xs">
          <span className="text-zinc-500">Payment status: </span>
          {depth === null ? (
            <span className="text-red-300">
              not on the canonical chain — reverted or never included
            </span>
          ) : (
            <span className="text-emerald-300">
              {depth} confirmation{depth === 1 ? '' : 's'}
              {model === 'scp' ? ' · final' : ` · ${(reversalProbability(hashPower, depth) * 100).toFixed(4)}% reversible at ${(hashPower * 100).toFixed(0)}% hash power`}
            </span>
          )}
        </div>

        {/* Timeline scrubber */}
        {chain.tick > 0 && (
          <div className="mt-4">
            <label htmlFor="scrub" className="block text-xs text-zinc-500">
              Timeline — inspect the chain as it stood at any point
              {scrubTick !== null && (
                <button
                  type="button"
                  onClick={() => setScrubTick(null)}
                  className="ml-2 text-emerald-400 underline"
                >
                  back to live
                </button>
              )}
            </label>
            <input
              id="scrub"
              type="range"
              min={0}
              max={chain.tick}
              value={scrubTick ?? chain.tick}
              onChange={(e) => setScrubTick(Number(e.target.value))}
              className="mt-1 w-full accent-emerald-400"
            />
          </div>
        )}
      </section>

      {/* ── Event log ───────────────────────────────────────────────────── */}
      {view.events.length > 0 && (
        <section className="mb-8 rounded-xl border border-white/10 bg-white/5 p-5">
          <h2 className="mb-3 text-lg font-semibold text-white">Event log</h2>
          <ul className="space-y-1.5 text-xs">
            {[...view.events].reverse().map((event, i) => (
              <li
                key={`${event.tick}-${i}`}
                className={
                  event.kind === 'reorg'
                    ? 'text-red-300'
                    : event.kind === 'finalized'
                      ? 'text-emerald-300'
                      : event.kind === 'fork'
                        ? 'text-amber-300'
                        : 'text-zinc-500'
                }
              >
                <span className="mr-2 font-mono text-zinc-600">t{event.tick}</span>
                {event.message}
                {event.revertedTxIds && event.revertedTxIds.length > 0 && (
                  <span className="ml-1 font-mono text-red-200">
                    [{event.revertedTxIds.join(', ')}]
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Double-spend lab ────────────────────────────────────────────── */}
      <section className="rounded-xl border border-white/10 bg-white/5 p-5">
        <h2 className="text-lg font-semibold text-white">Double-spend lab</h2>
        <p className="mt-1 text-xs text-zinc-400">
          The attacker pays a merchant, waits for the merchant to ship, then releases a privately
          mined branch that spends the same funds elsewhere.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="power" className="block text-xs text-zinc-500">
              Attacker hash power: {(hashPower * 100).toFixed(0)}%
            </label>
            <input
              id="power"
              type="range"
              min={5}
              max={70}
              value={hashPower * 100}
              onChange={(e) => setHashPower(Number(e.target.value) / 100)}
              className="mt-1 w-full accent-red-400"
            />
          </div>
          <div>
            <label htmlFor="confs" className="block text-xs text-zinc-500">
              Merchant waits: {confirmations} confirmation{confirmations === 1 ? '' : 's'}
            </label>
            <input
              id="confs"
              type="range"
              min={1}
              max={20}
              value={confirmations}
              onChange={(e) => setConfirmations(Number(e.target.value))}
              className="mt-1 w-full accent-emerald-400"
            />
          </div>
        </div>

        <div
          className={`mt-4 rounded-lg border p-4 ${
            attack.succeeded
              ? 'border-red-400/40 bg-red-500/10'
              : 'border-emerald-400/40 bg-emerald-500/10'
          }`}
        >
          <div className={`text-sm font-semibold ${attack.succeeded ? 'text-red-200' : 'text-emerald-200'}`}>
            {attack.succeeded ? 'Double-spend succeeded' : 'Double-spend failed'}
          </div>
          <ol className="mt-2 space-y-1 text-xs text-zinc-300">
            {attack.narrative.map((line, i) => (
              <li key={i}>{i + 1}. {line}</li>
            ))}
          </ol>
        </div>

        <div className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
          <div className="rounded-lg border border-white/10 bg-zinc-950/60 p-3">
            <div className="text-zinc-500">Reversal probability at {confirmations} confirmations</div>
            <div className="mt-1 font-mono text-lg text-white">
              {model === 'scp' ? '0%' : `${(attack.reversalProbability * 100).toFixed(6)}%`}
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-zinc-950/60 p-3">
            <div className="text-zinc-500">Confirmations for &lt;0.1% risk</div>
            <div className="mt-1 font-mono text-lg text-white">
              {model === 'scp'
                ? '1 (final immediately)'
                : Number.isFinite(safeConfirmations)
                  ? safeConfirmations
                  : 'no safe number'}
            </div>
          </div>
        </div>

        <p className="mt-3 text-xs text-zinc-500">
          Push hash power to 50% or above and the safe confirmation count stops existing — that is
          what a 51% attack means. Switch to SCP and the same slider does nothing to safety: an
          attacker with that much influence can stall the network, but stalling is a liveness
          failure, not a reversal.
        </p>
      </section>
    </main>
  );
}
