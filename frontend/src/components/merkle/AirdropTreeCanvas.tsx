'use client';

import * as d3 from 'd3';
import { useMemo } from 'react';
import type { AirdropNode, AirdropTree } from '@/lib/merkle/merkleTree';

export type NodeVerdict = 'match' | 'mismatch';

interface AirdropTreeCanvasProps {
  tree: AirdropTree;
  width: number;
  /** Leaf position currently selected (honest path is highlighted). */
  selectedLeaf: number | null;
  /** Nodes on the honest leaf-to-root path. */
  pathIds: ReadonlySet<string>;
  /** Siblings the proof consumes. */
  siblingIds: ReadonlySet<string>;
  /** Result of the verification walk, per node, once it has been revealed. */
  verdicts: ReadonlyMap<string, NodeVerdict>;
  onSelectLeaf: (leafPosition: number) => void;
}

const COLORS = {
  neutral: '#52525b',
  path: '#60a5fa',
  sibling: '#fbbf24',
  match: '#34d399',
  mismatch: '#f87171',
  edge: '#3f3f46',
  label: '#d4d4d8',
};

const ROW_HEIGHT = 96;
const RADIUS = 13;
const MARGIN_X = 44;
const MARGIN_TOP = 28;
const LABEL_SPACE = 52;

/** Children for the layout: a promoted node has the single child it was carried up from. */
function childrenOf(node: AirdropNode): AirdropNode[] {
  return [node.left, node.right].filter((n): n is AirdropNode => Boolean(n));
}

function short(hash: string): string {
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

/**
 * The airdrop Merkle tree as an SVG. D3 does the layout and link geometry; React
 * renders the nodes so their state is plain props rather than imperative DOM
 * edits. Colour is never the only signal: a verdict also changes the glyph
 * (✓ / ✗) so the result survives colour-blindness and forced-colour modes.
 */
export function AirdropTreeCanvas({
  tree,
  width,
  selectedLeaf,
  pathIds,
  siblingIds,
  verdicts,
  onSelectLeaf,
}: AirdropTreeCanvasProps) {
  const height = (tree.depth + 1) * ROW_HEIGHT + LABEL_SPACE;

  const { nodes, links } = useMemo(() => {
    const hierarchy = d3.hierarchy<AirdropNode>(tree.root, childrenOf);
    const laidOut = d3
      .tree<AirdropNode>()
      .size([Math.max(120, width - MARGIN_X * 2), tree.depth * ROW_HEIGHT])(hierarchy);
    return { nodes: laidOut.descendants(), links: laidOut.links() };
  }, [tree, width]);

  const linkPath = d3
    .linkVertical<d3.HierarchyLink<AirdropNode>, d3.HierarchyPointNode<AirdropNode>>()
    .x((d) => d.x + MARGIN_X)
    .y((d) => d.y + MARGIN_TOP);

  function fillFor(node: AirdropNode): string {
    const verdict = verdicts.get(node.id);
    if (verdict) return COLORS[verdict];
    if (siblingIds.has(node.id)) return COLORS.sibling;
    if (pathIds.has(node.id)) return COLORS.path;
    return COLORS.neutral;
  }

  return (
    <svg
      role="group"
      aria-label="Airdrop Merkle tree visualization"
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      className="merkle-canvas"
    >
      <style>{`
        .merkle-canvas .node-fill, .merkle-canvas .link { transition: fill 0.35s ease, stroke 0.35s ease; }
        @media (prefers-reduced-motion: reduce) {
          .merkle-canvas .node-fill, .merkle-canvas .link { transition: none; }
        }
      `}</style>

      <g>
        {links.map((link) => {
          const child = link.target.data;
          const verdict = verdicts.get(child.id);
          const onPath = pathIds.has(child.id) && pathIds.has(link.source.data.id);
          const stroke = verdict ? COLORS[verdict] : onPath ? COLORS.path : COLORS.edge;
          return (
            <path
              key={`${link.source.data.id}->${child.id}`}
              className="link"
              d={linkPath(link) ?? undefined}
              fill="none"
              stroke={stroke}
              strokeWidth={verdict || onPath ? 2.5 : 1.25}
              strokeDasharray={child.promoted || link.source.data.promoted ? '4 3' : undefined}
            />
          );
        })}
      </g>

      <g>
        {nodes.map((d) => {
          const node = d.data;
          const x = d.x + MARGIN_X;
          const y = d.y + MARGIN_TOP;
          const verdict = verdicts.get(node.id);
          const isSelected = node.isLeaf && selectedLeaf === node.index;
          const isRoot = node.id === tree.root.id;

          const circle = (
            <>
              <title>
                {node.isLeaf
                  ? `Leaf #${node.claim?.index} — ${node.hash}`
                  : `${isRoot ? 'Root' : node.promoted ? 'Promoted node' : 'Node'} — ${node.hash}`}
              </title>
              <circle
                className="node-fill"
                cx={x}
                cy={y}
                r={isRoot ? RADIUS + 3 : RADIUS}
                fill={fillFor(node)}
                stroke={isSelected ? '#ffffff' : '#18181b'}
                strokeWidth={isSelected ? 3 : 1.5}
              />
              {verdict && (
                <text
                  x={x}
                  y={y + 4}
                  textAnchor="middle"
                  fontSize="12"
                  fontWeight="bold"
                  fill="#052e16"
                  aria-hidden="true"
                >
                  {verdict === 'match' ? '✓' : '✗'}
                </text>
              )}
            </>
          );

          return (
            <g key={node.id} data-node-id={node.id} data-verdict={verdict ?? 'none'}>
              {node.isLeaf ? (
                <g
                  role="button"
                  tabIndex={0}
                  aria-label={`Select leaf ${node.claim?.index}`}
                  aria-pressed={isSelected}
                  style={{ cursor: 'pointer' }}
                  onClick={() => onSelectLeaf(node.index)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectLeaf(node.index);
                    }
                  }}
                >
                  {circle}
                </g>
              ) : (
                circle
              )}

              {node.isLeaf ? (
                <>
                  <text
                    x={x}
                    y={y + RADIUS + 14}
                    textAnchor="middle"
                    fontSize="10"
                    fontFamily="monospace"
                    fill={COLORS.label}
                  >
                    #{node.claim?.index}
                  </text>
                  <text
                    x={x}
                    y={y + RADIUS + 26}
                    textAnchor="middle"
                    fontSize="8"
                    fontFamily="monospace"
                    fill="#a1a1aa"
                  >
                    {node.claim
                      ? `${node.claim.account.slice(0, 4)}…${node.claim.account.slice(-4)}`
                      : ''}
                  </text>
                </>
              ) : (
                <text
                  x={x}
                  y={y - RADIUS - 5}
                  textAnchor="middle"
                  fontSize="8"
                  fontFamily="monospace"
                  fill="#a1a1aa"
                >
                  {isRoot ? `root ${short(node.hash)}` : ''}
                </text>
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
