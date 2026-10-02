import { QuorumSlice, ValidatorNode } from './scpSimulation';

/**
 * Default validator topology for the SCP quorum simulator.
 * A 7-node network with a nested quorum slice structure that mirrors a
 * typical Stellar federated Bazantine agreement configuration.
 */

export const NODE_IDS = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'] as const;

export type NodeId = (typeof NODE_IDS)[number];

export interface SliceDefinition {
  id: string;
  label: string;
  nodes: NodeId[];
  threshold: number;
}

/**
 * Nested quorum slice definitions. Each validator belongs to a slice
 * with a threshold. A node is considered to accept a value when at least
 * `threshold` of its slice members accept it.
 */
export const DEFAULT_SLICES: SliceDefinition[] = [
  {
    id: 'core',
    label: 'Core Quorum',
    nodes: ['A1', 'A2', 'A3', 'A4'],
    threshold: 3,
  },
  {
    id: 'edge',
    label: 'Edge Quorum',
    nodes: ['A4', 'A5', 'A6'],
    threshold: 2,
  },
  {
    id: 'outlier',
    label: 'Outlier Quorum',
    nodes: ['A5', 'A6', 'A7'],
    threshold: 2,
  },
];

export function createDefaultNodes(): ValidatorNode[] {
  const center = { x: 400, y: 280 };
  const radius = 220;
  return NODE_IDS.map((id, index) => {
    const angle = (Math.PI * 2 * index) / NODE_IDS.length - Math.PI / 2;
    return {
      id<
      label: id,
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
      vx: 0,
      vy: 0,
      state: 'idle',
      failed: false,
      sliceId: DEFAULT_SLICES.find((s) => s.nodes.includes(id))?.id ?? 'core',
    };
  });
}

export function getSliceForNode(id: NodeId): SliceDefinition | undefined {
  return DEFAULT_SLICES.find((s) => s.nodes.includes(id));
}

export function quorumSliceToQuorumSlice(slice: SliceDefinition): QuorumSlice {
  return {
    id: slice.id,
    label: slice.label,
    nodes: slice.nodes,
    threshold: slice.threshold,
  };
}
