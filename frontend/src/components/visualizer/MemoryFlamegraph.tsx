'use client';

/**
 * Interactive memory flamegraph (icicle layout, roots on top).
 *
 * Width of a bar = bytes attributed to that function *and everything it
 * calls* (D3 `hierarchy.sum`). Click a bar to zoom into it, click the root
 * row to zoom out. Hotspots are red, recursive edges amber, and the
 * function selected elsewhere in the UI is outlined.
 *
 * D3 computes the layout; React renders the SVG, so the output is
 * deterministic, SSR-safe and exportable as-is.
 */

import { forwardRef, useMemo, useState } from 'react';
import { hierarchy, partition, type HierarchyRectangularNode } from 'd3';
import { formatBytes } from '@/lib/wasmAnalyzer';
import type { ProfileNode } from '@/lib/wasmMemoryProfiler';

export interface MemoryFlamegraphProps {
  data: ProfileNode;
  /** Label for what bar width represents, e.g. "shadow-stack bytes". */
  unitLabel: string;
  width?: number;
  rowHeight?: number;
  selectedFunction?: number;
  onSelectFunction?: (functionIndex: number | undefined) => void;
}

type Node = HierarchyRectangularNode<ProfileNode>;

const PALETTE = ['#3f3f46', '#52525b', '#57534e', '#44403c', '#4b5563', '#374151'];

function fillFor(node: Node): string {
  if (node.data.recursive) return '#d97706';
  if (node.data.hotspot) return '#dc2626';
  if (node.depth === 0) return '#18181b';
  return PALETTE[(node.data.functionIndex ?? node.depth) % PALETTE.length];
}

function pathTo(node: Node): Node[] {
  return node.ancestors().reverse();
}

export const MemoryFlamegraph = forwardRef<SVGSVGElement, MemoryFlamegraphProps>(function MemoryFlamegraph(
  { data, unitLabel, width = 960, rowHeight = 22, selectedFunction, onSelectFunction },
  ref
) {
  const root = useMemo(() => {
    const h = hierarchy(data)
      .sum((d) => Math.max(0, d.value))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    return partition<ProfileNode>().size([width, (h.height + 1) * rowHeight]).padding(1)(h);
  }, [data, width, rowHeight]);

  const [focusPath, setFocusPath] = useState<string[]>([]);

  // Re-resolve the focused node by name path so zoom survives data refreshes.
  const focus = useMemo(() => {
    let node: Node = root;
    for (const name of focusPath.slice(1)) {
      const next = node.children?.find((c) => c.data.name === name);
      if (!next) return root;
      node = next;
    }
    return node;
  }, [root, focusPath]);

  const total = root.value ?? 0;
  if (total === 0) {
    return (
      <p className="rounded border border-white/10 bg-black p-4 text-xs text-zinc-500" role="status">
        Nothing to plot for {unitLabel} — no function in this module reserves any.
      </p>
    );
  }

  const span = focus.x1 - focus.x0 || 1;
  const scaleX = (x: number) => ((x - focus.x0) / span) * width;
  const visible = root.descendants().filter(
    (n) => (n.x1 > focus.x0 && n.x0 < focus.x1 && n.depth >= focus.depth) || focus.ancestors().includes(n)
  );
  const height = (root.height + 1) * rowHeight;

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      role="img"
      aria-label={`Memory flamegraph by ${unitLabel}. Total ${formatBytes(total)}.`}
      data-testid="memory-flamegraph"
      className="select-none"
    >
      {visible.map((node) => {
        const isAncestor = node.depth < focus.depth;
        const x = isAncestor ? 0 : scaleX(node.x0);
        const w = isAncestor ? width : Math.max(0, scaleX(node.x1) - scaleX(node.x0));
        if (w < 0.5) return null;
        const selected = selectedFunction !== undefined && node.data.functionIndex === selectedFunction;
        const value = node.value ?? 0;
        const share = total ? ((value / total) * 100).toFixed(1) : '0';
        const label = `${node.data.name} — ${formatBytes(value)} (${share}%)`;
        return (
          <g
            key={pathTo(node).map((n) => n.data.name).join('/')}
            transform={`translate(${x},${node.y0})`}
            role="button"
            tabIndex={0}
            aria-label={label}
            data-function-index={node.data.functionIndex}
            data-hotspot={node.data.hotspot ? 'true' : undefined}
            onClick={() => {
              setFocusPath(node === focus && node.parent ? pathTo(node.parent).map((n) => n.data.name) : pathTo(node).map((n) => n.data.name));
              onSelectFunction?.(node.data.functionIndex);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setFocusPath(pathTo(node).map((n) => n.data.name));
                onSelectFunction?.(node.data.functionIndex);
              }
            }}
            style={{ cursor: 'pointer' }}
          >
            <title>{`${label}${node.data.detail ? `\n${node.data.detail}` : ''}`}</title>
            <rect
              width={w}
              height={rowHeight - 1}
              rx={2}
              fill={fillFor(node)}
              opacity={isAncestor ? 0.6 : 1}
              stroke={selected ? '#fbbf24' : 'none'}
              strokeWidth={selected ? 2 : 0}
            />
            {w > 40 && (
              <text x={6} y={rowHeight / 2 + 4} fontSize={11} fill="#f4f4f5" pointerEvents="none">
                {truncate(node.data.name, Math.floor((w - 12) / 6.5))}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
});

function truncate(text: string, max: number): string {
  if (max <= 1) return '';
  return text.length > max ? `${text.slice(0, Math.max(1, max - 1))}…` : text;
}

export default MemoryFlamegraph;
