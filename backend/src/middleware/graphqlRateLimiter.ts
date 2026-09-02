import { Request, Response, NextFunction } from 'express';
import { redisConnection } from '../utils/redis.js';
import logger from '../utils/logger.js';

/**
 * GraphQL query complexity analysis and cost-based rate limiting.
 *
 * Assigns costs to GraphQL fields and rejects queries exceeding a configured
 * maximum cost budget. Integrates with the existing Redis rate limiter to
 * track cumulative cost per client.
 */

// Cost configuration for GraphQL operations
interface CostConfig {
  /** Base cost for the query/mutation itself */
  queryCost: number;
  /** Cost per requested field */
  fieldCost: number;
  /** Cost per level of nesting (depth multiplier) */
  depthCostFactor: number;
  /** Maximum allowed query cost */
  maxCost: number;
  /** Maximum allowed query depth */
  maxDepth: number;
  /** Cost budget per client per window (cumulative) */
  costBudgetPerWindow: number;
  /** Window in milliseconds for cost budget */
  budgetWindowMs: number;
}

const DEFAULT_COST_CONFIG: CostConfig = {
  queryCost: 1,
  fieldCost: 1,
  depthCostFactor: 2,
  maxCost: 500,
  maxDepth: 5,
  costBudgetPerWindow: 5000,
  budgetWindowMs: 60000, // 1 minute
};

const INTROSPECTION_DISABLED_ENVS = new Set(['production', 'staging']);

// Per-operation cost overrides for persisted/allowlisted operations
const ALLOWLISTED_OPERATIONS = new Map<string, Partial<CostConfig>>([
  ['GetStudents', { maxCost: 500, costBudgetPerWindow: 10000 }],
  ['GetStudent', { maxCost: 100, costBudgetPerWindow: 5000 }],
  ['GetCourses', { maxCost: 500, costBudgetPerWindow: 10000 }],
  ['GetCourse', { maxCost: 100, costBudgetPerWindow: 5000 }],
]);

// Introspection query detection patterns - only match schema introspection, not __typename
const INTROSPECTION_PATTERNS = [
  '__schema',
  '__type',
];

function isIntrospectionQuery(query: string): boolean {
  return INTROSPECTION_PATTERNS.some(pattern => query.includes(pattern));
}

/**
 * Estimate the cost of a GraphQL query based on field selections and nesting depth.
 * This is a simplified cost estimator that parses the query string.
 */
function estimateQueryCost(query: string, config: CostConfig = DEFAULT_COST_CONFIG): number {
  let cost = config.queryCost;

  // Count field selections (simplified: count non-comment, non-whitespace characters after '{')
  const lines = query.split('\n');
  let depth = 0;
  let maxDepth = 0;
  let fieldCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;

    // Count opening braces for depth
    const openBraces = (trimmed.match(/\{/g) || []).length;
    const closeBraces = (trimmed.match(/\}/g) || []).length;

    depth += openBraces - closeBraces;
    if (depth > maxDepth) maxDepth = depth;

    // Count field-like patterns (non-keyword identifiers before colon or newline)
    // This is a heuristic; full AST parsing would be more accurate
    if (openBraces === 0 && closeBraces === 0 && trimmed.match(/^\w+/)) {
      fieldCount++;
    }
  }

  // Cost = base + field count + depth factor
  cost += fieldCount * config.fieldCost;
  cost += (maxDepth - 1) * config.depthCostFactor * fieldCount;

  return Math.max(1, cost);
}

/**
 * Check if a client has exceeded their cumulative cost budget.
 */
async function checkCostBudget(
  clientId: string,
  queryCost: number,
  config: CostConfig = DEFAULT_COST_CONFIG
): Promise<{ allowed: boolean; remaining: number; resetMs: number }> {
  const key = `gql:cost:${clientId}:${Math.floor(Date.now() / config.budgetWindowMs)}`;
  const ttl = Math.ceil(config.budgetWindowMs / 1000) + 1;

  try {
    const current = await redisConnection.get(key);
    const totalCost = (current ? parseInt(current, 10) : 0) + queryCost;

    if (totalCost > config.costBudgetPerWindow) {
      const remaining = Math.max(0, config.costBudgetPerWindow - (totalCost - queryCost));
      const resetMs = Date.now() + config.budgetWindowMs;
      return { allowed: false, remaining, resetMs };
    }

    await redisConnection.setex(key, ttl, totalCost.toString());
    const remaining = config.costBudgetPerWindow - totalCost;
    const resetMs = Date.now() + config.budgetWindowMs;
    return { allowed: true, remaining, resetMs };
  } catch (error) {
    logger.error('GraphQL cost budget check failed, allowing request:', error);
    // Fail open - don't block legitimate traffic due to Redis issues
    return { allowed: true, remaining: config.costBudgetPerWindow, resetMs: Date.now() };
  }
}

