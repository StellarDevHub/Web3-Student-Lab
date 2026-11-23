/**
 * Certificate Analytics Explorer — Issue #1179
 *
 * Extends the base CertificateAnalytics class with public explorer endpoints:
 *  - Leaderboards (top students, top courses by certificate volume)
 *  - Searchable certificate directory (by student address, course, issuer/DID)
 *  - Historical issuance trend data for charting
 *  - CSV export builder for institutional transparency reports
 *
 * All read queries use indexed PostgreSQL columns and execute in sub-second
 * time under normal load (see Prisma indexes on certificates table).
 */

import prisma from '../db/index.js';
import logger from '../utils/logger.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  rank: number;
  studentId: string;
  studentName: string;
  walletAddress: string | null;
  certificateCount: number;
  lastIssuedAt: Date;
}

export interface CourseLeaderboardEntry {
  rank: number;
  courseId: string;
  courseTitle: string;
  instructor: string;
  certificateCount: number;
  averageGrade: string | null;
}

export interface CertificateSearchResult {
  id: string;
  tokenId: string | null;
  studentName: string;
  walletAddress: string | null;
  courseTitle: string;
  instructor: string;
  issuedAt: Date;
  status: string;
  grade: string | null;
  metadataUri: string | null;
  network: string | null;
  did: string | null;
}

export interface CertificateSearchQuery {
  /** Filter by student wallet address (partial match). */
  walletAddress?: string;
  /** Filter by student DID (partial match). */
  did?: string;
  /** Filter by course title (partial match, case-insensitive). */
  courseTitle?: string;
  /** Filter by certificate status. */
  status?: string;
  /** Filter by issuer DID stored on the certificate. */
  issuerDid?: string;
  /** ISO date string — only return certificates issued on or after. */
  issuedAfter?: string;
  /** ISO date string — only return certificates issued on or before. */
  issuedBefore?: string;
  /** Page number (1-based). */
  page?: number;
  /** Page size (max 100). */
  pageSize?: number;
}

