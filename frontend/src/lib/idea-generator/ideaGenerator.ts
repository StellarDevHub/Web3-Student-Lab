/**
 * Hackathon Idea Generator — pure logic & domain templates.
 *
 * This module holds the *pure*, side-effect-free brains of the idea generator:
 * the filter model (difficulty levels, technology stack, domain), validation,
 * the mapping from UI filters to the backend AI request, and a deterministic
 * local fallback that synthesises an idea from domain templates when the AI
 * service is unavailable.
 *
 * Why separate this from React? The AI call lives behind the existing
 * `generatorAPI` (backed by OpenAI on the server). The *filtering* and the
 * *offline fallback* are deterministic data transforms — keeping them here means
 * we can unit-test every branch without a network or a rendered component, and
 * the UI stays a thin shell.
 */

import type { ProjectIdea } from '@/lib/api';

/** Difficulty levels — must match the backend `ProjectIdea.difficulty` union. */
export const DIFFICULTY_LEVELS = ['Beginner', 'Intermediate', 'Advanced'] as const;
export type Difficulty = (typeof DIFFICULTY_LEVELS)[number];

/** Domain-specific templates the generator can target. */
export const DOMAINS = [
  'DeFi',
  'NFT',
  'DAO',
  'Gaming',
  'Social',
  'Infrastructure',
  'Identity',
  'Sustainability',
  'MultiSigWallet',
] as const;
export type Domain = (typeof DOMAINS)[number];

/** Multi-sig wallet signature policy types. */
export const MULTISIG_POLICIES = ['m-of-n', 'weighted', 'time-locked', 'social-recovery'] as const;
export type MultiSigPolicy = (typeof MULTISIG_POLICIES)[number];

/** A single signer entry in the multi-sig wallet simulator. */
export interface MultiSigSigner {
  address: string;
  weight: number;
  signed: boolean;
}

/** State for the multi-sig wallet simulator panel. */
export interface MultiSigState {
  signers: MultiSigSigner[];
  /** Minimum number of signers required (m in m-of-n). */
  threshold: number;
  policy: MultiSigPolicy;
  /** True once enough signers have signed to meet the threshold. */
  approved: boolean;
}

/** Create an initial multi-sig state for the simulator. */
export function createMultiSigState(
  numSigners: number = 3,
  threshold: number = 2,
  policy: MultiSigPolicy = 'm-of-n',
): MultiSigState {
  const signers: MultiSigSigner[] = Array.from({ length: numSigners }, (_, i) => ({
    address: `G${String(i + 1).padStart(4, '0')}...STELLAR`,
    weight: 1,
    signed: false,
  }));
  return { signers, threshold, policy, approved: false };
}

/** Toggle a signer's signed status and recompute approval. */
export function toggleSigner(state: MultiSigState, signerIndex: number): MultiSigState {
  const signers = state.signers.map((s, i) =>
    i === signerIndex ? { ...s, signed: !s.signed } : s,
  );
  const signedWeight = signers.filter((s) => s.signed).reduce((acc, s) => acc + s.weight, 0);
  const totalWeight = signers.reduce((acc, s) => acc + s.weight, 0);
  const approved =
    state.policy === 'weighted'
      ? signedWeight / totalWeight >= state.threshold / state.signers.length
      : signers.filter((s) => s.signed).length >= state.threshold;
  return { ...state, signers, approved };
}

/** Technology-stack options the student can filter by. */
export const TECH_STACK_OPTIONS = [
  'Soroban',
  'Rust',
  'React',
  'TypeScript',
  'Next.js',
  'Stellar SDK',
  'IPFS',
  'Solidity',
  'Node.js',
  'GraphQL',
] as const;
export type TechOption = (typeof TECH_STACK_OPTIONS)[number];

/** The filter state captured from the UI. */
export interface IdeaFilters {
  difficulty: Difficulty;
  domain: Domain;
  techStack: string[];
}

/** Sensible defaults so the panel renders something usable on first paint. */
export const DEFAULT_FILTERS: IdeaFilters = {
  difficulty: 'Intermediate',
  domain: 'DeFi',
  techStack: ['Soroban', 'React'],
};

/**
 * Domain-specific idea templates. Each domain offers a few description/feature
 * variants; the local fallback picks one deterministically (see
 * {@link generateLocalIdea}) so behaviour is reproducible in tests.
 */
export const DOMAIN_TEMPLATES: Record<
  Domain,
  { titles: string[]; descriptions: string[]; features: string[] }
