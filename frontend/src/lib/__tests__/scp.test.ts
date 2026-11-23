import { describe, it, expect } from 'vitest';

import {
  SCP_PHASES,
  ScpNode,
  addSybils,
  buildTierOneTopology,
  canReachConsensus,
  checkQuorumIntersection,
  findQuorum,
  isQuorum,
  isVBlocking,
  networkHealth,
  partition,
  quorumSetMembers,
  satisfiesQuorumSet,
  simulateVoting,
  trustEdges,
} from '@/lib/scp';

/** Three nodes that all trust each other, 2-of-3. A textbook healthy network. */
function trio(): ScpNode[] {
  const ids = ['a', 'b', 'c'];
  return ids.map((id) => ({
    id,
    name: id.toUpperCase(),
    online: true,
    quorumSet: { threshold: 2, validators: ids },
  }));
}

/** Two cliques that share nobody — the classic split-brain topology. */
function disjointCliques(): ScpNode[] {
  const left = ['l1', 'l2', 'l3'];
  const right = ['r1', 'r2', 'r3'];

  return [
    ...left.map((id) => ({
      id,
      name: id,
      online: true,
      quorumSet: { threshold: 2, validators: left },
    })),
    ...right.map((id) => ({
      id,
      name: id,
      online: true,
      quorumSet: { threshold: 2, validators: right },
    })),
  ];
}

describe('satisfiesQuorumSet', () => {
  it('is met once the threshold of validators is present', () => {
    const qs = { threshold: 2, validators: ['a', 'b', 'c'] };

    expect(satisfiesQuorumSet(qs, new Set(['a', 'b']))).toBe(true);
    expect(satisfiesQuorumSet(qs, new Set(['a']))).toBe(false);
  });

  it('counts a satisfied inner set as one towards the threshold', () => {
    const qs = {
      threshold: 2,
      validators: ['a'],
      innerSets: [{ threshold: 2, validators: ['x', 'y', 'z'] }],
    };

    expect(satisfiesQuorumSet(qs, new Set(['a', 'x', 'y']))).toBe(true);
    // The inner set falls one short, so only 'a' counts.
    expect(satisfiesQuorumSet(qs, new Set(['a', 'x']))).toBe(false);
  });

  it('handles nesting more than one level deep', () => {
    const qs = {
      threshold: 1,
      validators: [],
      innerSets: [
        { threshold: 1, validators: [], innerSets: [{ threshold: 1, validators: ['deep'] }] },
      ],
    };

    expect(satisfiesQuorumSet(qs, new Set(['deep']))).toBe(true);
    expect(satisfiesQuorumSet(qs, new Set(['other']))).toBe(false);
  });
});

