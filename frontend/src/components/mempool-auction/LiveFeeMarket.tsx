'use client';

import * as d3 from 'd3';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useFeeStats } from '@/hooks/useFeeStats';
import {
  CHART_PERCENTILES,
  FeeStats,
  expectedWaitSeconds,
  feeCurve,
  inclusionProbability,
  ledgerCapacity,
  stroopsToXlm,
  suggestedBid,
} from '@/lib/stellarFeeStats';

/**
 * Live Stellar fee market panel (Issue #1156).
 *
 * Replaces the synthetic timer loop with the real thing: Horizon's `/fee_stats`
 * percentiles, a bid slider that predicts inclusion against current network
 * load, and a ledger capacity meter.
 */

const CHART_HEIGHT = 220;
const CHART_MARGIN = { top: 16, right: 16, bottom: 34, left: 56 };

function formatWait(seconds: number): string {
  if (!Number.isFinite(seconds)) return 'never';
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  return `${(seconds / 60).toFixed(1)}m`;
}

/** D3 bar chart of the charged-fee percentile distribution. */
function FeeDistributionChart({ stats, bid }: { stats: FeeStats; bid: number }) {
  const ref = useRef<SVGSVGElement | null>(null);
  const [width, setWidth] = useState(640);

  // Track the container width so the chart is responsive without a re-render loop.
  useEffect(() => {
    const svg = ref.current;
    if (!svg?.parentElement || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (next) setWidth(Math.max(320, next));
    });
    observer.observe(svg.parentElement);

    return () => observer.disconnect();
  }, []);

  const curve = useMemo(() => feeCurve(stats.feeCharged, CHART_PERCENTILES), [stats]);

  useEffect(() => {
    const svg = d3.select(ref.current);
    // Redraw from scratch each update — the dataset is four bars, so there is
    // nothing to gain from an enter/update/exit join, and clearing outright is
    // what keeps repeated polls from stacking detached nodes.
    svg.selectAll('*').remove();

    const innerWidth = width - CHART_MARGIN.left - CHART_MARGIN.right;
    const innerHeight = CHART_HEIGHT - CHART_MARGIN.top - CHART_MARGIN.bottom;
    if (innerWidth <= 0) return;

    const root = svg
      .attr('width', width)
      .attr('height', CHART_HEIGHT)
      .append('g')
      .attr('transform', `translate(${CHART_MARGIN.left},${CHART_MARGIN.top})`);

    const x = d3
      .scaleBand<string>()
      .domain(curve.map((d) => `p${d.percentile}`))
      .range([0, innerWidth])
      .padding(0.35);

    const maxFee = Math.max(d3.max(curve, (d) => d.stroops) ?? 0, bid, 1);
    const y = d3.scaleLinear().domain([0, maxFee * 1.15]).range([innerHeight, 0]);

    root
      .append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x))
      .attr('color', '#6b7280')
      .selectAll('text')
      .attr('fill', '#9ca3af')
      .style('font-size', '10px');

    root
      .append('g')
      .call(d3.axisLeft(y).ticks(4).tickFormat((d) => `${d}`))
      .attr('color', '#6b7280')
      .selectAll('text')
      .attr('fill', '#9ca3af')
      .style('font-size', '10px');

    root
      .selectAll('rect.fee-bar')
      .data(curve)
      .join('rect')
      .attr('class', 'fee-bar')
      .attr('x', (d) => x(`p${d.percentile}`) ?? 0)
      .attr('width', x.bandwidth())
      .attr('y', (d) => y(d.stroops))
      .attr('height', (d) => innerHeight - y(d.stroops))
      // A bar the bid clears is one the student would have outpaid.
      .attr('fill', (d) => (bid >= d.stroops ? '#22c55e' : '#dc2626'))
      .attr('opacity', 0.85);

    root
      .selectAll('text.fee-label')
      .data(curve)
      .join('text')
      .attr('class', 'fee-label')
      .attr('x', (d) => (x(`p${d.percentile}`) ?? 0) + x.bandwidth() / 2)
      .attr('y', (d) => y(d.stroops) - 4)
      .attr('text-anchor', 'middle')
      .attr('fill', '#e5e7eb')
      .style('font-size', '10px')
      .text((d) => d.stroops);

    // The student's bid, drawn across the distribution it competes with.
    root
      .append('line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', y(bid))
      .attr('y2', y(bid))
      .attr('stroke', '#facc15')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '6 4');

    root
      .append('text')
      .attr('x', innerWidth)
      .attr('y', y(bid) - 6)
      .attr('text-anchor', 'end')
      .attr('fill', '#facc15')
      .style('font-size', '10px')
      .text(`your bid ${bid}`);

    return () => {
      // Drop every node and bound datum when the inputs change or the panel
      // unmounts, so nothing detached survives a poll.
      svg.selectAll('*').remove();
    };
  }, [curve, width, bid]);

  return <svg ref={ref} role="img" aria-label="Stellar fee distribution by percentile" />;
}

