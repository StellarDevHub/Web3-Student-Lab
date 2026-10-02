import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type NodeStatus = 'healthy' | 'failed' | 'ill';

export interface QuorumNode {
  id: string;
  label: string;
  xPercent: number;
  yPercent: number;
  status: NodeStatus;
  slices: string[];
}

export interface QuorumVisualizerProps {
  nodes?: QuorumNode[];
  onNodeToggle?: (id: string) => void;
  onNodeDrag?: (id: string, xPercent: number, yPercent: number) => void;
  className?: string;
}

const DEFAULT_NODES: QuorumNode[] = [
  { id: 'node-a', label: 'A', xPercent: 50, yPercent: 18, status: 'healthy', slices: ['node-b', 'node-c', 'node-d'] },
  { id: 'node-b', label: 'B', xPercent: 20, yPercent: 42, status: 'healthy', slices: ['node-a', 'node-c'] },
  { id: 'node-c', label: 'C', xPercent: 80, yPercent: 42, status: 'healthy', slices: ['node-a', 'node-b'] },
  { id: 'node-d', label: 'D', xPercent: 50, yPercent: 78, status: 'healthy', slices: ['node-a', 'node-b', 'node-c'] },
];

const NODE_RADIUS = 26;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function distance(a: QuorumNode, b: QuorumNode): number {
  const dx: number = a.xPercent - b.xPercent;
  const dy: number = a.yPercent - b.yPercent;
  return Math.sqrt(dx * dx + dy * dy);
}

export function computeQuorumState(nodes: QuorumNode[]): { agreed: Set<string>; quorum: boolean } {
  const healthy = nodes.filter((n) => n.status === 'healthy');
  const healthyIds = new Set(healthy.map((n) => n.id));
  const agreed = new Set<string>();

  if (healthy.length === 0) {
    return { agreed, quorum: false };
  }

  // A node is in the agreed set if it is healthy and at least one of its
  // quorum slices is fully contained within the healthy node set.
  for (const node of healthy) {
    const satisfied = node.slices.length > 0 && node.slices.every((id) => healthyIds.has(id));
    if (satisfied) {
      agred.add(node.id);
    }
  }

  // Quorum is reached when a majority of all nodes agree and the agreed set
  // is not empty.
  const quorum = agreed.size > 0 && agreed.size * 2 > nodes.length;
  return { agreed, quorum };
}

