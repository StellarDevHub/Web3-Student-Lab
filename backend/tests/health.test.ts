import request from 'supertest';
import { app } from '../src/index';
import { checkReadiness } from '../src/db/readinessMonitor';

jest.mock('../src/db/readinessMonitor.js', () => ({
  checkReadiness: jest.fn(),
}));

const mockedCheckReadiness = checkReadiness as jest.Mock;

const readyResult = {
  status: 'ready',
  checks: {
    database: { status: 'ready', latencyMs: 3 },
    redis: { status: 'ready', latencyMs: 2 },
  },
  checkedAt: '2026-07-31T12:00:00.000Z',
};

const notReadyResult = {
  status: 'not_ready',
  checks: {
    database: { status: 'ready', latencyMs: 3 },
    redis: { status: 'unavailable', latencyMs: 3000, error: 'redis unavailable' },
  },
  checkedAt: '2026-07-31T12:00:00.000Z',
};

describe('Health Endpoint Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health', () => {
    it('should return 200 and health status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status');
      expect(response.body.status).toBe('ok');
    });

    it('should return Web3 Student Lab Backend message', async () => {
      const response = await request(app).get('/health');

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toBe('Web3 Student Lab Backend is running');
    });

    it('should return uptime and version', async () => {
      const response = await request(app).get('/health');

      expect(response.body).toHaveProperty('uptime');
      expect(typeof response.body.uptime).toBe('number');
      expect(response.body).toHaveProperty('version');
      expect(response.body.version).toBe('1.0.0');
    });

    it('should return JSON content type', async () => {
      const response = await request(app).get('/health');

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });
  });

  describe('GET /health/live', () => {
    it('should return 200 with ok status', async () => {
      const response = await request(app).get('/health/live');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(response.body).toHaveProperty('uptime');
      expect(typeof response.body.uptime).toBe('number');
      expect(response.body).toHaveProperty('version');
      expect(response.body.version).toBe('1.0.0');
      expect(response.headers['content-type']).toMatch(/application\/json/);
    });

    it('should succeed without making any dependency calls', async () => {
      const response = await request(app).get('/health/live');

      expect(response.status).toBe(200);
      expect(mockedCheckReadiness).not.toHaveBeenCalled();
    });
  });

  describe('GET /health/ready', () => {
    it('should return 200 when all dependencies are ready', async () => {
      mockedCheckReadiness.mockResolvedValueOnce(readyResult);

      const response = await request(app).get('/health/ready');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ready');
      expect(response.body.checks.database.status).toBe('ready');
      expect(response.body.checks.redis.status).toBe('ready');
    });

    it('should return 503 when a required dependency is unavailable', async () => {
      mockedCheckReadiness.mockResolvedValueOnce(notReadyResult);

      const response = await request(app).get('/health/ready');

      expect(response.status).toBe(503);
      expect(response.body.status).toBe('not_ready');
      expect(response.body.checks.database.status).toBe('ready');
      expect(response.body.checks.redis.status).toBe('unavailable');
      expect(response.body.checks.redis.error).toBe('redis unavailable');
    });

    it('should return 503 without leaking details when the check fails unexpectedly', async () => {
      mockedCheckReadiness.mockRejectedValueOnce(new Error('postgres://user:secret@db:5432 exploded'));

      const response = await request(app).get('/health/ready');

      expect(response.status).toBe(503);
      expect(response.body.status).toBe('not_ready');
      expect(JSON.stringify(response.body)).not.toContain('postgres://');
      expect(response.body.checks.database.error).toBe('database unavailable');
    });
  });

  describe('404 Handling', () => {
    it('should return 404 for non-existent routes', async () => {
      const response = await request(app).get('/non-existent-route');

      expect(response.status).toBe(404);
    });
  });
});
