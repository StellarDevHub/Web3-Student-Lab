// Jest setup file for global test configuration
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgres://dummy:dummy@localhost:5432/dummy';
process.env.JWT_SECRET = 'test-secret-key';
process.env.REDIS_URL = 'redis://localhost:6379';
