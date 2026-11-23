import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { CertificateAnalytics } from '../src/certificates/CertificateAnalytics.js';
import { VerificationService } from '../src/certificates/VerificationService.js';
import prisma from '../src/db/index.js';
import logger from '../src/utils/logger.js';

jest.mock('../src/db/index.js', () => ({
  __esModule: true,
  default: {
    certificate: {
      count: jest.fn(),
      groupBy: jest.fn(),
      findFirst: jest.fn(),
    },
    certificateVerificationEvent: {
      count: jest.fn(),
      create: jest.fn(),
    },
  },
}));

jest.mock('../src/utils/logger.js', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

const mockCertificateCount = prisma.certificate.count as jest.Mock;
const mockCertificateGroupBy = prisma.certificate.groupBy as jest.Mock;
const mockCertificateFindFirst = prisma.certificate.findFirst as jest.Mock;
const mockVerificationCount = prisma.certificateVerificationEvent.count as jest.Mock;
const mockVerificationCreate = prisma.certificateVerificationEvent.create as jest.Mock;
const mockLoggerError = logger.error as jest.Mock;

function mockCertificateAnalyticsData({
  totalCertificates = 0,
  verificationEvents = 0,
  issuedThisMonth = 0,
  issuedThisWeek = 0,
  issuedToday = 0,
}: {
  totalCertificates?: number;
  verificationEvents?: number;
  issuedThisMonth?: number;
  issuedThisWeek?: number;
  issuedToday?: number;
} = {}) {
  mockCertificateCount
    .mockResolvedValueOnce(totalCertificates)
    .mockResolvedValueOnce(issuedThisMonth)
    .mockResolvedValueOnce(issuedThisWeek)
    .mockResolvedValueOnce(issuedToday);
  mockCertificateGroupBy
    .mockResolvedValueOnce([{ status: 'ACTIVE', _count: { status: totalCertificates } }])
    .mockResolvedValueOnce(totalCertificates > 0 ? [{ studentId: 'student-1' }] : [])
    .mockResolvedValueOnce(totalCertificates > 0 ? [{ courseId: 'course-1' }] : []);
  mockVerificationCount.mockResolvedValueOnce(verificationEvents);
}

describe('CertificateAnalytics persisted verification aggregation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns zero total verifications when no events exist', async () => {
    mockCertificateAnalyticsData({ totalCertificates: 0, verificationEvents: 0 });

    const analytics = await new CertificateAnalytics().getAnalytics();

    expect(analytics.totalVerifications).toBe(0);
    expect(mockVerificationCount).toHaveBeenCalledTimes(1);
  });

  it('returns one total verification from persisted events', async () => {
    mockCertificateAnalyticsData({ totalCertificates: 1, verificationEvents: 1 });

    const analytics = await new CertificateAnalytics().getAnalytics();

    expect(analytics.totalVerifications).toBe(1);
  });

  it('returns multiple total verifications from persisted events', async () => {
    mockCertificateAnalyticsData({ totalCertificates: 2, verificationEvents: 3 });

    const analytics = await new CertificateAnalytics().getAnalytics();

    expect(analytics.totalVerifications).toBe(3);
  });

  it('handles verification aggregation errors safely', async () => {
    mockCertificateAnalyticsData({ totalCertificates: 1, verificationEvents: 0 });
    mockVerificationCount.mockReset();
    mockVerificationCount.mockRejectedValueOnce(new Error('analytics table unavailable'));

    const analytics = await new CertificateAnalytics().getAnalytics();

    expect(analytics.totalVerifications).toBe(0);
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.stringContaining('Failed to aggregate certificate verification events')
    );
  });

  it('records verification events without requester personal data', async () => {
    mockCertificateFindFirst.mockResolvedValueOnce({
      id: 'cert-123',
      tokenId: 'token-123',
      workspaceId: 'workspace-1',
    });
    mockVerificationCreate.mockResolvedValueOnce({ id: 'event-1' });

    await new VerificationService().recordVerification('token-123');

    expect(mockVerificationCreate).toHaveBeenCalledWith({
      data: {
        workspaceId: 'workspace-1',
        certificateId: 'cert-123',
        tokenId: 'token-123',
      },
    });
    const data = mockVerificationCreate.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('ipAddress');
    expect(data).not.toHaveProperty('userAgent');
    expect(data).not.toHaveProperty('email');
    expect(data).not.toHaveProperty('walletAddress');
  });
});
