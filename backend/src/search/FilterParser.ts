export interface FilterOperator {
  eq?: string | number;
  neq?: string | number;
  gt?: number;
  gte?: number;
  lt?: number;
  lte?: number;
  in?: (string | number)[];
  contains?: string;
  startsWith?: string;
}

export class FilterParser {
  parseFilters(queryFilters: Record<string, any>): Record<string, FilterOperator> {
    const parsedFilters: Record<string, FilterOperator> = {};

    for (const [key, value] of Object.entries(queryFilters)) {
      if (typeof value === 'string' || typeof value === 'number' || Array.isArray(value)) {
        parsedFilters[key] = { eq: value };
      } else if (typeof value === 'object' && value !== null) {
        parsedFilters[key] = value as FilterOperator;
      }
    }

    return parsedFilters;
  }

  parseQueryStringFilters(queryString: string): Record<string, any> {
    const filters: Record<string, any> = {};

    // Parse filter[field][operator]=value format
    const filterRegex = /filter\[([^\]]+)\]\[([^\]]+)\]=([^&]+)/g;
    let match;

    while ((match = filterRegex.exec(queryString)) !== null) {
      const [, field, operator, value] = match;

      if (!filters[field]) {
        filters[field] = {};
      }

      // Parse value based on operator
      filters[field][operator] = this.parseFilterValue(value, operator);
    }

    return filters;
  }

  private parseFilterValue(value: string, operator: string): any {
    // Parse numbers for comparison operators
    if (['gt', 'gte', 'lt', 'lte', 'eq', 'neq'].includes(operator)) {
      const numValue = Number(value);
      return isNaN(numValue) ? value : numValue;
    }

    // Parse arrays for 'in' operator
    if (operator === 'in') {
      return value.split(',').map((v) => {
        const num = Number(v.trim());
        return isNaN(num) ? v.trim() : num;
      });
    }

    // Parse booleans
    if (value === 'true') return true;
    if (value === 'false') return false;

    return value;
  }

  validateOperators(filters: Record<string, FilterOperator>): void {
    const validOperators = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains', 'startsWith'];

    for (const [field, operators] of Object.entries(filters)) {
      for (const operator of Object.keys(operators)) {
        if (!validOperators.includes(operator)) {
          throw new Error(`Invalid operator '${operator}' for field '${field}'`);
        }
      }
    }
  }
}
