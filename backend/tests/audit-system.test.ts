import { jest } from '@jest/globals';
process.env.DATABASE_URL = 'postgres://dummy:dummy@localhost:5432/dummy';
import { Request } from 'express';

const mockPrismaCreate = jest.fn().mockResolvedValue({} as never);
const mockAuditLoggerInfo = jest.fn().mockReturnValue({} as never);

jest.unstable_mockModule('../src/db/index.js', () => ({
  default: {
    auditLog: {
      create: mockPrismaCreate,
    },
  },
}));

jest.unstable_mockModule('../src/utils/logger.js', () => ({
  auditLogger: {
    info: mockAuditLoggerInfo,
  },
  default: {
    error: jest.fn(),
    info: jest.fn(),
  },
}));

const { logAudit, logRequestAudit } = await import('../src/utils/audit.js');

describe('Audit Logging System', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('logAudit', () => {
    it('should create an audit log with cryptographic hash and immutable storage', async () => {
      const data = {
        userId: 'user-123',
        userEmail: 'test@example.com',
        action: 'TEST_ACTION',
        entity: 'User',
        entityId: 'user-123',
        details: { key: 'value' },
        ipAddress: '127.0.0.1',
        userAgent: 'Jest-Test',
      };

      await logAudit(data);

      expect(mockPrismaCreate).toHaveBeenCalledTimes(1);
      const prismaCall = mockPrismaCreate.mock.calls[0][0];
      
      expect(prismaCall.data.action).toBe('TEST_ACTION');
      expect(prismaCall.data.details._hash).toBeDefined();

      expect(mockAuditLoggerInfo).toHaveBeenCalledTimes(1);
      const fileLogCall = mockAuditLoggerInfo.mock.calls[0][0];
      
      expect(fileLogCall.action).toBe('TEST_ACTION');
      expect(fileLogCall.timestamp).toBeDefined();
      expect(fileLogCall.hash).toBeDefined();
    });

    it('should handle errors gracefully without throwing', async () => {
      mockPrismaCreate.mockRejectedValueOnce(new Error('DB Error') as never);
      
      const data = { action: 'FAIL_ACTION' };
      
      await expect(logAudit(data)).resolves.not.toThrow();
    });
  });

  describe('logRequestAudit', () => {
    it('should extract user info from authenticated request', async () => {
      const req = {
        user: { id: 'user-auth', email: 'auth@example.com' },
        ip: '192.168.1.1',
        headers: { 'user-agent': 'Browser' },
        socket: {},
      } as unknown as Request;

      await logRequestAudit(req, 'AUTH_ACTION');

      expect(mockPrismaCreate).toHaveBeenCalledTimes(1);
      const prismaCall = mockPrismaCreate.mock.calls[0][0];
      expect(prismaCall.data.userId).toBe('user-auth');
      expect(prismaCall.data.userEmail).toBe('auth@example.com');
      expect(prismaCall.data.ipAddress).toBe('192.168.1.1');
    });

    it('should extract email from body for login/register actions', async () => {
      const req = {
        body: { email: 'login@example.com' },
        socket: { remoteAddress: '10.0.0.1' },
        headers: {},
      } as unknown as Request;

      await logRequestAudit(req, 'LOGIN_ACTION');

      expect(mockPrismaCreate).toHaveBeenCalledTimes(1);
      const prismaCall = mockPrismaCreate.mock.calls[0][0];
      expect(prismaCall.data.userId).toBeNull();
      expect(prismaCall.data.userEmail).toBe('login@example.com');
      expect(prismaCall.data.ipAddress).toBe('10.0.0.1');
    });
  });
});
