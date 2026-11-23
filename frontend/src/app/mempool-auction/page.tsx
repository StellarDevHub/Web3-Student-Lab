'use client';

import { BlockHistory } from '@/components/mempool-auction/BlockHistory';
import { LiveFeeMarket } from '@/components/mempool-auction/LiveFeeMarket';
import { MempoolGrid } from '@/components/mempool-auction/MempoolGrid';
import { useMempoolSimulator } from '@/hooks/useMempoolSimulator';
import { MAX_FEE_BID, MIN_FEE_BID, selectForBlock, totalGas } from '@/lib/mempool';
import { useMemo } from 'react';

const GAS_LIMIT_MIN = 500_000;
const GAS_LIMIT_MAX = 5_000_000;

export default function MempoolAuctionPage() {
  const {
    pool,
    blocks,
    settings,
    autoFlow,
    addTransaction,
    removeTransaction,
    setFeeBid,
    updateSettings,
    mineBlock,
    reset,
    setAutoFlow,
  } = useMempoolSimulator();

  // Preview which transactions the next block would settle, so the grid can
  // highlight winning bids live as parameters change.
  const nextBlock = useMemo(
    () => selectForBlock(pool, settings.gasLimit, settings.baseFee),
    [pool, settings.gasLimit, settings.baseFee],
  );
  const nextBlockIds = useMemo(() => new Set(nextBlock.map((tx) => tx.id)), [nextBlock]);
  const projectedFill = Math.round((totalGas(nextBlock) / settings.gasLimit) * 100);

  return (
    <div className="relative min-h-[calc(100vh-80px)] overflow-y-auto bg-black p-6 font-mono text-white md:p-12">
      {/* Background grid accent */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px]" />

      <div className="relative z-10 mx-auto flex max-w-7xl flex-col">
        {/* Header */}
        <div className="mb-10 flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <div className="border-l-4 border-red-600 pl-6">
            <h1 className="mb-2 text-4xl font-black tracking-tighter uppercase">
              Gas Fee <span className="text-red-500">Auction</span>
            </h1>
            <p className="text-xs tracking-[0.3em] text-gray-500 uppercase">
              Mempool Simulator — Highest Bidder Settles First
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => addTransaction()}
              className="rounded border border-white/10 bg-zinc-900 px-4 py-2.5 text-[10px] font-black tracking-widest text-white uppercase transition-colors hover:bg-zinc-800"
            >
              + Broadcast Tx
            </button>
            <button
              onClick={() => setAutoFlow(!autoFlow)}
              aria-pressed={autoFlow}
              className="flex items-center gap-2 rounded border border-white/10 bg-zinc-900 px-4 py-2.5 text-[10px] font-black tracking-widest text-white uppercase transition-colors hover:bg-zinc-800"
            >
              <span
                className={`h-2 w-2 rounded-full ${autoFlow ? 'animate-pulse bg-green-500' : 'bg-gray-600'}`}
                aria-hidden="true"
              />
              {autoFlow ? 'Auto Flow On' : 'Auto Flow'}
            </button>
            <button
              onClick={mineBlock}
              disabled={nextBlock.length === 0}
              className="bg-white px-4 py-2.5 text-[10px] font-black tracking-widest text-black uppercase transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ⛏ Mine Block
            </button>
            <button
              onClick={reset}
              className="rounded border border-red-600/30 bg-red-600/10 px-4 py-2.5 text-[10px] font-black tracking-widest text-red-500 uppercase transition-colors hover:bg-red-600/20"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Live Stellar Testnet fee market (Issue #1156). Sits above the
            sandbox so students compare the real auction with the one they
            drive by hand below. */}
        <div className="mb-8">
          <LiveFeeMarket />
        </div>

        {/* Network parameters */}
        <div className="mb-8 grid grid-cols-1 gap-4 rounded-2xl border border-white/10 bg-zinc-950 p-6 md:grid-cols-3">
          <div>
            <div className="mb-2 flex items-center justify-between text-[10px] tracking-widest text-gray-500 uppercase">
              <span>Base Fee</span>
              <span className="font-black text-white tabular-nums">{settings.baseFee} gwei</span>
            </div>
            <input
              type="range"
              min={MIN_FEE_BID}
              max={MAX_FEE_BID}
              value={settings.baseFee}
              onChange={(e) => updateSettings({ baseFee: Number(e.target.value) })}
              className="w-full accent-red-600"
              aria-label="Network base fee in gwei"
            />
            <p className="mt-1 text-[9px] text-gray-600">Bids below the base fee are excluded.</p>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between text-[10px] tracking-widest text-gray-500 uppercase">
              <span>Block Gas Limit</span>
              <span className="font-black text-white tabular-nums">
                {settings.gasLimit.toLocaleString()}
              </span>
            </div>
            <input
              type="range"
              min={GAS_LIMIT_MIN}
              max={GAS_LIMIT_MAX}
              step={100_000}
              value={settings.gasLimit}
              onChange={(e) => updateSettings({ gasLimit: Number(e.target.value) })}
              className="w-full accent-red-600"
              aria-label="Block gas limit"
            />
            <p className="mt-1 text-[9px] text-gray-600">Caps how many bids fit per block.</p>
          </div>

          <div className="flex flex-col justify-center rounded-lg border border-white/5 bg-black p-4">
            <div className="mb-2 flex items-center justify-between text-[10px] tracking-widest text-gray-500 uppercase">
              <span>Next Block</span>
              <span className="font-black text-green-400 tabular-nums">
                {nextBlock.length} tx · {projectedFill}%
              </span>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-white/5"
              role="progressbar"
              aria-valuenow={projectedFill}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Projected next block gas fill"
            >
              <div
                className="h-full rounded-full bg-green-500 transition-all"
                style={{ width: `${Math.min(100, projectedFill)}%` }}
              />
            </div>
            <p className="mt-2 text-[9px] text-gray-600">
              Highest bidders that clear the base fee and fit the gas limit.
            </p>
          </div>
        </div>

        {/* Auction view */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <MempoolGrid
              pool={pool}
              baseFee={settings.baseFee}
              nextBlockIds={nextBlockIds}
              onFeeBid={setFeeBid}
              onRemove={removeTransaction}
            />
          </div>
          <div className="lg:col-span-1">
            <BlockHistory blocks={blocks} />
          </div>
        </div>
      </div>
    </div>
  );
}
