import logger from '../../utils/logger.js';
import { redisConnection } from '../../utils/redis.js';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  windowMs: number;
}

export type CircuitBreakerStats = {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  lastStateChange?: number;
};

const REDIS_PREFIX = 'cb:';
const STATE_TTL = 3600; // 1 hour TTL for circuit breaker state in Redis

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures = 0;
  private successes = 0;
  private lastFailureTime = 0;
  private lastSuccessTime = 0;
  private lastStateChange = Date.now();
  private failureTimestamps: number[] = [];

  constructor(
    private readonly name: string,
    private readonly config: CircuitBreakerConfig = {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 30000, // 30 seconds
      windowMs: 10000, // 10 seconds
    }
  ) {}

  /**
   * Load circuit breaker state from Redis for distributed consistency.
   * Should be called before executing operations if running in multi-process mode.
   */
  public async syncFromRedis(): Promise<void> {
    try {
      const key = `${REDIS_PREFIX}${this.name}:state`;
      const data = await redisConnection.get(key);
      if (data) {
        const remote = JSON.parse(data);
        this.state = remote.state || CircuitState.CLOSED;
        this.failures = remote.failures || 0;
        this.lastFailureTime = remote.lastFailureTime || 0;
        this.lastStateChange = remote.lastStateChange || Date.now();

        // If OPEN and timeout has passed, transition to HALF_OPEN
        if (this.state === CircuitState.OPEN && this.lastFailureTime > 0) {
          if (Date.now() - this.lastFailureTime > this.config.timeout) {
            this.state = CircuitState.HALF_OPEN;
            this.successes = 0;
          }
        }
      }
    } catch (error) {
      logger.warn(`CircuitBreaker [${this.name}] failed to sync from Redis, using local state`, error);
    }
  }

  /**
   * Persist circuit breaker state to Redis for distributed consistency.
   */
  private async persistToRedis(): Promise<void> {
    try {
      const key = `${REDIS_PREFIX}${this.name}:state`;
      const state = {
        state: this.state,
        failures: this.failures,
        lastFailureTime: this.lastFailureTime,
        lastStateChange: this.lastStateChange,
      };
      await redisConnection.setex(key, STATE_TTL, JSON.stringify(state));
    } catch (error) {
      logger.warn(`CircuitBreaker [${this.name}] failed to persist state to Redis`, error);
    }
  }

  public async execute<T>(
    action: () => Promise<T>,
    fallback?: (error: Error) => T | Promise<T>
  ): Promise<T> {
    // Sync state from Redis before executing
    await this.syncFromRedis();
    this.updateState();

    if (this.state === CircuitState.OPEN) {
      if (fallback) {
        logger.warn(`Circuit Breaker [${this.name}] is OPEN. Executing fallback.`);
        return fallback(new Error(`Circuit Breaker [${this.name}] is OPEN`));
      }
      throw new Error(`Circuit Breaker [${this.name}] is OPEN`);
    }

    try {
      const result = await action();
      await this.onSuccess();
      return result;
    } catch (error) {
      await this.onFailure();
      if (fallback) {
        logger.warn(`Circuit Breaker [${this.name}] caught error. Executing fallback.`, error);
        return fallback(error as Error);
      }
      throw error;
    }
  }

  public getStats(): CircuitBreakerStats {
    const stats: CircuitBreakerStats = {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastStateChange: this.lastStateChange,
    };
    if (this.lastFailureTime > 0) {
      stats.lastFailureTime = this.lastFailureTime;
    }
    if (this.lastSuccessTime > 0) {
      stats.lastSuccessTime = this.lastSuccessTime;
    }
    return stats;
  }

  private async onSuccess(): Promise<void> {
    this.lastSuccessTime = Date.now();
    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        await this.close();
      }
    }
  }

  private async onFailure(): Promise<void> {
    this.failures++;
    this.lastFailureTime = Date.now();
    this.failureTimestamps.push(this.lastFailureTime);

    if (this.state === CircuitState.CLOSED) {
      if (this.getFailureCount() >= this.config.failureThreshold) {
        await this.open();
      }
    } else if (this.state === CircuitState.HALF_OPEN) {
      await this.open();
    }
  }

  private updateState(): void {
    if (this.state === CircuitState.OPEN) {
      const now = Date.now();
      if (now - this.lastFailureTime > this.config.timeout) {
        this.halfOpen();
      }
    }
  }

  private async open(): Promise<void> {
    this.state = CircuitState.OPEN;
    this.lastStateChange = Date.now();
    logger.error(`Circuit Breaker [${this.name}] state changed to OPEN`);
    await this.persistToRedis();
  }

  private async close(): Promise<void> {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.failureTimestamps = [];
    this.lastStateChange = Date.now();
    logger.info(`Circuit Breaker [${this.name}] state changed to CLOSED`);
    await this.persistToRedis();
  }

  private halfOpen(): void {
    this.state = CircuitState.HALF_OPEN;
    this.successes = 0;
    this.lastStateChange = Date.now();
    logger.info(`Circuit Breaker [${this.name}] state changed to HALF-OPEN`);
    // Persist asynchronously (fire-and-forget to avoid blocking)
    this.persistToRedis().catch(err =>
      logger.warn(`CircuitBreaker [${this.name}] failed to persist HALF_OPEN state`, err)
    );
  }

  private getFailureCount(): number {
    const now = Date.now();
    this.failureTimestamps = this.failureTimestamps.filter(
      (ts) => now - ts <= this.config.windowMs
    );
    return this.failureTimestamps.length;
  }
}
