import logger from '../../utils/logger.js';

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
};

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures = 0;
  private successes = 0;
  private lastFailureTime = 0;
  private lastSuccessTime = 0;
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

  public async execute<T>(
    action: () => Promise<T>,
    fallback?: (error: Error) => T | Promise<T>
  ): Promise<T> {
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
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      if (fallback) {
        logger.warn(`Circuit Breaker [${this.name}] caught error. Executing fallback.`, error);
        return fallback(error as Error);
      }
      throw error;
    }
  }

  private onSuccess(): void {
    this.lastSuccessTime = Date.now();
    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.close();
      }
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    this.failureTimestamps.push(this.lastFailureTime);

    if (this.state === CircuitState.CLOSED) {
      if (this.getFailureCount() >= this.config.failureThreshold) {
        this.open();
      }
    } else if (this.state === CircuitState.HALF_OPEN) {
      this.open();
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

  private open(): void {
    this.state = CircuitState.OPEN;
    logger.error(`Circuit Breaker [${this.name}] state changed to OPEN`);
  }

  private close(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.failureTimestamps = [];
    logger.info(`Circuit Breaker [${this.name}] state changed to CLOSED`);
  }

  private halfOpen(): void {
    this.state = CircuitState.HALF_OPEN;
    this.successes = 0;
    logger.info(`Circuit Breaker [${this.name}] state changed to HALF-OPEN`);
  }

  private getFailureCount(): number {
    const now = Date.now();
    this.failureTimestamps = this.failureTimestamps.filter(
      (ts) => now - ts <= this.config.windowMs
    );
    return this.failureTimestamps.length;
  }

  public getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
    };
  }
}
