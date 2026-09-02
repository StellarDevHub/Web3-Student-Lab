/**
 * Redlock Distributed Locking (#1135).
 *
 * Provides distributed mutual exclusion for smart contract compilation jobs
 * using Redis-based Redlock algorithm. Prevents the same contract from being
 * compiled simultaneously by multiple workers.
 *
 * Usage:
 *   import { withLock } from '../utils/redlock';
 *
 *   const result = await withLock(`compile:${contractId}`, 30_000, async () => {
 *     // Only one worker runs this at a time
 *     return await compileContract(contractId);
 *   });
 */

import { redisConnection } from './redis';

const LOCK_PREFIX = 'lock:';
const DEFAULT_TTL_MS = 30_000;
const RETRY_COUNT = 3;
const RETRY_DELAY_MS = 200;

/**
 * Generate a random lock value for ownership verification.
 */
function generateLockValue(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
}

/**
 * Attempt to acquire a distributed lock.
 * Returns the lock value if acquired, null otherwise.
 */
async function acquireLock(key: string, ttlMs: number): Promise<string | null> {
  const lockValue = generateLockValue();
  const ttlSeconds = Math.ceil(ttlMs / 1000);

  try {
    // SET NX EX — atomic acquire
    const result = await redisConnection.set(
      `${LOCK_PREFIX}${key}`,
      lockValue,
      'EX',
      ttlSeconds,
      'NX',
    );
    return result === 'OK' ? lockValue : null;
  } catch {
    return null;
  }
}

/**
 * Release a distributed lock, only if we own it.
 */
async function releaseLock(key: string, lockValue: string): Promise<boolean> {
  try {
    // Lua script: check-and-delete atomically
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    const result = await redisConnection.eval(script, 1, `${LOCK_PREFIX}${key}`, lockValue);
    return result === 1;
  } catch {
    return false;
  }
}

/**
 * Extend a lock's TTL (re-lock before expiry).
 */
async function extendLock(key: string, lockValue: string, ttlMs: number): Promise<boolean> {
  try {
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("pexpire", KEYS[1], ARGV[2])
      else
        return 0
      end
    `;
    const result = await redisConnection.eval(
      script,
      1,
      `${LOCK_PREFIX}${key}`,
      lockValue,
      String(ttlMs),
    );
    return result === 1;
  } catch {
    return false;
  }
}

/**
 * Execute a function while holding a distributed lock.
 * Automatically retries acquisition and releases on completion.
 *
 * @param key      Lock identifier (e.g. "compile:contract-123")
 * @param ttlMs    Lock TTL in milliseconds
 * @param fn       Function to execute while holding the lock
 * @returns        The return value of fn
 * @throws         Error if lock cannot be acquired after retries
 */
export async function withLock<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  let lockValue: string | null = null;

  for (let attempt = 0; attempt < RETRY_COUNT; attempt++) {
    lockValue = await acquireLock(key, ttlMs);
    if (lockValue) break;
    if (attempt < RETRY_COUNT - 1) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)));
    }
  }

  if (!lockValue) {
    throw new Error(`Failed to acquire lock "${key}" after ${RETRY_COUNT} attempts`);
  }

  // Set up auto-extension to prevent expiry during long operations
  const extendInterval = setInterval(async () => {
    await extendLock(key, lockValue!, ttlMs);
  }, ttlMs / 3);

  try {
    return await fn();
  } finally {
    clearInterval(extendInterval);
    await releaseLock(key, lockValue);
  }
}

/**
 * Check if a lock is currently held.
 */
export async function isLocked(key: string): Promise<boolean> {
  const exists = await redisConnection.exists(`${LOCK_PREFIX}${key}`);
  return exists === 1;
}
