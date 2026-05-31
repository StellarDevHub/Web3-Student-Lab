import { EnvironmentValidationError } from '../src/utils/checkEnv.js';

// We mock process.env in each test and test maskSecret and getSafeConfig
describe('Environment Configuration Management', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let config: any;

  beforeAll(async () => {
    originalEnv = { ...process.env };
    // Set some variables so it doesn't fail on import
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost/db';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.JWT_SECRET = 'very-long-and-secure-test-secret-key';
    process.env.STELLAR_ISSUER_SECRET_KEY = 'secret-key-of-stellar';

    const configModule = await import('../src/config/env.config.js');
    config = configModule.config;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should load variables safely', () => {
    expect(config.app.env).toBe('development');
    expect(config.app.port).toBe(8080);
    expect(config.db.url).toBe('postgresql://user:pass@localhost/db');
  });

  it('should mask secrets correctly in getSafeConfig', () => {
    const safeConfig = config.getSafeConfig();
    expect(safeConfig.security.jwtSecret).toBe('***REDACTED***');
    expect(safeConfig.stellar.issuerSecretKey).toBe('***REDACTED***');
    expect(safeConfig.db.url).toBe('pos.../db');
  });

  it('maskSecret should return correct masked string', () => {
    expect(config.maskSecret('')).toBe('');
    expect(config.maskSecret('short')).toBe('***REDACTED***');
    expect(config.maskSecret('thisIsALongSecret123')).toBe('thi...123');
  });
});