/**
 * Extract client identifier from request.
 */
function getClientId(req: Request): string {
  const apiKey = req.headers['x-api-key'] as string;
  if (apiKey) return `apikey:${apiKey}`;
  const userId = (req as any).user?.id;
  if (userId) return `user:${userId}`;
  return `ip:${req.ip || req.socket.remoteAddress || 'unknown'}`;
}

/**
 * GraphQL query complexity rate limiter middleware.
 *
 * Analyzes incoming GraphQL queries, estimates their cost, and
 * rejects queries that exceed cost limits or cumulative budgets.
 */
export async function graphqlQueryComplexityLimiter(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (process.env.NODE_ENV === 'test') {
    return next();
  }

  // Only process GraphQL requests
  if (!req.body || (!req.body.query && !req.body.operationName)) {
    return next();
  }

  const query = req.body.query || '';
  const operationName = req.body.operationName || '';

  try {
    // Check if operation is allowlisted
    const allowedConfig = ALLOWLISTED_OPERATIONS.get(operationName);
    const config = allowedConfig
      ? { ...DEFAULT_COST_CONFIG, ...allowedConfig }
      : DEFAULT_COST_CONFIG;

    // Check introspection
    if (isIntrospectionQuery(query)) {
      if (INTROSPECTION_DISABLED_ENVS.has(process.env.NODE_ENV || 'development')) {
        res.status(403).json({
          status: 'error',
          message: 'Introspection queries are disabled in this environment.',
        });
        return;
      }

      // Allow introspection in non-production with strict rate limit
      const clientId = getClientId(req);
      const introspectionCost = 100; // High cost for introspection
      const budget = await checkCostBudget(clientId, introspectionCost, {
        ...config,
        costBudgetPerWindow: 500, // Very strict budget for introspection
      });

      if (!budget.allowed) {
        res.status(429).json({
          status: 'error',
          message: 'Introspection query rate limit exceeded.',
          retry_after: Math.ceil((budget.resetMs - Date.now()) / 1000),
        });
        return;
      }

      return next();
    }

    // Estimate query cost
    const queryCost = estimateQueryCost(query, config);

    // Check query depth
    const depth = (query.match(/\{/g) || []).length;
    if (depth > config.maxDepth) {
      res.status(400).json({
        status: 'error',
        message: `Query depth (${depth}) exceeds maximum allowed (${config.maxDepth}).`,
        query_depth: depth,
        max_depth: config.maxDepth,
      });
      return;
    }

    // Check single-query cost
    if (queryCost > config.maxCost) {
      res.status(400).json({
        status: 'error',
        message: `Query cost (${queryCost}) exceeds maximum allowed (${config.maxCost}). Simplify your query.`,
        query_cost: queryCost,
        max_cost: config.maxCost,
      });
      return;
    }

    // Check cumulative cost budget
    const clientId = getClientId(req);
    const budget = await checkCostBudget(clientId, queryCost, config);

    if (!budget.allowed) {
      res.status(429).json({
        status: 'error',
        message: 'GraphQL query cost budget exceeded. Please reduce query complexity or wait before retrying.',
        query_cost: queryCost,
        budget_remaining: budget.remaining,
        retry_after: Math.ceil((budget.resetMs - Date.now()) / 1000),
      });
      return;
    }

    // Set response headers for cost transparency
    res.setHeader('X-GraphQL-Cost', queryCost);
    res.setHeader('X-GraphQL-Cost-Limit', config.maxCost);
    res.setHeader('X-GraphQL-Cost-Remaining', Math.max(0, config.maxCost - queryCost));
    res.setHeader('X-GraphQL-Budget-Remaining', budget.remaining);

    next();
  } catch (error) {
    logger.error('GraphQL complexity analysis error, failing open:', error);
    next();
  }
}

/**
 * Register a persisted/allowlisted operation.
 * Allowlisted operations can have custom cost limits.
 */
export function registerAllowlistedOperation(
  operationName: string,
  overrides: Partial<CostConfig>
): void {
  ALLOWLISTED_OPERATIONS.set(operationName, overrides);
  logger.info(`Registered allowlisted GraphQL operation: ${operationName}`);
}

/**
 * Remove an allowlisted operation.
 */
export function removeAllowlistedOperation(operationName: string): boolean {
  return ALLOWLISTED_OPERATIONS.delete(operationName);
}

/**
 * Get current allowlisted operations (for admin/debugging).
 */
export function getAllowlistedOperations(): string[] {
  return Array.from(ALLOWLISTED_OPERATIONS.keys());
}
