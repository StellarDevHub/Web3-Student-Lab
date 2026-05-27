import { PrismaClient } from '@prisma/client';
import { SearchOptions, SearchResult, SearchService } from './SearchService.js';

export class CourseSearchService extends SearchService<any> {
  private readonly searchFields = ['title', 'description', 'instructor'];
  private readonly filterFields = {
    credits: 'number',
    instructor: 'string',
    createdAt: 'date',
  };
  private readonly sortFields = ['title', 'credits', 'createdAt', 'instructor'];

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

    return this.executeSearch(this.prisma.course, options, this.searchFields, this.filterFields);
  }

  getEntityName(): string {
    return 'courses';
  }
}
