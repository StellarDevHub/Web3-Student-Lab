/**
 * Federated Byzantine Agreement — the model behind the SCP visualizer (Issue #1158).
 *
 * Stellar does not vote by counting a fixed majority. Each node publishes a
 * **quorum set** naming who it trusts, and a quorum is any set of nodes that
 * contains a slice for every member — trust is chosen locally, and agreement is
 * an emergent property of those choices overlapping. That is the part students
 * find surprising, and the part a static diagram cannot teach.
 *
 * Two guarantees follow from the overlap, and they are what the simulator is
 * built to demonstrate:
 *
 * - **Safety** needs *quorum intersection*: any two quorums must share an honest
 *   node. Without it the network can split andboth  halves each externalise a
 *   different value, both believing they are correct.
 * - **Liveness** needs a node to still reach a quorum. A node whose quorum set
 *   is blocked simply stops — it cannot be tricked, but it cannot progress.
 *
 * Pure functions throughout, so the consensus logic is testable without a graph.
 */

export interface QuorumSet {
  /** How many of `validators` + `innerSets` must agree. */
  threshold: number;
  /** Node ids trusted directly. */
  validators: string[];
  /** Nested quorum sets, letting a node express "2 of these 3 orgs". */
  innerSets?: QuorumSet[];
}

export interface ScpNode {
  id: string;
  /** Display name, e.g. an organisation. */
  name: string;
  /** Who this node trusts. */
  quorumSet: QuorumSet;
  /** A crashed or partitioned node sends nothing. */
  online: boolean;
  /** A Byzantine node may vote inconsistently. */
  byzantine?: boolean;
  /** Organisational grouping, used for tier-1 style topologies. */
  organization?: string;
}

export type ScpPhase = 'nominate' | 'prepare' | 'commit' | 'externalize';

/** The federated voting phases, in the order SCP runs them. */
export const SCP_PHASES: ScpPhase[] = ['nominate', 'prepare', 'commit', 'externalize'];

export const PHASE_EXPLANATION: Record<ScpPhase, string> = {
  nominate:
    'Nodes propose candidate values and echo the ones their trusted peers proposed, converging on a shared candidate set.',
  prepare:
    'Nodes vote to prepare a ballot. A node accepts once a quorum votes for it, or once a v-blocking set has already accepted it.',
  commit:
    'Nodes vote to commit the prepared ballot. Confirming a commit means no conflicting value can ever be externalized.',
  externalize:
    'The value is final. Externalizing is irreversible — this is where the ledger closes.',
};

/**
 * Does `nodes` satisfy `quorumSet`?
 *
 * Counts direct validators present plus inner sets that are themselves
 * satisfied, and compares against the threshold. Recursive, because quorum sets
 * nest.
 */
export function satisfiesQuorumSet(quorumSet: QuorumSet, nodes: Set<string>): boolean {
  if (!quorumSet) return false;

  let met = 0;
  for (const validator of quorumSet.validators ?? []) {
    if (nodes.has(validator)) met += 1;
  }
  for (const inner of quorumSet.innerSets ?? []) {
    if (satisfiesQuorumSet(inner, nodes)) met += 1;
  }

  return met >= quorumSet.threshold;
}

/** Every node id named anywhere in a quorum set, at any depth. */
export function quorumSetMembers(quorumSet: QuorumSet): string[] {
  const members = [...(quorumSet?.validators ?? [])];
  for (const inner of quorumSet?.innerSets ?? []) {
    members.push(...quorumSetMembers(inner));
  }
  return Array.from(new Set(members));
}

/**
 * Is `candidate` a quorum?
 *
 * A quorum is a set where **every member's own quorum set is satisfied by the
 * set itself**. The self-referential definition is the point: a quorum is not
 * "enough nodes", it is a group that is internally sufficient for everyone in
 * it.
 */
export function isQuorum(candidate: string[], nodes: ScpNode[]): boolean {
  if (candidate.length === 0) return false;

  const set = new Set(candidate);
  const byId = new Map(nodes.map((n) => [n.id, n]));

  for (const id of candidate) {
    const node = byId.get(id);
    if (!node) return false;
    if (!satisfiesQuorumSet(node.quorumSet, set)) return false;
  }

  return true;
}

/** Online, non-Byzantine nodes — the ones that actually contribute to consensus. */
export function healthyNodes(nodes: ScpNode[]): ScpNode[] {
  return nodes.filter((n) => n.online && !n.byzantine);
}

/**
 * Drop every node the set can no longer satisfy, repeatedly, until it settles.
 *
 * What survives is a quorum (possibly empty): each remaining node's quorum set
 * is satisfied by the remainder, which is the definition.
 */
