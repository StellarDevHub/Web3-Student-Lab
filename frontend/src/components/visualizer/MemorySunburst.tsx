'use client';

/**
 * Sunburst diagram of a hierarchical byte breakdown (module sections or
 * linear-memory regions). Click a ring segment to zoom into it; click the
 * centre to zoom out.
 */

import { forwardRef, useMemo, useState } from 'react';
import { arc as d3arc, hierarchy, partition, type HierarchyRectangularNode } from 'd3';
import { formatBytes } from '@/lib/wasmAnalyzer';
import type { ProfileNode } from '@/lib/wasmMemoryProfiler';

export interface MemorySunburstProps {
  data: ProfileNode;
  size?: number;
  onSelectFunction?: (functionIndex: number | undefined) => void;
}

type Node = HierarchyRectangularNode<ProfileNode>;

const RING_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#6366f1', '#a855f7', '#ec4899'];

function colorFor(node: Node): string {
  if (node.data.hotspot) return '#dc2626';
  let top = node;
  while (top.depth > 1 && top.parent) top = top.parent;
  const siblings = top.parent?.children ?? [top];
  const base = RING_COLORS[Math.max(0, siblings.indexOf(top)) % RING_COLORS.length];
  return base;
}

export const MemorySunburst = forwardRef<SVGSVGElement, MemorySunburstProps>(function MemorySunburst(
  { data, size = 420, onSelectFunction },
  ref
) {
  const radius = size / 2;
  const root = useMemo(() => {
    const h = hierarchy(data)
      .sum((d) => Math.max(0, d.value))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    return partition<ProfileNode>().size([2 * Math.PI, h.height + 1])(h);
  }, [data]);

  const [focusIndex, setFocusIndex] = useState(0);
  const nodes = useMemo(() => root.descendants(), [root]);
  const focus = nodes[focusIndex] ?? root;
  const total = root.value ?? 0;

  if (total === 0) {
    return (
      <p className="rounded border border-white/10 bg-black p-4 text-xs text-zinc-500" role="status">
        Nothing to plot — the breakdown is empty.
      </p>
    );
  }

  const depthSpan = Math.max(1, root.height + 1 - focus.depth);
  const ringWidth = radius / (depthSpan + 0.5);
  const angle = (x: number) =>
    Math.max(0, Math.min(2 * Math.PI, ((x - focus.x0) / (focus.x1 - focus.x0 || 1)) * 2 * Math.PI));

  const arcGen = d3arc<Node>()
    .startAngle((d) => angle(d.x0))
    .endAngle((d) => angle(d.x1))
    .padAngle(0.004)
    .innerRadius((d) => (d.depth - focus.depth) * ringWidth + ringWidth * 0.5)
    .outerRadius((d) => (d.depth - focus.depth + 1) * ringWidth + ringWidth * 0.5 - 1);

  // Partition sums can overshoot 2π by a float ulp; compare with a tolerance.
  const EPS = 1e-9;
  const visible = nodes.filter(
    (n) =>
      n.depth > focus.depth &&
      n.x0 >= focus.x0 - EPS &&
      n.x1 <= focus.x1 + EPS &&
      angle(n.x1) - angle(n.x0) > 0.002
  );

  return (
    <svg
      ref={ref}
      viewBox={`${-radius} ${-radius} ${size} ${size}`}
      width="100%"
      style={{ maxWidth: size }}
      role="img"
      aria-label={`Sunburst of ${focus.data.name}: ${formatBytes(focus.value ?? 0)}`}
      data-testid="memory-sunburst"
    >
      {visible.map((node) => {
        const share = ((node.value ?? 0) / (focus.value || 1)) * 100;
        const label = `${node.data.name} — ${formatBytes(node.value ?? 0)} (${share.toFixed(1)}%)`;
        return (
          <path
            key={nodes.indexOf(node)}
            d={arcGen(node) ?? undefined}
            fill={colorFor(node)}
            fillOpacity={node.children ? 0.85 : 0.6}
            role="button"
            tabIndex={0}
            aria-label={label}
            data-hotspot={node.data.hotspot ? 'true' : undefined}
            style={{ cursor: 'pointer' }}
            onClick={() => {
              if (node.children) setFocusIndex(nodes.indexOf(node));
              onSelectFunction?.(node.data.functionIndex);
            }}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && node.children) {
                e.preventDefault();
                setFocusIndex(nodes.indexOf(node));
              }
            }}
          >
            <title>{`${label}${node.data.detail ? `\n${node.data.detail}` : ''}`}</title>
          </path>
        );
      })}
      <g
        role="button"
        tabIndex={0}
        aria-label={focus.parent ? `Zoom out from ${focus.data.name}` : focus.data.name}
        style={{ cursor: focus.parent ? 'pointer' : 'default' }}
        onClick={() => focus.parent && setFocusIndex(nodes.indexOf(focus.parent))}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && focus.parent) {
            e.preventDefault();
            setFocusIndex(nodes.indexOf(focus.parent));
          }
        }}
      >
        <circle r={ringWidth * 0.5 - 2} fill="#18181b" />
        <text textAnchor="middle" y={-2} fontSize={11} fill="#e4e4e7">
          {focus.data.name.length > 18 ? `${focus.data.name.slice(0, 17)}…` : focus.data.name}
        </text>
        <text textAnchor="middle" y={13} fontSize={10} fill="#a1a1aa">
          {formatBytes(focus.value ?? 0)}
        </text>
      </g>
    </svg>
  );
});

export default MemorySunburst;
