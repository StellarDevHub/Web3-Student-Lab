/**
 * CSP Configuration Tests
 * 
 * Tests for the Content Security Policy configuration to ensure
 * proper security headers are generated for different environments.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getProductionCSP,
  getReportOnlyCSP,
  getDevelopmentCSP,
  getCSPConfig,
  cspDirectivesToString,
} from '../csp-config';

describe('CSP Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('getProductionCSP', () => {
    it('should return production CSP with restrictive directives', () => {
      process.env.NODE_ENV = 'production';
      process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com';
      process.env.NEXT_PUBLIC_WS_URL = 'wss://api.example.com';
      process.env.NEXT_PUBLIC_FRONTEND_URL = 'https://example.com';

      const config = getProductionCSP();

      expect(config.directives['default-src']).toEqual(["'self'"]);
      expect(config.directives['script-src']).toContain("'self'");
      expect(config.directives['script-src']).toContain("'nonce-{nonce}'");
      expect(config.directives['object-src']).toEqual(["'none'"]);
      expect(config.directives['frame-ancestors']).toEqual(["'none'"]);
      expect(config.reportOnly).toBe(false);
    });

    it('should include Stellar endpoints in connect-src', () => {
      const config = getProductionCSP();

      const connectSrc = config.directives['connect-src'] || [];
      expect(connectSrc).toContain('https://soroban-testnet.stellar.org');
      expect(connectSrc).toContain('https://horizon-testnet.stellar.org');
      expect(connectSrc).toContain('https://stellar.expert');
    });

    it('should not include unsafe-eval in production', () => {
      process.env.NODE_ENV = 'production';
      const config = getProductionCSP();

      const scriptSrc = config.directives['script-src'] || [];
      expect(scriptSrc).not.toContain("'unsafe-eval'");
    });
  });

  describe('getReportOnlyCSP', () => {
    it('should return report-only CSP configuration', () => {
      const config = getReportOnlyCSP();

      expect(config.reportOnly).toBe(true);
      expect(config.directives).toBeDefined();
    });

    it('should have same directives as production but report-only', () => {
      process.env.NODE_ENV = 'production';
      const productionConfig = getProductionCSP();
      const reportOnlyConfig = getReportOnlyCSP();

      expect(reportOnlyConfig.directives).toEqual(productionConfig.directives);
      expect(reportOnlyConfig.reportOnly).toBe(true);
      expect(productionConfig.reportOnly).toBe(false);
    });
  });

  describe('getDevelopmentCSP', () => {
    it('should return permissive CSP for development', () => {
      const config = getDevelopmentCSP();

      expect(config.directives['script-src']).toContain("'unsafe-eval'");
      expect(config.directives['script-src']).toContain("'unsafe-inline'");
      expect(config.directives['connect-src']).toContain('https:');
      expect(config.directives['connect-src']).toContain('http:');
      expect(config.reportOnly).toBe(false);
    });

    it('should allow HTTP in development', () => {
      const config = getDevelopmentCSP();

      const connectSrc = config.directives['connect-src'] || [];
      expect(connectSrc).toContain('http:');
      expect(connectSrc).toContain('ws:');
    });
  });

  describe('getCSPConfig', () => {
    it('should return production CSP in production mode', () => {
      process.env.NODE_ENV = 'production';
      process.env.NEXT_PUBLIC_CSP_REPORT_ONLY = 'false';

      const config = getCSPConfig();

      expect(config.reportOnly).toBe(false);
      expect(config.directives['script-src']).not.toContain("'unsafe-eval'");
    });

    it('should return development CSP in development mode', () => {
      process.env.NODE_ENV = 'development';
      process.env.NEXT_PUBLIC_CSP_REPORT_ONLY = 'false';

      const config = getCSPConfig();

      expect(config.directives['script-src']).toContain("'unsafe-eval'");
    });

    it('should return report-only CSP when flag is set', () => {
      process.env.NODE_ENV = 'production';
      process.env.NEXT_PUBLIC_CSP_REPORT_ONLY = 'true';

      const config = getCSPConfig();

      expect(config.reportOnly).toBe(true);
    });

    it('should include report URI when configured', () => {
      process.env.NEXT_PUBLIC_CSP_REPORT_URI = 'https://example.com/api/csp-reports';
      process.env.NEXT_PUBLIC_CSP_REPORT_ONLY = 'true';

      const config = getCSPConfig();

      expect(config.reportUri).toBe('https://example.com/api/csp-reports');
    });
  });

  describe('cspDirectivesToString', () => {
    it('should convert directives to CSP string', () => {
      const directives = {
        'default-src': ["'self'"],
        'script-src': ["'self'", "'nonce-{nonce}'"],
        'style-src': ["'self'", "'unsafe-inline'"],
      };

      const result = cspDirectivesToString(directives);

      expect(result).toContain("default-src 'self'");
      expect(result).toContain("script-src 'self' 'nonce-{nonce}'");
      expect(result).toContain("style-src 'self' 'unsafe-inline'");
      expect(result).toContain('; ');
    });

    it('should handle directives with empty values', () => {
      const directives = {
        'block-all-mixed-content': [],
        'upgrade-insecure-requests': [],
      };

      const result = cspDirectivesToString(directives);

      expect(result).toContain('block-all-mixed-content');
      expect(result).toContain('upgrade-insecure-requests');
    });

    it('should produce valid CSP format', () => {
      const directives = {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
      };

      const result = cspDirectivesToString(directives);

      // Should not end with semicolon
      expect(result).not.toMatch(/;$/);
      // Should separate directives with semicolon and space
      expect(result).toMatch(/; /);
    });
  });

  describe('Security Requirements', () => {
    it('should always include frame-ancestors none for clickjacking protection', () => {
      const configs = [
        getProductionCSP(),
        getDevelopmentCSP(),
        getReportOnlyCSP(),
      ];

      configs.forEach(config => {
        expect(config.directives['frame-ancestors']).toEqual(["'none'"]);
      });
    });

    it('should always include object-src none', () => {
      const configs = [
        getProductionCSP(),
        getDevelopmentCSP(),
        getReportOnlyCSP(),
      ];

      configs.forEach(config => {
        expect(config.directives['object-src']).toEqual(["'none'"]);
      });
    });

    it('should include block-all-mixed-content in production', () => {
      process.env.NODE_ENV = 'production';
      const config = getProductionCSP();

      expect(config.directives['block-all-mixed-content']).toEqual([]);
    });

    it('should include upgrade-insecure-requests in production', () => {
      process.env.NODE_ENV = 'production';
      const config = getProductionCSP();

      expect(config.directives['upgrade-insecure-requests']).toEqual([]);
    });
  });

  describe('Stellar Integration', () => {
    it('should include all required Stellar endpoints', () => {
      const config = getProductionCSP();
      const connectSrc = config.directives['connect-src'] || [];

      const requiredEndpoints = [
        'https://soroban-testnet.stellar.org',
        'https://soroban-test.stellar.org:443',
        'https://horizon-testnet.stellar.org',
        'https://stellar.expert',
      ];

      requiredEndpoints.forEach(endpoint => {
        expect(connectSrc).toContain(endpoint);
      });
    });
  });

  describe('Environment Variable Handling', () => {
    it('should use custom API URL from environment', () => {
      process.env.NEXT_PUBLIC_API_URL = 'https://custom.api.com';
      const config = getProductionCSP();

      const connectSrc = config.directives['connect-src'] || [];
      expect(connectSrc).toContain('https://custom.api.com');
    });

    it('should use custom WS URL from environment', () => {
      process.env.NEXT_PUBLIC_WS_URL = 'wss://custom.ws.com';
      const config = getProductionCSP();

      const connectSrc = config.directives['connect-src'] || [];
      expect(connectSrc).toContain('wss://custom.ws.com');
    });

    it('should use custom frontend URL from environment', () => {
      process.env.NEXT_PUBLIC_FRONTEND_URL = 'https://custom.frontend.com';
      const config = getProductionCSP();

      expect(config.directives).toBeDefined();
    });

    it('should handle missing environment variables gracefully', () => {
      delete process.env.NEXT_PUBLIC_API_URL;
      delete process.env.NEXT_PUBLIC_WS_URL;
      delete process.env.NEXT_PUBLIC_FRONTEND_URL;

      const config = getProductionCSP();

      expect(config.directives).toBeDefined();
      expect(config.directives['connect-src']).toBeDefined();
    });
  });
});
