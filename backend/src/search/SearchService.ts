import { PrismaClient } from '@prisma/client';
import { PaginationHelper } from './PaginationHelper.js';
import { SearchQueryBuilder } from './SearchQueryBuilder.js';
import { SearchValidator } from './SearchValidator.js';

export interface SearchOptions {
  query?: string;
  filters?: Record<string, any>;
  sort?: string;
  page?: number;
  limit?: number;
  cursor?: string;
}

export interface SearchResult<T> {
  data: T[];
  pagination: {
    page?: number;
    limit?: number;
    total?: number;
    hasMore?: boolean;
    cursor?: string;
    nextCursor?: string;
  };
  metadata: {
    query?: string;
    filters?: Record<string, any>;
    sortBy?: string;
    executionTime: string;
    totalResults: number;
  };
}

export abstract class SearchService<T> {
  protected prisma: PrismaClient;
  protected queryBuilder: SearchQueryBuilder;
  protected validator: SearchValidator;
  protected paginationHelper: PaginationHelper;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.queryBuilder = new SearchQueryBuilder();
    this.validator = new SearchValidator();
    this.paginationHelper = new PaginationHelper();
  }

  abstract search(options: SearchOptions): Promise<SearchResult<T>>;
  abstract getEntityName(): string;

  protected async executeSearch(
    model: any,
    options: SearchOptions,
    searchFields: string[],
    filterFields: Record<string, string>
  ): Promise<SearchResult<T>> {
    const startTime = Date.now();

    // Validate search options
    this.validator.validateSearchOptions(options);

    // Build where clause for full-text search
    const whereClause = this.queryBuilder.buildWhereClause(options.query, searchFields);

    // Add filters
    const filterWhere = this.queryBuilder.buildFilterClause(options.filters || {}, filterFields);
    Object.assign(whereClause, filterWhere);

    // Build order by clause
    const orderBy = this.queryBuilder.buildOrderByClause(options.sort);

    // Execute count query for pagination metadata
    const total = await model.count({ where: whereClause });

    // Build pagination
    const paginationOptions = this.paginationHelper.buildPaginationOptions(options);

    // Execute search query
    let data: T[];
    if (paginationOptions.cursor) {
      // Cursor-based pagination
      data = await model.findMany({
        where: whereClause,
        orderBy,
        take: paginationOptions.limit,
        skip: paginationOptions.cursor ? 1 : 0,
        cursor: paginationOptions.cursor ? { id: paginationOptions.cursor } : undefined,
      });
    } else {
      // Offset-based pagination
      data = await model.findMany({
        where: whereClause,
        orderBy,
        take: paginationOptions.limit,
        skip: paginationOptions.offset,
      });
    }

    const executionTime = `${Date.now() - startTime}ms`;

    // Build pagination metadata
    const pagination = this.paginationHelper.buildPaginationMetadata(options, total, data.length);

    return {
      data,
      pagination,
      metadata: {
        query: options.query,
        filters: options.filters,
        sortBy: options.sort,
        executionTime,
        totalResults: total,
      },
    };
  }
}
