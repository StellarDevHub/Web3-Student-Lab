/**
 * Quadratic funding math (pure, framework-free, fully tested).
 *
 * Core formula: for a project with contributors donating amounts
 * c_1 … c_n, its quadratic *match weight* is
 *
 *     weight = ( Σ sqrt(c_i) )²
 *
 * The matching pool is distributed proportionally to each project's weight.
 *
 * Collusion / coordination: when one real contributor splits their stake
 * across many sock-puppet addresses, the Sybil-adjusted weight collapses
 * because sqrt is concave:
 *
 *     coordinated_weight = ( Σ_g sqrt(Σ_{i∈g} c_i) )²
 *
 * where each `g` is the set of addresses controlled by one real participant.
 * Splitting $100 across 10 puppets yields sqrt(100)² = 100, whereas 10
 * distinct $10 donors yield (10·sqrt(10))² ≈ 1000 — a 10× penalty that
 * pairwise coordination algorithms are designed to enforce.
 */

export function sqrtSum(donations: number[]): number {
  return donations.reduce((acc, c) => acc + Math.sqrt(Math.max(0, c)), 0);
}

/** Quadratic match weight for a single project: ( Σ sqrt(c_i) )² */
export function quadraticWeight(donations: number[]): number {
  const s = sqrtSum(donations);
  return s * s;
}

export interface ProjectMatch {
  id: string;
  donations: number[];
  directTotal: number;
  weight: number;
  payout: number;
}

/**
 * Compute matching payouts for a set of projects given a matching `pool`.
 * Each project's payout is `pool · weight_p / Σ weight`.
 */
export function computePayouts(projects: { id: string; donations: number[] }[], pool: number): ProjectMatch[] {
  const withWeights = projects.map((p) => ({
    id: p.id,
    donations: p.donations,
    directTotal: p.donations.reduce((a, b) => a + b, 0),
    weight: quadraticWeight(p.donations),
  }));
  const totalWeight = withWeights.reduce((a, p) => a + p.weight, 0);
  return withWeights.map((p) => ({
    ...p,
    payout: totalWeight > 0 ? (pool * p.weight) / totalWeight : 0,
  }));
}

/**
 * Coordination-adjusted weight used to penalise collusion. `groups` is a list
 * of groups; each group is the list of contributions controlled by ONE real
 * participant. One whale splitting their stake collapses to a single group.
 */
export function coordinationAdjustedWeight(groups: number[][]): number {
  const s = groups.reduce((acc, group) => {
    const total = group.reduce((a, b) => a + b, 0);
    return acc + Math.sqrt(Math.max(0, total));
  }, 0);
  return s * s;
}

/**
 * Demonstration helper: the "democratic power" of quadratic funding.
 * Returns the match weight for a broad grassroots project (many small donors)
 * versus a whale project (one large donor) with the SAME direct total.
 */
export function democracyDemo(smallDonation: number, donorCount: number): {
  grassrootsWeight: number;
  whaleWeight: number;
  advantage: number;
} {
  const grassroots = quadraticWeight(Array(donorCount).fill(smallDonation));
  const whale = quadraticWeight([smallDonation * donorCount]);
  return {
    grassrootsWeight: grassroots,
    whaleWeight: whale,
    advantage: whale > 0 ? grassroots / whale : Infinity,
  };
}

/** Collusion demo: same direct total, honest distinct donors vs one puppet-master. */
export function collusionDemo(total: number, puppetCount: number): {
  honestWeight: number;
  colludingWeight: number;
  penaltyFactor: number;
} {
  const per = total / puppetCount;
  const honest = coordinationAdjustedWeight(Array(puppetCount).fill([per]));
  const colluding = coordinationAdjustedWeight([[total]]);
  return {
    honestWeight: honest,
    colludingWeight: colluding,
    penaltyFactor: colluding > 0 ? honest / colluding : Infinity,
  };
}
