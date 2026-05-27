import { Prisma } from '@prisma/client';

export class SearchQueryBuilder {
  buildWhereClause(
    query?: string,
    searchFields: string[] = []
  ): Prisma.StudentWhereInput | Prisma.CourseWhereInput | Prisma.CertificateWhereInput {
    if (!query || searchFields.length === 0) {
      return {};
    }

    const searchConditions = searchFields.map((field) => ({
      [field]: {
        contains: query,
        mode: 'insensitive' as const,
      },
    }));

    return {
      OR: searchConditions,
    } as any;
  }

  buildFilterClause(
    filters: Record<string, any>,
    filterFields: Record<string, string>
  ): Record<string, any> {
    const whereClause: Record<string, any> = {};

    for (const [key, value] of Object.entries(filters)) {
      const fieldType = filterFields[key];
      if (!fieldType) continue;

      switch (fieldType) {
        case 'string':
          whereClause[key] = this.buildStringFilter(value);
          break;
        case 'number':
          whereClause[key] = this.buildNumberFilter(value);
          break;
        case 'date':
          whereClause[key] = this.buildDateFilter(value);
          break;
        case 'boolean':
          whereClause[key] = value;
          break;
        case 'array':
          whereClause[key] = this.buildArrayFilter(value);
          break;
      }
    }

    return whereClause;
  }

  private buildStringFilter(value: any): Record<string, any> {
    if (typeof value === 'string') {
      return { equals: value, mode: 'insensitive' };
    }

    if (typeof value === 'object' && value !== null) {
      const filter: Record<string, any> = {};

      if (value.eq) filter.equals = value.eq;
      if (value.neq) filter.not = value.neq;
      if (value.contains) filter.contains = value.contains;
      if (value.startsWith) filter.startsWith = value.startsWith;
      if (value.in) filter.in = value.in;

      if (Object.keys(filter).length > 0) {
        filter.mode = 'insensitive';
      }

      return filter;
    }

    return value;
  }

  private buildNumberFilter(value: any): Record<string, any> {
    if (typeof value === 'number') {
      return { equals: value };
    }

    if (typeof value === 'object' && value !== null) {
      const filter: Record<string, any> = {};

      if (value.eq !== undefined) filter.equals = value.eq;
      if (value.neq !== undefined) filter.not = value.neq;
      if (value.gt !== undefined) filter.gt = value.gt;
      if (value.gte !== undefined) filter.gte = value.gte;
      if (value.lt !== undefined) filter.lt = value.lt;
      if (value.lte !== undefined) filter.lte = value.lte;
      if (value.in) filter.in = value.in;

      return filter;
    }

    return value;
  }

  private buildDateFilter(value: any): Record<string, any> {
    if (value instanceof Date || typeof value === 'string') {
      return { equals: new Date(value) };
    }

    if (typeof value === 'object' && value !== null) {
      const filter: Record<string, any> = {};

      if (value.eq) filter.equals = new Date(value.eq);
      if (value.neq) filter.not = new Date(value.neq);
      if (value.gt) filter.gt = new Date(value.gt);
      if (value.gte) filter.gte = new Date(value.gte);
      if (value.lt) filter.lt = new Date(value.lt);
      if (value.lte) filter.lte = new Date(value.lte);

      return filter;
    }

    return value;
  }

  private buildArrayFilter(value: any): Record<string, any> {
    if (Array.isArray(value)) {
      return { hasSome: value };
    }

    if (typeof value === 'object' && value !== null) {
      if (value.in) return { hasSome: value.in };
      if (value.contains) return { has: value.contains };
    }

    return value;
  }

  buildOrderByClause(sort?: string): Record<string, 'asc' | 'desc'>[] {
    if (!sort) {
      return [{ createdAt: 'desc' }];
    }

    const [field, direction] = sort.split(':');
    const dir = direction === 'desc' ? 'desc' : 'asc';

    return [{ [field]: dir }];
  }
}
