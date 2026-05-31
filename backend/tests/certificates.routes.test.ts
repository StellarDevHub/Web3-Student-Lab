import request from 'supertest';
import { app } from '../src/index.js';

describe('Certificate route validation', () => {
  it('rejects mint requests missing required fields', async () => {
    const response = await request(app).post('/api/v1/certificates').send({ courseId: 'course-101' });

    expect(response.status).toBe(400);
    expect(response.body.status).toBe('error');
    expect(response.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'studentId' }),
      ])
    );
  });

  it('rejects mint requests with invalid tokenId and DID formats', async () => {
    const response = await request(app).post('/api/v1/certificates').send({
      studentId: 'student-101',
      courseId: 'course-101',
      tokenId: 'bad token!',
      did: 'invalid-did',
    });

    expect(response.status).toBe(400);
    expect(response.body.status).toBe('error');
    expect(response.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'tokenId' }),
        expect.objectContaining({ field: 'did' }),
      ])
    );
  });
});
