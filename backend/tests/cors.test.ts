import request from 'supertest';
import { app } from '../src/index';

describe('CORS Middleware', () => {
  describe('preflight requests', () => {
    it('returns 204 for an allowed origin', async () => {
      const response = await request(app)
        .options('/health')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'GET');

      expect(response.status).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    });

    it('omits access-control headers for an unlisted origin', async () => {
      const response = await request(app)
        .options('/health')
        .set('Origin', 'https://malicious.example')
        .set('Access-Control-Request-Method', 'GET');

      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('simple cross-origin requests', () => {
    it('sets CORS headers for allowed origins', async () => {
      const response = await request(app)
        .get('/health')
        .set('Origin', 'http://localhost:3000');

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('omits CORS headers for blocked origins', async () => {
      const response = await request(app)
        .get('/health')
        .set('Origin', 'https://malicious.example');

      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
