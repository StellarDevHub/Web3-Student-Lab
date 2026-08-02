import {
  validateEnvironment,
  EnvironmentValidationError,
  getEnvVar,
  isProduction,
  isDevelopment,
  isTest,
} from '../src/utils/checkEnv.js';

// Mock process.env
const originalEnv = process.env;

describe('Environment Variable Guard', () => {
  beforeEach(() => {
    // Reset process.env before each test
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    // Restore original process.env
    process.env = originalEnv;
  });

  describe('validateEnvironment', () => {
    it('should pass validation with all required variables', () => {
      // Set valid environment variables
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
      process.env.JWT_SECRET = 'this-is-a-very-long-secret-key-that-is-at-least-32-chars';
      process.env.NODE_ENV = 'development';
      process.env.REDIS_URL = 'redis://localhost:6379';

      // Should not throw an error
      expect(() => validateEnvironment()).not.toThrow();
    });

    it('should throw error for missing DATABASE_URL', () => {
      process.env.JWT_SECRET = 'this-is-a-very-long-secret-key-that-is-at-least-32-chars';
      process.env.NODE_ENV = 'test';
      delete process.env.DATABASE_URL;

      expect(() => validateEnvironment()).toThrow(EnvironmentValidationError);
    });

    it('should throw error for missing JWT_SECRET', () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
      process.env.NODE_ENV = 'test';
      delete process.env.JWT_SECRET;

      expect(() => validateEnvironment()).toThrow(EnvironmentValidationError);
    });

    it('should throw error for invalid JWT_SECRET (too short)', () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
      process.env.JWT_SECRET = 'short';
      process.env.NODE_ENV = 'test';

      expect(() => validateEnvironment()).toThrow(EnvironmentValidationError);
      expect(() => validateEnvironment()).toThrow(
        /Invalid value for environment variable: JWT_SECRET/
      );
    });

    it('should throw error for default JWT_SECRET value', () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
      process.env.JWT_SECRET = 'your-secret-key-change-in-production';
      process.env.NODE_ENV = 'test';

      expect(() => validateEnvironment()).toThrow(EnvironmentValidationError);
      expect(() => validateEnvironment()).toThrow(
        /Invalid value for environment variable: JWT_SECRET/
      );
    });

    it('should throw error for invalid DATABASE_URL format', () => {
      process.env.DATABASE_URL = 'invalid-url-format';
      process.env.JWT_SECRET = 'this-is-a-very-long-secret-key-that-is-at-least-32-chars';
      process.env.NODE_ENV = 'test';

      expect(() => validateEnvironment()).toThrow(EnvironmentValidationError);
      expect(() => validateEnvironment()).toThrow(
        /Invalid value for environment variable: DATABASE_URL/
      );
    });

    it('should require production variables in production environment', () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
      process.env.JWT_SECRET = 'this-is-a-very-long-secret-key-that-is-at-least-32-chars';
      process.env.NODE_ENV = 'production';
      process.env.REDIS_URL = 'redis://localhost:6379';
      // Missing production variables

      expect(() => validateEnvironment()).toThrow(EnvironmentValidationError);
      expect(() => validateEnvironment()).toThrow(
        /Missing required environment variable: STELLAR_ISSUER_SECRET_KEY/
      );
    });

    it('should pass production validation with all required variables', () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
      process.env.JWT_SECRET = 'this-is-a-very-long-secret-key-that-is-at-least-32-chars';
      process.env.NODE_ENV = 'production';
      process.env.REDIS_URL = 'redis://localhost:6379';
      process.env.STELLAR_ISSUER_SECRET_KEY = 'production-secret-key';
      process.env.STELLAR_ISSUER_PUBLIC_KEY = 'production-public-key';

      expect(() => validateEnvironment()).not.toThrow();
    });

    it('should set default values for optional variables', () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
      process.env.JWT_SECRET = 'this-is-a-very-long-secret-key-that-is-at-least-32-chars';
      process.env.NODE_ENV = 'development';
      process.env.REDIS_URL = 'redis://localhost:6379';

      // Clear some optional variables
      delete process.env.PORT;
      delete process.env.STELLAR_NETWORK;

      validateEnvironment();

      expect(process.env.PORT).toBe('8080');
      expect(process.env.STELLAR_NETWORK).toBe('testnet');
    });

    it('should not override existing optional variables', () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
      process.env.JWT_SECRET = 'this-is-a-very-long-secret-key-that-is-at-least-32-chars';
      process.env.NODE_ENV = 'development';
      process.env.REDIS_URL = 'redis://localhost:6379';
      process.env.PORT = '3000';
      process.env.STELLAR_NETWORK = 'mainnet';

      validateEnvironment();

      expect(process.env.PORT).toBe('3000');
      expect(process.env.STELLAR_NETWORK).toBe('mainnet');
    });
  });

  describe('getEnvVar', () => {
    it('should return existing environment variable', () => {
      process.env.TEST_VAR = 'test-value';
      expect(getEnvVar('TEST_VAR')).toBe('test-value');
    });

    it('should return default value if variable is missing', () => {
      delete process.env.TEST_VAR;
      expect(getEnvVar('TEST_VAR', 'default-value')).toBe('default-value');
    });

    it('should throw error if variable is missing and no default provided', () => {
      delete process.env.TEST_VAR;
      expect(() => getEnvVar('TEST_VAR')).toThrow(EnvironmentValidationError);
    });

    it('should return empty string if variable exists but is empty and no default', () => {
      process.env.TEST_VAR = '';
      expect(() => getEnvVar('TEST_VAR')).toThrow(EnvironmentValidationError);
    });

    it('should return default if variable exists but is empty', () => {
      process.env.TEST_VAR = '';
      expect(getEnvVar('TEST_VAR', 'default')).toBe('default');
    });
  });

  describe('environment helpers', () => {
    it('should correctly identify production environment', () => {
      process.env.NODE_ENV = 'production';
      expect(isProduction()).toBe(true);
      expect(isDevelopment()).toBe(false);
      expect(isTest()).toBe(false);
    });

    it('should correctly identify development environment', () => {
      process.env.NODE_ENV = 'development';
      expect(isProduction()).toBe(false);
      expect(isDevelopment()).toBe(true);
      expect(isTest()).toBe(false);
    });

    it('should correctly identify test environment', () => {
      process.env.NODE_ENV = 'test';
      expect(isProduction()).toBe(false);
      expect(isDevelopment()).toBe(false);
      expect(isTest()).toBe(true);
    });

    it('should handle undefined NODE_ENV', () => {
      delete process.env.NODE_ENV;
      expect(isProduction()).toBe(false);
      expect(isDevelopment()).toBe(false);
      expect(isTest()).toBe(false);
    });
  });
});
