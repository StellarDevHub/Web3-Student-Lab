'use client';

import * as d3 from 'd3';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useLiquidityPools } from '@/hooks/useLiquidityPools';
import {
  PoolReserves,
  YIELD_HORIZON_DAYS,
  depthCurve,
  divergenceCurve,
  feeApr,
  impermanentLoss,
  maxTradeWithinSlippage,
  netLpReturn,
  poolValueInB,
  projectHorizons,
  quoteSwap,
  spotPrice,
} from '@/lib/liquidityPool';

/**
 * Live AMM yield panel (Issue #1157).
 *
 * Reads real reserves from Horizon and turns them into the three things that
 * decide an LP's return: fee APR compounded over 30/90/365 days, impermanent
 * loss against simply holding, and the depth curve that says how large a trade
 * the pool can absorb.
 */

const CHART_HEIGHT = 200;
const MARGIN = { top: 14, right: 18, bottom: 32, left: 56 };

const pct = (value: number, digits = 2) => `${(value * 100).toFixed(digits)}%`;

/** Price scenarios the divergence chart walks, as ratios versus entry. */
const PRICE_RATIOS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];

function useChartWidth(ref: React.RefObject<SVGSVGElement | null>, fallback = 560) {
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (next) setWidth(Math.max(320, next));
    });
    observer.observe(parent);

    return () => observer.disconnect();
  }, [ref]);

  return width;
}

/** LP value against HODL value across price scenarios. */
function DivergenceChart({ ratios }: { ratios: number[] }) {
  const ref = useRef<SVGSVGElement | null>(null);
  const width = useChartWidth(ref);
  const data = useMemo(() => divergenceCurve(ratios), [ratios]);

  useEffect(() => {
    const svg = d3.select(ref.current);
    svg.selectAll('*').remove();

    const innerW = width - MARGIN.left - MARGIN.right;
    const innerH = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;
    if (innerW <= 0) return;

    const root = svg
      .attr('width', width)
      .attr('height', CHART_HEIGHT)
      .append('g')
      .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    const x = d3
      .scaleLinear()
      .domain([d3.min(data, (d) => d.priceRatio) ?? 0, d3.max(data, (d) => d.priceRatio) ?? 1])
      .range([0, innerW]);
    const y = d3
      .scaleLinear()
      .domain([0, (d3.max(data, (d) => d.hodlValue) ?? 1) * 1.1])
      .range([innerH, 0]);

    root
      .append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(6).tickFormat((d) => `${d}x`))
      .attr('color', '#6b7280')
      .selectAll('text')
      .attr('fill', '#9ca3af')
      .style('font-size', '10px');

    root
      .append('g')
      .call(d3.axisLeft(y).ticks(4))
      .attr('color', '#6b7280')
      .selectAll('text')
      .attr('fill', '#9ca3af')
      .style('font-size', '10px');

    const hodlLine = d3
      .line<(typeof data)[number]>()
      .x((d) => x(d.priceRatio))
      .y((d) => y(d.hodlValue));
    const lpLine = d3
      .line<(typeof data)[number]>()
      .x((d) => x(d.priceRatio))
      .y((d) => y(d.lpValue));

    root
      .append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', '#60a5fa')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '5 4')
      .attr('d', hodlLine);

    root
      .append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', '#f97316')
      .attr('stroke-width', 2)
      .attr('d', lpLine);

    return () => {
      svg.selectAll('*').remove();
    };
  }, [data, width]);

  return (
    <div>
      <svg ref={ref} role="img" aria-label="LP value versus holding across price scenarios" />
      <p className="mt-1 text-[10px] text-gray-500">
        <span className="text-orange-400">■</span> LP position ·{' '}
        <span className="text-blue-400">▪</span> HODL — the gap is impermanent loss
      </p>
    </div>
  );
}

