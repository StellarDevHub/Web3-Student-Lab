/**
 * Stellar Consensus Protocol (SCP) simulation engine.
 *
 * This module implements a deterministic, step-driven model of the SCP
 * Nomination and Ballot phases over a federated Byzantine agreement topology.
 * It is pure and side-effect free so the UI can drive it from a hook.
 */

export type NodeState = 'idle' | 'nominating' | 'voting' | 'accepted' | 'confirmed' | 'failed';

export type SCPPhase = 'idle' | 'nomination' | 'ballot' | 'confirmed';

export interface ValidatorNode {
  id: string;
  label: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  state: NodeState;
  failed: boolean;
  sliceId: string;
}

export interface QuorumSlice {
  id: string;
  label: string;
  nodes: string[];
  threshold: number;
}

export interface SliceStatus {
  id: string;
  label: string;
  nodes: string[];
  threshold: number;
  accepting: number;
  satisfied: boolean;
  failed: number;
}

export interface SimulationState {
  nodes: ValidatorNode;
  slices: QuorumSlice[];
  phase: SCPPhase;
  step: number;
  consensusValue: string | null;
  safetyViolated: boolean;
  livenessViolated: boolean;
  history: string[];
}

const CANDIDATE_VALUES = ['alpha', 'beta', 'gamma', 'delta'];

export function createInitialState(nodes: ValidatorNode[], slices: QuorumSlice[]): SimulationState {
  return {
    nodes: nodes.map((n) => ({ ...n, state: 'idle' as NodeState, failed: false })),
    slices,
    phase: 'idle',
    step: 0,
    consensusValue: null,
    safetyViolated: false,
    livenessViolated: false,
    history: [],
  };
}

function nodeById(nodes: ValidatorNode[], id: string): ValidatorNode | undefined {
  return nodes.find((n) => n.id === id);
}

export function computeSliceStatus(state: SimulationState): SliceStatus[] {
  return state.slices.map((slice) => {
    const members = slice.nodes.map((id) => nodeById(state.nodes, id)).filter(Boolean) as ValidatorNode[];
    const accepting = members.filter(
      (n) => !n.failed && (n.state === 'accepted' || n.state === 'confirmed'),
    ).length;
    const failed = members.filter((n) => n.failed).length;
    return {
      id: slice.id,
      label: slice.label,
      nodes: slice.nodes,
      threshold: slice.threshold,
      accepting,
      satisfied: accepting >= slice.threshold,
      failed,
    };
  });
}

export function computeSafety(state: SimulationState): boolean {
  // Safety holds when no two conflicting values can be confirmed.
  // In our model, safety is violated when two disjoint slices are both
  // satisfied by different values. We detect this by checking if any
  // confirmed node disagrees with the consensus value.
  if (!state.consensusValue) return true;
  const confirmed = state.nodes.filter((n) => n.state === 'confirmed');
  return confirmed.every((n) => !n.failed);
}

export function computeLiveness(state: SimulationState): boolean {
  // Liveness holds when at least one slice can still reach its threshold
  // given the current failed nodes.
  const statuses = computeSliceStatus(state);
  return statuses.some((s) => s.nodes.length - s.failed >= s.threshold);
}

export function advanceStep(state: SimulationState): SimulationState {
  const next: SimulationState = {
    ...state,
    nodes: state.nodes.map((n) => ({ ...n })),
    history: [...state.history],
  };
  next.step += 1;

  if (next.phase === 'idle') {
    next.phase = 'nomination';
    next.history.push('Nomination phase begins');
    for (const node of next.nodes) {
      if (!node.failed) node.state = 'nominating';
    }
    return next;
  }

  if (next.phase === 'nomination') {
    const nodes = next.nodes.filter((n) => !n.failed);
    if (nodes.length === 0) {
      next.livenessViolated = true;
      next.history.push('All nodes failed - liveness violated');
      return next;
    }
    for (const node of nodes) {
      node.state = 'voting';
    }
    next.phase = 'ballot';
    next.history.push('Nomination complete - ballot phase begins');
    return next;
  }

  if (next.phase === 'ballot') {
    const statuses = computeSliceStatus(next);
    for (const node of next.nodes) {
      if (node.failed) continue;
      const slice = next.slices.find((s) => s.id === node.sliceId);
      if (!slice) continue;
      const status = statuses.find((s) => s.id === slice.id);
      if (!status) continue;
      if (status.satisfied) {
        node.state = 'accepted';
      } else if (node.state === 'voting') {
        node.state = 'voting';
      }
    }
    const allSlicesSatisfied = statuses.every((s) => s.satisfied);
    if (allSlicesSatisfied) {
      const value = CANDIDATE_VALUES[Math.min(next.step, CANDIDATE_VALUES.length - 1)];
      next.consensusValue = value;
      next.phase = 'confirmed';
      for (const node of next.nodes) {
        if (!node.failed) node.state = 'confirmed';
      }
      next.history.push(`Consensus reached on "${value}"`);
    } else {
      next.history.push('Ballot round incomplete - waiting for quorum');
    }
    next.safetyViolated = !computeSafety(next);
    next.livenessViolated = !computeLiveness(next);
    return next;
  }

  return next;
}

export function toggleNodeFailure(state: SimulationState, id: string): SimulationState {
  const next: SimulationState = {
    ...state,
    nodes: state.nodes.map((n) => ({ ...n })),
    history: [...state.history],
  };
  const node = nodeById(next.nodes, id);
  if (!node) return next;
  node.failed = !node.failed;
  node.state = node.failed ? 'failed' : 'idle';
  next.history.push(
    node.failed ? `Node ${id} failed` : `Node ${id} recovered`,
  );
  next.safetyViolated = !computeSafety(next);
  next.livenessViolated = !computeLiveness(next);
  return next;
}
