import express from 'express';
import request from 'supertest';
import generatorRouter from '../src/routes/generator/generator.routes.js';

describe('Generator rate limiting', () => {
  it('rejects repeated generation attempts when the rate limit is exceeded', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/v1/generator', generatorRouter);

    for (let index = 0; index < 3; index += 1) {
      await request(app)
        .post('/api/v1/generator/generate')
        .send({ theme: 'Climate', techStack: ['Rust'], difficulty: 'Intermediate' });
    }

    const response = await request(app)
      .post('/api/v1/generator/generate')
      .send({ theme: 'Climate', techStack: ['Rust'], difficulty: 'Intermediate' })
      .expect(429);

    expect(response.body.error).toContain('rate limit');
  });
});
