'use client';

import { MinedBlock } from '@/lib/mempool';

interface BlockHistoryProps {
  blocks: MinedBlock[];
}

export function BlockHistory({ blocks }: BlockHistoryProps) {
  return (
    <section
      className="flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-2xl"
      aria-label="Mined blocks"
    >
      <h2 className="mb-6 flex items-center justify-between border-b border-white/10 pb-4 text-sm font-bold tracking-widest uppercase">
        Mined Blocks
        <span className="text-[10px] font-normal text-gray-600">History [{blocks.length}]</span>
      </h2>

      <div className="custom-scrollbar flex-grow space-y-4 overflow-y-auto pr-1" role="feed">
        {blocks.length === 0 ? (
          <p className="py-10 text-center text-xs text-gray-700 italic">
            No blocks yet — mine one to settle the top bids.
          </p>
        ) : (
          blocks.map((block) => {
            const fill = Math.round((block.gasUsed / block.gasLimit) * 100);
            return (
              <article
                key={block.height}
                className="rounded-r border-t border-r border-b border-l-2 border-green-600 border-white/5 bg-black p-4"
                aria-label={`Block ${block.height}, ${block.transactions.length} transactions, ${fill}% full`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-black text-green-500">#{block.height}</span>
                  <span className="text-[10px] text-gray-500">
                    {new Date(block.minedAt).toLocaleTimeString()}
                  </span>
                </div>

                <div className="mb-3 grid grid-cols-3 gap-2 text-[10px]">
                  <div>
                    <p className="tracking-widest text-gray-600 uppercase">Txs</p>
                    <p className="font-bold text-white tabular-nums">{block.transactions.length}</p>
                  </div>
                  <div>
                    <p className="tracking-widest text-gray-600 uppercase">Base</p>
                    <p className="font-bold text-white tabular-nums">{block.baseFee} gwei</p>
                  </div>
                  <div>
                    <p className="tracking-widest text-gray-600 uppercase">Reward</p>
                    <p className="font-bold text-green-400 tabular-nums">
                      {(block.totalFees / 1e9).toFixed(4)} Ξ
                    </p>
                  </div>
                </div>

                <div
                  className="h-2 w-full overflow-hidden rounded-full bg-white/5"
                  role="progressbar"
                  aria-valuenow={fill}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Block gas fill"
                >
                  <div className="h-full rounded-full bg-green-500" style={{ width: `${fill}%` }} />
                </div>
                <p className="mt-1 text-right text-[9px] text-gray-600 tabular-nums">
                  {block.gasUsed.toLocaleString()} / {block.gasLimit.toLocaleString()} gas ({fill}%)
                </p>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
