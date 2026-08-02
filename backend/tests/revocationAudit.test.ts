import { jest } from '@jest/globals';

const findUnique = jest.fn();
const update = jest.fn();
const auditLogCreate = jest.fn().mockResolvedValue({});

jest.mock('../src/db/index.js', () => ({
  __esModule: true,
  default: {
    certificate: {
      findUnique,
      update,
    },
    auditLog: {
      create: auditLogCreate,
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
  auditLogger: {
    info: jest.fn(),
  },
  getCorrelationId: jest.fn().mockReturnValue('test-correlation-id'),
}));

const AUTHORIZED_DID = 'did:stellar:GAUTHORIZEDISSUER000000000000000000000000000000';
const UNAUTHORIZED_DID = 'did:stellar:GUNAUTHORIZEDACTOR00000000000000000000000000000';

describe('RevocationService — authorization and audit trail (#914)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AUTHORIZED_ISSUER_DIDS = AUTHORIZED_DID;
  });

  afterEach(() => {
    delete process.env.AUTHORIZED_ISSUER_DIDS;
  });

  it('revokes a certificate when the actor is an authorized issuer and records an audit entry', async () => {
    const { RevocationService } = await import('../src/certificates/RevocationService.js');
    const service = new RevocationService();

    findUnique.mockResolvedValue({
      id: 'cert-1',
      status: 'ACTIVE',
      studentId: 'student-1',
      courseId: 'course-1',
    });
    update.mockResolvedValue({
      id: 'cert-1',
      status: 'REVOKED',
      revokedBy: AUTHORIZED_DID,
      revocationReason: 'Academic misconduct',
    });

    const result = await service.revokeCertificate('cert-1', {
      certificateId: 'cert-1',
      reason: 'Academic misconduct',
      revokedBy: AUTHORIZED_DID,
    });

    expect(result.status).toBe('REVOKED');
    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    const auditPayload = auditLogCreate.mock.calls[0][0].data;
    expect(auditPayload.action).toBe('CERTIFICATE_REVOKED');
    expect(auditPayload.entityId).toBe('cert-1');
    expect(auditPayload.details.priorStatus).toBe('ACTIVE');
    expect(auditPayload.details.actorDid).toBe(AUTHORIZED_DID);
  });

  it('rejects revocation by an actor who is not an authorized issuer and audits the failed attempt', async () => {
    const { RevocationService, UnauthorizedIssuerError } = await import(
      '../src/certificates/RevocationService.js'
    );
    const service = new RevocationService();

    findUnique.mockResolvedValue({
      id: 'cert-2',
      status: 'ACTIVE',
      studentId: 'student-1',
      courseId: 'course-1',
    });

    await expect(
      service.revokeCertificate('cert-2', {
        certificateId: 'cert-2',
        reason: 'Attempted fraud',
        revokedBy: UNAUTHORIZED_DID,
      })
    ).rejects.toThrow(UnauthorizedIssuerError);

    expect(update).not.toHaveBeenCalled();
    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    const auditPayload = auditLogCreate.mock.calls[0][0].data;
    expect(auditPayload.action).toBe('CERTIFICATE_REVOKE_FAILED');
    expect(auditPayload.details.actorDid).toBe(UNAUTHORIZED_DID);
  });

  it('reissues a certificate for an authorized issuer and audits the prior status', async () => {
    const { RevocationService } = await import('../src/certificates/RevocationService.js');
    const service = new RevocationService();

    findUnique.mockResolvedValue({
      id: 'cert-3',
      status: 'ACTIVE',
      studentId: 'student-1',
      courseId: 'course-1',
      grade: 'B',
      did: null,
      contractAddress: 'GCONTRACT',
      network: 'stellar-testnet',
    });
    update.mockResolvedValue({});

    (service as any).certificateService.mintCertificate = jest.fn().mockResolvedValue({
      id: 'cert-3-v2',
      status: 'ACTIVE',
    });

    const result = await service.reissueCertificate({
      certificateId: 'cert-3',
      reason: 'Grade correction',
      newGrade: 'A',
      issuedBy: AUTHORIZED_DID,
    });

    expect(result.new.id).toBe('cert-3-v2');
    expect(result.original.status).toBe('REISSUED');

    const reissueAudit = auditLogCreate.mock.calls.find(
      (call: any) => call[0].data.action === 'CERTIFICATE_REISSUED'
    );
    expect(reissueAudit).toBeDefined();
    expect(reissueAudit[0].data.details.priorStatus).toBe('ACTIVE');
    expect(reissueAudit[0].data.details.newCertificateId).toBe('cert-3-v2');
  });

  it('rejects reissuance by an unauthorized actor and audits the failure', async () => {
    const { RevocationService, UnauthorizedIssuerError } = await import(
      '../src/certificates/RevocationService.js'
    );
    const service = new RevocationService();

    findUnique.mockResolvedValue({
      id: 'cert-4',
      status: 'ACTIVE',
      studentId: 'student-1',
      courseId: 'course-1',
    });

    await expect(
      service.reissueCertificate({
        certificateId: 'cert-4',
        reason: 'Not allowed',
        issuedBy: UNAUTHORIZED_DID,
      })
    ).rejects.toThrow(UnauthorizedIssuerError);

    const failureAudit = auditLogCreate.mock.calls.find(
      (call: any) => call[0].data.action === 'CERTIFICATE_REISSUE_FAILED'
    );
    expect(failureAudit).toBeDefined();
  });
});