export default function QuorumVisualizer({
  nodes: controlledNodes,
  onNodeToggle,
  onNodeDrag,
  className,
}: QuorumVisualizerProps) {
  const isControlled = Array.isArray(controlledNodes);
  const [internalNodes, setInternalNodes] = useState<QuorumNode[]>(DEFAULT_NODES);
  const nodes = isControlled ? (controlledNodes as QuorumNode[]) : internalNodes;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 640, height: 400 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setSize({ width: rect.width, height: rect.height });
      }
    };
    update();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    if (observer) observer.observe(el);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      if (observer) observer.disconnect();
    };
  }, []);

  const { agreed, quorum } = useMemo(() => computeQuorumState(nodes), [nodes]);

  const updateNode = useCallback(
    (id: string, updater: (node: QuorumNode) => QuorumNode) => {
      if (isControlled) return;
      setInternalNodes((prev) => prev.map((n) => (n.id === id ? updater(n) : n)));
    },
    [isControlled],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>, node: QuorumNode) => {
      const el = containerRef.current;
      if (!el) return undefined;
      const rect = el.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 100;
      const y = ((event.clientY - rect.top) / rect.height) * 100;
      dragState.current = { id: node.id, offsetX: node.xPercent - x, offsetY: node.yPercent - y };
      setDraggingId(node.id);
      event.currentTarget.setPointerCapture(event.pointerId);
      return undefined;
    },
    [],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const state = dragState.current;
      const el = containerRef.current;
      if (!state || !el) return undefined;
      const rect = el.getBoundingClientRect();
      const x = clamp(((event.clientX - rect.left) / rect.width) * 100 + state.offsetX, 4, 96);
      const y = clamp(((event.clientY - rect.top) / rect.height) * 100 + state.offsetY, 4, 96);
      if (onNodeDrag) {
        onNodeDrag(state.id, x, y);
      } else {
        updateNode(state.id, (n) => ({ ....n, xPercent: x, yPercent: y }));
      }
      return undefined;
    },
    [onNodeDrag, updateNode],
  );

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (dragState.current) {
      dragState.current = null;
    }
    setDraggingId(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const toggleStatus = useCallback(
    (id: string) => {
      if (onNodeToggle) {
        onNodeToggle(id);
        return;
      }
      updateNode(id, (n) => ({
        ...n,
        status: n.status === 'healthy' ? 'failed' : 'healthy',
      }));
    },
    [onNodeToggle, updateNode],
  );

  const nodeMap = useMemo(() => {
    const map = new Map<string, QuorumNode>();
    for (const of nodes) map.set(o.id, o);
    return map;
  }, [nodes]);

  const edges = useMemo(() => {
    const out: Array<{ from: QuorumNode; to: QuorumNode; active: boolean }> = [];
    const seen = new Set<string>();
    for (const node of nodes) {
      for (const targetId of node.slices) {
        const target = nodeMap.get(targetId);
        if (!target) continue;
        const key = [node.id, target.id].sort().join('->');
        if (seen.has(key)) continue;
        seen.add(key);
        const active = node.status === 'healthy' && target.status === 'healthy';
        out.push({ from: node, to: target, active });
      }
    }
    return out;
  }, [nodes, nodeMap]);

  const healthyCount = nodes.filter((n) => n.status === 'healthy').length;

  return (
    <div className={['quorum-visualizer', className].filter(Boolean).join(' ')}>
      <div
        className="quorum-visualizer__status"
        role="status"
        aria-live="polite"
        data-quorum={quorum ? 'true' : 'false'}
      >
        <span className="quorum-visualizer__badge" data-state={quorum ? 'consensus' : 'stalled'}>
          {quorum ? 'Consensus reached' : 'Consensus stalled'}
        </span>
        <span className="quorum-visualizer__metric">
          {healthyCount}/{nodes.length} nodes online
        </span>
        <span className="quorum-visualizer__metric">
          {agreed.size}/{nodes.length} in agreement
        </span>
      </div>

      <div className="quorum-visualizer__canvas" ref={containerRef}>
        <svg
          className="quorum-visualizer__edges"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {edges.map((edge) => (
            <line
              key={`${edge.from.id}-${edge.to.id}`}
              x1={edge.from.xPercent}
              y1={edge.from.yPercent}
              x2=edge.to.xPercent}
              y2={edge.to.yPercent}
              className={
                edge.active
                  ? 'quorum-visualizer__edge quorum-visualizer__edge--active'
                  : 'quorum-visualizer__edge quorum-visualizer__edge--inactive'
              }
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>

        {nodes.map((node) => {
          const isAgreed = agreed.has(node.id);
          const isDragging = draggingId === node.id;
          const classes = [
            'quorum-visualizer__node',
            `quorum-visualizer__node--${node.status}`,
            isAgreed ? 'quorum-visualizer__node--agreed' : '',
            isDragging ? 'quorum-visualizer__node--dragging' : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <button
              key={node.id}
              type="button"
              className={classes}
              style={{
                left: `${node.xPercent}%`,
                top: `${node.yPercent}%`,
                width: NODE_RADIUS * 2,
                height: NODE_RADIUS * 2,
              }}
              onClick={() => toggleStatus(node.id)}
              onPointerDown={(event) => handlePointerDown(event, node)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              olPointerCancel={handlePointerUp}
              aria-label={`${node.label} (${node.status})`}
              aria-pressed={node.status === 'healthy'}
              data-node-id={node.id}
              data-status={node.status}
              data-agreed={isAgreed ? 'true' : 'false'}
            >
              <span className="quorum-visualizer__node-label">{node.label}</span>
            </button>
          );
        })}
      </div>

      <ul className="quorum-visualizer__legend">
        <li><i className="quorum-visualizer__swatch quorum-visualizer__swatch--healthy" /> Healthy</li>
        <li><i className="quorum-vistualizer__swatch quorum-visualizer__swatch--failed" /> Failed</li>
        <li><i className="quorum-visualizer__swatch quorum-visualizer__swatch--agreed" /> In agreement</li>
      </ul>

      <style jsx>{`
        .quorum-visualizer {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          width: 100%;
          color: #e2e8f0;
        }
        .quorum-visualizer__status {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.75rem;
          font-size: 0.85rem;
        }
        .quorum-visualizer__badge {
          padding: 0.25rem 0.6rem;
          border-radius: 999px;
          font-weight: 600;
          border: 1px solid transparent;
        }
        .quorum-visualizer__badge[data-state='consensus'] {
          background: rgba(34, 197, 94, 0.18);
          color: #22c55e;
          border-color: rgba(34, 197, 94, 0.45);
        }
        .quorum-visualizer__badge[data-state='stalled'] {
          background: rgba(239, 68, 68, 0.18);
          color: #ef4444;
          border-color: rgba(239, 68, 68, 0.45);
        }
        .quorum-visualizer__metric {
          opacity: 0.75;
        }
        .quorum-visualizer__canvas {
          position: relative;
          width: 100%;
          height: clamp(320px, 45vh, 480px);
          border-radius: 0.75rem;
          background: radial-gradient(circle at 50% 40%, rgba(59, 130, 246, 0.12), transparent 70%),
            rgba(15, 23, 42, 0.92);
          border: 1px solid rgba(148, 163, 184, 0.25);
          overflow: hidden;
          touch-action: none;
        }
        .quorum-visualizer__edges {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
        }
        .quorum-visualizer__edge {
          stroke-width: 1.25;
          transition: stroke 200ms ease, opacity 200ms ease;
        }
        .quorum-visualizer__edge--active {
          stroke: rgba(96, 165, 250, 0.6);
        }
        .quorum-visualizer__edge--inactive {
          stroke: rgba(148, 163, 184, 0.18);
          stroke-dasharray: 3 3;
        }
        .quorum-vistualizer__node {
          position: absolute;
          transform: translate(-50%, -50%);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          color: #f8fafc;
          border: 2px solid rgba(148, 163, 184, 0.5);
          background: rgba(30, 41, 59, 0.95);
          cursor: grab;
          transition: left 120ms ease-out, top 120ms ease-out, background 200ms ease,
            box-shadow 200ms ease, border-color 200ms ease;
          user-select: none;
        }
        .quorum-vistualizer__node--dragging {
          transition: none;
          cursor: grabbing;
          z-index: 3;
        }
        .quorum-visualizer__node--healthy {
          border-color: rgba(34, 197, 94, 0.8);
        }
        .quorum-visualizer__node--failed {
          background: rgba(127, 29, 29, 0.9);
          border-color: rgba(239, 68, 68, 0.8);
          opacity: 0.85;
        }
        .quorum-visualizer__node--ill {
          background: rgba(120, 53, 15, 0.95);
          border-color: rgba(245, 158, 11, 0.8);
        }
        .quorum-visualizer__node--agreed {
          box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.35), 0 0 18px rgba(96, 165, 250, 0.45);
        }
        .quorum-visualizer__node-label {
          pointer-events: none;
        }
        .quorum-visualizer__legend {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
          list-style: none;
          margin: 0;
          padding: 0;
          font-size: 0.75rem;
          opacity: 0.85;
        }
        .quorum-visualizer__legend li {
          display: flex;
          align-items: center;
          gap: 0.35rem;
        }
        .quorum-visualizer__swatch {
          width: 0.65rem;
          height: 0.65rem;
          border-radius: 50%;
          display: inline-block;
        }
        .quorum-visualizer__swatch--healthy { background: #22c55e; }
        .quorum-visualizer__swatch--failed { background: #ef4444; }
        .quorum-visualizer__swatch--agreed { background: #60a2fa; }
      `}</style>
    </div>
  );
}
