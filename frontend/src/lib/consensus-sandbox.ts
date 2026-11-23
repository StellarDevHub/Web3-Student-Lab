export type ConsensusAlgorithm = 'pow' | 'pos' | 'fba';

export interface ConsensusNode {
  id: string;
  stake: number;
  hashPower: number;
  trustedBy: string[];
  online: boolean;
}

export interface ConsensusResult {
  algorithm: ConsensusAlgorithm;
  leaderId: string | null;
  agreementPercent: number;
  finalized: boolean;
  explanation: string;
}

export const DEFAULT_CONSENSUS_NODES: ConsensusNode[] = [
  { id: 'alice', stake: 40, hashPower: 12, trustedBy: ['bob', 'carol'], online: true },
  { id: 'bob', stake: 25, hashPower: 20, trustedBy: ['alice', 'drew'], online: true },
  { id: 'carol', stake: 20, hashPower: 8, trustedBy: ['alice', 'bob'], online: true },
  { id: 'drew', stake: 15, hashPower: 5, trustedBy: ['alice'], online: true },
];

export function runConsensusRound(
  algorithm: ConsensusAlgorithm,
  nodes: ConsensusNode[] = DEFAULT_CONSENSUS_NODES
): ConsensusResult {
  const online = nodes.filter((node) => node.online);
  if (online.length === 0) {
    return {
      algorithm,
      leaderId: null,
      agreementPercent: 0,
      finalized: false,
      explanation: 'No online validators are available.',
    };
  }

  if (algorithm === 'pow') {
    const leader = [...online].sort((a, b) => b.hashPower - a.hashPower)[0]!;
    const total = online.reduce((sum, node) => sum + node.hashPower, 0);
    const agreementPercent = Math.round((leader.hashPower / total) * 100);
    return {
      algorithm,
      leaderId: leader.id,
      agreementPercent,
      finalized: agreementPercent >= 35,
      explanation: `${leader.id} wins by contributing the most hash power.`,
    };
  }

  if (algorithm === 'pos') {
    const leader = [...online].sort((a, b) => b.stake - a.stake)[0]!;
    const total = online.reduce((sum, node) => sum + node.stake, 0);
    const agreementPercent = Math.round((leader.stake / total) * 100);
    return {
      algorithm,
      leaderId: leader.id,
      agreementPercent,
      finalized: agreementPercent >= 34,
      explanation: `${leader.id} leads because they hold the largest active stake.`,
    };
  }

  const trustCounts = new Map<string, number>();
  for (const node of online) {
    for (const trusted of node.trustedBy) {
      if (online.some((candidate) => candidate.id === trusted)) {
        trustCounts.set(trusted, (trustCounts.get(trusted) ?? 0) + 1);
      }
    }
  }
  const [leaderId, votes = 0] = [...trustCounts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  const agreementPercent = Math.round((votes / online.length) * 100);
  return {
    algorithm,
    leaderId: leaderId ?? null,
    agreementPercent,
    finalized: agreementPercent >= 67,
    explanation: leaderId
      ? `${leaderId} is selected by quorum-slice trust overlap.`
      : 'No trusted quorum overlap was found.',
  };
}
