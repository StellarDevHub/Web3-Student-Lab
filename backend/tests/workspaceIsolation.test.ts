import request from 'supertest';
import { app } from '../src/index';
import prisma from '../src/db/index';

describe('Workspace Isolation Security Tests', () => {
  const workspaceA = 'workspace-a';
  const workspaceB = 'workspace-b';

  afterAll(async () => {
    // Cleanup test data
    try {
      // We use the raw prisma client to bypass isolation for cleanup if needed,
      // but here we can just delete by email which is unique.
      // Actually, we should probably just leave it or use a transaction that rolls back.
      // For now, let's just ensure we disconnect.
    } catch (e) {
      console.error('Cleanup failed', e);
    }
    await prisma.$disconnect();
  });

  describe('Data Access Isolation', () => {
    it('should not allow access to records from another workspace', async () => {
      // 1. Create a student in Workspace A
      const createResponse = await request(app)
        .post('/api/v1/students')
        .set('x-workspace-id', workspaceA)
        .send({
          email: `test-isolation-${Date.now()}@example.com`,
          firstName: 'Isolation',
          lastName: 'Test',
        });

      expect(createResponse.status).toBe(201);
      const studentId = createResponse.body.id;

      // 2. Attempt to fetch the student from Workspace B
      const getResponse = await request(app)
        .get(`/api/v1/students/${studentId}`)
        .set('x-workspace-id', workspaceB);

      // Should be 404 because Workspace B cannot see records in Workspace A
      expect(getResponse.status).toBe(404);
    });

    it('should fail if x-workspace-id header is missing', async () => {
      const response = await request(app)
        .get('/api/v1/students');

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/x-workspace-id/i);
    });

    it('should strictly isolate updates across workspaces', async () => {
       // 1. Create student in Workspace A
       const createResponse = await request(app)
        .post('/api/v1/students')
        .set('x-workspace-id', workspaceA)
        .send({
          email: `update-isolation-${Date.now()}@example.com`,
          firstName: 'Original',
          lastName: 'Student',
        });
       
       const studentId = createResponse.body.id;

       // 2. Try to update it from Workspace B
       const updateResponse = await request(app)
        .put(`/api/v1/students/${studentId}`)
        .set('x-workspace-id', workspaceB)
        .send({
          firstName: 'Hacked',
        });

       // Our Prisma extension makes it so that .update({ where: { id, workspaceId: 'B' } }) 
       // fails to find the record, which usually throws a P2025 error in Prisma.
       // The route catches this and returns a 500 (based on students.ts implementation).
       expect(updateResponse.status).toBe(500);
    });

    it('should strictly isolate deletions across workspaces', async () => {
       // 1. Create student in Workspace A
       const createResponse = await request(app)
        .post('/api/v1/students')
        .set('x-workspace-id', workspaceA)
        .send({
          email: `delete-isolation-${Date.now()}@example.com`,
          firstName: 'To Be Deleted',
          lastName: 'Student',
        });
       
       const studentId = createResponse.body.id;

       // 2. Try to delete it from Workspace B
       const deleteResponse = await request(app)
        .delete(`/api/v1/students/${studentId}`)
        .set('x-workspace-id', workspaceB);

       // Should fail because the record is not found in Workspace B
       expect(deleteResponse.status).toBe(500);

       // 3. Verify it still exists in Workspace A
       const verifyResponse = await request(app)
        .get(`/api/v1/students/${studentId}`)
        .set('x-workspace-id', workspaceA);
       
       expect(verifyResponse.status).toBe(200);
    });
  });
});
