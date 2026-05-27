import request from 'supertest';
import { app } from '../src/index';

describe('Health Endpoint Integration Tests', () => {
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

  describe('404 Handling', () => {
    it('should return 404 for non-existent routes', async () => {
      const response = await request(app).get('/non-existent-route');

      expect(response.status).toBe(404);
    });
  });
});