export function LiveFeeMarket() {
  const { stats, loading, error, updatedAt, refresh } = useFeeStats();
  const [bid, setBid] = useState(100);
  const [bidTouched, setBidTouched] = useState(false);

  // Until the student moves the slider, track the network's own base fee so the
  // panel opens on a sensible bid rather than an arbitrary one.
  useEffect(() => {
    if (!bidTouched && stats) setBid(stats.baseFee);
  }, [stats, bidTouched]);

  if (loading && !stats) {
    return (
      <div className="border border-gray-800 bg-gray-950 p-6 text-xs tracking-widest text-gray-500 uppercase">
        Connecting to Stellar Testnet Horizon…
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="border border-red-900 bg-red-950/30 p-6">
        <p className="text-xs tracking-widest text-red-400 uppercase">Horizon unreachable</p>
        <p className="mt-2 font-mono text-xs text-gray-400">{error}</p>
        <button
          type="button"
          onClick={refresh}
          className="mt-4 border border-red-700 px-4 py-2 text-xs tracking-widest text-red-300 uppercase hover:bg-red-900/40"
        >
          Retry
        </button>
      </div>
    );
  }

  const capacity = ledgerCapacity(stats);
  const probability = inclusionProbability(bid, stats);
  const waitSeconds = expectedWaitSeconds(bid, stats);
  const recommended = suggestedBid(stats, 0.9);
  const maxBid = Math.max(stats.feeCharged.max, stats.baseFee * 10, 1000);

  return (
    <section className="border border-gray-800 bg-gray-950">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 px-6 py-4">
        <div>
          <h2 className="text-sm font-black tracking-widest text-white uppercase">
            Live Fee Market — Testnet
          </h2>
          <p className="mt-1 text-[10px] tracking-[0.2em] text-gray-500 uppercase">
            Ledger #{stats.lastLedger.toLocaleString()} · base fee {stats.baseFee} stroops
          </p>
        </div>
        <div className="text-right">
          <span
            className={`text-[10px] tracking-widest uppercase ${error ? 'text-amber-400' : 'text-green-400'}`}
          >
            {error ? 'stale — retrying' : 'live'}
          </span>
          {updatedAt && (
            <p className="text-[10px] text-gray-600">
              {new Date(updatedAt).toLocaleTimeString()}
            </p>
          )}
        </div>
      </header>

      {/* Ledger capacity meter */}
      <div className="border-b border-gray-800 px-6 py-4">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-[10px] tracking-[0.2em] text-gray-500 uppercase">
            Ledger capacity
          </span>
          <span className="font-mono text-xs text-gray-300">
            {capacity.operations.toLocaleString()} / {capacity.limit.toLocaleString()} ops
          </span>
        </div>
        <div className="h-3 w-full overflow-hidden border border-gray-800 bg-black">
          <div
            className={`h-full transition-[width] duration-500 ${
              capacity.saturated ? 'bg-red-600' : capacity.usage > 0.75 ? 'bg-amber-500' : 'bg-green-600'
            }`}
            style={{ width: `${Math.round(capacity.usage * 100)}%` }}
            role="progressbar"
            aria-valuenow={Math.round(capacity.usage * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Ledger capacity usage"
          />
        </div>
        <p className="mt-2 text-[10px] text-gray-600">
          {capacity.saturated
            ? 'Ledger is full — bids now compete and surge pricing applies.'
            : 'Spare capacity: any bid at or above the base fee is included.'}
        </p>
      </div>

      <div className="px-6 py-4">
        <FeeDistributionChart stats={stats} bid={bid} />
      </div>

      {/* Bid slider + inclusion prediction */}
      <div className="border-t border-gray-800 px-6 py-5">
        <label
          htmlFor="fee-bid"
          className="mb-2 block text-[10px] tracking-[0.2em] text-gray-500 uppercase"
        >
          Your bid — {bid} stroops ({stroopsToXlm(bid).toFixed(7)} XLM)
        </label>
        <input
          id="fee-bid"
          type="range"
          min={1}
          max={maxBid}
          step={1}
          value={bid}
          onChange={(e) => {
            setBidTouched(true);
            setBid(Number(e.target.value));
          }}
          className="w-full accent-red-600"
        />

        <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-[10px] tracking-[0.2em] text-gray-500 uppercase">
              Inclusion chance
            </dt>
            <dd
              className={`font-mono text-2xl ${probability >= 0.9 ? 'text-green-400' : probability > 0 ? 'text-amber-400' : 'text-red-500'}`}
            >
              {(probability * 100).toFixed(0)}%
            </dd>
          </div>
          <div>
            <dt className="text-[10px] tracking-[0.2em] text-gray-500 uppercase">Expected wait</dt>
            <dd className="font-mono text-2xl text-gray-200">{formatWait(waitSeconds)}</dd>
          </div>
          <div>
            <dt className="text-[10px] tracking-[0.2em] text-gray-500 uppercase">
              Bid for 90% odds
            </dt>
            <dd className="font-mono text-2xl text-gray-200">{recommended}</dd>
          </div>
        </dl>

        {bid < stats.baseFee && (
          <p className="mt-3 text-xs text-red-400">
            Below the network base fee of {stats.baseFee} stroops — this transaction would be
            rejected outright, not merely delayed.
          </p>
        )}
      </div>
    </section>
  );
}
