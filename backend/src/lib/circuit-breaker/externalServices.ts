import { cbManager } from './CircuitBreakerManager.js';
import { CircuitBreakerConfig } from './CircuitBreaker.js';

/**
 * Pre-configured circuit breakers for all external API dependencies.
 *
 * Service configurations:
 * - Stellar Horizon: Higher timeout (RPC nodes can be slow), moderate failure threshold
 * - Soroban RPC: Similar to Horizon but with separate isolation
 * - GitHub API: Stricter limits (well-known reliable service)
 * - Webhook deliveries: Very generous timeouts (target servers may be slow)
 */

const stellarHorizonConfig: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 60000, // 60 seconds
  windowMs: 30000, // 30 seconds
};

const sorobanRpcConfig: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 60000, // 60 seconds
  windowMs: 30000, // 30 seconds
};

const githubApiConfig: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30000, // 30 seconds
  windowMs: 15000, // 15 seconds
};

const webhookConfig: CircuitBreakerConfig = {
  failureThreshold: 3,
  successThreshold: 2,
  timeout: 120000, // 120 seconds
  windowMs: 60000, // 60 seconds
};

// Circuit breaker instances
export const stellarHorizonBreaker = cbManager.getOrCreateBreaker('stellar-horizon', stellarHorizonConfig);
export const sorobanRpcBreaker = cbManager.getOrCreateBreaker('soroban-rpc', sorobanRpcConfig);
export const githubApiBreaker = cbManager.getOrCreateBreaker('github-api', githubApiConfig);
export const webhookBreaker = cbManager.getOrCreateBreaker('webhook-delivery', webhookConfig);

/**
 * Wrap an external API call with a circuit breaker and optional fallback.
 *
 * @example
 * const result = await withCircuitBreaker(
 *   stellarHorizonBreaker,
 *   () => fetch('https://horizon.stellar.org/...'),
 *   () => ({ cached: true, data: cachedData })
 * );
 */
export async function withCircuitBreaker<T>(
  breaker: import('./CircuitBreaker.js').CircuitBreaker,
  action: () => Promise<T>,
  fallback?: () => T | Promise<T>
): Promise<{ data: T; degraded: boolean }> {
  try {
    const result = await breaker.execute(action, async (error) => {
      if (fallback) {
        return fallback();
      }
      throw error;
    });
    return { data: result, degraded: false };
  } catch (error) {
    if (fallback) {
      const fallbackResult = await fallback();
      return { data: fallbackResult, degraded: true };
    }
    throw error;
  }
}

/**
 * Get cached data for a circuit-breaker-protected service when degraded.
 */
export function getDegradedResponse(service: string) {
  return {
    status: 'degraded',
    message: `${service} is temporarily unavailable. Please try again later.`,
    timestamp: new Date().toISOString(),
  };
}
