/**
 * Comprehensive Unit Tests for Request Logger Middleware
 * 
 * This test suite covers the detailed request logger middleware with correlation IDs,
 * request/response logging, and sanitization functionality.
 * 
 * Educational Notes:
 * - Tests verify correlation ID generation and propagation
 * - Tests validate request/response logging with timing
 * - Tests ensure sensitive data sanitization
 * - Tests verify header propagation to responses
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Request, Response, NextFunction } from 'express';
import {
  detailedRequestLogger,
  requestLogger,
} from '../src/middleware/requestLogger.js';
import logger, {
  setCorrelationId,
  getCorrelationId,
  clearCorrelationId,
} from '../src/utils/logger.js';

// Mock logger to prevent actual log output during tests
const loggerInfoSpy = jest.spyOn(logger, 'info');
const loggerWarnSpy = jest.spyOn(logger, 'warn');
const loggerErrorSpy = jest.spyOn(logger, 'error');

describe('Request Logger Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    // Reset correlation ID before each test
    clearCorrelationId();
    
    // Clear all mocks
    loggerInfoSpy.mockClear();
    loggerWarnSpy.mockClear();
    loggerErrorSpy.mockClear();

    // Setup mock request
    mockReq = {
      method: 'GET',
      url: '/api/test',
      originalUrl: '/api/test',
      ip: '127.0.0.1',
      headers: {
        'user-agent': 'test-agent',
        'content-type': 'application/json',
      },
      body: {},
      query: {},
      socket: {
        remoteAddress: '127.0.0.1',
      },
    };

    // Setup mock response
    mockRes = {
      statusCode: 200,
      headers: {},
      setHeader: jest.fn(function (this: Response, name: string, value: string) {
        this.headers[name] = value;
      }),
      get: jest.fn(function (this: Response, name: string) {
        return this.headers[name];
      }),
      send: jest.fn(function (this: Response) {
        return this;
      }),
    };

    // Setup mock next function
    mockNext = jest.fn();
  });

  afterEach(() => {
    clearCorrelationId();
  });

  describe('Detailed Request Logger', () => {
    it('should generate correlation ID if not provided in headers', () => {
      detailedRequestLogger(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.correlationId).toBeDefined();
      expect(mockReq.correlationId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('should use correlation ID from X-Correlation-ID header', () => {
      const testCorrelationId = 'test-correlation-id-123';
      mockReq.headers = {
        ...mockReq.headers,
        'x-correlation-id': testCorrelationId,
      };

      detailedRequestLogger(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.correlationId).toBe(testCorrelationId);
    });

    it('should use correlation ID from X-Request-ID header if X-Correlation-ID not present', () => {
      const testCorrelationId = 'test-request-id-123';
      mockReq.headers = {
        ...mockReq.headers,
        'x-request-id': testCorrelationId,
      };

      detailedRequestLogger(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.correlationId).toBe(testCorrelationId);
    });

    it('should set correlation ID in logger context', () => {
      detailedRequestLogger(mockReq as Request, mockRes as Response, mockNext);

      expect(getCorrelationId()).toBe(mockReq.correlationId);
    });

    it('should add correlation ID to response headers', () => {
      detailedRequestLogger(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'X-Correlation-ID',
        mockReq.correlationId
      );
    });

    it('should record start time for request', () => {
      detailedRequestLogger(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.startTime).toBeDefined();
      expect(mockReq.startTime).toBeGreaterThan(0);
    });

    it('should log incoming request with details', () => {
      detailedRequestLogger(mockReq as Request, mockRes as Response, mockNext);

      expect(loggerInfoSpy).toHaveBeenCalledWith('Incoming request', {
        method: mockReq.method,
        url: mockReq.originalUrl,
        correlationId: mockReq.correlationId,
        ip: mockReq.ip,
        userAgent: mockReq.headers['user-agent'],
        headers: expect.any(Object),
        body: mockReq.body,
        query: mockReq.query,
      });
    });

    it('should call next function', () => {
      detailedRequestLogger(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should log response completion when send is called', () => {
      detailedRequestLogger(mockReq as Request, mockRes as Response, mockNext);

      // Simulate response send
      (mockRes.send as any).call(mockRes);

      expect(loggerInfoSpy).toHaveBeenCalledWith('Request completed', {
        method: mockReq.method,
        url: mockReq.originalUrl,
        correlationId: mockReq.correlationId,
        statusCode: mockRes.statusCode,
        duration: expect.stringMatching(/^\d+ms$/),
        contentLength: mockRes.get('Content-Length'),
        contentType: mockRes.get('Content-Type'),
      });
    });

    it('should log warning for 4xx status codes', () => {
      mockRes.statusCode = 404;

      detailedRequestLogger(mockReq as Request, mockRes as Response, mockNext);
      (mockRes.send as any).call(mockRes);

      expect(loggerWarnSpy).toHaveBeenCalledWith('Request completed', expect.any(Object));
    });

    it('should log error for 5xx status codes', () => {
      mockRes.statusCode = 500;

      detailedRequestLogger(mockReq as Request, mockRes as Response, mockNext);
      (mockRes.send as any).call(mockRes);

      expect(loggerErrorSpy).toHaveBeenCalledWith('Request completed', expect.any(Object));
    });

    it('should clear correlation ID after response is sent', () => {
      detailedRequestLogger(mockReq as Request, mockRes as Response, mockNext);

      expect(getCorrelationId()).toBe(mockReq.correlationId);

      (mockRes.send as any).call(mockRes);

      expect(getCorrelationId()).toBeUndefined();
    });

    it('should sanitize sensitive headers', () => {
      mockReq.headers = {
        ...mockReq.headers,
        authorization: 'Bearer secret-token',
        cookie: 'session=secret',
        'x-api-key': 'secret-key',
      };

      detailedRequestLogger(mockReq as Request, mockRes as Response, mockNext);

      const loggedHeaders = loggerInfoSpy.mock.calls[0][1].headers;
      expect(loggedHeaders.authorization).toBe('[REDACTED]');
      expect(loggedHeaders.cookie).toBe('[REDACTED]');
      expect(loggedHeaders['x-api-key']).toBe('[REDACTED]');
    });

    it('should sanitize sensitive body fields', () => {
      mockReq.body = {
        username: 'testuser',
        password: 'secret-password',
        token: 'secret-token',
      };

      detailedRequestLogger(mockReq as Request, mockRes as Response, mockNext);

      const loggedBody = loggerInfoSpy.mock.calls[0][1].body;
      expect(loggedBody.username).toBe('testuser');
      expect(loggedBody.password).toBe('[REDACTED]');
      expect(loggedBody.token).toBe('[REDACTED]');
    });

    it('should handle missing IP address gracefully', () => {
      mockReq.ip = undefined;
      mockReq.socket = undefined;

      detailedRequestLogger(mockReq as Request, mockRes as Response, mockNext);

      expect(loggerInfoSpy).toHaveBeenCalledWith('Incoming request', expect.any(Object));
    });

    it('should calculate request duration correctly', () => {
      detailedRequestLogger(mockReq as Request, mockRes as Response, mockNext);

      const startTime = mockReq.startTime;

      // Simulate some delay
      jest.advanceTimersByTime(100);

      (mockRes.send as any).call(mockRes);

      const loggedDuration = loggerInfoSpy.mock.calls[1][1].duration;
      expect(loggedDuration).toMatch(/^\d+ms$/);
    });
  });

  describe('Legacy Request Logger', () => {
    it('should log basic request information', () => {
      requestLogger(mockReq as Request, mockRes as Response, mockNext);

      expect(loggerInfoSpy).toHaveBeenCalledWith(
        `${mockReq.method} ${mockReq.originalUrl}`,
        expect.any(Object)
      );
    });

    it('should include correlation ID if set', () => {
      const testCorrelationId = 'test-correlation-id-123';
      setCorrelationId(testCorrelationId);

      requestLogger(mockReq as Request, mockRes as Response, mockNext);

      expect(loggerInfoSpy).toHaveBeenCalledWith(
        `${mockReq.method} ${mockReq.originalUrl}`,
        { correlationId: testCorrelationId }
      );
    });

    it('should not include correlation ID if not set', () => {
      requestLogger(mockReq as Request, mockRes as Response, mockNext);

      expect(loggerInfoSpy).toHaveBeenCalledWith(
        `${mockReq.method} ${mockReq.originalUrl}`,
        {}
      );
    });

    it('should call next function', () => {
      requestLogger(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete request lifecycle', () => {
      mockReq.method = 'POST';
      mockReq.url = '/api/users';
      mockReq.originalUrl = '/api/users';
      mockReq.body = { email: 'test@example.com', password: 'secret' };
      mockReq.headers = {
        ...mockReq.headers,
        'content-type': 'application/json',
        authorization: 'Bearer token',
      };

      detailedRequestLogger(mockReq as Request, mockRes as Response, mockNext);

      // Verify request was logged
      expect(loggerInfoSpy).toHaveBeenCalledWith('Incoming request', expect.any(Object));

      // Simulate response
      mockRes.statusCode = 201;
      (mockRes.send as any).call(mockRes);

      // Verify response was logged
      expect(loggerInfoSpy).toHaveBeenCalledWith('Request completed', expect.any(Object));

      // Verify correlation ID was cleared
      expect(getCorrelationId()).toBeUndefined();
    });

    it('should handle error responses correctly', () => {
      mockReq.method = 'GET';
      mockReq.url = '/api/nonexistent';

      detailedRequestLogger(mockReq as Request, mockRes as Response, mockNext);

      mockRes.statusCode = 404;
      (mockRes.send as any).call(mockRes);

      expect(loggerWarnSpy).toHaveBeenCalledWith('Request completed', expect.any(Object));
    });

    it('should handle server errors correctly', () => {
      mockReq.method = 'GET';
      mockReq.url = '/api/error';

      detailedRequestLogger(mockReq as Request, mockRes as Response, mockNext);

      mockRes.statusCode = 500;
      (mockRes.send as any).call(mockRes);

      expect(loggerErrorSpy).toHaveBeenCalledWith('Request completed', expect.any(Object));
    });
  });
});

// Clean up mocks after all tests
afterAll(() => {
  loggerInfoSpy.mockRestore();
  loggerWarnSpy.mockRestore();
  loggerErrorSpy.mockRestore();
});