/** Slippage against trade size. */
function DepthChart({ pool }: { pool: PoolReserves }) {
  const ref = useRef<SVGSVGElement | null>(null);
  const width = useChartWidth(ref);
  const data = useMemo(() => depthCurve(pool, 0.4, 30), [pool]);

  useEffect(() => {
    const svg = d3.select(ref.current);
    svg.selectAll('*').remove();

    const innerW = width - MARGIN.left - MARGIN.right;
    const innerH = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;
    if (innerW <= 0 || data.length === 0) return;

    const root = svg
      .attr('width', width)
      .attr('height', CHART_HEIGHT)
      .append('g')
      .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    const x = d3
      .scaleLinear()
      .domain([0, d3.max(data, (d) => d.amountIn) ?? 1])
      .range([0, innerW]);
    const y = d3
      .scaleLinear()
      .domain([0, (d3.max(data, (d) => d.slippage) ?? 0.01) * 1.1])
      .range([innerH, 0]);

    root
      .append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat((d) => d3.format('.2s')(d as number)))
      .attr('color', '#6b7280')
      .selectAll('text')
      .attr('fill', '#9ca3af')
      .style('font-size', '10px');

    root
      .append('g')
      .call(d3.axisLeft(y).ticks(4).tickFormat((d) => `${((d as number) * 100).toFixed(1)}%`))
      .attr('color', '#6b7280')
      .selectAll('text')
      .attr('fill', '#9ca3af')
      .style('font-size', '10px');

    root
      .append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', '#22c55e')
      .attr('stroke-width', 2)
      .attr(
        'd',
        d3
          .line<(typeof data)[number]>()
          .x((d) => x(d.amountIn))
          .y((d) => y(d.slippage)),
      );

    return () => {
      svg.selectAll('*').remove();
    };
  }, [data, width]);

  return <svg ref={ref} role="img" aria-label="Trade slippage against order size" />;
}