function shrinkToQuorum(candidate: Set<string>, byId: Map<string, ScpNode>): Set<string> {
  const current = new Set(candidate);

  for (;;) {
    const doomed: string[] = [];
    for (const id of current) {
      const node = byId.get(id);
      if (!node || !satisfiesQuorumSet(node.quorumSet, current)) doomed.push(id);
    }

    if (doomed.length === 0) return current;
    for (const id of doomed) current.delete(id);
    if (current.size === 0) return current;
  }
}

/**
 * A *minimal* quorum containing `nodeId`, or null when none exists.
 *
 * Two steps. First shrink the whole healthy network to a fixpoint — drop anyone
 * the remainder cannot satisfy, repeat — which converges in O(n²) and avoids
 * enumerating the 2^n subsets a brute-force search would.
 *
 * Then minimise: try removing each remaining node and keep the removal whenever
 * the target still lands in a quorum. Minimality is not cosmetic here. The
 * maximal quorum is usually "everyone still online", and two networks that share
 * no trust at all would each report that same set and appear to intersect —
 * hiding exactly the split this module exists to detect.
 */
export function findQuorum(nodeId: string, nodes: ScpNode[]): string[] | null {
  const healthy = healthyNodes(nodes);
  if (!healthy.some((n) => n.id === nodeId)) return null;

  const byId = new Map(nodes.map((n) => [n.id, n]));
  let current = shrinkToQuorum(new Set(healthy.map((n) => n.id)), byId);
  if (!current.has(nodeId)) return null;

  // Greedy minimisation. Dropping a node can cascade, so re-shrink after each
  // attempt and only keep the result if it still contains the target.
  for (const id of Array.from(current)) {
    if (id === nodeId || !current.has(id)) continue;

    const attempt = new Set(current);
    attempt.delete(id);
    const reduced = shrinkToQuorum(attempt, byId);

    if (reduced.size > 0 && reduced.has(nodeId)) current = reduced;
  }

  return Array.from(current).sort();
}

/** Can this node still reach consensus? */
export function canReachConsensus(nodeId: string, nodes: ScpNode[]): boolean {
  return findQuorum(nodeId, nodes) !== null;
}

/**
 * Is `blocking` v-blocking for `node`?
 *
 * A v-blocking set overlaps every one of the node's slices, so if all of them
 * refuse, the node can never assemble a quorum. Equivalently: remove them and
 * the node's quorum set can no longer be satisfied by anyone else. This is also
 * what lets SCP accept a statement on a *minority* — if a v-blocking set has
 * already accepted, no conflicting value can still gather a quorum.
 */
export function isVBlocking(blocking: string[], node: ScpNode, allNodes: ScpNode[]): boolean {
  const remaining = new Set(
    allNodes.filter((n) => !blocking.includes(n.id)).map((n) => n.id),
  );

  return !satisfiesQuorumSet(node.quorumSet, remaining);
}

export interface IntersectionReport {
  /** True when every pair of quorums shares at least one node. */
  intersects: boolean;
  /** Quorums found, one per healthy node (deduplicated). */
  quorums: string[][];
  /** A disjoint pair, when one exists — the proof that safety is lost. */
  disjointPair?: [string[], string[]];
}

/**
 * Check quorum intersection across the network.
 *
 * Compares the quorum each healthy node reaches. Two that share nothing is a
 * split: both sides can externalise different values and neither is wrong from
 * where it sits. That is the exact condition students should be able to
 * manufacture by cutting the graph.
 */
export function checkQuorumIntersection(nodes: ScpNode[]): IntersectionReport {
  const quorums: string[][] = [];
  const seen = new Set<string>();

  for (const node of healthyNodes(nodes)) {
    const quorum = findQuorum(node.id, nodes);
    if (!quorum) continue;
    const key = quorum.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    quorums.push(quorum);
  }

  for (let i = 0; i < quorums.length; i++) {
    for (let j = i + 1; j < quorums.length; j++) {
      const overlap = quorums[i].some((id) => quorums[j].includes(id));
      if (!overlap) {
        return { intersects: false, quorums, disjointPair: [quorums[i], quorums[j]] };
      }
    }
  }

  return { intersects: true, quorums };
}

export interface NetworkHealth {
  /** Nodes that can still reach a quorum. */
  live: string[];
  /** Nodes that are online but blocked — they halt rather than fork. */
  blocked: string[];
  /** Nodes that are offline or partitioned away. */
  down: string[];
  /** Safety: does every pair of quorums overlap? */
  safe: boolean;
  /** Liveness: can at least one node still make progress? */
  hasLiveness: boolean;
  intersection: IntersectionReport;
}

