import { Prisma } from '@prisma/client';
import prisma from '../db/index.js';
import logger from '../utils/logger.js';

export interface ActivityLogEntry {
  id: string;
  userId: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: Date;
}

export interface ActivityLogResponse {
  entries: ActivityLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Fetch paginated activity log entries for a specific user.
 */
export async function getUserActivityLog(
  userId: string,
  page = 1,
  pageSize = 20
): Promise<ActivityLogResponse> {
  const skip = (page - 1) * pageSize;

  try {
    const [entries, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        select: {
          id: true,
          userId: true,
          action: true,
          entity: true,
          entityId: true,
          details: true,
          ipAddress: true,
          createdAt: true,
        },
      }),
      prisma.auditLog.count({ where: { userId } }),
    ]);

    return {
      entries: entries.map((e) => ({
        ...e,
        userId: e.userId ?? userId,
        details: (e.details as Record<string, unknown>) ?? null,
      })),
      total,
      page,
      pageSize,
    };
  } catch (error) {
    logger.error('Failed to fetch activity log', { userId, error });
    throw error;
  }
}

/**
 * Record a new activity log entry.
 */
export async function recordActivity(
  userId: string,
  action: string,
  entity?: string,
  entityId?: string,
  details?: Record<string, unknown>,
  ipAddress?: string
): Promise<ActivityLogEntry> {
  try {
    const entry = await prisma.auditLog.create({
      data: {
        userId,
        action,
        entity: entity ?? null,
        entityId: entityId ?? null,
        details: details === undefined ? Prisma.JsonNull : (details as Prisma.InputJsonValue),
        ipAddress: ipAddress ?? null,
      },
    });

    return {
      ...entry,
      userId: entry.userId ?? userId,
      details: (entry.details as Record<string, unknown>) ?? null,
    };
  } catch (error) {
    logger.error('Failed to record activity', { userId, action, error });
    throw error;
  }
}
