import prisma from '../db/index.js';
import logger from '../utils/logger.js';
import { redisConnection } from '../utils/redis.js';

export interface NotificationPreferences {
  id: string;
  workspaceId: string;
  studentId: string;
  emailEnabled: boolean;
  pushEnabled: boolean;
  inAppEnabled: boolean;
  courseUpdates: boolean;
  announcements: boolean;
  newCourses: boolean;
  reminders: boolean;
  frequency: string;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePreferencesDto {
  studentId: string;
  emailEnabled?: boolean;
  pushEnabled?: boolean;
  inAppEnabled?: boolean;
  courseUpdates?: boolean;
  announcements?: boolean;
  newCourses?: boolean;
  reminders?: boolean;
  frequency?: string;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
}

export interface UpdatePreferencesDto extends Partial<CreatePreferencesDto> {
  studentId: string;
}

export class NotificationPreferencesService {
  private static instance: NotificationPreferencesService;

  static getInstance(): NotificationPreferencesService {
    if (!NotificationPreferencesService.instance) {
      NotificationPreferencesService.instance = new NotificationPreferencesService();
    }
    return NotificationPreferencesService.instance;
  }

  async getByStudentId(studentId: string): Promise<NotificationPreferences | null> {
    try {
      const cacheKey = `notification_prefs:${studentId}`;
      const client = redisClient.getClient();
      const cached = client ? await client.get(cacheKey) : null;
      if (cached) {
        return JSON.parse(cached) as NotificationPreferences;
      }

      const prefs = await prisma.notificationPreferences.findUnique({
        where: { studentId },
      });

      if (prefs) {
        if (client) await client.setex(cacheKey, 120, JSON.stringify(prefs));
      }

      return prefs as NotificationPreferences | null;
    } catch (error) {
      logger.error('Error fetching notification preferences:', error);
      throw new Error('Failed to fetch notification preferences');
    }
  }

  async create(dto: CreatePreferencesDto): Promise<NotificationPreferences> {
    try {
      const prefs = await prisma.notificationPreferences.create({
        data: {
          studentId: dto.studentId,
          emailEnabled: dto.emailEnabled ?? true,
          pushEnabled: dto.pushEnabled ?? true,
          inAppEnabled: dto.inAppEnabled ?? true,
          courseUpdates: dto.courseUpdates ?? true,
          announcements: dto.announcements ?? true,
          newCourses: dto.newCourses ?? true,
          reminders: dto.reminders ?? true,
          frequency: dto.frequency ?? 'immediate',
          quietHoursStart: dto.quietHoursStart,
          quietHoursEnd: dto.quietHoursEnd,
        },
      });

      await redisConnection.del(`notification_prefs:${dto.studentId}`);
      logger.info('Notification preferences created', { studentId: dto.studentId });
      return prefs as NotificationPreferences;
    } catch (error) {
      logger.error('Error creating notification preferences:', error);
      throw new Error('Failed to create notification preferences');
    }
  }

  async upsert(dto: CreatePreferencesDto): Promise<NotificationPreferences> {
    try {
      const prefs = await prisma.notificationPreferences.upsert({
        where: { studentId: dto.studentId },
        update: {
          emailEnabled: dto.emailEnabled ?? true,
          pushEnabled: dto.pushEnabled ?? true,
          inAppEnabled: dto.inAppEnabled ?? true,
          courseUpdates: dto.courseUpdates ?? true,
          announcements: dto.announcements ?? true,
          newCourses: dto.newCourses ?? true,
          reminders: dto.reminders ?? true,
          frequency: dto.frequency ?? 'immediate',
          quietHoursStart: dto.quietHoursStart,
          quietHoursEnd: dto.quietHoursEnd,
        },
        create: {
          studentId: dto.studentId,
          emailEnabled: dto.emailEnabled ?? true,
          pushEnabled: dto.pushEnabled ?? true,
          inAppEnabled: dto.inAppEnabled ?? true,
          courseUpdates: dto.courseUpdates ?? true,
          announcements: dto.announcements ?? true,
          newCourses: dto.newCourses ?? true,
          reminders: dto.reminders ?? true,
          frequency: dto.frequency ?? 'immediate',
          quietHoursStart: dto.quietHoursStart,
          quietHoursEnd: dto.quietHoursEnd,
        },
      });

      await redisConnection.del(`notification_prefs:${dto.studentId}`);
      logger.info('Notification preferences updated', { studentId: dto.studentId });
      return prefs as NotificationPreferences;
    } catch (error) {
      logger.error('Error updating notification preferences:', error);
      throw new Error('Failed to update notification preferences');
    }
  }

  async update(studentId: string, dto: UpdatePreferencesDto): Promise<NotificationPreferences> {
    try {
      const existing = await prisma.notificationPreferences.findUnique({
        where: { studentId },
      });

      if (!existing) {
        throw new Error('Notification preferences not found');
      }

      const prefs = await prisma.notificationPreferences.update({
        where: { studentId },
        data: {
          emailEnabled: dto.emailEnabled ?? existing.emailEnabled,
          pushEnabled: dto.pushEnabled ?? existing.pushEnabled,
          inAppEnabled: dto.inAppEnabled ?? existing.inAppEnabled,
          courseUpdates: dto.courseUpdates ?? existing.courseUpdates,
          announcements: dto.announcements ?? existing.announcements,
          newCourses: dto.newCourses ?? existing.newCourses,
          reminders: dto.reminders ?? existing.reminders,
          frequency: dto.frequency ?? existing.frequency,
          quietHoursStart: dto.quietHoursStart ?? existing.quietHoursStart,
          quietHoursEnd: dto.quietHoursEnd ?? existing.quietHoursEnd,
        },
      });

      await redisConnection.del(`notification_prefs:${studentId}`);
      logger.info('Notification preferences patched', { studentId });
      return prefs as NotificationPreferences;
    } catch (error) {
      logger.error('Error patching notification preferences:', error);
      throw new Error('Failed to update notification preferences');
    }
  }

  async delete(studentId: string): Promise<void> {
    try {
      await prisma.notificationPreferences.delete({
        where: { studentId },
      });

      await redisConnection.del(`notification_prefs:${studentId}`);
      logger.info('Notification preferences deleted', { studentId });
    } catch (error) {
      logger.error('Error deleting notification preferences:', error);
      throw new Error('Failed to delete notification preferences');
    }
  }

  async applyPreferencesFilter(
    studentId: string,
    notificationType: string
  ): Promise<boolean> {
    const prefs = await this.getByStudentId(studentId);
    if (!prefs) {
      return true;
    }

    switch (notificationType) {
      case 'course_created':
      case 'course_updated':
        return prefs.courseUpdates && prefs.inAppEnabled;
      case 'announcement':
        return prefs.announcements && prefs.inAppEnabled;
      case 'learning_opportunity':
        return prefs.newCourses && prefs.inAppEnabled;
      case 'course_deleted':
        return prefs.courseUpdates && prefs.inAppEnabled;
      default:
        return prefs.inAppEnabled;
    }
  }
}

export const notificationPreferencesService = NotificationPreferencesService.getInstance();