/** Full safety/liveness snapshot for the current topology. */
export function networkHealth(nodes: ScpNode[]): NetworkHealth {
  const live: string[] = [];
  const blocked: string[] = [];
  const down: string[] = [];

  for (const node of nodes) {
    if (!node.online) {
      down.push(node.id);
      continue;
    }
    if (canReachConsensus(node.id, nodes)) live.push(node.id);
    else blocked.push(node.id);
  }

  const intersection = checkQuorumIntersection(nodes);

  return {
    live,
    blocked,
    down,
    safe: intersection.intersects,
    hasLiveness: live.length > 0,
    intersection,
  };
}

export interface PhaseStep {
  phase: ScpPhase;
  /** Nodes that have accepted the value at this phase. */
  accepted: string[];
  /** Nodes that have confirmed it. */
  confirmed: string[];
  /** Whether the phase completed for the network. */
  complete: boolean;
  explanation: string;
}

/**
 * Walk the federated voting phases over the current topology.
 *
 * A node accepts once its quorum agrees, and confirms once a quorum has
 * accepted. Blocked nodes never accept, so a partition shows up as phases that
 * stop completing rather than as a wrong value — SCP halts instead of forking,
 * which is the tradeoff the visualizer is meant to make concrete.
 */
export function simulateVoting(nodes: ScpNode[]): PhaseStep[] {
  const health = networkHealth(nodes);
  const steps: PhaseStep[] = [];

  for (const phase of SCP_PHASES) {
    // Progress is gated on safety: without intersection the network must not be
    // shown reaching agreement, however many nodes are online.
    const canProgress = health.safe && health.hasLiveness;
    const accepted = canProgress ? health.live : [];
    const previousComplete = steps.length === 0 || steps[steps.length - 1].complete;
    const complete = canProgress && previousComplete;

    steps.push({
      phase,
      accepted,
      confirmed: complete ? accepted : [],
      complete,
      explanation: PHASE_EXPLANATION[phase],
    });
  }

  return steps;
}

/** Take nodes offline, as a crash or a network partition would. */
export function partition(nodes: ScpNode[], offlineIds: string[]): ScpNode[] {
  const offline = new Set(offlineIds);
  return nodes.map((node) => ({ ...node, online: !offline.has(node.id) }));
}

/**
 * Add `count` Sybil nodes that all trust each other and nobody else.
 *
 * The instructive part is that this changes nothing: because trust is chosen
 * rather than counted, nodes nobody has named cannot join anyone's quorum, so
 * spinning up a thousand of them buys no influence. That is precisely why FBA
 * does not need proof-of-work to resist Sybils.
 */
export function addSybils(nodes: ScpNode[], count: number, prefix = 'sybil'): ScpNode[] {
  const sybils: ScpNode[] = [];
  const ids = Array.from({ length: count }, (_, i) => `${prefix}_${i + 1}`);

  for (const id of ids) {
    sybils.push({
      id,
      name: id.toUpperCase(),
      organization: 'Sybil',
      online: true,
      byzantine: true,
      quorumSet: { threshold: Math.max(1, Math.ceil(ids.length / 2)), validators: ids },
    });
  }

  return [...nodes, ...sybils];
}

/** A tier-1 style topology: organisations of three, each trusting the others. */
export function buildTierOneTopology(orgCount = 3, perOrg = 3): ScpNode[] {
  const orgs = Array.from({ length: orgCount }, (_, i) => `org${i + 1}`);
  const nodes: ScpNode[] = [];

  for (const org of orgs) {
    const members = Array.from({ length: perOrg }, (_, i) => `${org}_n${i + 1}`);

    for (const id of members) {
      nodes.push({
        id,
        name: id,
        organization: org,
        online: true,
        quorumSet: {
          // Two of the three organisations, each represented by a majority of
          // its own members — the shape real tier-1 quorum sets take.
          threshold: Math.ceil((orgCount * 2) / 3),
          validators: [],
          innerSets: orgs.map((o) => ({
            threshold: Math.ceil((perOrg + 1) / 2),
            validators: Array.from({ length: perOrg }, (_, i) => `${o}_n${i + 1}`),
          })),
        },
      });
    }
  }

  return nodes;
}

export interface GraphLink {
  source: string;
  target: string;
}

/** Trust edges for the force-directed graph: node → each node it trusts. */
export function trustEdges(nodes: ScpNode[]): GraphLink[] {
  const known = new Set(nodes.map((n) => n.id));
  const links: GraphLink[] = [];

  for (const node of nodes) {
    for (const target of quorumSetMembers(node.quorumSet)) {
      if (target !== node.id && known.has(target)) {
        links.push({ source: node.id, target });
      }
    }
  }

  return links;
}
