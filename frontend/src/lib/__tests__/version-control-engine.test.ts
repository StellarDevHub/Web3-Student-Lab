import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VersionControl } from '@/lib/version-control/engine';

describe('version control engine verified identity integration', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('stores verified identity metadata on new versions', () => {
    const nowSpy = vi.spyOn(Date, 'now');
    nowSpy.mockReturnValueOnce(1700000000000).mockReturnValueOnce(1700000001000);

    const document = VersionControl.createDocument(
      'Issue #501 fix',
      'Initial analysis',
      'Ada',
      'Initial version'
    );

    const version = VersionControl.createVersion(
      document.id,
      'Issue #501 fix',
      'Implemented decentralized identity verification',
      'Ada',
      'Add DID proof to contribution flow',
      ['did-verified', 'reviewer'],
      {
        verifiedIdentity: {
          did: 'did:key:web3studentlab-contributor',
          walletAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
          githubHandle: 'ada-dev',
          verifiedAt: 1700000000000,
          issuer: 'did:web:web3studentlab.dev',
          method: 'stellar-wallet-attestation',
        },
      }
    );

    expect(version).not.toBeNull();
    expect(version?.metadata.verifiedIdentity?.githubHandle).toBe('ada-dev');
    expect(VersionControl.hasVerifiedIdentity(version)).toBe(true);
  });

  it('preserves verified identity metadata on rollback', () => {
    const document = VersionControl.createDocument('PR draft', 'v1', 'Ada', 'Initial version');
    const version = VersionControl.createVersion(
      document.id,
      'PR draft',
      'v2',
      'Ada',
      'Verified update',
      ['did-verified'],
      {
        verifiedIdentity: {
          did: 'did:key:web3studentlab-contributor',
          walletAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
          githubHandle: 'ada-dev',
          verifiedAt: 1700000000000,
          issuer: 'did:web:web3studentlab.dev',
          method: 'stellar-wallet-attestation',
        },
      }
    );

    const rolledBack = VersionControl.rollback(document.id, version!.id, 'Ada');

    expect(rolledBack?.metadata.verifiedIdentity?.did).toBe('did:key:web3studentlab-contributor');
    expect(rolledBack?.tags).toContain('did-verified');
  });
});
