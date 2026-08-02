import { jest } from '@jest/globals';
import { Request, Response } from 'express';

const mockLogRequestAudit = jest.fn().mockResolvedValue(undefined as never);

jest.mock('../src/utils/audit.js', () => ({
  logRequestAudit: mockLogRequestAudit,
  logAudit: jest.fn(),
}));

import { auditAction } from '../src/middleware/audit.js';

describe('auditAction middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should log action when response is successful', async () => {
    const middleware = auditAction('TEST_MIDDLEWARE_ACTION', 'TestEntity');
    const req = {
      method: 'POST',
      path: '/test',
      params: { id: 'entity-1' },
      body: { data: 'test' },
      user: { id: 'user-1', email: 'test@example.com' },
      ip: '127.0.0.1',
      headers: {},
      socket: {},
    } as unknown as Request;

    const res = {
      statusCode: 200,
      send: jest.fn((body) => {
        return res;
      }),
    } as unknown as Response;

    const next = jest.fn();

    await middleware(req, res, next);
    
    // Simulate response send
    res.send({ success: true });

    // Wait for the async logRequestAudit to run
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockLogRequestAudit).toHaveBeenCalledTimes(1);
    const callArgs = mockLogRequestAudit.mock.calls[0];
    expect(callArgs[1]).toBe('TEST_MIDDLEWARE_ACTION');
    expect(callArgs[2]).toBe('TestEntity');
    expect(callArgs[3]).toBe('entity-1');
  });

  it('should not log action when response is failed', async () => {
    const middleware = auditAction('TEST_MIDDLEWARE_ACTION', 'TestEntity');
    const req = {
      params: {},
      body: {},
      headers: {},
      socket: {},
    } as unknown as Request;

    const res = {
      statusCode: 400,
      send: jest.fn(),
    } as unknown as Response;

    const next = jest.fn();

    await middleware(req, res, next);
    
    // Simulate response send
    res.send({ error: 'failed' });

    expect(mockLogRequestAudit).not.toHaveBeenCalled();
  });
});
