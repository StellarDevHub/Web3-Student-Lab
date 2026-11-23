'use client';

/**
 * Merkle Proof Studio (FE-HARD-27) — the single unified `/merkle-tree` route.
 *
 * Merges the former `/merkle-tree` airdrop demo (D3 canvas visualisation) and
 * the former `/merkle-simulator` route (SHA-256 tree construction, inclusion
 * proofs, tamper simulation) into one interactive cryptographic studio:
 *
 * - interactive tree construction from student-supplied leaves,
 * - SHA-256 leaf hashing with `0x00`/`0x01` domain separation,
 * - inclusion-proof generation and step-by-step root reconstruction,
 * - proof verification (members and non-members) rendered on a
 *   ResizeObserver-driven D3 canvas.
 */

import * as d3 from 'd3';
import { FlaskConical, Plus, ShieldCheck, TreeDeciduous } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildMerkleTree,
  exportProofBundle,
  getPathNodeIds,
  getProof,
  getSiblingNodeIds,
  hashLeaf,
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

export default function MerkleTreePage() {
  const [rawInput, setRawInput] = useState(DEFAULT_LEAVES.join('\n'));
  const [tree, setTree] = useState<MerkleTree | null>(null);
  const [building, setBuilding] = useState(false);
  const [selectedLeaf, setSelectedLeaf] = useState<number | null>(null);
  const [leafHash, setLeafHash] = useState<string | null>(null);
  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [visibleSteps, setVisibleSteps] = useState(0);
  const [tamper, setTamper] = useState<TamperResult | null>(null);
  const [tamperValue, setTamperValue] = useState('');
  const [manualValue, setManualValue] = useState('');
  const [manualResult, setManualResult] = useState<VerificationResult | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(800);

  const leafValues = useMemo(
    () =>
      rawInput
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
    [rawInput]
  );

  const rebuild = useCallback(async () => {
    setBuilding(true);
    // Derived state computed against the previous tree is meaningless once the
    // leaves change — clear it rather than show a stale proof as verified.
    setSelectedLeaf(null);
    setLeafHash(null);
    setVerification(null);
    setVisibleSteps(0);
    setTamper(null);
    setTamperValue('');
    setManualValue('');
    setManualResult(null);
    setTree(await buildMerkleTree(leafValues));
    setBuilding(false);
  }, [leafValues]);

  useEffect(() => {
    void rebuild();
    // Build once on mount; afterwards the student drives rebuilds explicitly so
    // a keystroke does not re-hash the whole tree.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Canvas resize observer: the D3 tree re-lays out whenever its container
  // width changes instead of measuring once at mount.
  useEffect(() => {
    const el = canvasWrapRef.current;
    if (!el) return;
    if (el.clientWidth > 0) setCanvasWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? el.clientWidth;
      if (width > 0) setCanvasWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const proof: MerkleProofStep[] = useMemo(
    () => (tree && selectedLeaf !== null ? getProof(tree, selectedLeaf) : []),
    [tree, selectedLeaf]
  );

  const pathIds = useMemo(
    () =>
      tree && selectedLeaf !== null
        ? new Set(getPathNodeIds(tree, selectedLeaf))
        : new Set<string>(),
    [tree, selectedLeaf]
  );

  const siblingIds = useMemo(
    () => (tree ? new Set(getSiblingNodeIds(tree, proof)) : new Set<string>()),
    [tree, proof]
  );

  const changedIds = useMemo(() => new Set(tamper?.changedNodeIds ?? []), [tamper]);

  async function handleSelectLeaf(index: number) {
    if (!tree) return;
    setSelectedLeaf(index);
    setTamper(null);
    setManualResult(null);
    setManualValue('');
    setVisibleSteps(0);
    const [hash, result] = await Promise.all([
      hashLeaf(tree.leaves[index]),
      verifyProof(tree.leaves[index], getProof(tree, index), tree.root.hash),
    ]);
    setLeafHash(hash);
    setVerification(result);
  }

  async function handleManualVerify() {
    if (!tree || selectedLeaf === null || !manualValue.trim()) return;
    setManualResult(await verifyProof(manualValue.trim(), proof, tree.root.hash));
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

  // D3 canvas render: root at top, leaves at bottom — the direction a proof
  // travels. Proof-path, sibling, and tampered nodes are highlighted.
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || !tree) return;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    const width = Math.max(320, canvasWidth);
    const height = Math.max(300, tree.levels.length * 120);
    const nodeRadius = 22;

    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const rootD3 = d3.hierarchy<MerkleNode>(tree.root, (node) =>
      [node.left, node.right].filter((child): child is MerkleNode => Boolean(child))
    );
    d3.tree<MerkleNode>().size([width - 100, height - 100])(rootD3);

    const g = svg.append('g').attr('transform', 'translate(50, 50)');

    g.selectAll('.link')
      .data(rootD3.links())
      .enter()
      .append('path')
      .attr('class', 'link')
      .attr(
        'd',
        (d) =>
          d3.linkVertical<d3.HierarchyLink<MerkleNode>, d3.HierarchyPointNode<MerkleNode>>()(d) ??
          ''
      )
      .attr('fill', 'none')
      .attr('stroke', (d) =>
        changedIds.has((d.target.data as MerkleNode).id)
          ? '#f87171'
          : pathIds.has((d.target.data as MerkleNode).id)
            ? '#34d399'
            : '#374151'
      )
      .attr('stroke-width', 2);

    const nodes = g
      .selectAll('.node')
      .data(rootD3.descendants())
      .enter()
      .append('g')
      .attr('class', 'node')
      .attr('transform', (d) => `translate(${d.x},${d.y})`);

    nodes
      .append('circle')
      .attr('r', nodeRadius)
      .attr('fill', (d) => {
        const node = d.data as MerkleNode;
        if (node.isLeaf) {
          if (tree.levels[0][node.index] && node.index === selectedLeaf) return '#22c55e';
          return '#27272a';
        }
        return '#3b82f6';
      })
      .attr('stroke', (d) => {
        const node = d.data as MerkleNode;
        if (changedIds.has(node.id)) return '#f87171';
        if (pathIds.has(node.id)) return '#34d399';
        if (siblingIds.has(node.id)) return '#fbbf24';
        return '#1f1f1f';
      })
      .attr('stroke-width', (d) => {
        const node = d.data as MerkleNode;
        return pathIds.has(node.id) || siblingIds.has(node.id) || changedIds.has(node.id) ? 3 : 2;
      })
      .style('cursor', (d) => ((d.data as MerkleNode).isLeaf ? 'pointer' : 'default'))
      .on('click', (_event, d) => {
        const node = d.data as MerkleNode;
        if (node.isLeaf) void handleSelectLeaf(node.index);
      });

    nodes
      .append('text')
      .attr('dy', nodeRadius + 15)
      .attr('text-anchor', 'middle')
      .attr('fill', '#9ca3af')
      .attr('font-size', '10px')
      .attr('font-family', 'monospace')
      .text((d) => short((d.data as MerkleNode).hash));

    nodes
      .filter((d) => (d.data as MerkleNode).isLeaf)
      .append('text')
      .attr('dy', nodeRadius + 28)
      .attr('text-anchor', 'middle')
      .attr('fill', '#ffffff')
      .attr('font-size', '9px')
      .attr('font-family', 'monospace')
      .text((d) => (d.data as MerkleNode).value ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, selectedLeaf, pathIds, siblingIds, changedIds, canvasWidth]);

  const canvasHeight = tree ? Math.max(300, tree.levels.length * 120) : 300;

  return (
    <main className="min-h-screen bg-black p-6 font-mono text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 border-b border-white/10 pb-6">
          <h1 className="mb-2 text-4xl font-black tracking-tighter uppercase">
            Merkle <span className="text-red-500">Proof</span> Studio
          </h1>
          <p className="text-xs tracking-widest text-gray-500 uppercase">
            Interactive cryptographic tree visualizer — build leaves, hash, prove, verify
          </p>
        </div>

        <section className="mb-8 grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="rounded-3xl border border-white/10 bg-zinc-950 p-6">
            <label
              htmlFor="merkle-leaves"
              className="mb-2 block text-xs font-black tracking-widest text-white uppercase"
            >
              Leaf values (one per line)
            </label>
            <textarea
              id="merkle-leaves"
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              rows={10}
              className="w-full rounded-lg border border-white/10 bg-black p-3 font-mono text-xs text-zinc-100"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={() => void rebuild()}
              disabled={building || leafValues.length === 0}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {building ? 'Hashing…' : 'Build tree'}
            </button>
            <p className="mt-2 text-[11px] text-zinc-500">
              Blank lines and duplicates are dropped. {leafValues.length} value
              {leafValues.length === 1 ? '' : 's'} entered. Leaves hash as{' '}
              <code className="text-zinc-300">SHA-256(0x00 ‖ value)</code>, internal nodes as{' '}
              <code className="text-zinc-300">SHA-256(0x01 ‖ left ‖ right)</code>.
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-zinc-950 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xs font-black tracking-widest text-white uppercase">
                Tree Canvas
              </h2>
              <div className="flex items-center gap-2 text-[10px] text-gray-400">
                <TreeDeciduous className="h-4 w-4" aria-hidden="true" />
                <span>Click a leaf to generate its inclusion proof</span>
              </div>
            </div>

            <div ref={canvasWrapRef} className="rounded-xl border border-white/5 bg-black p-4">
              {!tree ? (
                <p className="py-10 text-center text-sm text-zinc-500">
                  Enter at least one value and build a tree.
                </p>
              ) : (
                <>
                  <div className="mb-2 text-xs text-zinc-400">
                    Root <code className="text-emerald-300">{short(tree.root.hash)}</code> · depth{' '}
                    {tree.depth} · {tree.leaves.length} leaves
                  </div>
                  <svg
                    ref={svgRef}
                    role="img"
                    aria-label="Merkle tree visualization"
                    className="w-full"
                    style={{ height: `${canvasHeight}px` }}
                  />
                </>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                <div className="h-3 w-3 rounded-full bg-emerald-500" />
                <span className="text-[10px] font-bold text-emerald-500 uppercase">Proof path</span>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2">
                <div className="h-3 w-3 rounded-full bg-yellow-500" />
                <span className="text-[10px] font-bold text-yellow-500 uppercase">
                  Sibling in proof
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
                <div className="h-3 w-3 rounded-full bg-red-500" />
                <span className="text-[10px] font-bold text-red-500 uppercase">
                  Invalidated by tampering
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2">
                <div className="h-3 w-3 rounded-full bg-blue-500" />
                <span className="text-[10px] font-bold text-blue-500 uppercase">Internal node</span>
              </div>
            </div>
          </div>
        </section>

        {tree && selectedLeaf !== null && verification && (
          <section
            aria-label="Inclusion proof"
            className="mb-8 rounded-3xl border border-white/10 bg-zinc-950 p-6"
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xs font-black tracking-widest text-white uppercase">
                Inclusion proof for{' '}
                <code className="text-emerald-300">{tree.leaves[selectedLeaf]}</code>
              </h2>
              <div className="flex flex-wrap gap-2">
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

            <div className="mb-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-white/10 bg-black/40 p-3">
                <div className="text-[10px] tracking-widest text-gray-400 uppercase">
                  Leaf hash — SHA-256(0x00 ‖ “{tree.leaves[selectedLeaf]}”)
                </div>
                <div className="mt-1 break-all font-mono text-[11px] text-zinc-200">{leafHash}</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/40 p-3">
                <div className="text-[10px] tracking-widest text-gray-400 uppercase">
                  Proof carries {proof.length} sibling hash{proof.length === 1 ? '' : 'es'} — not
                  the whole tree
                </div>
                <div className="mt-1 font-mono text-[11px] text-zinc-400">
                  {proof.length === 0
                    ? 'Single-leaf tree: the leaf hash is the root.'
                    : proof.map((step) => short(step.hash)).join('  ·  ')}
                </div>
              </div>
            </div>

            <ol className="space-y-2">
              {verification.steps.slice(0, visibleSteps).map((step) => (
                <li
                  key={step.stepNumber}
                  className="rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-[11px] text-zinc-300"
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
                role="status"
                className={`mt-4 rounded-lg border p-3 text-sm ${
                  verification.valid
                    ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
                    : 'border-red-400/40 bg-red-500/10 text-red-200'
                }`}
              >
                <span className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  {verification.valid
                    ? `Verified — reconstructed root matches: ${short(verification.computedRoot)}`
                    : `Invalid — reconstructed ${short(verification.computedRoot)} but expected ${short(verification.expectedRoot)}`}
                </span>
              </div>
            )}

            <div className="mt-6 border-t border-white/10 pt-4">
              <h3 className="text-[11px] font-black tracking-widest text-white uppercase">
                Verify any value against this proof
              </h3>
              <p className="mt-1 text-[11px] text-zinc-500">
                A value outside the tree fails against the same root — that is what makes the proof
                an inclusion proof.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  value={manualValue}
                  onChange={(e) => setManualValue(e.target.value)}
                  placeholder='try "mallory"…'
                  aria-label="Value to verify against the selected proof"
                  className="flex-1 rounded-lg border border-white/10 bg-black px-3 py-2 font-mono text-xs text-zinc-100"
                />
                <button
                  type="button"
                  onClick={() => void handleManualVerify()}
                  disabled={!manualValue.trim()}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold uppercase text-white disabled:opacity-40"
                >
                  Verify
                </button>
              </div>
              {manualResult && (
                <div
                  role="status"
                  className={`mt-3 rounded-lg border p-3 text-sm ${
                    manualResult.valid
                      ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
                      : 'border-red-400/40 bg-red-500/10 text-red-200'
                  }`}
                >
                  {manualResult.valid
                    ? `“${manualValue.trim()}” is in the tree under this root.`
                    : `“${manualValue.trim()}” is NOT in the tree — reconstructed ${short(manualResult.computedRoot)} ≠ root ${short(manualResult.expectedRoot)}.`}
                </div>
              )}
            </div>
          </section>
        )}

        {tree && selectedLeaf !== null && (
          <section className="mb-8 rounded-3xl border border-white/10 bg-zinc-950 p-6">
            <h2 className="flex items-center gap-2 text-xs font-black tracking-widest text-white uppercase">
              <FlaskConical className="h-4 w-4" aria-hidden="true" />
              Tamper with this leaf
            </h2>
            <p className="mt-1 text-[11px] text-zinc-500">
              Change the value and every hash on its path to the root changes with it — highlighted
              red on the canvas. Nothing else moves, which is also why a proof only needs the
              siblings.
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <input
                value={tamperValue}
                onChange={(e) => setTamperValue(e.target.value)}
                placeholder={`replace "${tree.leaves[selectedLeaf]}" with…`}
                aria-label="Replacement value for tamper simulation"
                className="flex-1 rounded-lg border border-white/10 bg-black px-3 py-2 font-mono text-xs text-zinc-100"
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
                  {tamper.changedNodeIds.length === 1 ? '' : 's'} invalidated, highlighted in red
                  above.
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

        <section className="rounded-3xl border border-white/10 bg-zinc-950 p-6">
          <h2 className="mb-4 text-xs font-black tracking-widest text-white uppercase">
            How Merkle proofs work here
          </h2>
          <div className="space-y-3 text-[11px] leading-relaxed text-gray-400">
            <p>
              <strong className="text-white">1. Leaf hashing:</strong> each value hashes as{' '}
              <code className="text-zinc-300">SHA-256(0x00 ‖ value)</code>. The{' '}
              <code className="text-zinc-300">0x00</code> prefix separates the leaf domain from
              internal nodes so an internal preimage can never be presented as a leaf.
            </p>
            <p>
              <strong className="text-white">2. Pair hashing:</strong> adjacent hashes combine as{' '}
              <code className="text-zinc-300">SHA-256(0x01 ‖ left ‖ right)</code> up to a single
              root. An unpaired node is promoted — never duplicated — so distinct trees cannot share
              a root.
            </p>
            <p>
              <strong className="text-white">3. Proof generation:</strong> click any leaf on the
              canvas. Its proof is the sibling hash at each level — O(log n), never the whole tree.
            </p>
            <p>
              <strong className="text-white">4. Verification:</strong> replay the proof from the
              leaf hash and compare against the root. Export the bundle as JSON to verify the same
              vector against a Soroban contract.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
