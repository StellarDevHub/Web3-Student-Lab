import { beforeEach, describe, expect, it } from 'vitest';
import {
  IdentityVerificationStore,
  createIdentityAttestation,
  createIdentityChallenge,
  isValidDid,
  isValidGithubHandle,
  isValidStellarAddress,
  verifyIdentityAttestation,
  type DecentralizedIdentityProfile,
} from '@/lib/open-source-trainer/identity';

const profile: DecentralizedIdentityProfile = {
  did: 'did:key:web3studentlab-contributor',
  walletAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  githubHandle: 'web3-student',
  contributorTier: 'reviewer',
  skills: ['Testing', 'Docs'],
};

describe('open source trainer identity verification', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('validates supported identity fields', () => {
    expect(isValidDid(profile.did)).toBe(true);
    expect(isValidStellarAddress(profile.walletAddress)).toBe(true);
    expect(isValidGithubHandle(profile.githubHandle)).toBe(true);
    expect(isValidGithubHandle('@bad handle')).toBe(false);
    expect(isValidDid('student:123')).toBe(false);
  });

  it('creates a stable challenge for a contributor profile', async () => {
    const challengeA = await createIdentityChallenge(profile);
    const challengeB = await createIdentityChallenge({ ...profile, skills: ['Docs', 'Testing'] });

    expect(challengeA).toMatch(/^verify:did:key:web3studentlab-contributor:/);
    expect(challengeA).toBe(challengeB);
  });

  it('creates and verifies a decentralized identity attestation', async () => {
    const attestation = await createIdentityAttestation(profile, { now: 1700000000000, ttlMs: 60000 });
    const result = await verifyIdentityAttestation(attestation, 1700000005000);

    expect(result.isValid).toBe(true);
    expect(result.checks).toEqual({
      did: true,
      walletAddress: true,
      githubHandle: true,
      chronology: true,
      signature: true,
    });
  });

  it('rejects tampered attestations', async () => {
    const attestation = await createIdentityAttestation(profile, { now: 1700000000000, ttlMs: 60000 });
    const tampered = {
      ...attestation,
      subject: {
        ...attestation.subject,
        githubHandle: 'another-user',
      },
    };

    const result = await verifyIdentityAttestation(tampered, 1700000005000);

    expect(result.isValid).toBe(false);
    expect(result.reason).toContain('signature');
  });

  it('persists attestations in local storage', async () => {
    const attestation = await createIdentityAttestation(profile);

    IdentityVerificationStore.save(attestation);

    expect(IdentityVerificationStore.load()).toEqual(attestation);

    IdentityVerificationStore.clear();
    expect(IdentityVerificationStore.load()).toBeNull();
  });
});
