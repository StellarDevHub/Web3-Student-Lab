'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { axisBottom, axisLeft, extent, scaleLinear, select, zoom, zoomTransform } from 'd3';

export interface ScatterDatum {
  x: number;
  y: number;
  r?: number;
  label?: string;
}

interface Props {
  data: ScatterDatum[];
  width?: number;
  height?: number;
}

export default function ScatterPlot({ data, width = 680, height = 420 }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string } | null>(null);

  const margin = { top: 28, right: 24, bottom: 40, left: 48 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const [rendered, setRendered] = useState(false);

  const xDomain = useMemo(() => extent(data, (item) => item.x) as [number, number], [data]);
  const yDomain = useMemo(() => extent(data, (item) => item.y) as [number, number], [data]);

  useEffect(() => {
    const svgElement = svgRef.current;
    if (!svgElement || data.length === 0) return;

    const id = window.requestIdleCallback
      ? window.requestIdleCallback(() => setRendered(true))
      : window.setTimeout(() => setRendered(true), 100);

    return () => {
      if ('cancelIdleCallback' in window) {
        window.cancelIdleCallback(id as number);
      }
      window.clearTimeout(id as number);
    };
  }, [data]);

  useEffect(() => {
    if (!rendered) return;
    const svgElement = svgRef.current;
    if (!svgElement) return;

    const svg = select(svgElement);
    svg.selectAll('*').remove();

    const xScale = scaleLinear().domain([xDomain[0] ?? 0, xDomain[1] ?? 1]).nice().range([margin.left, margin.left + innerWidth]);
    const yScale = scaleLinear().domain([yDomain[0] ?? 0, yDomain[1] ?? 1]).nice().range([margin.top + innerHeight, margin.top]);

    const g = svg.append('g');

    g.append('g')
      .attr('transform', `translate(0, ${margin.top + innerHeight})`)
      .call(axisBottom(xScale).ticks(6).tickSizeOuter(0))
      .attr('color', '#94a3b8');

    g.append('g')
      .attr('transform', `translate(${margin.left}, 0)`)
      .call(axisLeft(yScale).ticks(6).tickSizeOuter(0))
      .attr('color', '#94a3b8');

    const pointLayer = g.append('g').attr('class', 'scatter-points');

    pointLayer
      .selectAll('circle')
      .data(data)
      .join('circle')
      .attr('cx', (item) => xScale(item.x))
      .attr('cy', (item) => yScale(item.y))
      .attr('r', (item) => Math.max(3, item.r ?? 6))
      .attr('fill', '#38bdf8')
      .attr('fill-opacity', 0.85)
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 0.75)
      .on('mouseenter', (event, item) => {
        setTooltip({ x: event.clientX, y: event.clientY, label: `${item.label ?? 'Point'} (${item.x}, ${item.y})` });
      })
      .on('mouseleave', () => setTooltip(null));

    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 8])
      .on('zoom', (event) => {
        pointLayer.attr('transform', event.transform.toString());
        g.selectAll('g').attr('transform', event.transform.toString());
      });

    svg.call(zoomBehavior);
  }, [data, innerHeight, innerWidth, margin.left, margin.top, rendered, xDomain, yDomain]);

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-950 p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-100">Contract performance scatter plot</h2>
          <p className="text-sm text-slate-400">Interactive scatter plot with zooming, panning, and tooltips.</p>
        </div>
      </div>
      <svg ref={svgRef} width={width} height={height} className="w-full rounded-3xl bg-slate-900" />
      {tooltip ? (
        <div
          className="pointer-events-none absolute z-10 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 shadow-2xl"
          style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}
        >
          {tooltip.label}
        </div>
      ) : null}
    </div>
  );
}
