import { Injectable, Logger } from '@nestjs/common';

/**
 * BE-031: GraphQL Query Complexity Analysis & Depth Limiting Protection.
 * Prevents DoS from deeply nested or circular GraphQL queries.
 */
@Injectable()
export class QueryComplexityLimiterService {
  private readonly logger = new Logger(QueryComplexityLimiterService.name);
  private readonly MAX_DEPTH = 10;
  private readonly MAX_COMPLEXITY = 1000;

  /**
   * Analyze query complexity before execution.
   */
  analyzeQuery(query: string): {
    complexity: number;
    depth: number;
    valid: boolean;
    reason?: string;
  } {
    const depth = this.calculateDepth(query);
    const complexity = this.calculateComplexity(query);

    if (depth > this.MAX_DEPTH) {
      return {
        complexity,
        depth,
        valid: false,
        reason: `Query depth ${depth} exceeds maximum ${this.MAX_DEPTH}`,
      };
    }

    if (complexity > this.MAX_COMPLEXITY) {
      return {
        complexity,
        depth,
        valid: false,
        reason: `Query complexity ${complexity} exceeds maximum ${this.MAX_COMPLEXITY}`,
      };
    }

    return { complexity, depth, valid: true };
  }

  /**
   * Calculate query depth (nesting level).
   */
  private calculateDepth(query: string): number {
    let maxDepth = 0;
    let currentDepth = 0;

    for (const char of query) {
      if (char === '{') {
        currentDepth++;
        maxDepth = Math.max(maxDepth, currentDepth);
      } else if (char === '}') {
        currentDepth--;
      }
    }

    return maxDepth;
  }

  /**
   * Calculate query complexity score.
   * Each field adds 1, multiplied by nesting level.
   */
  private calculateComplexity(query: string): number {
    let complexity = 0;
    let depth = 0;

    // Simple parser: count fields at each depth
    const lines = query.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.endsWith('{')) {
        depth++;
      } else if (trimmed === '}') {
        depth = Math.max(0, depth - 1);
      } else if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('query')) {
        // Field found at current depth
        complexity += Math.pow(2, depth); // Exponential to penalize nesting
      }
    }

    return complexity;
  }

  /**
   * Detect circular references in query.
   */
  detectCircularReferences(query: string): { hasCircular: boolean; path?: string } {
    const fieldPattern = /(\w+)\s*{/g;
    const fields = new Set<string>();
    const stack: string[] = [];

    let match;
    while ((match = fieldPattern.exec(query))) {
      const field = match[1];

      if (fields.has(field) && stack.includes(field)) {
        return {
          hasCircular: true,
          path: `${stack.join(' → ')} → ${field}`,
        };
      }

      fields.add(field);
      stack.push(field);
    }

    return { hasCircular: false };
  }

  /**
   * Apply rate limiting based on complexity.
   */
  getRateLimitForComplexity(complexity: number): { rateLimit: number; windowSecs: number } {
    if (complexity < 100) {
      return { rateLimit: 1000, windowSecs: 60 };
    } else if (complexity < 500) {
      return { rateLimit: 100, windowSecs: 60 };
    } else {
      return { rateLimit: 10, windowSecs: 60 };
    }
  }
}
