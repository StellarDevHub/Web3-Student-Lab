'use client';

/**
 * Interactive Merkle tree visualiser (Issue #1159).
 *
 * Distinct from `/merkle-tree`, which is a fixed airdrop-verification demo
 * built on the FNV-1a `stableHash`. This one takes student input, hashes with
 * real SHA-256, and exists to make three things visible: the audit path, the
 * step-by-step root reconstruction, and the tamper cascade.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildMerkleTree,
  exportProofBundle,
  getPathNodeIds,
  getProof,
  getSiblingNodeIds,
  simulateTamper,
  verifyProof,
  type MerkleNode,
  type MerkleProofStep,
  type MerkleTree,
  type TamperResult,
  type VerificationResult,
} from '@/lib/merkle-sha256';

const DEFAULT_LEAVES = ['alice', 'bob', 'carol', 'dave', 'erin', 'frank'];

/** First 10 hex chars — enough to compare visually, short enough to fit. */
function short(hash: string): string {
  return `${hash.slice(0, 10)}…`;
}

export default function MerkleSimulatorPage() {
  const [rawInput, setRawInput] = useState(DEFAULT_LEAVES.join('\n'));
  const [tree, setTree] = useState<MerkleTree | null>(null);
  const [building, setBuilding] = useState(false);
  const [selectedLeaf, setSelectedLeaf] = useState<number | null>(null);
  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [visibleSteps, setVisibleSteps] = useState(0);
  const [tamper, setTamper] = useState<TamperResult | null>(null);
  const [tamperValue, setTamperValue] = useState('');

  const leafValues = useMemo(
    () => rawInput.split('\n').map((l) => l.trim()).filter(Boolean),
    [rawInput]
  );

  const rebuild = useCallback(async () => {
    setBuilding(true);
    // Clear derived state: a proof or cascade computed against the previous
    // tree is meaningless once the leaves change, and showing it would be
    // actively misleading.
    setSelectedLeaf(null);
    setVerification(null);
    setVisibleSteps(0);
    setTamper(null);
    setTree(await buildMerkleTree(leafValues));
    setBuilding(false);
  }, [leafValues]);

  useEffect(() => {
    void rebuild();
    // Build once on mount; afterwards the student drives it with the button,
    // so a keystroke does not re-hash the whole tree.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const proof: MerkleProofStep[] = useMemo(
    () => (tree && selectedLeaf !== null ? getProof(tree, selectedLeaf) : []),
    [tree, selectedLeaf]
  );

  const pathIds = useMemo(
    () => (tree && selectedLeaf !== null ? new Set(getPathNodeIds(tree, selectedLeaf)) : new Set<string>()),
    [tree, selectedLeaf]
  );

  const siblingIds = useMemo(
    () => (tree ? new Set(getSiblingNodeIds(tree, proof)) : new Set<string>()),
    [tree, proof]
  );

  const changedIds = useMemo(
    () => new Set(tamper?.changedNodeIds ?? []),
    [tamper]
  );

  async function handleSelectLeaf(index: number) {
    if (!tree) return;
    setSelectedLeaf(index);
    setTamper(null);
    setVisibleSteps(0);
    setVerification(await verifyProof(tree.leaves[index], getProof(tree, index), tree.root.hash));
  }

  async function handleTamper() {
    if (!tree || selectedLeaf === null || !tamperValue.trim()) return;
    setTamper(await simulateTamper(tree, selectedLeaf, tamperValue.trim()));
  }

  async function handleExport() {
    if (!tree || selectedLeaf === null) return;
    const bundle = await exportProofBundle(tree, selectedLeaf);
    if (!bundle) return;

    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `merkle-proof-${bundle.leaf}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function nodeClasses(node: MerkleNode): string {
    if (changedIds.has(node.id)) return 'border-red-400 bg-red-500/20 text-red-100';
    if (pathIds.has(node.id)) return 'border-emerald-400 bg-emerald-500/20 text-emerald-100';
    if (siblingIds.has(node.id)) return 'border-amber-400 bg-amber-500/20 text-amber-100';
    return 'border-white/10 bg-white/5 text-zinc-300';
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-white">Merkle Tree Simulator</h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-400">
          Build a Merkle tree from your own values, generate an inclusion proof, and watch the
          root be reconstructed one hash at a time. Hashing is real SHA-256, with leaves domain
          separated by a <code className="text-zinc-300">0x00</code> prefix and internal nodes by{' '}
          <code className="text-zinc-300">0x01</code>, so exported proofs are valid test vectors.
        </p>
      </header>

      <section className="mb-8 grid gap-6 lg:grid-cols-[320px_1fr]">
        <div>
          <label htmlFor="leaves" className="block text-sm font-medium text-zinc-200">
            Leaf values (one per line)
          </label>
          <textarea
            id="leaves"
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            rows={10}
            className="mt-2 w-full rounded-lg border border-white/10 bg-zinc-950 p-3 font-mono text-xs text-zinc-100"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => void rebuild()}
            disabled={building || leafValues.length === 0}
            className="mt-3 w-full rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50"
          >
            {building ? 'Hashing…' : 'Build tree'}
          </button>
          <p className="mt-2 text-xs text-zinc-500">
            Blank lines and duplicates are dropped. {leafValues.length} value
            {leafValues.length === 1 ? '' : 's'} entered.
          </p>
        </div>

        <div className="min-w-0">
          {!tree ? (
            <p className="text-sm text-zinc-500">Enter at least one value to build a tree.</p>
          ) : (
            <div className="space-y-4 overflow-x-auto">
              <div className="text-xs text-zinc-400">
                Root <code className="text-emerald-300">{short(tree.root.hash)}</code> · depth{' '}
                {tree.depth} · {tree.leaves.length} leaves
              </div>

              {/* Root at the top, leaves at the bottom — the direction a proof travels. */}
              {[...tree.levels].reverse().map((level, reversedIndex) => {
                const levelNumber = tree.levels.length - 1 - reversedIndex;
                return (
                  <div key={levelNumber} className="flex flex-wrap items-center gap-2">
                    <span className="w-16 shrink-0 text-[10px] uppercase tracking-wider text-zinc-600">
                      {levelNumber === 0 ? 'leaves' : `level ${levelNumber}`}
                    </span>
                    {level.map((node) => (
                      <button
                        key={node.id}
                        type="button"
                        disabled={!node.isLeaf}
                        onClick={() => node.isLeaf && void handleSelectLeaf(node.index)}
                        className={`rounded-md border px-2 py-1 font-mono text-[11px] transition-colors ${nodeClasses(node)} ${
                          node.isLeaf ? 'cursor-pointer hover:brightness-125' : 'cursor-default'
                        }`}
                        title={node.value ? `${node.value} → ${node.hash}` : node.hash}
                      >
                        {node.value ? `${node.value} ` : ''}
                        {short(node.hash)}
                        {node.promoted ? ' ↑' : ''}
                      </button>
                    ))}
                  </div>
                );
              })}

              <div className="flex flex-wrap gap-4 text-[11px] text-zinc-500">
                <span><span className="text-emerald-300">■</span> proof path</span>
                <span><span className="text-amber-300">■</span> sibling supplied by the proof</span>
                <span><span className="text-red-300">■</span> invalidated by tampering</span>
                <span>↑ promoted unpaired node</span>
              </div>
            </div>
          )}
        </div>
      </section>

      {tree && selectedLeaf !== null && verification && (
        <section className="mb-8 rounded-xl border border-white/10 bg-white/5 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-white">
              Proof for <code className="text-emerald-300">{tree.leaves[selectedLeaf]}</code>
            </h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setVisibleSteps((s) => Math.min(s + 1, verification.steps.length))}
                disabled={visibleSteps >= verification.steps.length}
                className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-zinc-200 disabled:opacity-40"
              >
                Step forward
              </button>
              <button
                type="button"
                onClick={() => setVisibleSteps(verification.steps.length)}
                className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-zinc-200"
              >
                Show all
              </button>
              <button
                type="button"
                onClick={() => void handleExport()}
                className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-zinc-100"
              >
                Export JSON test vector
              </button>
            </div>
          </div>

          <p className="mb-3 text-xs text-zinc-400">
            The proof carries {proof.length} sibling hash{proof.length === 1 ? '' : 'es'} — not the
            whole tree. That is the property that makes inclusion cheap to verify on-chain.
          </p>

          <ol className="space-y-2">
            {verification.steps.slice(0, visibleSteps).map((step) => (
              <li
                key={step.stepNumber}
                className="rounded-lg border border-white/10 bg-zinc-950/60 p-3 font-mono text-[11px] text-zinc-300"
              >
                <div className="text-zinc-500">
                  Step {step.stepNumber} · combine with the {step.position} sibling
                </div>
                <div className="mt-1">{step.concatenation}</div>
                <div className="mt-1 text-emerald-300">= {short(step.resultHash)}</div>
              </li>
            ))}
          </ol>

          {visibleSteps >= verification.steps.length && (
            <div
              className={`mt-4 rounded-lg border p-3 text-sm ${
                verification.valid
                  ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
                  : 'border-red-400/40 bg-red-500/10 text-red-200'
              }`}
            >
              {verification.valid
                ? `Reconstructed root matches: ${short(verification.computedRoot)}`
                : `Reconstructed ${short(verification.computedRoot)} but expected ${short(verification.expectedRoot)}`}
            </div>
          )}
        </section>
      )}

      {tree && selectedLeaf !== null && (
        <section className="rounded-xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-lg font-semibold text-white">Tamper with this leaf</h2>
          <p className="mt-1 text-xs text-zinc-400">
            Change the value and every hash on its path to the root changes with it. Nothing else
            in the tree moves — which is also why a proof only needs the siblings.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <input
              value={tamperValue}
              onChange={(e) => setTamperValue(e.target.value)}
              placeholder={`replace "${tree.leaves[selectedLeaf]}" with…`}
              className="flex-1 rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-100"
            />
            <button
              type="button"
              onClick={() => void handleTamper()}
              disabled={!tamperValue.trim()}
              className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              Tamper
            </button>
          </div>

          {tamper && (
            <div className="mt-4 space-y-2 text-xs">
              <p className="text-zinc-400">
                {tamper.changedNodeIds.length} node
                {tamper.changedNodeIds.length === 1 ? '' : 's'} invalidated, highlighted in red above.
              </p>
              <p className="font-mono text-zinc-500">
                before <span className="text-zinc-300">{short(tamper.originalRoot)}</span>
              </p>
              <p className="font-mono text-zinc-500">
                after <span className="text-red-300">{short(tamper.tamperedRoot)}</span>
              </p>
              <p className="text-zinc-400">
                Any proof issued against the original root now fails. Anyone holding that root
                detects the change without seeing the data.
              </p>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
