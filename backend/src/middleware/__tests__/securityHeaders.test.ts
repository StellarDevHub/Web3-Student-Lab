/**
 * Security Headers Middleware Tests
 * 
 * Tests for the security headers middleware to ensure
 * proper security headers are applied to API responses.
 */

import { Request, Response, NextFunction } from 'express';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { securityHeadersMiddleware, cspReportOnlyMiddleware } from '../securityHeaders';

describe('Security Headers Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {};
    mockRes = {
      setHeader: jest.fn(),
      removeHeader: jest.fn(),
    };
    mockNext = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('securityHeadersMiddleware', () => {
    it('should add all security headers to response', () => {
      securityHeadersMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should set X-Content-Type-Options to nosniff', () => {
      securityHeadersMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    });

    it('should set X-Frame-Options to DENY', () => {
      securityHeadersMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
    });

    it('should set X-XSS-Protection', () => {
      securityHeadersMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
    });

    it('should set Referrer-Policy', () => {
      securityHeadersMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Referrer-Policy',
        'strict-origin-when-cross-origin'
      );
    });

    it('should set Permissions-Policy with restricted features', () => {
      securityHeadersMiddleware(mockReq as Request, mockRes as Response, mockNext);

      const permissionsPolicy = 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=()';
      expect(mockRes.setHeader).toHaveBeenCalledWith('Permissions-Policy', permissionsPolicy);
    });

    it('should set Content-Security-Policy', () => {
      securityHeadersMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        expect.stringContaining('Content-Security-Policy'),
        expect.any(String)
      );
    });

    it('should include frame-ancestors none in CSP', () => {
      securityHeadersMiddleware(mockReq as Request, mockRes as Response, mockNext);

      const cspCall = mockRes.setHeader.mock.calls.find(
        (call) => call[0] === 'Content-Security-Policy'
      );
      expect(cspCall).toBeDefined();
      expect(cspCall![1]).toContain("frame-ancestors 'none'");
    });

    it('should remove X-Powered-By header', () => {
      securityHeadersMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.removeHeader).toHaveBeenCalledWith('X-Powered-By');
    });

    it('should call next middleware', () => {
      securityHeadersMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    describe('Production Mode', () => {
      const originalEnv = process.env;

      beforeEach(() => {
        process.env = { ...originalEnv };
      });

      afterEach(() => {
        process.env = originalEnv;
      });

      it('should set HSTS header in production', () => {
        process.env.NODE_ENV = 'production';
        process.env.CORS_ORIGIN = 'https://example.com';

        securityHeadersMiddleware(mockReq as Request, mockRes as Response, mockNext);

        expect(mockRes.setHeader).toHaveBeenCalledWith(
          'Strict-Transport-Security',
          'max-age=31536000; includeSubDomains; preload'
        );
      });

      it('should not set HSTS header in development', () => {
        process.env.NODE_ENV = 'development';

        securityHeadersMiddleware(mockReq as Request, mockRes as Response, mockNext);

        const hstsCall = mockRes.setHeader.mock.calls.find(
          (call) => call[0] === 'Strict-Transport-Security'
        );
        expect(hstsCall).toBeUndefined();
      });
    });

    describe('CSP Configuration', () => {
      const originalEnv = process.env;

      beforeEach(() => {
        process.env = { ...originalEnv };
      });

      afterEach(() => {
        process.env = originalEnv;
      });

      it('should use FRONTEND_URL from environment', () => {
        process.env.FRONTEND_URL = 'https://custom-frontend.com';
        process.env.NODE_ENV = 'production';

        securityHeadersMiddleware(mockReq as Request, mockRes as Response, mockNext);

        const cspCall = mockRes.setHeader.mock.calls.find(
          (call) => call[0] === 'Content-Security-Policy'
        );
        expect(cspCall).toBeDefined();
        expect(cspCall![1]).toContain('https://custom-frontend.com');
      });

      it('should use CORS_ORIGIN as fallback if FRONTEND_URL not set', () => {
        delete process.env.FRONTEND_URL;
        process.env.CORS_ORIGIN = 'https://cors-origin.com';
        process.env.NODE_ENV = 'production';

        securityHeadersMiddleware(mockReq as Request, mockRes as Response, mockNext);

        const cspCall = mockRes.setHeader.mock.calls.find(
          (call) => call[0] === 'Content-Security-Policy'
        );
        expect(cspCall).toBeDefined();
      });

      it('should be more permissive in development', () => {
        process.env.NODE_ENV = 'development';

        securityHeadersMiddleware(mockReq as Request, mockRes as Response, mockNext);

        const cspCall = mockRes.setHeader.mock.calls.find(
          (call) => call[0] === 'Content-Security-Policy'
        );
        expect(cspCall).toBeDefined();
        expect(cspCall![1]).toContain('connect-src');
      });
    });
  });

  describe('cspReportOnlyMiddleware', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should not add report-only header when flag is not set', () => {
      delete process.env.CSP_REPORT_ONLY;

      cspReportOnlyMiddleware(mockReq as Request, mockRes as Response, mockNext);

      const reportOnlyCall = mockRes.setHeader.mock.calls.find(
        (call) => call[0] === 'Content-Security-Policy-Report-Only'
      );
      expect(reportOnlyCall).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should add report-only header when flag is set to true', () => {
      process.env.CSP_REPORT_ONLY = 'true';

      cspReportOnlyMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Security-Policy-Report-Only',
        expect.any(String)
      );
    });

    it('should include report URI when configured', () => {
      process.env.CSP_REPORT_ONLY = 'true';
      process.env.CSP_REPORT_URI = 'https://example.com/api/csp-reports';

      cspReportOnlyMiddleware(mockReq as Request, mockRes as Response, mockNext);

      const reportOnlyCall = mockRes.setHeader.mock.calls.find(
        (call) => call[0] === 'Content-Security-Policy-Report-Only'
      );
      expect(reportOnlyCall).toBeDefined();
      expect(reportOnlyCall![1]).toContain('report-uri');
      expect(reportOnlyCall![1]).toContain('https://example.com/api/csp-reports');
    });

    it('should call next middleware', () => {
      process.env.CSP_REPORT_ONLY = 'true';

      cspReportOnlyMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
    });
  });

  describe('Security Requirements', () => {
    it('should always set clickjacking protection headers', () => {
      securityHeadersMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
      
      const cspCall = mockRes.setHeader.mock.calls.find(
        (call) => call[0] === 'Content-Security-Policy'
      );
      expect(cspCall![1]).toContain("frame-ancestors 'none'");
    });

    it('should always set MIME sniffing protection', () => {
      securityHeadersMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    });

    it('should always set XSS protection', () => {
      securityHeadersMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
    });

    it('should always restrict browser features via Permissions-Policy', () => {
      securityHeadersMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Permissions-Policy',
        expect.stringContaining('camera=()')
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Permissions-Policy',
        expect.stringContaining('microphone=()')
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Permissions-Policy',
        expect.stringContaining('geolocation=()')
      );
    });
  });
});
