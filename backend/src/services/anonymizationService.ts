import crypto from 'crypto';
import type { Prisma } from '@prisma/client';
import prisma from '../db/index.js';
import redisClient from '../cache/RedisClient.js';
import logger from '../utils/logger.js';

export const SYSTEM_BURN_USER_ID = '00000000-0000-0000-0000-000000000000';

export interface GdprErasureReceipt {
  receiptId: string;
  anonymizedStudentHash: string;
  erasedAt: string;
  certificatesPreserved: number;
  status: 'COMPLETED';
}

class AnonymizationService {
  /**
   * Hashes sensitive data using SHA-256
   */
  public hashPII(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Aggregates specific location data into broader regions
   */
  public aggregateLocation(city: string | null, country: string | null): string {
    if (!country) return 'Unknown';
    return country;
  }

  /**
   * GDPR Account Erasure & Cryptographic Anonymization Pipeline (Issue #1115).
   * Irreversibly scrubs PII, re-points records to system burn UUID, clears Redis caches,
   * and produces a compliance erasure receipt.
   */
  public async deleteAndAnonymizeStudent(studentId: string): Promise<GdprErasureReceipt> {
    logger.info(`Starting GDPR erasure pipeline for student: ${studentId}`);

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: { certificates: true },
    });

    if (!student) {
      throw new Error(`Student ${studentId} not found`);
    }

    const emailHash = this.hashPII(student.email);

    // 1. Ensure system burn user exists
    let burnUser = await prisma.student.findUnique({ where: { id: SYSTEM_BURN_USER_ID } });
    if (!burnUser) {
      burnUser = await prisma.student.create({
        data: {
          id: SYSTEM_BURN_USER_ID,
          email: 'anonymous-burn@system.local',
          firstName: 'Anonymized',
          lastName: 'User',
          password: 'REDACTED',
          workspaceId: 'system',
        },
      });
    }

    // 2. Re-point Certificates to burn user while preserving on-chain hashes
    const certificatesCount = student.certificates.length;
    await prisma.certificate.updateMany({
      where: { studentId },
      data: {
        studentId: SYSTEM_BURN_USER_ID,
        did: null,
      },
    });

    // 3. Purge PII from student record
    await prisma.student.delete({ where: { id: studentId } });

    // 4. Invalidate Redis session caches
    try {
      if (redisClient && typeof (redisClient as any).del === 'function') {
        await (redisClient as any).del(`user:${studentId}`, `session:${studentId}`, `user:did:${student.did}`);
      }
    } catch (e) {
      logger.warn('Failed to clear Redis cache during GDPR erasure', e);
    }

    // 5. Emit compliance audit log
    const receiptId = `gdpr-receipt-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    await prisma.auditLog.create({
      data: {
        userId: SYSTEM_BURN_USER_ID,
        userEmail: 'gdpr-erased@system.local',
        action: 'GDPR_ACCOUNT_ERASURE',
        entity: 'Student',
        entityId: studentId,
        details: {
          receiptId,
          anonymizedStudentHash: emailHash,
          certificatesPreserved: certificatesCount,
          erasedAt: new Date().toISOString(),
        },
      },
    });

    logger.info(`Completed GDPR erasure pipeline for student: ${studentId}`);

    return {
      receiptId,
      anonymizedStudentHash: emailHash,
      erasedAt: new Date().toISOString(),
      certificatesPreserved: certificatesCount,
      status: 'COMPLETED',
    };
  }

  /**
   * Processes all students and loads them into the analytics table
   */
  public async performAnonymization(): Promise<void> {
    logger.info('Starting nightly anonymization job...');

    try {
      const students = await prisma.student.findMany({
        include: {
          enrollments: true,
          feedback: true,
        },
      });

      // 2. Clear existing (or move to archive if needed) analytics data
      // For simplicity, we'll just add new records or clear and reload
      await prisma.analyticsData.deleteMany({});

      const analyticsBatch: Prisma.AnalyticsDataCreateManyInput[] = [];


      for (const student of students) {
        analyticsBatch.push({
          metricType: 'USER_STAT',
          anonymizedUserHash: this.hashPII(student.email),
          region: 'Global',
          timestamp: student.createdAt,
          metadata: {
            enrollmentCount: student.enrollments.length,
            feedbackCount: student.feedback.length,
          },
        });

        for (const enrollment of student.enrollments) {
          analyticsBatch.push({
            metricType: 'ENROLLMENT_STAT',
            anonymizedUserHash: this.hashPII(student.email),
            value: 1,
            category: enrollment.status,
            timestamp: enrollment.enrolledAt,
            metadata: {
              courseId: enrollment.courseId,
            },
          });
        }
      }

      if (analyticsBatch.length > 0) {
        await prisma.analyticsData.createMany({
          data: analyticsBatch,
        });
      }

      logger.info(
        `Successfully anonymized and loaded ${analyticsBatch.length} records into analytics.`
      );
    } catch (error) {
      logger.error('Anonymization job failed:', error);
    }
  }
}

export const anonymizationService = new AnonymizationService();
