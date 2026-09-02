import type { Request } from 'express';

export interface ParsedPagination {
  page: number;
  pageSize: number;
  offset: number;
}

export interface PaginationMetadata {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  offset: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: PaginationMetadata;
}

export function parsePaginationQuery(
  req: Request,
  options: { defaultPageSize?: number; maxPageSize?: number } = {}
): ParsedPagination {
  const defaultPageSize = options.defaultPageSize ?? 25;
  const maxPageSize = options.maxPageSize ?? 50;

  const rawPage = req.query.page;
  const rawPageSize = req.query.pageSize ?? req.query.limit;
  const rawOffset = req.query.offset;

  let page = 1;
  if (rawPage !== undefined) {
    const parsedPage = Number(rawPage);
    if (!Number.isInteger(parsedPage) || parsedPage < 1) {
      throw new Error('Page must be a positive integer.');
    }
    page = parsedPage;
  }

  let pageSize = defaultPageSize;
  if (rawPageSize !== undefined) {
    const parsedPageSize = Number(rawPageSize);
    if (!Number.isInteger(parsedPageSize) || parsedPageSize < 1) {
      throw new Error('Page size must be a positive integer.');
    }
    if (parsedPageSize > maxPageSize) {
      throw new Error(`Page size cannot exceed ${maxPageSize}.`);
    }
    pageSize = parsedPageSize;
  }

  let offset = 0;
  if (rawOffset !== undefined) {
    const parsedOffset = Number(rawOffset);
    if (!Number.isInteger(parsedOffset) || parsedOffset < 0) {
      throw new Error('Offset must be a non-negative integer.');
    }
    offset = parsedOffset;
  } else {
    offset = (page - 1) * pageSize;
  }

  return { page, pageSize, offset };
}

export function buildPaginationMetadata(
  totalItems: number,
  page: number,
  pageSize: number,
  offset: number
): PaginationMetadata {
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);

  return {
    page,
    pageSize,
    totalItems,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
    offset,
  };
}

export function buildPaginatedResponse<T>(items: T[], totalItems: number, page: number, pageSize: number, offset: number): PaginatedResponse<T> {
  return {
    items,
    pagination: buildPaginationMetadata(totalItems, page, pageSize, offset),
  };
}
