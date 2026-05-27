import crypto from 'crypto';
import prisma from '../db/index.js';
import logger from '../utils/logger.js';

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
    // Just return country for now to anonymize city
    return country;
  }

  /**
   * Processes all students and loads them into the analytics table
   */
  public async performAnonymization(): Promise<void> {
    logger.info('Starting nightly anonymization job...');

    try {
      // 1. Extract raw data from main database
      const students = await prisma.student.findMany({
        include: {
          enrollments: true,
          feedback: true,
        },
      });

      // 2. Clear existing (or move to archive if needed) analytics data
      // For simplicity, we'll just add new records or clear and reload
      await (prisma as any).analyticsData.deleteMany({});

      const analyticsBatch = [];

      for (const student of students) {
        // Anonymize user
        analyticsBatch.push({
          metricType: 'USER_STAT',
          anonymizedUserHash: this.hashPII(student.email),
          region: 'Global', // Mock region or get from IP if available in AuditLog
          timestamp: student.createdAt,
          metadata: {
            enrollmentCount: student.enrollments.length,
            feedbackCount: student.feedback.length,
          },
        });

        // Anonymize Enrollments
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

      // 3. Load sanitized data into analytics table
      if (analyticsBatch.length > 0) {
        await (prisma as any).analyticsData.createMany({
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
