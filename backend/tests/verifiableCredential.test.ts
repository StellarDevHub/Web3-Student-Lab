import {
  canonicalSerialize,
  deriveIssuerKeyPair,
  signMessage,
  createSignedMessage,
  toMultibaseBase58,
  fromMultibaseBase58,
  verifySignature,
} from '../src/certificates/Ed25519Signature2020.js';
import { VerifiableCredentialService } from '../src/certificates/VerifiableCredentialService.js';
import {
  ED25519_SIGNATURE_2020,
  COURSE_COMPLETION_VC_TYPE,
  VC_TYPE,
  type VerifiableCredential,
} from '../src/certificates/verifiableCredential.types.js';

jest.mock('../src/db/index.js', () => ({
  __esModule: true,
  default: {
    certificate: {
      findUnique: jest.fn().mockImplementation(({ where }) =>
        Promise.resolve(
          where?.id === 'cert-1'
            ? {
                id: 'cert-1',
                issuedAt: new Date('2026-01-01T00:00:00.000Z'),
                status: 'ACTIVE',
                did: 'did:stellar:GSTUDENT',
                tokenId: 'token-1',
                grade: 'A',
                student: {
                  firstName: 'Ada',
                  lastName: 'Lovelace',
                  walletAddress: 'GSTUDENT',
                },
                course: {
                  id: 'course-1',
                  title: 'Intro to Soroban',
                  instructor: 'Prof X',
                  credits: 3,
                },
              }
            : null
        )
      ),
    },
  },
}));

describe('Ed25519Signature2020 (issue #1107)', () => {
  const seed = 'a'.repeat(64); // 32-byte hex seed

  it('derives a deterministic keypair and encodes a multibase public key', () => {
    const kp1 = deriveIssuerKeyPair(seed);
    const kp2 = deriveIssuerKeyPair(seed);
    expect(kp1.publicKey.equals(kp2.publicKey)).toBe(true);
    expect(kp1.publicKeyMultibase.startsWith('z')).toBe(true);
    expect(kp1.publicKey.length).toBe(32);
  });

  it('round-trips base58btc via multibase', () => {
    const bytes = Buffer.from('hello-credential');
    const encoded = toMultibaseBase58(bytes);
    expect(encoded.startsWith('z')).toBe(true);
    expect(fromMultibaseBase58(encoded).equals(bytes)).toBe(true);
  });

  it('canonicalizes JSON deterministically regardless of key order', () => {
    const a = canonicalSerialize({ b: 1, a: [2, { d: 4, c: 3 }] });
    const b = canonicalSerialize({ a: [2, { c: 3, d: 4 }], b: 1 });
    expect(a).toBe(b);
  });

  it('signs and verifies a credential message', () => {
    const kp = deriveIssuerKeyPair(seed);
    const credential = {
      '@context': ['https://www.w3.org/ns/credentials/v2'],
      type: [VC_TYPE, COURSE_COMPLETION_VC_TYPE],
    };
    const proof = { type: ED25519_SIGNATURE_2020, proofValue: '' };
    const message = createSignedMessage(credential, proof);
    const sig = signMessage(message, kp.privateKey);
    const proofWithValue = { ...proof, proofValue: toMultibaseBase58(sig) };

    expect(verifySignature(credential, proofWithValue, kp.publicKey)).toBe(true);
  });

  it('rejects a tampered credential signature', () => {
    const kp = deriveIssuerKeyPair(seed);
    const credential = { id: 'urn:uuid:original' };
    const proof = { type: ED25519_SIGNATURE_2020, proofValue: '' };
    const message = createSignedMessage(credential, proof);
    proof.proofValue = toMultibaseBase58(signMessage(message, kp.privateKey));

    const tampered = { id: 'urn:uuid:tampered' };
    expect(verifySignature(tampered, proof, kp.publicKey)).toBe(false);
  });

  it('rejects a forged signature from a different key', () => {
    const issuerKp = deriveIssuerKeyPair(seed);
    const attackerKp = deriveIssuerKeyPair('b'.repeat(64));
    const credential = { id: 'urn:uuid:1' };
    const proof = { type: ED25519_SIGNATURE_2020, proofValue: '' };
    const message = createSignedMessage(credential, proof);
    proof.proofValue = toMultibaseBase58(signMessage(message, attackerKp.privateKey));

    expect(verifySignature(credential, proof, issuerKp.publicKey)).toBe(false);
  });

  it('builds a W3C-compliant issuer DID document with the Ed25519 key', () => {
    const service = new VerifiableCredentialService();
    const doc = service.getIssuerDidDocument() as {
      id: string;
      verificationMethod?: Array<{ id: string; type: string; publicKeyBase64: string }>;
      service?: Array<{ type: string }>;
    };
    expect(doc.id).toMatch(/^did:stellar:/);
    expect(doc.verificationMethod?.[0]?.type).toBe('Ed25519VerificationKey2020');
    expect(doc.verificationMethod?.[0]?.publicKeyBase64).toBeTruthy();
    expect(doc.service?.[0]?.type).toBe('CredentialIssuer');
  });

  it('produces a VC v2.0 document with the correct shape', async () => {
    const service = new VerifiableCredentialService();
    const vc = (await service.issueCredential('cert-1')) as VerifiableCredential | null;
    expect(vc).not.toBeNull();
    expect(vc?.['@context']).toContain('https://www.w3.org/ns/credentials/v2');
    expect(vc?.type).toContain(VC_TYPE);
    expect(vc?.type).toContain(COURSE_COMPLETION_VC_TYPE);
    expect(vc?.proof?.type).toBe(ED25519_SIGNATURE_2020);
    expect(vc?.proof?.proofValue).toMatch(/^z/);
    expect(vc?.proof?.verificationMethod).toMatch(/^did:stellar:.*#key-1$/);
    expect(vc?.credentialSubject.courseTitle).toBe('Intro to Soroban');
  });

  it('verifies an issued credential end-to-end and rejects tampering', async () => {
    const service = new VerifiableCredentialService();
    const vc = (await service.issueCredential('cert-1')) as VerifiableCredential | null;
    expect(vc).not.toBeNull();

    const ok = await service.verifyCredential(vc as VerifiableCredential);
    expect(ok.valid).toBe(true);
    expect(ok.verifiedProof).toBe(true);

    // Tamper with the subject -> signature must fail.
    const tampered = JSON.parse(JSON.stringify(vc)) as VerifiableCredential;
    tampered.credentialSubject.grade = 'F';
    const bad = await service.verifyCredential(tampered);
    expect(bad.valid).toBe(false);
    expect(bad.reason).toMatch(/tampered|verification failed/i);
  });
});
