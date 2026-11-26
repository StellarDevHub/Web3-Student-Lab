'use client';

/**
 * Airdrop Merkle Proof Explorer (FE-081).
 *
 * Shows a student *why* their address is (or is not) in an airdrop's Merkle root:
 * type the claim list, find your address, inspect the leaf hash, then watch the
 * verification walk up through the sibling hashes to the anchored root — green
 * where it matches the tree, red where it diverges — using the same leaf, pair
 * ordering and checks as `claim_airdrop` in `contracts/smart_vault`.
 *
 * Unlike the general-purpose Proof Studio at `/merkle-tree` (domain-separated
 * SHA-256, tamper demo), every hash here follows the distributor contract, so
 * the proof it emits can be submitted on-chain as is.
 */

import { Check, Copy, Download, Play, RotateCcw, ShieldAlert, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AirdropTreeCanvas, type NodeVerdict } from '@/components/merkle/AirdropTreeCanvas';
import {
  buildAirdropTree,
  formatClaimSubmission,
  getPathNodeIds,
  getProof,
  getSiblingNodeIds,
  isValidAddress,
  parseClaimLines,
  verifyClaim,
  type AirdropClaim,
  type AirdropTree,
  type ClaimVerification,
  type ProofStep,
} from '@/lib/merkle/merkleTree';

const SAMPLE_CLAIMS = [
  'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF, 500',
  'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H, 750',
  'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37, 1000000000000',
  'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM, 1',
  'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGSNFHEYVXM3XOJMDS674JZ, 2500',
].join('\n');

/** Pause between animation stages, in ms. */
const STAGE_DELAY_MS = 750;

