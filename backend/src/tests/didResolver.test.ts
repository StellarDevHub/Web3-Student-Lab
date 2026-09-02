import { generateKeyPairSync, sign as ed25519Sign, type KeyObject } from 'node:crypto';
import {
  buildDidDocument,
  canonicalizeClaim,
  parseDid,
  verifyContributorProof,
  type ContributorProofClaim,
  type DidBinding,
} from '../services/didResolver';

function makeKey(): { privateKey: KeyObject; publicKeyBase64: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const der = publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
  const raw = der.subarray(der.length - 32);
  return { privateKey, publicKeyBase64: raw.toString('base64') };
}

describe('did:stellar resolver', () => {
  it('parses a valid did:stellar identifier', () => {
    const id = 'a'.repeat(64);
    const parsed = parseDid(`did:stellar:${id}`);
    expect(parsed.method).toBe('stellar');
    expect(parsed.id).toBe(id);
  });

  it('rejects malformed did identifiers', () => {
    expect(() => parseDid('did:example:123')).toThrow();
    expect(() => parseDid('did:stellar:xyz')).toThrow();
  });

  it('builds a JSON-LD DID document with verification method', () => {
    const did = `did:stellar:${'b'.repeat(64)}`;
    const doc = buildDidDocument({ did, publicKeyBase64: 'A'.repeat(44) });
    expect(doc.id).toBe(did);
    expect(Array.isArray(doc['@context'])).toBe(true);
    expect(doc.verificationMethod?.[0]?.type).toBe('Ed25519VerificationKey2020');
    expect(doc.authentication?.[0]).toBe(`${did}#key-1`);
  });

  it('verifies a valid signed contributor proof and rejects forgeries', () => {
    const { privateKey, publicKeyBase64 } = makeKey();
    const did = `did:stellar:${'c'.repeat(64)}`;
    const binding: DidBinding = { githubHandle: 'alice', publicKeyBase64 };

    const claim: ContributorProofClaim = {
      did,
      claimType: 'pr',
      repo: 'StellarDevHub/Web3-Student-Lab',
      itemId: '123',
      githubHandle: 'alice',
      issuedAt: 1_700_000_000,
    };
    const message = canonicalizeClaim(claim);
    const signature = ed25519Sign(null, Buffer.from(message), privateKey).toString('base64');

    const ok = verifyContributorProof(claim, signature, binding);
    expect(ok.valid).toBe(true);

    // Tampered claim must be rejected
    const tampered = { ...claim, itemId: '999' };
    const tamperedMsg = canonicalizeClaim(tampered);
    const tamperedSig = ed25519Sign(null, Buffer.from(tamperedMsg), privateKey).toString('base64');
    const bad = verifyContributorProof(tampered, tamperedSig, binding);
    expect(bad.valid).toBe(false);
    expect(bad.reason).toContain('signature');

    // Wrong handle must be rejected
    const wrongHandle: ContributorProofClaim = { ...claim, githubHandle: 'mallory' };
    const wrongMsg = canonicalizeClaim(wrongHandle);
    const wrongSig = ed25519Sign(null, Buffer.from(wrongMsg), privateKey).toString('base64');
    const wrong = verifyContributorProof(wrongHandle, wrongSig, binding);
    expect(wrong.valid).toBe(false);
    expect(wrong.reason).toContain('handle');

    // Missing binding must be rejected
    const noBinding = verifyContributorProof(claim, signature, undefined);
    expect(noBinding.valid).toBe(false);
  });
});
