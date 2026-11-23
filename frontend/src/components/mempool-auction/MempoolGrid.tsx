'use client';

import {
  MAX_FEE_BID,
  MIN_FEE_BID,
  PendingTx,
  sortByFee,
} from '@/lib/mempool';
import { useMemo } from 'react';

interface MempoolGridProps {
  pool: PendingTx[];
  baseFee: number;
  /** Ids the next block would include — used to highlight winning bids. */
  nextBlockIds: Set<string>;
  onFeeBid: (id: string, feeBid: number) => void;
  onRemove: (id: string) => void;
}

const typeColor: Record<PendingTx['type'], string> = {
  TRANSFER: 'text-sky-400',
  SWAP: 'text-violet-400',
  MINT: 'text-amber-400',
  CONTRACT: 'text-emerald-400',
};

export function MempoolGrid({
  pool,
  baseFee,
  nextBlockIds,
  onFeeBid,
  onRemove,
}: MempoolGridProps) {
  const sorted = useMemo(() => sortByFee(pool), [pool]);

  return (
    <section
      className="flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-2xl"
      aria-label="Pending transaction pool"
    >
      <h2 className="mb-6 flex items-center justify-between border-b border-white/10 pb-4 text-sm font-bold tracking-widest uppercase">
        Mempool
        <span className="text-[10px] font-normal text-gray-600">
          Pending [{sorted.length}]
        </span>
      </h2>

      <div className="custom-scrollbar flex-grow overflow-y-auto pr-1">
        {sorted.length === 0 ? (
          <p className="py-10 text-center text-xs text-gray-700 italic">
            Pool is empty — broadcast a transaction to start the auction.
          </p>
        ) : (
          <ul className="space-y-3" aria-live="polite">
            {sorted.map((tx, index) => {
              const winning = nextBlockIds.has(tx.id);
              const underpriced = tx.feeBid < baseFee;
              return (
                <li
                  key={tx.id}
                  className={`rounded-lg border bg-black p-4 transition-colors ${
                    winning
                      ? 'border-l-2 border-green-500 border-white/10'
                      : underpriced
                        ? 'border-l-2 border-red-600/60 border-white/5 opacity-70'
                        : 'border-white/5'
                  }`}
                  aria-label={`Transaction ${tx.id}, ${tx.type}, bidding ${tx.feeBid} gwei${
                    winning ? ', included in next block' : ''
                  }`}
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-gray-600 tabular-nums">
                        #{index + 1}
                      </span>
                      <span className="font-mono text-xs font-bold text-red-500">
                        {tx.id}
                      </span>
                      <span className={`text-[10px] font-black tracking-widest ${typeColor[tx.type]}`}>
                        {tx.type}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      {winning && (
                        <span className="rounded bg-green-500/10 px-2 py-0.5 text-[9px] font-black text-green-500">
                          NEXT BLOCK
                        </span>
                      )}
                      {underpriced && !winning && (
                        <span className="rounded bg-red-500/10 px-2 py-0.5 text-[9px] font-black text-red-500">
                          UNDERPRICED
                        </span>
                      )}
                      <button
                        onClick={() => onRemove(tx.id)}
                        className="text-[10px] font-bold text-gray-600 transition-colors hover:text-red-500"
                        aria-label={`Drop transaction ${tx.id}`}
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex-grow">
                      <div className="mb-1 flex items-center justify-between text-[10px] tracking-widest text-gray-500 uppercase">
                        <span>Fee Bid</span>
                        <span className="font-black text-white tabular-nums">
                          {tx.feeBid} gwei
                        </span>
                      </div>
                      <input
                        type="range"
                        min={MIN_FEE_BID}
                        max={MAX_FEE_BID}
                        value={tx.feeBid}
                        onChange={(e) => onFeeBid(tx.id, Number(e.target.value))}
                        className="w-full accent-red-600"
                        aria-label={`Fee bid for transaction ${tx.id}, in gwei`}
                      />
                    </div>
                    <div className="w-20 shrink-0 text-right">
                      <p className="text-[9px] tracking-widest text-gray-600 uppercase">Gas</p>
                      <p className="text-xs font-bold text-gray-300 tabular-nums">
                        {tx.gasUnits.toLocaleString()}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