function short(hash: string, head = 10, tail = 6): string {
  return hash.length > head + tail + 1 ? `${hash.slice(0, head)}…${hash.slice(-tail)}` : hash;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Flip the first byte of a hash, so a corrupted sibling is certain to differ. */
function corruptHash(hash: string): string {
  const flipped = (parseInt(hash.slice(0, 2), 16) ^ 0xff).toString(16).padStart(2, '0');
  return flipped + hash.slice(2);
}

interface ClaimDraft {
  index: string;
  account: string;
  amount: string;
}

function draftFrom(claim: AirdropClaim): ClaimDraft {
  return { index: String(claim.index), account: claim.account, amount: claim.amount.toString() };
}

/** The draft as a claim, or the reason it is not one. */
function readDraft(draft: ClaimDraft): { claim?: AirdropClaim; error?: string } {
  if (!/^\d+$/.test(draft.index) || Number(draft.index) > 0xffffffff) {
    return { error: 'Index must be a whole number up to 4294967295.' };
  }
  if (!isValidAddress(draft.account.trim())) {
    return { error: 'Account is not a valid Stellar address.' };
  }
  if (!/^-?\d+$/.test(draft.amount.trim())) return { error: 'Amount must be a whole number.' };
  return {
    claim: {
      index: Number(draft.index),
      account: draft.account.trim(),
      amount: BigInt(draft.amount.trim()),
    },
  };
}

export default function MerkleSimulatorPage() {
  const [rawInput, setRawInput] = useState(SAMPLE_CLAIMS);
  const [tree, setTree] = useState<AirdropTree | null>(null);
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);

  const [lookup, setLookup] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [draft, setDraft] = useState<ClaimDraft | null>(null);
  const [corrupt, setCorrupt] = useState(false);

  const [verification, setVerification] = useState<ClaimVerification | null>(null);
  const [stage, setStage] = useState(0);
  const [playing, setPlaying] = useState(false);

  const [contractId, setContractId] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(800);

  const parsed = useMemo(() => parseClaimLines(rawInput), [rawInput]);

  const resetVerification = useCallback(() => {
    setVerification(null);
    setStage(0);
    setPlaying(false);
  }, []);

  const rebuild = useCallback(async () => {
    setBuilding(true);
    setBuildError(null);
    setSelected(null);
    setDraft(null);
    setCorrupt(false);
    resetVerification();
    try {
      setTree(parsed.claims.length > 0 ? await buildAirdropTree(parsed.claims) : null);
    } catch (error) {
      setTree(null);
      setBuildError(error instanceof Error ? error.message : 'Could not build the tree');
    }
    setBuilding(false);
  }, [parsed.claims, resetVerification]);

  useEffect(() => {
    void rebuild();
    // Build once on mount; afterwards the student drives rebuilds explicitly so a
    // keystroke does not re-hash the whole tree.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-lay out the canvas whenever its container changes width.
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
  }, [tree]);

  const honestProof: ProofStep[] = useMemo(
    () => (tree && selected !== null ? getProof(tree, selected) : []),
    [tree, selected]
  );
  const proofUsed: ProofStep[] = useMemo(
    () =>
      corrupt && honestProof.length > 0
        ? honestProof.map((step, i) => (i === 0 ? { ...step, hash: corruptHash(step.hash) } : step))
        : honestProof,
    [corrupt, honestProof]
  );

  const pathIds = useMemo(
    () => new Set(tree && selected !== null ? getPathNodeIds(tree, selected) : []),
    [tree, selected]
  );
  const siblingIds = useMemo(
    () => new Set(tree ? getSiblingNodeIds(tree, honestProof) : []),
    [tree, honestProof]
  );

  const draftResult = useMemo(() => (draft ? readDraft(draft) : null), [draft]);
  const honestLeaf = tree && selected !== null ? tree.claims[selected] : null;

  const matches = useMemo(() => {
    const needle = lookup.trim();
    if (!tree || !needle) return [];
    return tree.claims
      .map((claim, position) => ({ claim, position }))
      .filter((m) => m.claim.account === needle);
  }, [tree, lookup]);

  function selectLeaf(position: number) {
    if (!tree) return;
    setSelected(position);
    setDraft(draftFrom(tree.claims[position]));
    setCorrupt(false);
    resetVerification();
  }

  function resetClaim() {
    if (!honestLeaf) return;
    setDraft(draftFrom(honestLeaf));
    setCorrupt(false);
    resetVerification();
  }

  function editDraft(patch: Partial<ClaimDraft>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    resetVerification();
  }

  async function runVerification(animate: boolean) {
    if (!tree || selected === null || !draftResult?.claim) return;
    const result = await verifyClaim(draftResult.claim, proofUsed, tree.root.hash, {
      tree,
      leafPosition: selected,
    });
    setVerification(result);
    const last = result.steps.length + 2;
    if (animate && !prefersReducedMotion() && last > 1) {
      setStage(0);
      setPlaying(true);
    } else {
      setStage(last);
      setPlaying(false);
    }
  }

  // Advance the animation one stage at a time.
  const finalStage = verification ? verification.steps.length + 2 : 0;
  useEffect(() => {
    if (!playing || !verification) return;
    if (stage >= finalStage) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setStage((s) => s + 1), STAGE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [playing, stage, finalStage, verification]);

  const visibleSteps = verification
    ? Math.max(0, Math.min(verification.steps.length, stage - 1))
    : 0;
  const showVerdict = Boolean(verification) && stage >= finalStage;

  const verdicts = useMemo(() => {
    const map = new Map<string, NodeVerdict>();
    if (!verification) return map;
    if (stage >= 1 && verification.leafNodeId) {
      map.set(verification.leafNodeId, verification.leafMatchesTree ? 'match' : 'mismatch');
    }
    verification.steps.slice(0, visibleSteps).forEach((step) => {
      if (step.treeNodeId) map.set(step.treeNodeId, step.matchesTree ? 'match' : 'mismatch');
    });
    return map;
  }, [verification, stage, visibleSteps]);

  const submission = useMemo(() => {
    if (!tree || !draftResult?.claim) return null;
    try {
      return formatClaimSubmission(draftResult.claim, proofUsed, {
        contractId: contractId.trim() || undefined,
        root: tree.root.hash,
      });
    } catch {
      return null;
    }
  }, [tree, draftResult, proofUsed, contractId]);

  const submissionJson = submission
    ? JSON.stringify(
        {
          function: submission.functionName,
          args: submission.args,
          scVals: submission.scVals,
          root: tree?.root.hash,
        },
        null,
        2
      )
    : '';

  async function copy(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied((c) => (c === label ? null : c)), 1500);
    } catch {
      setCopied(null);
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([submissionJson], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `claim-airdrop-${draftResult?.claim?.index ?? 'proof'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const canvasHeightHint = tree ? (tree.depth + 1) * 96 + 52 : 260;

  return (
    <main className="min-h-screen bg-black p-6 font-mono text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 border-b border-white/10 pb-6">
          <h1 className="mb-2 text-4xl font-black tracking-tighter uppercase">
            Airdrop <span className="text-emerald-400">Merkle</span> Proof Explorer
          </h1>
          <p className="max-w-3xl text-xs tracking-widest text-gray-500 uppercase">
            See how your address proves it is in the anchored root — leaf hash, sibling hashes, and
            the path up, checked exactly as the Soroban distributor checks it.
          </p>
          <p className="mt-2 text-[11px] text-zinc-500">
            Looking for the general tree builder and tamper demo? That is the{' '}
            <Link href="/merkle-tree" className="text-emerald-400 underline">
              Merkle Proof Studio
            </Link>
            .
          </p>
        </div>

        <section className="mb-8 grid gap-6 lg:grid-cols-[360px_1fr]">
          <div className="rounded-3xl border border-white/10 bg-zinc-950 p-6">
            <label
              htmlFor="airdrop-claims"
              className="mb-2 block text-xs font-black tracking-widest text-white uppercase"
            >
              Airdrop claims
            </label>
            <textarea
              id="airdrop-claims"
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              rows={9}
              className="w-full rounded-lg border border-white/10 bg-black p-3 font-mono text-[11px] text-zinc-100"
              spellCheck={false}
              aria-describedby="airdrop-claims-help"
            />
            <p id="airdrop-claims-help" className="mt-2 text-[11px] text-zinc-500">
              One <code className="text-zinc-300">address, amount</code> per line. A claim’s index
              is its line order, and it is part of the leaf hash. Amounts are raw token units.
            </p>
            {parsed.errors.length > 0 && (
              <ul className="mt-2 space-y-1 text-[11px] text-red-400" role="alert">
                {parsed.errors.map((error) => (
                  <li key={`${error.line}-${error.message}`}>
                    Line {error.line}: {error.message}
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => void rebuild()}
              disabled={building || parsed.claims.length === 0}
              className="mt-3 w-full rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50"
            >
              {building ? 'Hashing…' : 'Build tree'}
            </button>
            {buildError && (
              <p className="mt-2 text-[11px] text-red-400" role="alert">
                {buildError}
              </p>
            )}

            {tree && (
              <dl className="mt-4 space-y-1 text-[11px] text-zinc-400">
                <div>
                  <dt className="inline text-zinc-500">Anchored root: </dt>
                  <dd className="inline break-all text-emerald-300" data-testid="merkle-root">
                    {tree.root.hash}
                  </dd>
                </div>
                <div>
                  <dt className="inline text-zinc-500">Shape: </dt>
                  <dd className="inline">
                    depth {tree.depth} · {tree.claims.length} claim
                    {tree.claims.length === 1 ? '' : 's'}
                  </dd>
                </div>
              </dl>
            )}
          </div>

          <div className="rounded-3xl border border-white/10 bg-zinc-950 p-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xs font-black tracking-widest text-white uppercase">Tree</h2>
              <div className="flex flex-wrap items-center gap-3 text-[10px] text-gray-400">
                <Legend color="#60a5fa" label="your path" />
                <Legend color="#fbbf24" label="sibling hashes" />
                <Legend color="#34d399" label="matches ✓" />
                <Legend color="#f87171" label="diverges ✗" />
              </div>
            </div>

            <div
              ref={canvasWrapRef}
              className="rounded-xl border border-white/5 bg-black p-4"
              style={{ minHeight: canvasHeightHint }}
            >
              {!tree ? (
                <p className="py-10 text-center text-sm text-zinc-500">
                  Add at least one valid claim and build the tree.
                </p>
              ) : (
                <AirdropTreeCanvas
                  tree={tree}
                  width={canvasWidth}
                  selectedLeaf={selected}
                  pathIds={pathIds}
                  siblingIds={siblingIds}
                  verdicts={verdicts}
                  onSelectLeaf={selectLeaf}
                />
              )}
            </div>

            <div className="mt-4">
              <label
                htmlFor="lookup-address"
                className="mb-1 block text-[11px] font-bold tracking-widest text-zinc-300 uppercase"
              >
                Your address
              </label>
              <input
                id="lookup-address"
                value={lookup}
                onChange={(e) => setLookup(e.target.value)}
                placeholder="G… or C… — or click a leaf above"
                className="w-full rounded-lg border border-white/10 bg-black p-2 font-mono text-xs text-zinc-100"
                spellCheck={false}
                autoComplete="off"
              />
              {lookup.trim() && tree && (
                <div className="mt-2 text-[11px]" role="status">
                  {matches.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-emerald-300">
                        Found in this airdrop ({matches.length} claim
                        {matches.length === 1 ? '' : 's'}):
                      </span>
                      {matches.map(({ claim, position }) => (
                        <button
                          key={claim.index}
                          type="button"
                          onClick={() => selectLeaf(position)}
                          className="rounded border border-emerald-500/40 px-2 py-0.5 text-emerald-300 hover:bg-emerald-500/10"
                        >
                          Inspect claim #{claim.index}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span className="text-amber-300">
                      That address is not in this airdrop, so there is no proof for it. Select any
                      leaf and change the account below to watch such a claim fail.
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        {tree && !honestLeaf && (
          <p className="mb-8 rounded-2xl border border-white/10 bg-zinc-950 p-6 text-sm text-zinc-400">
            Select a leaf in the tree (or look up your address) to inspect its hash and verify its
            proof.
          </p>
        )}

        {tree && honestLeaf && draft && (
          <>
            <section className="mb-8 grid gap-6 lg:grid-cols-2" aria-label="Leaf inspector">
              <div className="rounded-3xl border border-white/10 bg-zinc-950 p-6">
                <h2 className="mb-1 text-xs font-black tracking-widest text-white uppercase">
                  1 · Leaf hash
                </h2>
                <p className="mb-3 text-[11px] text-zinc-500">
                  The contract hashes{' '}
                  <code className="text-zinc-300">sha256(index ‖ account XDR ‖ amount)</code> — the
                  index as 4 big-endian bytes, the account as its <code>ScVal</code> XDR, and the
                  amount as 16 big-endian bytes.
                </p>
                <dl className="space-y-2 text-[11px]">
                  <Field label="index · 4 bytes" value={honestLeaf.parts.index} />
                  <Field label="account · Address XDR" value={honestLeaf.parts.account} />
                  <Field label="amount · 16 bytes" value={honestLeaf.parts.amount} />
                  <Field label="= leaf hash" value={honestLeaf.hash} accent />
                </dl>
              </div>

              <div className="rounded-3xl border border-white/10 bg-zinc-950 p-6">
                <h2 className="mb-1 text-xs font-black tracking-widest text-white uppercase">
                  2 · The claim you submit
                </h2>
                <p className="mb-3 text-[11px] text-zinc-500">
                  Starts as the honest claim. Edit a field, or corrupt a sibling hash, to see how
                  the contract reacts to a claim that is not in the tree.
                </p>
                <div className="grid gap-2 text-[11px]">
                  <DraftInput
                    id="claim-index"
                    label="Index"
                    value={draft.index}
                    onChange={(v) => editDraft({ index: v })}
                  />
                  <DraftInput
                    id="claim-account"
                    label="Account"
                    value={draft.account}
                    onChange={(v) => editDraft({ account: v })}
                  />
                  <DraftInput
                    id="claim-amount"
                    label="Amount"
                    value={draft.amount}
                    onChange={(v) => editDraft({ amount: v })}
                  />
                  <label className="flex items-center gap-2 text-zinc-300">
                    <input
                      type="checkbox"
                      checked={corrupt}
                      disabled={honestProof.length === 0}
                      onChange={(e) => {
                        setCorrupt(e.target.checked);
                        resetVerification();
                      }}
                    />
                    Corrupt the first sibling hash in the proof
                  </label>
                </div>
                {draftResult?.error && (
                  <p className="mt-2 text-[11px] text-red-400" role="alert">
                    {draftResult.error}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void runVerification(true)}
                    disabled={!draftResult?.claim || playing}
                    className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50"
                  >
                    <Play className="h-4 w-4" aria-hidden="true" />
                    Verify claim
                  </button>
                  {playing && (
                    <button
                      type="button"
                      onClick={() => {
                        setStage(finalStage);
                        setPlaying(false);
                      }}
                      className="rounded-lg border border-white/20 px-4 py-2 text-sm text-zinc-200"
                    >
                      Skip animation
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={resetClaim}
                    className="flex items-center gap-2 rounded-lg border border-white/20 px-4 py-2 text-sm text-zinc-200"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    Reset to honest claim
                  </button>
                </div>
              </div>
            </section>

            {verification && (
              <section
                className="mb-8 rounded-3xl border border-white/10 bg-zinc-950 p-6"
                aria-label="Verification"
              >
                <h2 className="mb-1 text-xs font-black tracking-widest text-white uppercase">
                  3 · Verification, as the contract runs it
                </h2>
                <p className="mb-4 text-[11px] text-zinc-500">
                  At each step the two hashes are ordered (smaller first — no left/right flags in
                  the proof) and hashed together. Each result is compared with the tree.
                </p>

                {verification.outcome.status === 'ZeroAmount' ? (
                  <p className="text-sm text-zinc-300">
                    The contract rejects a non-positive amount before it hashes anything.
                  </p>
                ) : (
                  <ol className="space-y-3">
                    {stage >= 1 && (
                      <li
                        className="rounded-xl border border-white/10 p-3 text-[11px]"
                        data-testid="leaf-step"
                        data-match={String(Boolean(verification.leafMatchesTree))}
                      >
                        <div className="mb-1 flex items-center gap-2 font-bold text-zinc-200">
                          <VerdictBadge ok={Boolean(verification.leafMatchesTree)} />
                          Leaf
                        </div>
                        <div className="break-all text-zinc-400">
                          computed <span className="text-zinc-200">{verification.leafHash}</span>
                        </div>
                        {!verification.leafMatchesTree && (
                          <div className="text-red-300">
                            differs from leaf #{selected}’s hash in the tree
                          </div>
                        )}
                      </li>
                    )}
                    {verification.steps.slice(0, visibleSteps).map((step) => (
                      <li
                        key={step.stepNumber}
                        className="rounded-xl border border-white/10 p-3 text-[11px]"
                        data-testid="proof-step"
                        data-match={String(step.matchesTree)}
                      >
                        <div className="mb-1 flex items-center gap-2 font-bold text-zinc-200">
                          <VerdictBadge ok={Boolean(step.matchesTree)} />
                          Step {step.stepNumber}
                        </div>
                        <div className="break-all text-zinc-400">
                          sha256(
                          <span className={step.currentIsFirst ? 'text-sky-300' : 'text-amber-300'}>
                            {short(step.first, 12, 6)}
                          </span>{' '}
                          ‖{' '}
                          <span className={step.currentIsFirst ? 'text-amber-300' : 'text-sky-300'}>
                            {short(step.second, 12, 6)}
                          </span>
                          ){' '}
                          <span className="text-zinc-500">
                            — carried hash goes {step.currentIsFirst ? 'first' : 'second'}
                          </span>
                        </div>
                        <div className="break-all text-zinc-400">
                          = <span className="text-zinc-200">{step.resultHash}</span>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}

                {showVerdict && (
                  <div
                    role="status"
                    data-testid="verdict"
                    data-valid={String(verification.valid)}
                    className={`mt-4 flex items-start gap-3 rounded-xl border p-4 text-sm ${
                      verification.valid
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                        : 'border-red-500/40 bg-red-500/10 text-red-200'
                    }`}
                  >
                    {verification.valid ? (
                      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                    ) : (
                      <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                    )}
                    <div>
                      {verification.outcome.status === 'Ok' && (
                        <>
                          <strong>Accepted.</strong> The computed root equals the anchored root, so{' '}
                          <code>claim_airdrop</code> would pass its proof check.
                        </>
                      )}
                      {verification.outcome.status === 'InvalidProof' && (
                        <>
                          <strong>Rejected — Error(Contract, #404) InvalidProof.</strong> The
                          computed root <code>{short(verification.computedRoot, 12, 6)}</code> is
                          not the anchored root{' '}
                          <code>{short(verification.expectedRoot, 12, 6)}</code>.
                        </>
                      )}
                      {verification.outcome.status === 'ZeroAmount' && (
                        <>
                          <strong>Rejected — Error(Contract, #407) ZeroAmount.</strong> The amount
                          must be positive.
                        </>
                      )}
                      <div className="mt-1 text-[11px] opacity-80">
                        The contract also checks the claimed bitmap (#403 AlreadyClaimed) and the
                        pause switch, and requires the account to sign; those need on-chain state
                        and are not simulated here.
                      </div>
                    </div>
                  </div>
                )}
              </section>
            )}

            <section
              className="mb-8 rounded-3xl border border-white/10 bg-zinc-950 p-6"
              aria-label="Contract call"
            >
              <h2 className="mb-1 text-xs font-black tracking-widest text-white uppercase">
                4 · Submit it: <code>claim_airdrop</code>
              </h2>
              <p className="mb-3 text-[11px] text-zinc-500">
                The proof is just the sibling hashes, as the{' '}
                <code>Vec&lt;BytesN&lt;32&gt;&gt;</code> the contract takes.{' '}
                {verification && !verification.valid
                  ? 'This call would revert, as shown above.'
                  : 'Arguments are shown for the claim above.'}
              </p>

              <label htmlFor="contract-id" className="mb-1 block text-[11px] text-zinc-400">
                Contract ID (optional, fills the CLI command)
              </label>
              <input
                id="contract-id"
                value={contractId}
                onChange={(e) => setContractId(e.target.value)}
                placeholder="C…"
                className="mb-3 w-full rounded-lg border border-white/10 bg-black p-2 font-mono text-xs text-zinc-100"
                spellCheck={false}
                autoComplete="off"
              />

              {submission ? (
                <div className="space-y-3">
                  <CodeBlock
                    label="Stellar CLI"
                    text={submission.cli}
                    copied={copied === 'cli'}
                    onCopy={() => void copy('cli', submission.cli)}
                  />
                  <CodeBlock
                    label="Arguments (JSON, incl. base64 ScVal XDR)"
                    text={submissionJson}
                    copied={copied === 'json'}
                    onCopy={() => void copy('json', submissionJson)}
                  />
                  <button
                    type="button"
                    onClick={download}
                    className="flex items-center gap-2 rounded-lg border border-white/20 px-4 py-2 text-sm text-zinc-200"
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                    Download JSON
                  </button>
                </div>
              ) : (
                <p className="text-[11px] text-zinc-500">
                  Fix the claim fields above to see the call.
                </p>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function Field({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <dt className="text-zinc-500">{label}</dt>
      <dd className={`break-all ${accent ? 'text-emerald-300' : 'text-zinc-200'}`}>{value}</dd>
    </div>
  );
}

function DraftInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-0.5 block text-zinc-400">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-white/10 bg-black p-2 font-mono text-xs text-zinc-100"
        spellCheck={false}
        autoComplete="off"
      />
    </div>
  );
}

function VerdictBadge({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-black ${
        ok ? 'bg-emerald-400 text-emerald-950' : 'bg-red-400 text-red-950'
      }`}
      role="img"
      aria-label={ok ? 'matches the tree' : 'does not match the tree'}
    >
      {ok ? '✓' : '✗'}
    </span>
  );
}

function CodeBlock({
  label,
  text,
  copied,
  onCopy,
}: {
  label: string;
  text: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px] text-zinc-400">
        <span>{label}</span>
        <button
          type="button"
          onClick={onCopy}
          className="flex items-center gap-1 rounded border border-white/15 px-2 py-0.5 text-zinc-200"
        >
          {copied ? (
            <Check className="h-3 w-3" aria-hidden="true" />
          ) : (
            <Copy className="h-3 w-3" aria-hidden="true" />
          )}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="max-h-64 overflow-auto rounded-lg border border-white/10 bg-black p-3 text-[11px] break-all whitespace-pre-wrap text-zinc-200">
        {text}
      </pre>
    </div>
  );
}
