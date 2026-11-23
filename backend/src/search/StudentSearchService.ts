import { PrismaClient } from '@prisma/client';
import { SearchOptions, SearchResult, SearchService } from './SearchService.js';

export class StudentSearchService extends SearchService<any> {
  private readonly searchFields = ['firstName', 'lastName', 'email'];
  private readonly filterFields = {
    email: 'string',
    createdAt: 'date',
    did: 'string',
  };
  private readonly sortFields = ['firstName', 'lastName', 'email', 'createdAt'];

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

    return this.executeSearch(this.prisma.student, options, this.searchFields, this.filterFields);
  }

  getEntityName(): string {
    return 'students';
  }
}
