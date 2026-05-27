import prisma from '../db/index.js';
import logger from '../utils/logger.js';

export class CertificateAnalytics {
  /**
   * Gets comprehensive certificate analytics
   */
  async getAnalytics(): Promise<{
    totalCertificates: number;
    byStatus: Record<string, number>;
    totalVerifications: number;
    uniqueStudents: number;
    uniqueCourses: number;
    revocationRate: number;
    issuedThisMonth: number;
    issuedThisWeek: number;
    issuedToday: number;
  }> {
    const [totalCertificates, byStatusRaw, uniqueStudents, uniqueCourses] = await Promise.all([
      prisma.certificate.count(),
      prisma.certificate.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
      prisma.certificate.groupBy({
        by: ['studentId'],
        _count: { studentId: true },
      }),
      prisma.certificate.groupBy({
        by: ['courseId'],
        _count: { courseId: true },
      }),
    ]);

    // Transform status counts into object
    const byStatus = byStatusRaw.reduce(
      (acc, item) => {
        acc[item.status] = item._count.status;
        return acc;
      },
      {} as Record<string, number>
    );

    // Get verifications count (placeholder)
    const totalVerifications = await this.getTotalVerifications();

    // Get various issued counts
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [issuedThisMonth, issuedThisWeek, issuedToday] = await Promise.all([
      prisma.certificate.count({
        where: { issuedAt: { gte: startOfMonth } },
      }),
      prisma.certificate.count({
        where: { issuedAt: { gte: startOfWeek } },
      }),
      prisma.certificate.count({
        where: { issuedAt: { gte: startOfDay } },
      }),
    ]);

    // Calculate revocation rate
    const revokedCount = byStatus['REVOKED'] || 0;
    const revocationRate = totalCertificates > 0 ? revokedCount / totalCertificates : 0;

    return {
      totalCertificates,
      byStatus,
      totalVerifications,
      uniqueStudents: uniqueStudents.length,
      uniqueCourses: uniqueCourses.length,
      revocationRate,
      issuedThisMonth,
      issuedThisWeek,
      issuedToday,
    };
  }

  /**
   * Gets daily certificate issuance for charting
   */
  async getDailyIssuance(days = 30): Promise<Array<{ date: string; count: number }>> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Using raw query for date grouping
    const results = await prisma.$queryRaw`
      SELECT 
        DATE(issued_at) as date,
        COUNT(*) as count
      FROM certificates
      WHERE issued_at >= ${startDate.toISOString()}
      GROUP BY DATE(issued_at)
      ORDER BY date ASC
    `;

    // Fill missing dates with zeros
    const filled = this.fillDateRange(startDate, endDate, results as any[]);

    return filled;
  }

  /**
   * Helper to fill missing dates in range
   */
  private fillDateRange(
    startDate: Date,
    endDate: Date,
    data: { date: string; count: number }[]
  ): { date: string; count: number }[] {
    const result: { date: string; count: number }[] = [];
    const dataMap = new Map(data.map((d) => [d.date, d.count]));

    const current = new Date(startDate);
    while (current <= endDate) {
      const dateParts = current.toISOString().split('T');
      const dateStr = dateParts[0] || '';
      result.push({
        date: dateStr,
        count: dataMap.get(dateStr) || 0,
      });
      current.setDate(current.getDate() + 1);
    }

    return result;
  }

  // Placeholder methods - would be implemented with real analytics tables
  private async getTotalVerifications(): Promise<number> {
    return 0;
  }
}

export const certificateAnalytics = new CertificateAnalytics();
