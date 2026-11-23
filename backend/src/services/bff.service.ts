import { getStudentDashboard } from '../dashboard/dashboard.service.js';
import prisma from '../db/index.js';
import logger from '../utils/logger.js';

// Simple in-memory cache
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 30 * 1000; // 30 seconds

export const getAggregatedDashboardData = async (studentId: string) => {
  const cacheKey = `dashboard:${studentId}`;
  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    logger.debug(`Returning cached dashboard data for ${studentId}`);
    return cached.data;
  }

  // Define concurrent resolvers with individual error handling
  const [dashboard, studentInfo, recentAuditLogs] = await Promise.all([
    getStudentDashboard(studentId).catch((err) => {
      logger.error('BFF: Failed to fetch student dashboard:', err);
      return null;
    }),
    prisma.student
      .findUnique({
        where: { id: studentId },
        select: { email: true, firstName: true, lastName: true, createdAt: true },
      })
      .catch((err) => {
        logger.error('BFF: Failed to fetch student info:', err);
        return null;
      }),
    prisma.auditLog
      .findMany({
        where: { userId: studentId },
        orderBy: { createdAt: 'desc' },
        take: 5,
      })
      .catch((err) => {
        logger.error('BFF: Failed to fetch audit logs:', err);
        return [];
      }),
  ]);

  const aggregatedData = {
    profile: studentInfo,
    dashboard: dashboard,
    recentActivity: recentAuditLogs,
    meta: {
      generatedAt: new Date().toISOString(),
      cacheTtl: CACHE_TTL / 1000,
    },
  };

  // Cache the result
  cache.set(cacheKey, { data: aggregatedData, timestamp: Date.now() });

  return aggregatedData;
};
