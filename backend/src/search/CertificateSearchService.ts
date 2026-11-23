import { PrismaClient } from '@prisma/client';
import { SearchOptions, SearchResult, SearchService } from './SearchService.js';

export class CertificateSearchService extends SearchService<any> {
  private readonly searchFields = ['certificateHash', 'status'];
  private readonly filterFields = {
    status: 'string',
    issuedAt: 'date',
    did: 'string',
  };
  private readonly sortFields = ['issuedAt', 'status'];

  constructor(prisma: PrismaClient) {
    super(prisma);
  }

  async search(options: SearchOptions): Promise<SearchResult<any>> {
    // Validate sort field
    if (options.sort) {
      this.validator.validateSortField(options.sort, this.sortFields);
    }

    // Validate filter fields
    if (options.filters) {
      this.validator.validateFilterFields(options.filters, Object.keys(this.filterFields));
    }

    // For certificates, we need to include related student and course data
    const result = await this.executeSearch(
      this.prisma.certificate,
      options,
      this.searchFields,
      this.filterFields
    );

    // Enrich with student and course data
    const enrichedData = await Promise.all(
      result.data.map(async (cert: any) => {
        const student = await this.prisma.student.findUnique({
          where: { id: cert.studentId },
          select: { firstName: true, lastName: true, email: true },
        });

        const course = await this.prisma.course.findUnique({
          where: { id: cert.courseId },
          select: { title: true, instructor: true },
        });

        return {
          ...cert,
          student: student ? `${student.firstName} ${student.lastName}` : 'Unknown',
          studentEmail: student?.email,
          course: course?.title || 'Unknown',
          instructor: course?.instructor,
        };
      })
    );

    return {
      ...result,
      data: enrichedData,
    };
  }

  getEntityName(): string {
    return 'certificates';
  }
}
