import request from 'supertest';
import { app } from '../src/index';
import {
  createNotification,
  getNotifications,
  markAsRead,
  markAllAsRead,
  resetStore,
} from '../src/notifications/NotificationService.js';

beforeEach(() => {
  resetStore();
});

describe('NotificationService', () => {
  describe('createNotification', () => {
    it('should create a broadcast notification', async () => {
      const notif = await createNotification({
        type: 'course_created',
        courseId: 'course-1',
        courseTitle: 'Web3 101',
        title: 'New Course',
        message: 'A new course is available.',
      });

      expect(notif.id).toBeTruthy();
      expect(notif.type).toBe('course_created');
      expect(notif.title).toBe('New Course');
      expect(notif.read).toBe(false);
      expect(notif.createdAt).toBeTruthy();
      expect(notif.userId).toBeUndefined();
    });

    it('should create a user-targeted notification', async () => {
      const notif = await createNotification({
        type: 'learning_opportunity',
        userId: 'user-1',
        courseId: 'course-2',
        title: 'Recommended Course',
        message: 'Check out Soroban Smart Contracts.',
      });

      expect(notif.userId).toBe('user-1');
    });

    it('should handle announcement type', async () => {
      const notif = await createNotification({
        type: 'announcement',
        title: 'Platform Update',
        message: 'New features are live!',
      });

      expect(notif.type).toBe('announcement');
      expect(notif.courseId).toBeUndefined();
    });
  });

  describe('getNotifications', () => {
    it('should return user-targeted and broadcast notifications merged', async () => {
      await createNotification({
        type: 'course_created',
        title: 'Broadcast',
        message: 'For everyone.',
      });

      await createNotification({
        type: 'course_updated',
        userId: 'user-1',
        title: 'User-specific',
        message: 'Just for user-1.',
      });

      await createNotification({
        type: 'course_created',
        userId: 'user-2',
        title: 'Other user',
        message: 'Not for user-1.',
      });

      const result = getNotifications('user-1');
      expect(result.total).toBe(2);
      expect(result.notifications.some((n) => n.title === 'Broadcast')).toBe(true);
      expect(result.notifications.some((n) => n.title === 'User-specific')).toBe(true);
      expect(result.notifications.some((n) => n.title === 'Other user')).toBe(false);
    });

    it('should include unread count', async () => {
      await createNotification({ type: 'course_created', title: 'A', message: 'Msg' });
      await createNotification({ type: 'course_created', userId: 'user-1', title: 'B', message: 'Msg' });

      const { unreadCount } = getNotifications('user-1');
      expect(unreadCount).toBe(2);
    });

    it('should return notifications sorted newest-first', async () => {
      await createNotification({ type: 'course_created', title: 'First', message: 'M' });
      await new Promise((r) => setTimeout(r, 5));
      await createNotification({ type: 'course_created', title: 'Second', message: 'M' });

      const { notifications } = getNotifications('user-1');
      expect(notifications[0].title).toBe('Second');
      expect(notifications[1].title).toBe('First');
    });
  });

  describe('markAsRead', () => {
    it('should mark a single notification as read', async () => {
      const notif = await createNotification({
        type: 'course_created',
        title: 'Test',
        message: 'Msg',
      });

      const updated = markAsRead(notif.id);
      expect(updated).toBe(true);

      const result = getNotifications('any-user');
      const found = result.notifications.find((n) => n.id === notif.id);
      expect(found?.read).toBe(true);
    });

    it('should return false for unknown id', () => {
      expect(markAsRead('non-existent')).toBe(false);
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all notifications as read for a user', async () => {
      await createNotification({ type: 'course_created', title: 'A', message: 'm' });
      await createNotification({ type: 'course_created', userId: 'user-1', title: 'B', message: 'm' });
      await createNotification({ type: 'announcement', userId: 'user-1', title: 'C', message: 'm' });

      const count = markAllAsRead('user-1');
      expect(count).toBe(3);

      const { unreadCount } = getNotifications('user-1');
      expect(unreadCount).toBe(0);
    });
  });
});

describe('Notifications API (integration)', () => {
  describe('GET /api/v1/notifications', () => {
    it('should return 400 without userId', async () => {
      const res = await request(app).get('/api/v1/notifications');
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/userId/i);
    });

    it('should return notifications for a valid userId', async () => {
      await createNotification({
        type: 'course_created',
        courseTitle: 'Web3 101',
        title: 'New Course',
        message: 'Enroll now!',
      });

      const res = await request(app).get('/api/v1/notifications?userId=test-user');
      expect(res.status).toBe(200);
      expect(res.body.notifications).toBeInstanceOf(Array);
      expect(res.body.total).toBeGreaterThan(0);
      expect(res.body.unreadCount).toBeDefined();
    });
  });

  describe('PUT /api/v1/notifications/:id/read', () => {
    it('should mark a notification as read', async () => {
      const notif = await createNotification({
        type: 'course_created',
        title: 'Read test',
        message: 'Mark me',
      });

      const res = await request(app).put(`/api/v1/notifications/${notif.id}/read`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 for unknown notification', async () => {
      const res = await request(app).put('/api/v1/notifications/bad-id/read');
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/v1/notifications/read-all', () => {
    it('should mark all notifications as read', async () => {
      await createNotification({ type: 'course_created', title: 'A', message: 'm' });
      await createNotification({ type: 'course_created', userId: 'test-user', title: 'B', message: 'm' });

      const res = await request(app)
        .put('/api/v1/notifications/read-all')
        .send({ userId: 'test-user' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.updatedCount).toBeGreaterThan(0);
    });

    it('should return 400 without userId', async () => {
      const res = await request(app).put('/api/v1/notifications/read-all').send({});
      expect(res.status).toBe(400);
    });
  });
});
