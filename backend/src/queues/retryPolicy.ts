import type { JobsOptions } from 'bullmq';

export const DLQ_RETRY_SCHEDULE_MS = [
  60_000,
  300_000,
  1_200_000,
  5_640_000,
] as const;

export const DLQ_RETRY_ATTEMPTS = DLQ_RETRY_SCHEDULE_MS.length;
export const DLQ_TOTAL_ATTEMPTS = DLQ_RETRY_ATTEMPTS + 1;
export const DLQ_RETRY_WINDOW_MS = DLQ_RETRY_SCHEDULE_MS.reduce((sum, delay) => sum + delay, 0);
export const DLQ_RETRY_JITTER = 0.2;
export const DLQ_MIN_RETRY_DELAY_MS = 1_000;

export function computeDlqRetryDelayMs(
  attemptsMade: number,
  random: () => number = Math.random
): number {
  const index = Math.min(Math.max(Math.floor(attemptsMade), 1), DLQ_RETRY_SCHEDULE_MS.length) - 1;
  const base =
    DLQ_RETRY_SCHEDULE_MS[index] ??
    DLQ_RETRY_SCHEDULE_MS[DLQ_RETRY_SCHEDULE_MS.length - 1] ??
    DLQ_MIN_RETRY_DELAY_MS;
  const jittered = base * (1 - DLQ_RETRY_JITTER * random());
  return Math.max(DLQ_MIN_RETRY_DELAY_MS, Math.round(jittered));
}

export function dlqRetryBackoffStrategy(attemptsMade: number): number {
  return computeDlqRetryDelayMs(attemptsMade);
}

export function withDlqRetryPolicy(options: JobsOptions): JobsOptions {
  return {
    ...options,
    attempts: DLQ_TOTAL_ATTEMPTS,
    backoff: { type: 'custom', delay: DLQ_RETRY_SCHEDULE_MS[0] },
  };
}

export function isDlqRetryWindowExhausted(
  firstAttemptAt: number | undefined,
  now: number = Date.now()
): boolean {
  if (!firstAttemptAt) return false;
  return now - firstAttemptAt >= DLQ_RETRY_WINDOW_MS;
}
