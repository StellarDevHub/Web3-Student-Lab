'use client';

/**
 * Live fee-history chart (min / p50 / max) for /devtools/fees.
 * Lives in its own module so d3 is only fetched via next/dynamic (FE-076).
 */

import * as d3 from 'd3';
import { useEffect, useRef } from 'react';
import type { FeeStats } from '@/lib/soroban-tools';

export function FeeChart({ data }: { data: FeeStats[] }) {
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

export default FeeChart;
