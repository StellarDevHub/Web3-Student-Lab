'use client';

import { FeeStats, fetchFeeStats } from '@/lib/soroban-tools';
import * as d3 from 'd3';
import { useEffect, useRef, useState } from 'react';

const MAX_HISTORY = 36; // 6 minutes at 10s intervals

function FeeChart({ data }: { data: FeeStats[] }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || data.length < 2) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const W = svgRef.current.clientWidth || 700;
    const H = 220;
    const margin = { top: 16, right: 16, bottom: 32, left: 52 };
    const w = W - margin.left - margin.right;
    const h = H - margin.top - margin.bottom;

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3
      .scaleTime()
      .domain(d3.extent(data, (d) => new Date(d.timestamp)) as [Date, Date])
      .range([0, w]);
    const allVals = data.flatMap((d) => [d.min, d.p50, d.max]);
    const y = d3
      .scaleLinear()
      .domain([0, d3.max(allVals)! * 1.1])
      .range([h, 0]);

    // Grid
    g.append('g')
      .attr('class', 'grid')
      .call(
        d3
          .axisLeft(y)
          .ticks(4)
          .tickSize(-w)
          .tickFormat(() => '')
      )
      .selectAll('line')
      .attr('stroke', '#2d2d2d');
    g.select('.grid .domain').remove();

    // Area between min and max
    const area = d3
      .area<FeeStats>()
      .x((d) => x(new Date(d.timestamp)))
      .y0((d) => y(d.min))
      .y1((d) => y(d.max))
      .curve(d3.curveMonotoneX);
    g.append('path').datum(data).attr('fill', '#ef444420').attr('d', area);

    // Lines
    const lines: { key: keyof FeeStats; color: string; label: string }[] = [
      { key: 'min', color: '#22c55e', label: 'Min' },
      { key: 'p50', color: '#f59e0b', label: 'Avg (p50)' },
      { key: 'max', color: '#ef4444', label: 'Max' },
    ];

    for (const { key, color } of lines) {
      const line = d3
        .line<FeeStats>()
        .x((d) => x(new Date(d.timestamp)))
        .y((d) => y(d[key] as number))
        .curve(d3.curveMonotoneX);
      g.append('path')
        .datum(data)
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', 2)
        .attr('d', line);
    }

    // Axes
    g.append('g')
      .attr('transform', `translate(0,${h})`)
      .call(
        d3
          .axisBottom(x)
          .ticks(5)
          .tickFormat((d) => d3.timeFormat('%H:%M:%S')(d as Date))
      )
      .selectAll('text')
      .attr('fill', '#9ca3af')
      .attr('font-size', '10px');
    g.append('g')
      .call(d3.axisLeft(y).ticks(4))
      .selectAll('text')
      .attr('fill', '#9ca3af')
      .attr('font-size', '10px');
    g.selectAll('.domain').attr('stroke', '#374151');
    g.selectAll('.tick line').attr('stroke', '#374151');
  }, [data]);

  return <svg ref={svgRef} className="w-full" style={{ height: 220 }} />;
}

export default function FeesPage() {
  const [history, setHistory] = useState<FeeStats[]>([]);
  const [latest, setLatest] = useState<FeeStats | null>(null);
  const [feeSlider, setFeeSlider] = useState(100);
  const [isSurge, setIsSurge] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const stats = await fetchFeeStats();
        setLatest(stats);
        setHistory((prev) => [...prev, stats].slice(-MAX_HISTORY));
        setIsSurge(stats.p99 > stats.p50 * 3);
      } catch (e) {
        console.error('Fee fetch failed:', e);
      }
    };
    load();
    const interval = setInterval(load, 10_000);
    return () => clearInterval(interval);
  }, []);

  const inclusionProbability = latest
    ? Math.min(100, Math.round((feeSlider / latest.p50) * 50))
    : 0;

  const probColor =
    inclusionProbability >= 80
      ? 'text-green-400'
      : inclusionProbability >= 50
        ? 'text-yellow-400'
        : 'text-red-400';

  return (
    <div className="min-h-screen bg-black p-6 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-black text-red-500">FEE DASHBOARD</h1>
          {isSurge && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500 bg-red-900/40 px-4 py-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
              <span className="text-sm font-bold text-red-400">SURGE PRICING ACTIVE</span>
            </div>
          )}
        </div>

        {/* Stats Row */}
        <div className="mb-6 grid grid-cols-4 gap-4">
          {[
            { label: 'MIN', value: latest?.min, color: 'text-green-400' },
            { label: 'P50 (AVG)', value: latest?.p50, color: 'text-yellow-400' },
            { label: 'P99', value: latest?.p99, color: 'text-orange-400' },
            { label: 'MAX', value: latest?.max, color: 'text-red-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-lg border border-white/10 bg-zinc-900 p-4">
              <div className="mb-1 text-xs font-bold text-gray-400">{label}</div>
              <div className={`font-mono text-2xl font-black ${color}`}>{value ?? '—'}</div>
              <div className="text-xs text-gray-500">stroops</div>
            </div>
          ))}
        </div>

        {/* Chart */}
        <div className="mb-6 rounded-lg border border-white/10 bg-zinc-900 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-bold text-gray-400">FEE HISTORY (last 6 min)</span>
            <div className="flex gap-4 text-xs">
              <span className="text-green-400">— Min</span>
              <span className="text-yellow-400">— Avg</span>
              <span className="text-red-400">— Max</span>
            </div>
          </div>
          {history.length >= 2 ? (
            <FeeChart data={history} />
          ) : (
            <div className="flex h-[220px] items-center justify-center text-sm text-gray-500">
              Collecting data...
            </div>
          )}
        </div>

        {/* Fee Slider */}
        <div className="rounded-lg border border-white/10 bg-zinc-900 p-6">
          <div className="mb-4 text-xs font-bold text-gray-400">
            FEE SLIDER — INCLUSION PROBABILITY
          </div>
          <div className="flex items-center gap-6">
            <div className="flex-1">
              <input
                type="range"
                min={latest?.min ?? 100}
                max={latest?.max ?? 10000}
                value={feeSlider}
                onChange={(e) => setFeeSlider(Number(e.target.value))}
                className="w-full accent-red-500"
              />
              <div className="mt-1 flex justify-between text-xs text-gray-500">
                <span>{latest?.min ?? 100} stroops</span>
                <span>{latest?.max ?? 10000} stroops</span>
              </div>
            </div>
            <div className="min-w-[120px] text-center">
              <div className="mb-1 text-xs text-gray-400">YOUR FEE</div>
              <div className="font-mono text-2xl font-black text-white">{feeSlider}</div>
              <div className="text-xs text-gray-500">stroops</div>
            </div>
            <div className="min-w-[120px] text-center">
              <div className="mb-1 text-xs text-gray-400">INCLUSION PROB.</div>
              <div className={`font-mono text-2xl font-black ${probColor}`}>
                {inclusionProbability}%
              </div>
              <div className="text-xs text-gray-500">estimated</div>
            </div>
          </div>
          <div className="mt-4 text-xs text-gray-500">
            {inclusionProbability >= 80
              ? '✅ High probability — your transaction should be included in the next ledger.'
              : inclusionProbability >= 50
                ? '⚠️ Moderate probability — consider increasing the fee during congestion.'
                : '❌ Low probability — increase your fee to ensure inclusion.'}
          </div>
        </div>
      </div>
    </div>
  );
}
