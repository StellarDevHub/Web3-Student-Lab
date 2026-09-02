import request from 'supertest';
import { app } from '../src/index';

describe('Lottery Router API Versioning Integration Tests', () => {
  describe('GET /api/v1/lottery and GET /api/v2/lottery', () => {
    it('should respond to v1 lottery endpoint with valid lottery details', async () => {
      const response = await request(app)
        .get('/api/v1/lottery')
        .set('x-workspace-id', 'test-workspace');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('lotteryId');
    });

    it('should respond to v2 lottery endpoint with valid lottery details', async () => {
      const response = await request(app)
        .get('/api/v2/lottery')
        .set('x-workspace-id', 'test-workspace');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('lotteryId');
    });

    it('should return identical data contract for v1 and v2 shared router', async () => {
      const responseV1 = await request(app)
        .get('/api/v1/lottery')
        .set('x-workspace-id', 'test-workspace');

      const responseV2 = await request(app)
        .get('/api/v2/lottery')
        .set('x-workspace-id', 'test-workspace');

      expect(responseV1.status).toBe(200);
      expect(responseV2.status).toBe(200);
      expect(responseV1.body).toEqual(responseV2.body);
    });
  });

  describe('POST /api/v1/lottery/tickets and POST /api/v2/lottery/tickets', () => {
    it('should allow purchasing tickets via v1 lottery endpoint', async () => {
      const response = await request(app)
        .post('/api/v1/lottery/tickets')
        .set('x-workspace-id', 'test-workspace')
        .send({ amount: 3 });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body.data).toHaveProperty('ticketsPurchased', 3);
    });

    it('should allow purchasing tickets via v2 lottery endpoint', async () => {
      const response = await request(app)
        .post('/api/v2/lottery/tickets')
        .set('x-workspace-id', 'test-workspace')
        .send({ amount: 5 });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body.data).toHaveProperty('ticketsPurchased', 5);
    });
  });
});
