import request from 'supertest';
import prisma from '../src/db/index.js';
import { app } from '../src/index.js';

// Check if database is available before running tests
let dbAvailable = false;
beforeAll(async () => {
  try {
    await prisma.$connect();
    dbAvailable = true;
  } catch (_error) {
    console.warn('Database not available, skipping user tests');
  }
});

const describeOrSkip = dbAvailable ? describe : describe.skip;

describeOrSkip('User Profile DID Integration Tests', () => {
  beforeEach(async () => {
    if (!dbAvailable) return;
    await prisma.certificate.deleteMany();
    await prisma.enrollment.deleteMany();
    await prisma.student.deleteMany();
  });

  afterAll(async () => {
    if (!dbAvailable) return;
    await prisma.$disconnect();
  });

  it('updates the authenticated student DID and exposes it on the profile', async () => {
    const registerResponse = await request(app).post('/api/v1/auth/register').send({
      email: 'did-user@example.com',
      password: 'password123',
      firstName: 'Did',
      lastName: 'User',
    });

    const token = registerResponse.body.token as string;
    const did = 'did:soroban:testnet:did-user-123#profile';

    const updateResponse = await request(app)
      .put('/api/v1/user/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ did })
      .expect(200);

    expect(updateResponse.body.did).toBe(did);

    const profileResponse = await request(app)
      .get('/api/v1/user/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(profileResponse.body.did).toBe(did);

    const meResponse = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(meResponse.body.user.did).toBe(did);
  });

  it('rejects invalid DID formats on authenticated profile updates', async () => {
    const registerResponse = await request(app).post('/api/v1/auth/register').send({
      email: 'invalid-did@example.com',
      password: 'password123',
      firstName: 'Invalid',
      lastName: 'Did',
    });

    const token = registerResponse.body.token as string;

    const response = await request(app)
      .put('/api/v1/user/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ did: 'https://example.com/not-a-did' })
      .expect(400);

    expect(response.body.error).toContain('Invalid DID format');
  });
});
