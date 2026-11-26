'use client';

/**
 * Linear memory size over execution steps, one segment per traced export,
 * with the execution memory limit drawn as a ceiling.
 */

import { forwardRef, useMemo } from 'react';
import { line, scaleLinear } from 'd3';
import { formatBytes } from '@/lib/wasmAnalyzer';
import type { GrowthTrace } from '@/lib/wasmMemoryProfiler';

export interface MemoryGrowthChartProps {
  trace: GrowthTrace;
  width?: number;
  height?: number;
}

const MARGIN = { top: 16, right: 16, bottom: 28, left: 72 };
const SERIES = ['#ef4444', '#22c55e', '#06b6d4', '#eab308', '#a855f7', '#f97316'];

export const MemoryGrowthChart = forwardRef<SVGSVGElement, MemoryGrowthChartProps>(function MemoryGrowthChart(
  { trace, width = 960, height = 260 },
  ref
) {
  const { segments, x, y } = useMemo(() => {
    const maxStep = Math.max(1, ...trace.steps.map((s) => s.step));
    const peak = Math.max(1, ...trace.steps.map((s) => s.bytes));
    // Show the limit line only when usage is within an order of magnitude of it.
    const top = peak > trace.limitBytes / 10 ? trace.limitBytes * 1.05 : peak * 1.2;
    const xs = scaleLinear().domain([0, maxStep]).range([MARGIN.left, width - MARGIN.right]);
    const ys = scaleLinear().domain([0, top]).range([height - MARGIN.bottom, MARGIN.top]).nice();
    const byExport = new Map<string, typeof trace.steps>();
    for (const s of trace.steps) byExport.set(s.exportName, [...(byExport.get(s.exportName) ?? []), s]);
    return { segments: Array.from(byExport.entries()), x: xs, y: ys };
  }, [trace, width, height]);

  if (trace.steps.length === 0) {
    return (
      <p className="rounded border border-white/10 bg-black p-4 text-xs text-zinc-500" role="status">
        No execution steps were recorded (the module has no callable exports).
      </p>
    );
  }

  const path = line<{ step: number; bytes: number }>()
    .x((d) => x(d.step))
    .y((d) => y(d.bytes));
  const limitY = y(trace.limitBytes);
  const showLimit = limitY >= MARGIN.top;
  const ticks = y.ticks(4);

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      role="img"
      aria-label={`Linear memory growth over ${trace.steps.length} execution steps`}
      data-testid="memory-growth-chart"
    >
      {ticks.map((t) => (
        <g key={t} transform={`translate(0,${y(t)})`}>
          <line x1={MARGIN.left} x2={width - MARGIN.right} stroke="#27272a" />
          <text x={MARGIN.left - 8} y={4} textAnchor="end" fontSize={10} fill="#71717a">
            {formatBytes(t)}
          </text>
        </g>
      ))}
      <text x={width / 2} y={height - 6} textAnchor="middle" fontSize={10} fill="#71717a">
        execution step (host call)
      </text>

      {showLimit && (
        <g data-testid="memory-limit-line">
          <line
            x1={MARGIN.left}
            x2={width - MARGIN.right}
            y1={limitY}
            y2={limitY}
            stroke="#dc2626"
            strokeDasharray="6 4"
          />
          <text x={width - MARGIN.right} y={limitY - 4} textAnchor="end" fontSize={10} fill="#f87171">
            {formatBytes(trace.limitBytes)} limit
          </text>
        </g>
      )}

      {segments.map(([name, steps], i) => (
        <g key={name}>
          <path d={path(steps) ?? undefined} fill="none" stroke={SERIES[i % SERIES.length]} strokeWidth={2} />
          {steps.map((s) => (
            <circle key={s.step} cx={x(s.step)} cy={y(s.bytes)} r={2.5} fill={SERIES[i % SERIES.length]}>
              <title>{`${name} · step ${s.step} · ${s.label} · ${formatBytes(s.bytes)}`}</title>
            </circle>
          ))}
          <text x={x(steps[0].step) + 4} y={y(steps[0].bytes) - 6} fontSize={10} fill={SERIES[i % SERIES.length]}>
            {name}
          </text>
        </g>
      ))}
    </svg>
  );
});

export default MemoryGrowthChart;
