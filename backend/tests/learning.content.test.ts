import request from 'supertest';
import { describe, expect, it, beforeAll, afterAll, jest } from '@jest/globals';
import { app } from '../src/index.js';
import prisma from '../src/db/index.js';

describe('Decentralized Storage Lesson Content API Tests', () => {
  const workspaceId = 'default';
  const lessonId = 'lesson-ipfs-test';
  const cid = 'bafy-mock-cid-lesson-content';
  let assetId: string;
  const originalFetch = global.fetch;

  beforeAll(async () => {
    // Mock global fetch to return a mock markdown content
    global.fetch = jest.fn().mockImplementation(() => {
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve('# Test Lesson\n\nWelcome to this **decentralized** lesson.\n\n```javascript\nconst a = 42;\n```'),
      } as Response);
    }) as any;

    // Create a mock DecentralizedAsset in the DB
    const asset = await prisma.decentralizedAsset.create({
      data: {
        workspaceId,
        resourceType: 'lesson',
        resourceId: lessonId,
        name: 'content.md',
        kind: 'generic',
        provider: 'pinata',
        cid,
        ipfsUri: `ipfs://${cid}`,
        gatewayUrl: `https://gateway.pinata.cloud/ipfs/${cid}`,
        status: 'pinned',
      },
    });
    assetId = asset.id;
  });

  afterAll(async () => {
    // Restore global fetch
    global.fetch = originalFetch;

    // Cleanup DB
    if (assetId) {
      await prisma.decentralizedAsset.deleteMany({
        where: { id: assetId },
      }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it('should retrieve and parse decentralized lesson content successfully', async () => {
    const response = await request(app)
      .get(`/api/v1/learning/courses/course-1/lessons/${lessonId}/content`)
      .set('x-workspace-id', workspaceId);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('html');
    expect(response.body).toHaveProperty('codeBlocks');

    // HTML should be parsed and sanitized
    expect(response.body.html).toContain('<h1>Test Lesson</h1>');
    expect(response.body.html).toContain('<strong>decentralized</strong>');

    // Code blocks should be extracted
    expect(response.body.codeBlocks).toHaveLength(1);
    expect(response.body.codeBlocks[0]).toEqual({
      language: 'javascript',
      code: 'const a = 42;',
    });
  });

  it('should return 404 if decentralized content asset does not exist', async () => {
    const response = await request(app)
      .get('/api/v1/learning/courses/course-1/lessons/non-existent-lesson/content')
      .set('x-workspace-id', workspaceId);

    expect(response.status).toBe(404);
    expect(response.body.error).toContain('not found');
  });
});
