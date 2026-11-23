'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { forceCenter, forceLink, forceManyBody, forceSimulation, select } from 'd3';

export interface NodeDatum {
  id: string;
  group: number;
}

export interface LinkDatum {
  source: string;
  target: string;
  value: number;
}

interface Props {
  nodes: NodeDatum[];
  links: LinkDatum[];
  width?: number;
  height?: number;
}

export default function NetworkGraph({ nodes, links, width = 680, height = 420 }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [layout, setLayout] = useState<NodeDatum[]>([]);

  const linkData = useMemo(
    () => links.map((link) => ({ ...link })),
    [links]
  );

  useEffect(() => {
    const svgElement = svgRef.current;
    if (!svgElement) return;

    const simulation = forceSimulation<NodeDatum>(nodes)
      .force('link', forceLink<NodeDatum, LinkDatum>(linkData).id((d) => d.id).distance(110).strength(0.2))
      .force('charge', forceManyBody().strength(-180))
      .force('center', forceCenter(width / 2, height / 2));

    simulation.on('tick', () => {
      setLayout(nodes.map((node) => ({ ...node, x: (node as any).x ?? width / 2, y: (node as any).y ?? height / 2 })));
    });

    return () => {
      simulation.stop();
    };
  }, [height, linkData, nodes, width]);

  useEffect(() => {
    const svgElement = svgRef.current;
    if (!svgElement) return;

    const svg = select(svgElement);
    svg.selectAll('*').remove();

    svg
      .append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(linkData)
      .join('line')
      .attr('stroke', '#334155')
      .attr('stroke-width', (d) => Math.max(1, d.value * 0.8));

    svg
      .append('g')
      .attr('class', 'nodes')
      .selectAll('circle')
      .data(nodes)
      .join('circle')
      .attr('r', 12)
      .attr('fill', (d) => (d.group % 2 === 0 ? '#60a5fa' : '#facc15'))
      .attr('stroke', '#0f172a')
      .attr('stroke-width', 2);

    const tick = () => {
      svg.selectAll('.links line')
        .data(linkData)
        .attr('x1', (d) => ((d.source as any).x ?? width / 2))
        .attr('y1', (d) => ((d.source as any).y ?? height / 2))
        .attr('x2', (d) => ((d.target as any).x ?? width / 2))
        .attr('y2', (d) => ((d.target as any).y ?? height / 2));

      svg.selectAll('.nodes circle')
        .data(nodes)
        .attr('cx', (d) => ((d as any).x ?? width / 2))
        .attr('cy', (d) => ((d as any).y ?? height / 2));
    };

    const interval = window.setInterval(tick, 50);
    tick();
    return () => window.clearInterval(interval);
  }, [height, linkData, nodes, width]);

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-950 p-4">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-slate-100">Network graph</h2>
        <p className="text-sm text-slate-400">Visualize contract execution and call topology with an interactive force layout.</p>
      </div>
      <svg ref={svgRef} width={width} height={height} className="w-full rounded-3xl bg-slate-900" />
    </div>
  );
}