> = {
  DeFi: {
    titles: ['Liquid Yield Router', 'Cross-Asset AMM', 'On-Chain Lending Desk'],
    descriptions: [
      'A protocol that auto-routes liquidity across Stellar assets to maximise yield.',
      'A constant-product market maker tuned for low-fee Stellar swaps.',
    ],
    features: ['Liquidity Pools', 'Yield Optimisation', 'Slippage Guards'],
  },
  NFT: {
    titles: ['Generative Art Forge', 'Royalty Splitter', 'NFT Ticketing Rail'],
    descriptions: [
      'A minting studio for generative collections with on-chain provenance.',
      'A marketplace that enforces creator royalties at settlement time.',
    ],
    features: ['On-Chain Metadata', 'Royalty Enforcement', 'Lazy Minting'],
  },
  DAO: {
    titles: ['Quadratic Treasury', 'Contributor Reputation Graph', 'Proposal Engine'],
    descriptions: [
      'A governance treasury using quadratic funding to allocate grants.',
      'A reputation system that weights votes by verified contribution history.',
    ],
    features: ['Proposal Voting', 'Treasury Management', 'Delegation'],
  },
  Gaming: {
    titles: ['On-Chain Tournament Ladder', 'Play-to-Earn Quest Hub', 'Asset Crafting Forge'],
    descriptions: [
      'A skill-based tournament platform with on-chain prize escrow.',
      'A quest system rewarding verifiable in-game achievements with tokens.',
    ],
    features: ['Prize Escrow', 'Verifiable Scores', 'Tradeable Assets'],
  },
  Social: {
    titles: ['Decentralised Reputation Feed', 'Tipping Layer', 'Creator Membership Rail'],
    descriptions: [
      'A social feed where reputation and tips settle directly on Stellar.',
      'A micro-tipping layer that lets fans support creators per-post.',
    ],
    features: ['Micro-Tipping', 'Portable Identity', 'Content Gating'],
  },
  Infrastructure: {
    titles: ['Indexer-as-a-Service', 'Oracle Relay', 'Bridge Health Monitor'],
    descriptions: [
      'A self-serve indexer that exposes Stellar contract events over GraphQL.',
      'A decentralised oracle relay feeding off-chain prices to Soroban.',
    ],
    features: ['Event Indexing', 'Uptime Monitoring', 'Webhook Triggers'],
  },
  Identity: {
    titles: ['Verifiable Credential Wallet', 'Sybil-Resistant Login', 'Proof-of-Skill Registry'],
    descriptions: [
      'A wallet issuing and verifying W3C credentials anchored on-chain.',
      'A sybil-resistant sign-in flow using soulbound attestations.',
    ],
    features: ['Verifiable Credentials', 'Selective Disclosure', 'Revocation'],
  },
  Sustainability: {
    titles: ['Carbon Credit Ledger', 'Green Impact Tracker', 'Regen Funding Pool'],
    descriptions: [
      'A transparent ledger tokenising and retiring verified carbon credits.',
      'A funding pool that streams capital to measurable climate outcomes.',
    ],
    features: ['Impact Verification', 'Credit Retirement', 'Transparent Reporting'],
  },
  MultiSigWallet: {
    titles: ['Multi-Party Treasury', 'Threshold Signature Vault', 'Social Recovery Wallet'],
    descriptions: [
      'A Soroban-native m-of-n multi-sig wallet where transactions execute only after a configurable quorum of signers approve on-chain.',
      'A threshold-signature vault with time-locked and social-recovery policies for secure team asset management on Stellar.',
    ],
    features: ['m-of-n Signing', 'Threshold Configuration', 'On-Chain Approval', 'Social Recovery'],
  },
};

/** Toggle a technology in/out of the selected stack (pure — returns a new array). */
export function toggleTech(stack: string[], tech: string): string[] {
  return stack.includes(tech) ? stack.filter((t) => t !== tech) : [...stack, tech];
}

/** Result of validating a filter set before generation. */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate filters before we spend an AI call. Catches the empty-stack and
 * unknown-value cases that would otherwise produce irrelevant ideas.
 */
export function validateFilters(filters: IdeaFilters): ValidationResult {
  const errors: string[] = [];
  if (!DIFFICULTY_LEVELS.includes(filters.difficulty)) {
    errors.push('Select a valid difficulty level.');
  }
  if (!DOMAINS.includes(filters.domain)) {
    errors.push('Select a valid domain.');
  }
  if (!filters.techStack || filters.techStack.length === 0) {
    errors.push('Select at least one technology.');
  }
  return { valid: errors.length === 0, errors };
}

/** Map UI filters to the parameter shape the backend AI endpoint expects. */
export function buildGeneratorParams(filters: IdeaFilters): {
  theme: string;
  techStack: string[];
  difficulty: string;
} {
  return {
    theme: `${filters.domain} on the Stellar ecosystem`,
    techStack: filters.techStack,
    difficulty: filters.difficulty,
  };
}

/**
 * Deterministically synthesise a relevant idea from domain templates.
 *
 * Used as the offline/error fallback so the feature still "produces relevant
 * ideas" (acceptance criterion) when the AI service is unreachable. Deterministic
 * — no Math.random — so the same filters always yield the same idea, which keeps
 * tests stable and makes the UI predictable.
 */
export function generateLocalIdea(filters: IdeaFilters): ProjectIdea {
  const template = DOMAIN_TEMPLATES[filters.domain] ?? DOMAIN_TEMPLATES.DeFi;
  const difficultyIndex = Math.max(0, DIFFICULTY_LEVELS.indexOf(filters.difficulty));
  // Pick variants deterministically from the filter shape.
  const pick = (filters.techStack.length + difficultyIndex) % template.titles.length;
  const descPick = (filters.techStack.length + difficultyIndex) % template.descriptions.length;
  const stack = filters.techStack.length > 0 ? filters.techStack : ['Soroban'];

  return {
    title: template.titles[pick],
    description: template.descriptions[descPick],
    difficulty: filters.difficulty,
    recommendedTech: stack,
    keyFeatures: template.features,
  };
}
