import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FILTERS,
  toggleTech,
  validateFilters,
  buildGeneratorParams,
  generateLocalIdea,
  createMultiSigState,
  toggleSigner,
  MULTISIG_POLICIES,
  DOMAINS,
  type IdeaFilters,
} from '../ideaGenerator';

describe('ideaGenerator', () => {
  it('toggles a technology in and out of the stack', () => {
    expect(toggleTech(['React'], 'Rust')).toEqual(['React', 'Rust']);
    expect(toggleTech(['React', 'Rust'], 'React')).toEqual(['Rust']);
  });

  it('validates filters and rejects an empty tech stack', () => {
    expect(validateFilters(DEFAULT_FILTERS).valid).toBe(true);
    const bad = validateFilters({ ...DEFAULT_FILTERS, techStack: [] });
    expect(bad.valid).toBe(false);
    expect(bad.errors.length).toBeGreaterThan(0);
  });

  it('maps filters to backend generator params', () => {
    const params = buildGeneratorParams(DEFAULT_FILTERS);
    expect(params.difficulty).toBe('Intermediate');
    expect(params.theme).toContain('DeFi');
    expect(params.techStack).toEqual(DEFAULT_FILTERS.techStack);
  });

  it('synthesises a deterministic, relevant fallback idea', () => {
    const filters: IdeaFilters = { difficulty: 'Advanced', domain: 'NFT', techStack: ['IPFS'] };
    const a = generateLocalIdea(filters);
    const b = generateLocalIdea(filters);
    expect(a).toEqual(b); // deterministic
    expect(a.difficulty).toBe('Advanced');
    expect(a.recommendedTech).toEqual(['IPFS']);
    expect(a.title.length).toBeGreaterThan(0);
  });
});

describe('Multi-sig Wallet — DOMAINS', () => {
  it('includes MultiSigWallet in the DOMAINS list', () => {
    expect(DOMAINS).toContain('MultiSigWallet');
  });
});

describe('createMultiSigState', () => {
  it('creates the correct number of signers', () => {
    const state = createMultiSigState(4, 3, 'm-of-n');
    expect(state.signers).toHaveLength(4);
  });

  it('initialises all signers as unsigned', () => {
    const state = createMultiSigState(3, 2, 'm-of-n');
    expect(state.signers.every((s) => !s.signed)).toBe(true);
  });

  it('sets threshold and policy correctly', () => {
    const state = createMultiSigState(5, 3, 'time-locked');
    expect(state.threshold).toBe(3);
    expect(state.policy).toBe('time-locked');
  });

  it('defaults to 3 signers, threshold 2, m-of-n policy', () => {
    const state = createMultiSigState();
    expect(state.signers).toHaveLength(3);
    expect(state.threshold).toBe(2);
    expect(state.policy).toBe('m-of-n');
  });

  it('starts with approved = false', () => {
    expect(createMultiSigState().approved).toBe(false);
  });
});

describe('toggleSigner', () => {
  it('marks a signer as signed when previously unsigned', () => {
    const state = createMultiSigState(3, 2, 'm-of-n');
    const next = toggleSigner(state, 0);
    expect(next.signers[0].signed).toBe(true);
  });

  it('unmarks a signer when already signed', () => {
    let state = createMultiSigState(3, 2, 'm-of-n');
    state = toggleSigner(state, 0);
    state = toggleSigner(state, 0);
    expect(state.signers[0].signed).toBe(false);
  });

  it('does not mutate the original state', () => {
    const state = createMultiSigState(3, 2, 'm-of-n');
    toggleSigner(state, 0);
    expect(state.signers[0].signed).toBe(false);
  });

  it('sets approved = true once threshold is met (m-of-n)', () => {
    let state = createMultiSigState(3, 2, 'm-of-n');
    state = toggleSigner(state, 0);
    expect(state.approved).toBe(false);
    state = toggleSigner(state, 1);
    expect(state.approved).toBe(true);
  });

  it('sets approved = false when signatures drop below threshold', () => {
    let state = createMultiSigState(3, 2, 'm-of-n');
    state = toggleSigner(state, 0);
    state = toggleSigner(state, 1); // approved
    state = toggleSigner(state, 1); // unsign → below threshold
    expect(state.approved).toBe(false);
  });

  it('requires all signers for a 3-of-3 config', () => {
    let state = createMultiSigState(3, 3, 'm-of-n');
    state = toggleSigner(state, 0);
    state = toggleSigner(state, 1);
    expect(state.approved).toBe(false);
    state = toggleSigner(state, 2);
    expect(state.approved).toBe(true);
  });
});

describe('generateLocalIdea — MultiSigWallet domain', () => {
  it('generates a valid idea for the MultiSigWallet domain', () => {
    const filters: IdeaFilters = {
      difficulty: 'Intermediate',
      domain: 'MultiSigWallet',
      techStack: ['Soroban', 'React'],
    };
    const idea = generateLocalIdea(filters);
    expect(idea.title.length).toBeGreaterThan(0);
    expect(idea.description.length).toBeGreaterThan(0);
    expect(idea.keyFeatures.length).toBeGreaterThan(0);
    expect(idea.difficulty).toBe('Intermediate');
    expect(idea.recommendedTech).toEqual(['Soroban', 'React']);
  });

  it('is deterministic for the MultiSigWallet domain', () => {
    const filters: IdeaFilters = {
      difficulty: 'Beginner',
      domain: 'MultiSigWallet',
      techStack: ['Rust'],
    };
    expect(generateLocalIdea(filters)).toEqual(generateLocalIdea(filters));
  });
});

describe('MULTISIG_POLICIES', () => {
  it('contains the expected policy types', () => {
    expect(MULTISIG_POLICIES).toContain('m-of-n');
    expect(MULTISIG_POLICIES).toContain('weighted');
    expect(MULTISIG_POLICIES).toContain('time-locked');
    expect(MULTISIG_POLICIES).toContain('social-recovery');
  });
});
