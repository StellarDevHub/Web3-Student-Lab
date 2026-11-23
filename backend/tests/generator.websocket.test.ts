import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';
import generatorRouter from '../src/routes/generator/generator.routes.js';

jest.mock('../src/websocket/gateway.js', () => ({
  broadcastEvent: jest.fn().mockResolvedValue(undefined),
}));

describe('Generator websocket integration', () => {
  it('adds a websocket subscription payload when requested', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/v1/generator', generatorRouter);

    const response = await request(app)
      .post('/api/v1/generator/generate')
      .send({
        theme: 'Climate',
        techStack: ['Rust'],
        difficulty: 'Intermediate',
        subscribeToUpdates: true,
      })
      .expect(200);

    expect(response.body).toHaveProperty('subscription');
    expect(response.body.subscription.channel).toBe('generator:ideas');
  });
});
