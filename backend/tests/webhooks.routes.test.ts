import request from 'supertest';
import { app } from '../src/index.js';
import prisma from '../src/db/index.js';

describe('Webhooks Subscription Route Integration Tests', () => {
  const workspaceA = 'workspace-a';
  const workspaceB = 'workspace-b';
  let createdId: string;

  afterAll(async () => {
    // Clean up
    if (createdId) {
      await prisma.webhookSubscription.deleteMany({
        where: { id: createdId },
      }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it('should create a webhook subscription', async () => {
    const response = await request(app)
      .post('/api/v1/webhooks/subscriptions')
      .set('x-workspace-id', workspaceA)
      .send({
        url: 'https://example.com/webhook-a',
        events: ['lesson.completed'],
        secret: 'supersecret',
      });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('id');
    expect(response.body.url).toBe('https://example.com/webhook-a');
    expect(response.body.events).toEqual(['lesson.completed']);
    expect(response.body.active).toBe(true);
    createdId = response.body.id;
  });

  it('should reject invalid subscription payload', async () => {
    const response = await request(app)
      .post('/api/v1/webhooks/subscriptions')
      .set('x-workspace-id', workspaceA)
      .send({
        url: 'not-a-url',
        events: [],
      });

    expect(response.status).toBe(400);
  });

  it('should list subscriptions for the active workspace', async () => {
    const response = await request(app)
      .get('/api/v1/webhooks/subscriptions')
      .set('x-workspace-id', workspaceA);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    const sub = response.body.find((s: any) => s.id === createdId);
    expect(sub).toBeDefined();
    expect(sub.url).toBe('https://example.com/webhook-a');
  });

  it('should strictly isolate subscriptions across workspaces', async () => {
    const response = await request(app)
      .get('/api/v1/webhooks/subscriptions')
      .set('x-workspace-id', workspaceB);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    const sub = response.body.find((s: any) => s.id === createdId);
    expect(sub).toBeUndefined(); // Workspace B cannot see workspace A's subscription
  });

  it('should delete a webhook subscription', async () => {
    const response = await request(app)
      .delete(`/api/v1/webhooks/subscriptions/${createdId}`)
      .set('x-workspace-id', workspaceA);

    expect(response.status).toBe(204);

    // Verify it is deleted
    const getResponse = await request(app)
      .get('/api/v1/webhooks/subscriptions')
      .set('x-workspace-id', workspaceA);
    const sub = getResponse.body.find((s: any) => s.id === createdId);
    expect(sub).toBeUndefined();
  });
});
