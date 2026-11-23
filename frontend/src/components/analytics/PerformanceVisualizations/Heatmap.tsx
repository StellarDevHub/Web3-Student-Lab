'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { axisBottom, axisLeft, interpolateViridis, scaleBand, scaleSequential, select } from 'd3';

export interface HeatmapDatum {
  x: string;
  y: string;
  value: number;
}

interface Props {
  data: HeatmapDatum[];
  width?: number;
  height?: number;
}

export default function Heatmap({ data, width = 680, height = 420 }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; value: number } | null>(null);

  const margin = { top: 28, right: 24, bottom: 40, left: 64 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const xKeys = useMemo(() => Array.from(new Set(data.map((item) => item.x))), [data]);
  const yKeys = useMemo(() => Array.from(new Set(data.map((item) => item.y))).reverse(), [data]);
  const valueExtent = useMemo(() => [Math.min(...data.map((item) => item.value)), Math.max(...data.map((item) => item.value))] as [number, number], [data]);

  useEffect(() => {
    const svgElement = svgRef.current;
    if (!svgElement || data.length === 0) return;

    const svg = select(svgElement);
    svg.selectAll('*').remove();

    const xScale = scaleBand<string>().domain(xKeys).range([margin.left, margin.left + innerWidth]).padding(0.08);
    const yScale = scaleBand<string>().domain(yKeys).range([margin.top, margin.top + innerHeight]).padding(0.08);
    const colorScale = scaleSequential(interpolateViridis).domain([valueExtent[0], valueExtent[1]]);

    svg.append('g')
      .attr('transform', `translate(0, ${margin.top + innerHeight})`)
      .call(axisBottom(xScale).tickSizeOuter(0))
      .attr('color', '#94a3b8');

    svg.append('g')
      .attr('transform', `translate(${margin.left}, 0)`)
      .call(axisLeft(yScale).tickSizeOuter(0))
      .attr('color', '#94a3b8');

    svg
      .append('g')
      .selectAll('rect')
      .data(data)
      .join('rect')
      .attr('x', (d) => xScale(d.x) ?? 0)
      .attr('y', (d) => yScale(d.y) ?? 0)
      .attr('width', xScale.bandwidth())
      .attr('height', yScale.bandwidth())
      .attr('fill', (d) => colorScale(d.value))
      .attr('stroke', '#0f172a')
      .on('mouseenter', (event, d) => {
        setTooltip({ x: event.clientX, y: event.clientY, value: d.value });
      })
      .on('mouseleave', () => setTooltip(null));
  }, [data, innerHeight, innerWidth, margin.left, margin.top, xKeys, yKeys, valueExtent]);

  return (
    <div className="relative rounded-3xl border border-slate-800 bg-slate-950 p-4">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-slate-100">Contract performance heatmap</h2>
        <p className="text-sm text-slate-400">Heatmap visualization for performance hotspots and block-level intensity.</p>
      </div>
      <svg ref={svgRef} width={width} height={height} className="w-full rounded-3xl bg-slate-900" />
      {tooltip ? (
        <div
          className="pointer-events-none absolute z-10 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 shadow-2xl"
          style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}
        >
          <span>Value: {tooltip.value.toFixed(2)}</span>
        </div>
      ) : null}
    </div>
  );
}
