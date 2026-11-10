'use client';

import React from 'react';
import { useBridgeStatus, UseBridgeStatusInput } from '../../hooks/useBridgeStatus';

export const CrossChainMonitor: React.FC<UseBridgeStatusInput> = (props) => {
  const { state, selectedNodeLevel, setSelectedNodeLevel, activeNode } = useBridgeStatus(props);

  return (
    <section
      data-testid="cross-chain-bridge-monitor"
      className="rounded-2xl border border-slate-700 bg-slate-950 p-5 text-xs text-slate-100"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div>
          <h3 className="text-base font-bold text-white">
            Cross-Chain Bridge Transfer #{state.transferId}
          </h3>
          <p className="text-slate-400">
            {state.amount} {state.assetSymbol} • Merkle Root:{' '}
            <code className="text-indigo-300">{state.merkleProof.rootHash.slice(0, 16)}...</code>
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href={state.sourceExplorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="source-explorer-link"
            className="rounded bg-slate-800 px-2.5 py-1 text-indigo-300 hover:underline"
          >
            Source Explorer (Sepolia)
          </a>
          {state.destinationExplorerUrl && (
            <a
              href={state.destinationExplorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="dest-explorer-link"
              className="rounded bg-slate-800 px-2.5 py-1 text-emerald-300 hover:underline"
            >
              Destination Explorer (Stellar)
            </a>
          )}
        </div>
      </div>

      <ol className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-4">
        {state.milestones.map((m) => (
          <li
            key={m.id}
            data-testid={`milestone-${m.id}`}
            className="rounded-lg border border-slate-800 bg-slate-900 p-3"
          >
            <p className="font-semibold text-white">{m.label}</p>
            <p className="mt-1 text-[11px] text-slate-400">
              {m.chain} • {m.confirmations}/{m.requiredConfirmations} confirmations
            </p>
            <span className="mt-1 inline-block rounded bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase">
              {m.status}
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-white">Interactive Merkle Inclusion Proof Inspector</h4>
          <span
            data-testid="merkle-proof-status"
            className={state.merkleProof.verified ? 'text-emerald-400' : 'text-rose-400'}
          >
            {state.merkleProof.verified ? 'Verified Valid' : 'Invalid Proof'}
          </span>
        </div>

        <div className="mt-2 flex gap-2">
          {state.merkleProof.nodes.map((node) => (
            <button
              key={node.level}
              type="button"
              onClick={() => setSelectedNodeLevel(node.level)}
              className={`rounded px-2.5 py-1 text-[11px] ${
                selectedNodeLevel === node.level
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-800 text-slate-300'
              }`}
            >
              Level {node.level} ({node.position})
            </button>
          ))}
        </div>

        {activeNode && (
          <dl
            data-testid="merkle-node-inspector"
            className="mt-3 grid grid-cols-1 gap-1.5 font-mono text-[11px] text-slate-300"
          >
            <div>Leaf Hash: {state.merkleProof.leafHash}</div>
            <div>
              Sibling Hash ({activeNode.position}): {activeNode.siblingHash}
            </div>
            <div>Computed Parent Hash: {activeNode.computedParentHash}</div>
          </dl>
        )}
      </div>
    </section>
  );
};
