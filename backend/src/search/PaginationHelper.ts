import { SearchOptions } from './SearchService.js';

export interface PaginationOptions {
  limit: number;
  offset?: number;
  cursor?: string;
}

export function encodeCursor(data: Record<string, any>): string {
  return Buffer.from(JSON.stringify(data)).toString('base64');
}

export function decodeCursor(cursor: string): Record<string, any> {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64').toString());
  } catch {
    throw new Error('Invalid cursor');
  }
}

export function buildLinkHeader(
  baseUrl: string,
  params: Record<string, any>,
  nextCursor?: string | null,
  prevCursor?: string | null
): string {
  const links: string[] = [];
  if (nextCursor) {
    const nextUrl = `${baseUrl}?${new URLSearchParams({ ...params, cursor: nextCursor }).toString()}`;
    links.push(`<${nextUrl}>; rel="next"`);
  }
  if (prevCursor) {
    const prevUrl = `${baseUrl}?${new URLSearchParams({ ...params, cursor: prevCursor }).toString()}`;
    links.push(`<${prevUrl}>; rel="prev"`);
  }
  return links.join(', ');
}

export interface KeysetPaginationResult<T> {
  items: T[];
  nextCursor: string | null;
  prevCursor: string | null;
  hasMore: boolean;
}

export async function paginateKeyset<T extends { id: string }>(
  fetchFn: (args: { take: number; cursor?: { id: string }; skip?: number }) => Promise<T[]>,
  options: { take?: number; cursor?: string }
): Promise<KeysetPaginationResult<T>> {
  const take = Math.min(options.take || 20, 100);
  let decodedCursor: { id: string } | undefined;
  
  if (options.cursor) {
    try {
      const decoded = decodeCursor(options.cursor);
      if (decoded.id) {
        decodedCursor = { id: decoded.id };
      }
    } catch {
      // Invalid cursor defaults to first page
    }
  }

  const queryArgs: { take: number; cursor?: { id: string }; skip?: number } = {
    take: take + 1,
  };

  if (decodedCursor) {
    queryArgs.cursor = decodedCursor;
    queryArgs.skip = 1; // Skip the cursor element itself
  }

  const rawResults = await fetchFn(queryArgs);
  const hasMore = rawResults.length > take;
  const items = hasMore ? rawResults.slice(0, take) : rawResults;

  const nextItem = items[items.length - 1];
  const firstItem = items[0];

  const nextCursor = hasMore && nextItem ? encodeCursor({ id: nextItem.id }) : null;
  const prevCursor = decodedCursor && firstItem ? encodeCursor({ id: firstItem.id }) : null;

  return {
    items,
    nextCursor,
    prevCursor,
    hasMore,
  };
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
      return {
        cursor: options.cursor,
        limit: options.limit || this.DEFAULT_LIMIT,
        hasMore: resultCount === (options.limit || this.DEFAULT_LIMIT),
        nextCursor: resultCount > 0 ? this.encodeCursor({ id: resultCount }) : '',

      };
    } else {
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
    return encodeCursor(data);
  }

  decodeCursor(cursor: string): Record<string, any> {
    return decodeCursor(cursor);
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
