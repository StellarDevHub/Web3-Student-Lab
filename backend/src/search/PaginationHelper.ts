import { SearchOptions } from './SearchService.js';

export interface PaginationOptions {
  limit: number;
  offset?: number;
  cursor?: string;
}

export class PaginationHelper {
  private readonly DEFAULT_LIMIT = 20;
  private readonly MAX_LIMIT = 100;

  buildPaginationOptions(options: SearchOptions): PaginationOptions {
    const limit = Math.min(options.limit || this.DEFAULT_LIMIT, this.MAX_LIMIT);

    if (options.cursor) {
      return {
        limit,
        cursor: options.cursor,
      };
    } else {
      const page = options.page || 1;
      const offset = (page - 1) * limit;

      return {
        limit,
        offset,
      };
    }
  }

  buildPaginationMetadata(
    options: SearchOptions,
    total: number,
    resultCount: number
  ): {
    page?: number;
    limit?: number;
    total?: number;
    hasMore?: boolean;
    cursor?: string;
    nextCursor?: string;
  } {
    if (options.cursor) {
      // Cursor-based pagination
      return {
        cursor: options.cursor,
        limit: options.limit || this.DEFAULT_LIMIT,
        hasMore: resultCount === (options.limit || this.DEFAULT_LIMIT),
        nextCursor: resultCount > 0 ? this.encodeCursor({ id: (resultCount as any).id }) : null,
      };
    } else {
      // Offset-based pagination
      const page = options.page || 1;
      const limit = options.limit || this.DEFAULT_LIMIT;
      const totalPages = Math.ceil(total / limit);

      return {
        page,
        limit,
        total,
        hasMore: page < totalPages,
      };
    }
  }

  encodeCursor(data: Record<string, any>): string {
    return Buffer.from(JSON.stringify(data)).toString('base64');
  }

  decodeCursor(cursor: string): Record<string, any> {
    try {
      return JSON.parse(Buffer.from(cursor, 'base64').toString());
    } catch {
      throw new Error('Invalid cursor');
    }
  }

  validateCursor(cursor: string): boolean {
    try {
      this.decodeCursor(cursor);
      return true;
    } catch {
      return false;
    }
  }
}
