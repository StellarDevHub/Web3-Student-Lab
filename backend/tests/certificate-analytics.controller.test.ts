import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { CertificateController } from '../src/certificates/certificates.controller.js';
import { certificateAnalytics } from '../src/certificates/CertificateAnalytics.js';
import logger from '../src/utils/logger.js';

jest.mock('../src/db/index.js', () => ({
  __esModule: true,
  default: {
    certificate: {
      count: jest.fn(),
      groupBy: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    certificateVerificationEvent: {
      count: jest.fn(),
      create: jest.fn(),
    },
  },
}));

jest.mock('../src/certificates/CertificateAnalytics.js', () => ({
  __esModule: true,
  CertificateAnalytics: jest.fn(),
  certificateAnalytics: {
    getAnalytics: jest.fn(),
  },
}));

jest.mock('../src/utils/logger.js', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockGetAnalytics = certificateAnalytics.getAnalytics as jest.Mock;
const mockLoggerError = logger.error as jest.Mock;

function createMockResponse() {
  const res: any = {
    status: jest.fn(() => res),
    json: jest.fn(() => res),
  };
  return res;
}

describe('Certificate analytics endpoint handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns persisted verification analytics', async () => {
    const analytics = {
      totalCertificates: 2,
      byStatus: { ACTIVE: 2 },
      totalVerifications: 3,
      uniqueStudents: 1,
      uniqueCourses: 1,
      revocationRate: 0,
      issuedThisMonth: 2,
      issuedThisWeek: 2,
      issuedToday: 1,
    };
    mockGetAnalytics.mockResolvedValueOnce(analytics);
    const res = createMockResponse();

    await new CertificateController().getAnalytics({} as any, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(analytics);
  });

  it('returns a safe error response when analytics aggregation fails', async () => {
    mockGetAnalytics.mockRejectedValueOnce(new Error('database unavailable'));
    const res = createMockResponse();

    await new CertificateController().getAnalytics({} as any, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch analytics' });
    expect(mockLoggerError).toHaveBeenCalledWith(expect.stringContaining('Analytics error'));
  });
});