describe('quorumSetMembers', () => {
  it('collects ids at every depth without duplicates', () => {
    const members = quorumSetMembers({
      threshold: 2,
      validators: ['a', 'b'],
      innerSets: [{ threshold: 1, validators: ['b', 'c'] }],
    });

    expect(members.sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('isQuorum', () => {
  it('accepts a set that satisfies every member', () => {
    expect(isQuorum(['a', 'b'], trio())).toBe(true);
  });

  it('rejects a set too small for its members', () => {
    expect(isQuorum(['a'], trio())).toBe(false);
  });

  it('rejects the empty set', () => {
    expect(isQuorum([], trio())).toBe(false);
  });

  it('rejects a set naming a node that does not exist', () => {
    expect(isQuorum(['a', 'ghost'], trio())).toBe(false);
  });
});

describe('findQuorum', () => {
  it('finds a quorum in a healthy network', () => {
    const quorum = findQuorum('a', trio());

    expect(quorum).not.toBeNull();
    expect(isQuorum(quorum!, trio())).toBe(true);
  });

  it('returns null for a node nobody can reach', () => {
    // Only 'a' is left, but its quorum set needs two of three.
    const nodes = partition(trio(), ['b', 'c']);

    expect(findQuorum('a', nodes)).toBeNull();
  });

  it('still finds a quorum when one of three drops', () => {
    const nodes = partition(trio(), ['c']);

    expect(findQuorum('a', nodes)).toEqual(['a', 'b']);
  });

  it('returns null for an offline node', () => {
    expect(findQuorum('c', partition(trio(), ['c']))).toBeNull();
  });
});

describe('canReachConsensus', () => {
  it('is true while the quorum survives', () => {
    expect(canReachConsensus('a', partition(trio(), ['c']))).toBe(true);
  });

  it('is false once too many peers are gone', () => {
    expect(canReachConsensus('a', partition(trio(), ['b', 'c']))).toBe(false);
  });
});

describe('isVBlocking', () => {
  const nodes = trio();
  const a = nodes[0];

  it('is v-blocking when removing the set leaves the quorum set unsatisfiable', () => {
    // 'a' needs 2 of {a,b,c}; without b and c only 'a' remains.
    expect(isVBlocking(['b', 'c'], a, nodes)).toBe(true);
  });

  it('is not v-blocking when the node can still reach its threshold', () => {
    expect(isVBlocking(['b'], a, nodes)).toBe(false);
  });

  it('treats the empty set as not blocking', () => {
    expect(isVBlocking([], a, nodes)).toBe(false);
  });
});

describe('checkQuorumIntersection', () => {
  it('holds in a network where everyone trusts everyone', () => {
    const report = checkQuorumIntersection(trio());

    expect(report.intersects).toBe(true);
    expect(report.disjointPair).toBeUndefined();
  });

  it('fails for two cliques that share nobody', () => {
    const report = checkQuorumIntersection(disjointCliques());

    expect(report.intersects).toBe(false);
    expect(report.disjointPair).toBeDefined();

    // The pair really is disjoint — this is the safety proof, so assert it.
    const [left, right] = report.disjointPair!;
    expect(left.some((id) => right.includes(id))).toBe(false);
  });

  it('holds for the tier-1 topology', () => {
    expect(checkQuorumIntersection(buildTierOneTopology()).intersects).toBe(true);
  });
});

describe('networkHealth', () => {
  it('reports a healthy network as safe and live', () => {
    const health = networkHealth(trio());

    expect(health.safe).toBe(true);
    expect(health.hasLiveness).toBe(true);
    expect(health.live.sort()).toEqual(['a', 'b', 'c']);
    expect(health.blocked).toEqual([]);
  });

  it('separates offline nodes from blocked ones', () => {
    const health = networkHealth(partition(trio(), ['b', 'c']));

    expect(health.down.sort()).toEqual(['b', 'c']);
    // 'a' is online but can no longer reach a quorum — halted, not crashed.
    expect(health.blocked).toEqual(['a']);
    expect(health.hasLiveness).toBe(false);
  });

  it('flags a split network as unsafe', () => {
    expect(networkHealth(disjointCliques()).safe).toBe(false);
  });

  it('keeps liveness while a quorum survives a single failure', () => {
    const health = networkHealth(partition(trio(), ['c']));

    expect(health.hasLiveness).toBe(true);
    expect(health.live.sort()).toEqual(['a', 'b']);
  });
});

describe('simulateVoting', () => {
  it('walks all four phases in order', () => {
    expect(simulateVoting(trio()).map((s) => s.phase)).toEqual(SCP_PHASES);
  });

  it('completes every phase in a healthy network', () => {
    const steps = simulateVoting(trio());

    expect(steps.every((s) => s.complete)).toBe(true);
    expect(steps[steps.length - 1].confirmed.sort()).toEqual(['a', 'b', 'c']);
  });

  it('halts rather than externalizing when the network is partitioned', () => {
    const steps = simulateVoting(partition(trio(), ['b', 'c']));

    expect(steps.every((s) => !s.complete)).toBe(true);
    expect(steps[3].confirmed).toEqual([]);
  });

  it('refuses to externalize without quorum intersection', () => {
    // Both halves are live, but agreement here would be a fork, not consensus.
    const steps = simulateVoting(disjointCliques());

    expect(steps[SCP_PHASES.length - 1].complete).toBe(false);
  });

  it('carries an explanation for every phase', () => {
    for (const step of simulateVoting(trio())) {
      expect(step.explanation.length).toBeGreaterThan(0);
    }
  });
});

describe('addSybils', () => {
  it('adds the requested number of nodes', () => {
    expect(addSybils(trio(), 50)).toHaveLength(53);
  });

  it('buys the attacker no influence, because nobody trusts them', () => {
    const attacked = addSybils(trio(), 1_000);
    const health = networkHealth(attacked);

    expect(health.safe).toBe(true);

    // 'a' still reaches a quorum, and not one sybil is in it — trust is named,
    // not counted, so nodes nobody listed cannot join anyone's quorum.
    const quorum = findQuorum('a', attacked);
    expect(quorum).not.toBeNull();
    expect(quorum!.every((id) => !id.startsWith('sybil'))).toBe(true);
    expect(isQuorum(quorum!, attacked)).toBe(true);
  });

  it('leaves the sybils themselves outside consensus', () => {
    const attacked = addSybils(trio(), 5);

    expect(networkHealth(attacked).live).not.toContain('sybil_1');
  });
});

describe('partition', () => {
  it('marks only the named nodes offline', () => {
    const nodes = partition(trio(), ['b']);

    expect(nodes.find((n) => n.id === 'b')!.online).toBe(false);
    expect(nodes.find((n) => n.id === 'a')!.online).toBe(true);
  });

  it('does not mutate the input', () => {
    const original = trio();
    partition(original, ['a']);

    expect(original.every((n) => n.online)).toBe(true);
  });
});

describe('buildTierOneTopology', () => {
  it('builds one node per organisation member', () => {
    expect(buildTierOneTopology(3, 3)).toHaveLength(9);
  });

  it('survives losing a whole organisation', () => {
    const nodes = buildTierOneTopology(3, 3);
    const downed = partition(nodes, ['org3_n1', 'org3_n2', 'org3_n3']);

    expect(networkHealth(downed).hasLiveness).toBe(true);
  });

  it('halts once a second organisation goes down', () => {
    const nodes = buildTierOneTopology(3, 3);
    const downed = partition(nodes, [
      'org2_n1', 'org2_n2', 'org2_n3',
      'org3_n1', 'org3_n2', 'org3_n3',
    ]);

    expect(networkHealth(downed).hasLiveness).toBe(false);
  });
});

describe('trustEdges', () => {
  it('emits an edge per trusted peer, excluding self-trust', () => {
    const edges = trustEdges(trio());

    expect(edges).toHaveLength(6); // 3 nodes × 2 peers
    expect(edges.every((e) => e.source !== e.target)).toBe(true);
  });

  it('skips targets that are not in the network', () => {
    const nodes: ScpNode[] = [
      { id: 'a', name: 'a', online: true, quorumSet: { threshold: 1, validators: ['ghost'] } },
    ];

    expect(trustEdges(nodes)).toEqual([]);
  });
});
