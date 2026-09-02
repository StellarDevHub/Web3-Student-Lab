import request from 'supertest';
import { app } from '../src/index.js';
import { resetStore } from '../src/notifications/NotificationService.js';
import { notificationPreferencesService } from '../src/notifications/preferences.service.js';

describe('Notification Preferences API', () => {
  const workspaceA = 'workspace-a';
  let authToken: string;
  let userId: string;

  beforeAll(async () => {
    const registerRes = await request(app)
      .post('/api/v1/auth/register')
      .set('x-workspace-id', workspaceA)
      .send({
        email: 'prefs@test.com',
        password: 'password123',
        firstName: 'Pref',
        lastName: 'Test',
      });

    authToken = registerRes.body.token;
    userId = registerRes.body.user.id;
  });

  beforeEach(() => {
    resetStore();
  });

  describe('POST /api/v1/notifications/preferences', () => {
    it('creates notification preferences', async () => {
      const response = await request(app)
        .post('/api/v1/notifications/preferences')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-workspace-id', workspaceA)
        .send({
          emailEnabled: true,
          pushEnabled: false,
          courseUpdates: true,
          frequency: 'daily',
        });

      expect(response.status).toBe(201);
      expect(response.body.studentId).toBe(userId);
      expect(response.body.emailEnabled).toBe(true);
      expect(response.body.pushEnabled).toBe(false);
      expect(response.body.frequency).toBe('daily');
    });

    it('rejects duplicate creation', async () => {
      await request(app)
        .post('/api/v1/notifications/preferences')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-workspace-id', workspaceA)
        .send({ emailEnabled: true });

      const response = await request(app)
        .post('/api/v1/notifications/preferences')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-workspace-id', workspaceA)
        .send({ emailEnabled: false });

      expect(response.status).toBe(409);
      expect(response.body.error).toMatch(/already exist/i);
    });

    it('requires authentication', async () => {
      const response = await request(app)
        .post('/api/v1/notifications/preferences')
        .set('x-workspace-id', workspaceA)
        .send({ emailEnabled: true });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/v1/notifications/preferences', () => {
    it('returns 404 when preferences do not exist', async () => {
      await notificationPreferencesService.delete(userId);

      const response = await request(app)
        .get('/api/v1/notifications/preferences')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-workspace-id', workspaceA);

      expect(response.status).toBe(404);
    });

    it('returns existing preferences', async () => {
      await notificationPreferencesService.upsert({
        studentId: userId,
        emailEnabled: true,
        pushEnabled: true,
        inAppEnabled: true,
        courseUpdates: true,
        announcements: false,
        newCourses: true,
        reminders: true,
        frequency: 'immediate',
        quietHoursStart: '22:00',
        quietHoursEnd: '08:00',
      });

      const response = await request(app)
        .get('/api/v1/notifications/preferences')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-workspace-id', workspaceA);

      expect(response.status).toBe(200);
      expect(response.body.courseUpdates).toBe(true);
      expect(response.body.announcements).toBe(false);
      expect(response.body.quietHoursStart).toBe('22:00');
    });
  });

  describe('PUT /api/v1/notifications/preferences', () => {
    it('upserts preferences', async () => {
      const response = await request(app)
        .put('/api/v1/notifications/preferences')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-workspace-id', workspaceA)
        .send({
          emailEnabled: false,
          pushEnabled: true,
          frequency: 'weekly',
        });

      expect(response.status).toBe(200);
      expect(response.body.emailEnabled).toBe(false);
      expect(response.body.frequency).toBe('weekly');
    });
  });

  describe('PATCH /api/v1/notifications/preferences', () => {
    it('updates existing preferences', async () => {
      await notificationPreferencesService.upsert({
        studentId: userId,
        emailEnabled: true,
        pushEnabled: true,
        inAppEnabled: true,
        courseUpdates: true,
        announcements: true,
        newCourses: true,
        reminders: true,
        frequency: 'immediate',
        quietHoursStart: null,
        quietHoursEnd: null,
      });

      const response = await request(app)
        .patch('/api/v1/notifications/preferences')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-workspace-id', workspaceA)
        .send({
          reminders: false,
          quietHoursStart: '23:00',
          quietHoursEnd: '07:00',
        });

      expect(response.status).toBe(200);
      expect(response.body.reminders).toBe(false);
      expect(response.body.quietHoursStart).toBe('23:00');
      expect(response.body.emailEnabled).toBe(true);
    });

    it('returns 404 when updating non-existent preferences', async () => {
      await notificationPreferencesService.delete(userId);

      const response = await request(app)
        .patch('/api/v1/notifications/preferences')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-workspace-id', workspaceA)
        .send({ reminders: false });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/v1/notifications/preferences', () => {
    it('removes preferences', async () => {
      await notificationPreferencesService.upsert({
        studentId: userId,
        emailEnabled: true,
        pushEnabled: true,
        inAppEnabled: true,
        courseUpdates: true,
        announcements: true,
        newCourses: true,
        reminders: true,
        frequency: 'immediate',
        quietHoursStart: null,
        quietHoursEnd: null,
      });

      const response = await request(app)
        .delete('/api/v1/notifications/preferences')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-workspace-id', workspaceA);

      expect(response.status).toBe(204);

      const getResponse = await request(app)
        .get('/api/v1/notifications/preferences')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-workspace-id', workspaceA);

      expect(getResponse.status).toBe(404);
    });

    it('returns 404 when deleting non-existent preferences', async () => {
      await notificationPreferencesService.delete(userId);

      const response = await request(app)
        .delete('/api/v1/notifications/preferences')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-workspace-id', workspaceA);

      expect(response.status).toBe(404);
    });
  });
});