export function LivePoolYield() {
  const { pools, loading, error, refresh } = useLiquidityPools();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [principal, setPrincipal] = useState(10_000);
  const [dailyVolume, setDailyVolume] = useState(50_000);
  const [priceRatio, setPriceRatio] = useState(2);
  const [tradeSize, setTradeSize] = useState(1_000);

  const pool = useMemo(
    () => pools.find((p) => p.id === selectedId) ?? pools[0] ?? null,
    [pools, selectedId],
  );

  if (loading && pools.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-zinc-950 p-6 text-xs tracking-widest text-gray-500 uppercase">
        Loading live Stellar liquidity pools…
      </div>
    );
  }

  if (!pool) {
    return (
      <div className="rounded-2xl border border-red-600/30 bg-red-950/20 p-6">
        <p className="text-xs tracking-widest text-red-400 uppercase">No live pools available</p>
        {error && <p className="mt-2 font-mono text-xs text-gray-400">{error}</p>}
        <button
          type="button"
          onClick={refresh}
          className="mt-4 rounded border border-red-600/40 px-4 py-2 text-xs tracking-widest text-red-300 uppercase hover:bg-red-900/30"
        >
          Retry
        </button>
      </div>
    );
  }

  const apr = feeApr(pool, dailyVolume, 1);
  const projections = projectHorizons(principal, apr, YIELD_HORIZON_DAYS);
  const il = impermanentLoss(priceRatio);
  const quote = quoteSwap(pool, tradeSize);
  const safeTrade = maxTradeWithinSlippage(pool, 0.01);

  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-950">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-6 py-4">
        <div>
          <h2 className="text-sm font-black tracking-widest text-white uppercase">
            Live Pool Yield — Testnet
          </h2>
          <p className="mt-1 text-[10px] tracking-[0.2em] text-gray-500 uppercase">
            Reserves read from Horizon · constant product x·y=k
          </p>
        </div>
        <label className="flex items-center gap-2 text-[10px] tracking-widest text-gray-500 uppercase">
          Pool
          <select
            value={pool.id}
            onChange={(e) => setSelectedId(e.target.value)}
            className="rounded border border-white/10 bg-black px-2 py-1 font-mono text-xs text-white"
            aria-label="Select liquidity pool"
          >
            {pools.map((p) => (
              <option key={p.id} value={p.id}>
                {p.assetA}/{p.assetB} — {p.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
      </header>

      {/* Live reserves */}
      <dl className="grid grid-cols-2 gap-4 border-b border-white/10 px-6 py-4 md:grid-cols-4">
        <div>
          <dt className="text-[10px] tracking-[0.2em] text-gray-500 uppercase">
            {pool.assetA} reserve
          </dt>
          <dd className="font-mono text-lg text-white">{pool.reserveA.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-[10px] tracking-[0.2em] text-gray-500 uppercase">
            {pool.assetB} reserve
          </dt>
          <dd className="font-mono text-lg text-white">{pool.reserveB.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-[10px] tracking-[0.2em] text-gray-500 uppercase">Spot price</dt>
          <dd className="font-mono text-lg text-white">{spotPrice(pool).toFixed(6)}</dd>
        </div>
        <div>
          <dt className="text-[10px] tracking-[0.2em] text-gray-500 uppercase">Pool fee</dt>
          <dd className="font-mono text-lg text-white">{pool.feeBps} bps</dd>
        </div>
      </dl>

      {/* Fee APR + horizons */}
      <div className="border-b border-white/10 px-6 py-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="text-[10px] tracking-[0.2em] text-gray-500 uppercase">
            Position size
            <input
              type="number"
              min={0}
              value={principal}
              onChange={(e) => setPrincipal(Math.max(0, Number(e.target.value)))}
              className="mt-1 w-full rounded border border-white/10 bg-black px-3 py-2 font-mono text-sm text-white"
            />
          </label>
          <label className="text-[10px] tracking-[0.2em] text-gray-500 uppercase">
            Assumed daily volume ({pool.assetB})
            <input
              type="number"
              min={0}
              value={dailyVolume}
              onChange={(e) => setDailyVolume(Math.max(0, Number(e.target.value)))}
              className="mt-1 w-full rounded border border-white/10 bg-black px-3 py-2 font-mono text-sm text-white"
            />
          </label>
        </div>

        <p className="mt-4 text-[10px] tracking-[0.2em] text-gray-500 uppercase">
          Fee APR at that volume ·{' '}
          <span className="font-mono text-sm text-green-400">{pct(apr)}</span> · pool liquidity{' '}
          {poolValueInB(pool).toLocaleString()} {pool.assetB}
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {projections.map((p) => (
            <div key={p.days} className="rounded border border-white/10 bg-black p-3">
              <p className="text-[10px] tracking-[0.2em] text-gray-500 uppercase">{p.days} days</p>
              <p className="font-mono text-lg text-white">{p.finalValue.toFixed(2)}</p>
              <p className="font-mono text-xs text-green-400">
                +{p.feesEarned.toFixed(2)} ({pct(p.yieldFraction)})
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Impermanent loss */}
      <div className="border-b border-white/10 px-6 py-5">
        <label
          htmlFor="price-ratio"
          className="mb-2 block text-[10px] tracking-[0.2em] text-gray-500 uppercase"
        >
          Price move versus entry — {priceRatio.toFixed(2)}x
        </label>
        <input
          id="price-ratio"
          type="range"
          min={0.25}
          max={4}
          step={0.05}
          value={priceRatio}
          onChange={(e) => setPriceRatio(Number(e.target.value))}
          className="w-full accent-orange-500"
        />

        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-[10px] tracking-[0.2em] text-gray-500 uppercase">
              Impermanent loss
            </p>
            <p className="font-mono text-2xl text-orange-400">{pct(il)}</p>
          </div>
          <div>
            <p className="text-[10px] tracking-[0.2em] text-gray-500 uppercase">
              Net after 365d fees
            </p>
            <p
              className={`font-mono text-2xl ${netLpReturn(apr, 365, priceRatio).net >= 0 ? 'text-green-400' : 'text-red-500'}`}
            >
              {pct(netLpReturn(apr, 365, priceRatio).net)}
            </p>
          </div>
          <div>
            <p className="text-[10px] tracking-[0.2em] text-gray-500 uppercase">Versus holding</p>
            <p className="font-mono text-2xl text-gray-300">
              {il === 0 ? 'even' : 'behind'}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <DivergenceChart ratios={PRICE_RATIOS} />
        </div>
      </div>

      {/* Slippage / depth */}
      <div className="px-6 py-5">
        <label
          htmlFor="trade-size"
          className="mb-2 block text-[10px] tracking-[0.2em] text-gray-500 uppercase"
        >
          Trade size — {tradeSize.toLocaleString()} {pool.assetA}
        </label>
        <input
          id="trade-size"
          type="range"
          min={1}
          max={Math.max(2, Math.round(pool.reserveA * 0.4))}
          value={Math.min(tradeSize, Math.round(pool.reserveA * 0.4))}
          onChange={(e) => setTradeSize(Number(e.target.value))}
          className="w-full accent-green-500"
        />

        <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <dt className="text-[10px] tracking-[0.2em] text-gray-500 uppercase">You receive</dt>
            <dd className="font-mono text-sm text-white">
              {quote.amountOut.toFixed(4)} {pool.assetB}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] tracking-[0.2em] text-gray-500 uppercase">Slippage</dt>
            <dd
              className={`font-mono text-sm ${quote.slippage > 0.05 ? 'text-red-500' : quote.slippage > 0.01 ? 'text-amber-400' : 'text-green-400'}`}
            >
              {pct(quote.slippage)}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] tracking-[0.2em] text-gray-500 uppercase">Fee paid</dt>
            <dd className="font-mono text-sm text-white">
              {quote.feePaid.toFixed(4)} {pool.assetA}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] tracking-[0.2em] text-gray-500 uppercase">
              Max trade under 1%
            </dt>
            <dd className="font-mono text-sm text-white">{safeTrade.toFixed(0)}</dd>
          </div>
        </dl>

        {quote.slippage > 0.05 && (
          <p className="mt-3 text-xs text-red-400">
            This order moves the price more than 5%. In a pool this size you are paying most of
            that to arbitrageurs — split the order or find deeper liquidity.
          </p>
        )}

        <div className="mt-4">
          <DepthChart pool={pool} />
        </div>
      </div>
    </section>
  );
}
