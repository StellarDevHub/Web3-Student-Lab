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

    it('blocks requests with null origin with 403', async () => {
      const response = await request(app)
        .get('/health')
        .set('Origin', 'null');

      expect(response.status).toBe(403);
    });

    it('allows requests without an Origin header', async () => {
      const response = await request(app)
        .get('/health');

      expect(response.status).toBe(200);
    });
  });

  describe('preview subdomain validation', () => {
    const originalEnv = process.env.CORS_ALLOWED_PREVIEW_SUBDOMAINS;

    beforeEach(() => {
      process.env.CORS_ALLOWED_PREVIEW_SUBDOMAINS = 'vercel.app,netlify.app';
    });

    afterEach(() => {
      process.env.CORS_ALLOWED_PREVIEW_SUBDOMAINS = originalEnv;
    });

    it('allows exact preview subdomain matches', async () => {
      const response = await request(app)
        .get('/health')
        .set('Origin', 'https://project.vercel.app');

      expect(response.headers['access-control-allow-origin']).toBe('https://project.vercel.app');
    });

    it('allows nested preview subdomain matches', async () => {
      const response = await request(app)
        .get('/health')
        .set('Origin', 'https://branch-123.project.vercel.app');

      expect(response.headers['access-control-allow-origin']).toBe('https://branch-123.project.vercel.app');
    });
  });

  describe('preflight caching', () => {
    it('sets max-age preflight cache directive', async () => {
      const response = await request(app)
        .options('/health')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'GET');

      expect(response.headers['access-control-max-age']).toBe('86400');
    });
  });
});
