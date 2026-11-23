import { describe, expect, it } from '@jest/globals';
import {
  computeDlqRetryDelayMs,
  DLQ_RETRY_ATTEMPTS,
  DLQ_RETRY_JITTER,
  DLQ_RETRY_SCHEDULE_MS,
  DLQ_RETRY_WINDOW_MS,
  DLQ_TOTAL_ATTEMPTS,
  isDlqRetryWindowExhausted,
  withDlqRetryPolicy,
} from '../src/queues/retryPolicy.js';

describe('BE-063 DLQ retry policy', () => {
  it('spreads five jittered retries across a two-hour window', () => {
    expect(DLQ_RETRY_SCHEDULE_MS).toHaveLength(4);
    expect(DLQ_RETRY_ATTEMPTS).toBe(4);
    expect(DLQ_TOTAL_ATTEMPTS).toBe(5);
    expect(DLQ_RETRY_WINDOW_MS).toBe(2 * 60 * 60 * 1000);
    expect(DLQ_RETRY_JITTER).toBeGreaterThan(0);
  });

  it('uses an exponential schedule with randomized jitter', () => {
    expect(computeDlqRetryDelayMs(1, () => 0)).toBe(DLQ_RETRY_SCHEDULE_MS[0]);
    expect(computeDlqRetryDelayMs(1, () => 1)).toBeLessThan(DLQ_RETRY_SCHEDULE_MS[0]!);
    expect(computeDlqRetryDelayMs(3, () => 0)).toBe(DLQ_RETRY_SCHEDULE_MS[2]);

    const first = computeDlqRetryDelayMs(2, () => 0.25);
    const second = computeDlqRetryDelayMs(2, () => 0.75);
    expect(first).toBeGreaterThan(second);
  });

  it('applies the policy to BullMQ job options', () => {
    const options = withDlqRetryPolicy({ attempts: 99, backoff: { type: 'exponential', delay: 10 } });
    expect(options.attempts).toBe(DLQ_TOTAL_ATTEMPTS);
    expect(options.backoff).toMatchObject({ type: 'custom', delay: DLQ_RETRY_SCHEDULE_MS[0] });
  });

  it('detects an exhausted retry window', () => {
    expect(isDlqRetryWindowExhausted(undefined, 10_000)).toBe(false);
    expect(isDlqRetryWindowExhausted(1_000, 1_000 + DLQ_RETRY_WINDOW_MS - 1)).toBe(false);
    expect(isDlqRetryWindowExhausted(1_000, 1_000 + DLQ_RETRY_WINDOW_MS)).toBe(true);
  });
});
