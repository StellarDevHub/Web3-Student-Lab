import { jest } from '@jest/globals';
import { computeCertificateContentHash } from '../src/certificates/ContentHash.js';

const findFirst = jest.fn();

jest.mock('../src/db/index.js', () => ({
  __esModule: true,
  default: {
    certificate: {
      findFirst,
    },
  },
}));

jest.mock('../src/utils/logger.js', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
  auditLogger: { info: jest.fn() },
  getCorrelationId: jest.fn().mockReturnValue('test-correlation-id'),
}));

const baseCertificate = {
  id: 'cert-1',
  tokenId: 'token-1',
  studentId: 'student-1',
  courseId: 'course-1',
  grade: 'A',
  did: null,
  issuedAt: new Date('2026-01-01T00:00:00.000Z'),
  status: 'ACTIVE',
  contractAddress: 'GCONTRACT',
  network: 'stellar-testnet',
  transactionHash: '0xabc',
  certificateHash: '0xabc',
  student: { walletAddress: 'GSTUDENT', did: null, firstName: 'Ada', lastName: 'L' },
  course: { id: 'course-1', title: 'Intro', instructor: 'A', credits: 3 },
};

describe('VerificationService — content-hash tamper detection (#913)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns a valid, non-tampered result when the content hash matches', async () => {
    const { verificationService } = await import('../src/certificates/VerificationService.js');
    const contentHash = computeCertificateContentHash(baseCertificate);

    findFirst.mockResolvedValue({ ...baseCertificate, contentHash });

    const result = await verificationService.verifyByTokenId('token-1');
    expect(result.status).not.toBe('TAMPERED');
    expect(result.isValid).toBe(true);
  });

  it('surfaces a tamper-detected result instead of silently serving mismatched metadata', async () => {
    const { verificationService } = await import('../src/certificates/VerificationService.js');
    const storedHash = computeCertificateContentHash(baseCertificate);

    // Simulate tampering: the grade stored in the DB no longer matches
    // what was hashed at mint time, but the stale contentHash remains.
    findFirst.mockResolvedValue({ ...baseCertificate, grade: 'A+', contentHash: storedHash });

    const result = await verificationService.verifyByTokenId('token-1');

    expect(result.isValid).toBe(false);
    expect(result.status).toBe('TAMPERED');
    expect(result.certificate).toBeNull();
    expect(result.message).toMatch(/integrity check failed/i);
  });

  it('treats a certificate with no stored content hash as unverified, not tampered', async () => {
    const { verificationService } = await import('../src/certificates/VerificationService.js');
    findFirst.mockResolvedValue({ ...baseCertificate, contentHash: null });

    const result = await verificationService.verifyByTokenId('token-1');
    expect(result.status).not.toBe('TAMPERED');
  });

  it('redacts the revoking actor identity from public revocation info', async () => {
    const { verificationService } = await import('../src/certificates/VerificationService.js');
    const contentHash = computeCertificateContentHash(baseCertificate);

    findFirst.mockResolvedValue({
      ...baseCertificate,
      status: 'REVOKED',
      contentHash,
      revokedAt: new Date('2026-02-01T00:00:00.000Z'),
      revocationReason: 'Fraud',
      revokedBy: 'did:stellar:GADMINPRIVATE',
    });

    const result = await verificationService.verifyByTokenId('token-1');
    expect(result.status).toBe('REVOKED');
    expect(result.revocationInfo?.revokedBy).toBe('redacted');
    expect(result.revocationInfo?.reason).toBe('Fraud');
  });
});
