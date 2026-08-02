import { logAudit, logRequestAudit } from '../src/utils/audit.js';
import prisma from '../src/db/index.js';
import { auditLogger } from '../src/utils/logger.js';
import { Request } from 'express';

jest.mock('../src/db/index.js', () => ({
  __esModule: true,
  default: {
    auditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  },
}));

jest.mock('../src/utils/logger.js', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
  },
  auditLogger: {
    info: jest.fn(),
  },
  getCorrelationId: jest.fn().mockReturnValue('test-correlation-id'),
}));

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

      expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
      const prismaCall = (prisma.auditLog.create as jest.Mock).mock.calls[0][0];
      
      expect(prismaCall.data.action).toBe('TEST_ACTION');
      expect(prismaCall.data.details._hash).toBeDefined();

      expect(auditLogger.info).toHaveBeenCalledTimes(1);
      const fileLogCall = (auditLogger.info as jest.Mock).mock.calls[0][0];
      
      expect(fileLogCall.action).toBe('TEST_ACTION');
      expect(fileLogCall.timestamp).toBeDefined();
      expect(fileLogCall.hash).toBeDefined();
    });

    it('should handle errors gracefully without throwing', async () => {
      (prisma.auditLog.create as jest.Mock).mockRejectedValueOnce(new Error('DB Error'));
      
      const data = { action: 'FAIL_ACTION' };
      
      await expect(logAudit(data)).resolves.not.toThrow();
      const { default: logger } = require('../src/utils/logger.js');
      expect(logger.error).toHaveBeenCalled();
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

      expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
      const prismaCall = (prisma.auditLog.create as jest.Mock).mock.calls[0][0];
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

      expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
      const prismaCall = (prisma.auditLog.create as jest.Mock).mock.calls[0][0];
      expect(prismaCall.data.userId).toBeNull();
      expect(prismaCall.data.userEmail).toBe('login@example.com');
      expect(prismaCall.data.ipAddress).toBe('10.0.0.1');
    });
  });
});