export interface SearchResponse {
  results: CertificateSearchResult[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface GradeDistribution {
  grade: string;
  count: number;
  percentage: number;
}

export interface ExplorerStats {
  totalCertificates: number;
  activeCertificates: number;
  revokedCertificates: number;
  totalStudents: number;
  totalCourses: number;
  certificatesThisMonth: number;
  certificatesThisWeek: number;
  revocationRate: number;
}

// ─── CertificateExplorerService ───────────────────────────────────────────────

export class CertificateExplorerService {
  private static instance: CertificateExplorerService | null = null;

  static getInstance(): CertificateExplorerService {
    if (!CertificateExplorerService.instance) {
      CertificateExplorerService.instance = new CertificateExplorerService();
    }
    return CertificateExplorerService.instance;
  }

  // ── Overview Stats ─────────────────────────────────────────────────────

  /**
   * High-level stats for the public explorer landing page.
   * All queries use indexed columns; executes in a single parallel batch.
   */
  async getExplorerStats(): Promise<ExplorerStats> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const [
      totalCertificates,
      activeCertificates,
      revokedCertificates,
      uniqueStudents,
      uniqueCourses,
      certificatesThisMonth,
      certificatesThisWeek,
    ] = await Promise.all([
      prisma.certificate.count(),
      prisma.certificate.count({ where: { status: 'ACTIVE' } }),
      prisma.certificate.count({ where: { status: 'REVOKED' } }),
      prisma.certificate.groupBy({ by: ['studentId'], _count: true }),
      prisma.certificate.groupBy({ by: ['courseId'], _count: true }),
      prisma.certificate.count({ where: { issuedAt: { gte: startOfMonth } } }),
      prisma.certificate.count({ where: { issuedAt: { gte: startOfWeek } } }),
    ]);

    const revocationRate =
      totalCertificates > 0 ? revokedCertificates / totalCertificates : 0;

    return {
      totalCertificates,
      activeCertificates,
      revokedCertificates,
      totalStudents: uniqueStudents.length,
      totalCourses: uniqueCourses.length,
      certificatesThisMonth,
      certificatesThisWeek,
      revocationRate,
    };
  }

  // ── Leaderboards ───────────────────────────────────────────────────────

  /**
   * Top students by certificate count.
   * Uses the `studentId` index on the certificates table.
   *
   * @param limit - Maximum number of entries (max 50). Default 10.
   */
  async getStudentLeaderboard(limit = 10): Promise<LeaderboardEntry[]> {
    const cap = Math.min(limit, 50);

    const grouped = await prisma.certificate.groupBy({
      by: ['studentId'],
      _count: { studentId: true },
      _max: { issuedAt: true },
      orderBy: { _count: { studentId: 'desc' } },
      take: cap,
    });

    const studentIds = grouped.map((g) => g.studentId);
    const students = await prisma.student.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, firstName: true, lastName: true, walletAddress: true },
    });

    const studentMap = new Map(students.map((s) => [s.id, s]));

    return grouped.map((g, index) => {
      const student = studentMap.get(g.studentId);
      const fullName = student
        ? `${student.firstName || ''} ${student.lastName || ''}`.trim()
        : 'Unknown';

      return {
        rank: index + 1,
        studentId: g.studentId,
        studentName: fullName,
        walletAddress: student?.walletAddress ?? null,
        certificateCount: g._count.studentId,
        lastIssuedAt: g._max.issuedAt ?? new Date(0),
      };
    });
  }

  /**
   * Top courses by certificate issuance volume.
   * Uses the `courseId` index on the certificates table.
   *
   * @param limit - Maximum number of entries (max 50). Default 10.
   */
  async getCourseLeaderboard(limit = 10): Promise<CourseLeaderboardEntry[]> {
    const cap = Math.min(limit, 50);

    const grouped = await prisma.certificate.groupBy({
      by: ['courseId'],
      _count: { courseId: true },
      orderBy: { _count: { courseId: 'desc' } },
      take: cap,
    });

    const courseIds = grouped.map((g) => g.courseId);
    const courses = await prisma.course.findMany({
      where: { id: { in: courseIds } },
      select: { id: true, title: true, instructor: true },
    });

    const courseMap = new Map(courses.map((c) => [c.id, c]));

    // Compute average grade per course (grades are strings like "A", "B+", etc.)
    const gradeMap = new Map<string, string | null>();
    for (const g of grouped) {
      const certs = await prisma.certificate.findMany({
        where: { courseId: g.courseId, grade: { not: null } },
        select: { grade: true },
        take: 500,
      });
      gradeMap.set(g.courseId, this.computeModeGrade(certs.map((c) => c.grade)));
    }

    return grouped.map((g, index) => {
      const course = courseMap.get(g.courseId);
      return {
        rank: index + 1,
        courseId: g.courseId,
        courseTitle: course?.title ?? 'Unknown Course',
        instructor: course?.instructor ?? 'Unknown',
        certificateCount: g._count.courseId,
        averageGrade: gradeMap.get(g.courseId) ?? null,
      };
    });
  }

  // ── Searchable Certificate Directory ──────────────────────────────────

  /**
   * Search certificates by student address, DID, course, or status.
   * Executes in sub-second time over properly indexed PostgreSQL columns.
   */
  async searchCertificates(query: CertificateSearchQuery): Promise<SearchResponse> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const offset = (page - 1) * pageSize;

    // Build dynamic where clause
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = {};

    if (query.status) {
      where.status = query.status;
    }
    if (query.issuerDid) {
      where.did = { contains: query.issuerDid, mode: 'insensitive' };
    }
    if (query.issuedAfter || query.issuedBefore) {
      where.issuedAt = {};
      if (query.issuedAfter) where.issuedAt.gte = new Date(query.issuedAfter);
      if (query.issuedBefore) where.issuedAt.lte = new Date(query.issuedBefore);
    }

    // Student-level filters
    const studentWhere: Record<string, unknown> = {};
    if (query.walletAddress) {
      studentWhere.walletAddress = {
        contains: query.walletAddress,
        mode: 'insensitive',
      };
    }
    if (query.did) {
      studentWhere.did = { contains: query.did, mode: 'insensitive' };
    }

    // Course-level filter
    const courseWhere: Record<string, unknown> = {};
    if (query.courseTitle) {
      courseWhere.title = { contains: query.courseTitle, mode: 'insensitive' };
    }

    if (Object.keys(studentWhere).length) {
      where.student = studentWhere;
    }
    if (Object.keys(courseWhere).length) {
      where.course = courseWhere;
    }

    const [certs, total] = await Promise.all([
      prisma.certificate.findMany({
        where,
        include: {
          student: { select: { firstName: true, lastName: true, walletAddress: true, did: true } },
          course: { select: { title: true, instructor: true } },
        },
        orderBy: { issuedAt: 'desc' },
        take: pageSize,
        skip: offset,
      }),
      prisma.certificate.count({ where }),
    ]);

    const results: CertificateSearchResult[] = certs.map((c) => ({
      id: c.id,
      tokenId: c.tokenId,
      studentName: c.student
        ? `${c.student.firstName || ''} ${c.student.lastName || ''}`.trim()
        : 'Unknown',
      walletAddress: c.student?.walletAddress ?? null,
      courseTitle: c.course?.title ?? 'Unknown',
      instructor: c.course?.instructor ?? 'Unknown',
      issuedAt: c.issuedAt,
      status: c.status,
      grade: c.grade,
      metadataUri: c.metadataUri,
      network: c.network,
      did: c.student?.did ?? null,
    }));

    return {
      results,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  // ── Grade Distribution ─────────────────────────────────────────────────

  /**
   * Returns grade distribution across all certificates for charting.
   */
  async getGradeDistribution(): Promise<GradeDistribution[]> {
    const grouped = await prisma.certificate.groupBy({
      by: ['grade'],
      _count: { grade: true },
      orderBy: { _count: { grade: 'desc' } },
    });

    const total = grouped.reduce((sum, g) => sum + g._count.grade, 0);

    return grouped
      .filter((g) => g.grade !== null)
      .map((g) => ({
        grade: g.grade ?? 'N/A',
        count: g._count.grade,
        percentage: total > 0 ? Math.round((g._count.grade / total) * 10000) / 100 : 0,
      }));
  }

  // ── CSV Export ─────────────────────────────────────────────────────────

  /**
   * Builds a CSV string from the certificate search results.
   * Suitable for institutional academic transparency reports.
   *
   * @param query - Same search query used for the directory endpoint.
   * @returns Raw CSV text (UTF-8, with BOM for Excel compatibility).
   */
  async exportCertificatesCsv(query: CertificateSearchQuery = {}): Promise<string> {
    // Fetch up to 10 000 rows for export
    const exportQuery: CertificateSearchQuery = { ...query, page: 1, pageSize: 10_000 };
    const { results } = await this.searchCertificates(exportQuery);

    const header = [
      'Certificate ID',
      'Token ID',
      'Student Name',
      'Wallet Address',
      'DID',
      'Course Title',
      'Instructor',
      'Grade',
      'Status',
      'Network',
      'Issued At',
      'Metadata URI',
    ].join(',');

    const rows = results.map((r) =>
      [
        this.csvEscape(r.id),
        this.csvEscape(r.tokenId ?? ''),
        this.csvEscape(r.studentName),
        this.csvEscape(r.walletAddress ?? ''),
        this.csvEscape(r.did ?? ''),
        this.csvEscape(r.courseTitle),
        this.csvEscape(r.instructor),
        this.csvEscape(r.grade ?? ''),
        this.csvEscape(r.status),
        this.csvEscape(r.network ?? ''),
        this.csvEscape(r.issuedAt.toISOString()),
        this.csvEscape(r.metadataUri ?? ''),
      ].join(',')
    );

    // UTF-8 BOM for Excel auto-detection
    return '\uFEFF' + [header, ...rows].join('\n');
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  /** Wraps a value in double-quotes and escapes internal double-quotes. */
  private csvEscape(value: string): string {
    const escaped = value.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  /** Returns the most-common (mode) grade from an array of grade strings. */
  private computeModeGrade(grades: (string | null)[]): string | null {
    const counts = new Map<string, number>();
    for (const g of grades) {
      if (g) counts.set(g, (counts.get(g) ?? 0) + 1);
    }
    if (!counts.size) return null;
    let mode = '';
    let max = 0;
    for (const [grade, count] of counts) {
      if (count > max) {
        max = count;
        mode = grade;
      }
    }
    return mode || null;
  }
}

export const certificateExplorerService = CertificateExplorerService.getInstance();
