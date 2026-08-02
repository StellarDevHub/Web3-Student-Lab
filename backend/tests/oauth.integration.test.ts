import express from 'express';
import request from 'supertest';
import oauthRouter from '../src/routes/oauth.routes.js';

describe('OAuth integration', () => {
  it('returns a redirect URL for GitHub auth', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/v1/oauth', oauthRouter);

    const response = await request(app)
      .get('/api/v1/oauth/github')
      .expect(302);

    expect(response.headers.location).toContain('github.com/login/oauth/authorize');
    expect(response.headers.location).toContain('client_id=');
    expect(response.headers.location).toContain('state=');
    expect(response.headers.location).toContain('redirect_uri=');
    expect(response.headers.location).toContain('scope=');
  });

  it('rejects callback without authorization code', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/v1/oauth', oauthRouter);

    const response = await request(app)
      .post('/api/v1/oauth/github/callback')
      .send({ state: 'test-state' })
      .expect(400);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toBe('Authorization code is required');
  });

  it('rejects callback without state parameter', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/v1/oauth', oauthRouter);

    const response = await request(app)
      .post('/api/v1/oauth/github/callback')
      .send({ code: 'sample-code' })
      .expect(400);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toBe('State parameter is required');
  });
});
