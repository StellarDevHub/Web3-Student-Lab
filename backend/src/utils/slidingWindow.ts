/**
 * Sliding-Window Log — Issue BE-012
 *
 * Exact sliding-window-log rate limiting on a Redis sorted set: every accepted
 * request is a member scored by its timestamp, entries older than the window
 * are trimmed on each check, and a request is admitted only while fewer than
 * `limit` entries remain. Because the window slides continuously there is no
 * boundary at which the counter resets, so callers cannot double up a burst
 * across two fixed windows.
 *
 * Several windows (e.g. a 1s burst window and a 60s sustained window) are
 * evaluated atomically in a single Lua call: a request is recorded in all of
 * them or in none, so rejected requests never consume quota.
 *
 * An in-memory implementation with identical semantics is used when Redis is
 * unavailable (and in tests).
 */

import { randomUUID } from 'crypto';

export interface WindowRule {
  /** Short name for headers / logs, e.g. `burst` or `sustained`. */
  name: string;
  /** Maximum requests admitted inside the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface WindowState {
  name: string;
  limit: number;
  windowMs: number;
  /** Requests counted in the window, including this one if admitted. */
  count: number;
  remaining: number;
  /** Milliseconds until the oldest counted request leaves the window. */
  resetMs: number;
}

export interface SlidingWindowResult {
  allowed: boolean;
  /** The most restrictive window (lowest remaining / the one that blocked). */
  binding: WindowState;
  windows: WindowState[];
  /** Milliseconds until a retry can succeed; 0 when allowed. */
  retryAfterMs: number;
}

/** Minimal Redis surface needed (ioredis-compatible). */
export interface SlidingWindowRedis {
  eval(script: string, numKeys: number, ...args: Array<string | number>): Promise<unknown>;
}

export interface SlidingWindowStore {
  hit(key: string, rules: WindowRule[], now?: number): Promise<SlidingWindowResult>;
}

/**
 * KEYS[i]   = sorted set for rule i
 * ARGV[1]   = now (ms), ARGV[2] = unique member id
 * ARGV[3+2(i-1)] = windowMs_i, ARGV[4+2(i-1)] = limit_i
 * Returns a flat array: allowed, then per rule {count, oldestScore}.
 */
const SLIDING_WINDOW_LOG_SCRIPT = `
local now = tonumber(ARGV[1])
local member = ARGV[2]
local n = #KEYS
local counts = {}
local oldest = {}
local allowed = 1

for i = 1, n do
  local window = tonumber(ARGV[1 + 2 * i])
  local limit = tonumber(ARGV[2 + 2 * i])
  redis.call('ZREMRANGEBYSCORE', KEYS[i], '-inf', now - window)
  local count = redis.call('ZCARD', KEYS[i])
  counts[i] = count
  local first = redis.call('ZRANGE', KEYS[i], 0, 0, 'WITHSCORES')
  oldest[i] = first[2] or now
  if count >= limit then
    allowed = 0
  end
end

if allowed == 1 then
  for i = 1, n do
    local window = tonumber(ARGV[1 + 2 * i])
    redis.call('ZADD', KEYS[i], now, member)
    redis.call('PEXPIRE', KEYS[i], window)
    counts[i] = counts[i] + 1
  end
end

local out = { allowed }
for i = 1, n do
  table.insert(out, counts[i])
  table.insert(out, tostring(oldest[i]))
end
return out
`;

function buildResult(
  rules: WindowRule[],
  allowed: boolean,
  counts: number[],
  oldest: number[],
  now: number,
): SlidingWindowResult {
  const windows: WindowState[] = rules.map((rule, i) => {
    const count = counts[i] ?? 0;
    const oldestAt = oldest[i] ?? now;
    return {
      name: rule.name,
      limit: rule.limit,
      windowMs: rule.windowMs,
      count,
      remaining: Math.max(0, rule.limit - count),
      resetMs: Math.max(0, oldestAt + rule.windowMs - now),
    };
  });

  const blocking = windows.filter((w) => w.count >= w.limit);
  let retryAfterMs = 0;
  let binding: WindowState;

  if (!allowed && blocking.length > 0) {
    // Retry once every exhausted window has freed a slot.
    binding = blocking.reduce((a, b) => (b.resetMs > a.resetMs ? b : a));
    retryAfterMs = Math.max(1, binding.resetMs);
  } else {
    binding = windows.reduce((a, b) => (b.remaining / b.limit < a.remaining / a.limit ? b : a));
  }

  return { allowed, binding, windows, retryAfterMs };
}

function assertRules(rules: WindowRule[]): void {
  if (rules.length === 0) throw new Error('slidingWindow: at least one window rule is required');
  for (const rule of rules) {
    if (!(rule.limit > 0) || !(rule.windowMs > 0)) {
      throw new Error(`slidingWindow: invalid rule "${rule.name}"`);
    }
  }
}

export class RedisSlidingWindowStore implements SlidingWindowStore {
  constructor(private readonly redis: SlidingWindowRedis) {}

  async hit(key: string, rules: WindowRule[], now = Date.now()): Promise<SlidingWindowResult> {
    assertRules(rules);
    // Hash tag keeps every window of one identity on the same cluster slot.
    const keys = rules.map((rule) => `{${key}}:${rule.name}`);
    const args: Array<string | number> = [now, `${now}-${randomUUID()}`];
    for (const rule of rules) args.push(rule.windowMs, rule.limit);

    const raw = (await this.redis.eval(SLIDING_WINDOW_LOG_SCRIPT, keys.length, ...keys, ...args)) as Array<
      number | string
    >;

    const allowed = Number(raw[0]) === 1;
    const counts: number[] = [];
    const oldest: number[] = [];
    for (let i = 0; i < rules.length; i += 1) {
      counts.push(Number(raw[1 + i * 2]));
      oldest.push(Number(raw[2 + i * 2]));
    }
    return buildResult(rules, allowed, counts, oldest, now);
  }
}

export class MemorySlidingWindowStore implements SlidingWindowStore {
  private readonly logs = new Map<string, number[]>();

  async hit(key: string, rules: WindowRule[], now = Date.now()): Promise<SlidingWindowResult> {
    assertRules(rules);
    const counts: number[] = [];
    const oldest: number[] = [];
    let allowed = true;

    const logs = rules.map((rule) => {
      const logKey = `${key}:${rule.name}`;
      const log = (this.logs.get(logKey) ?? []).filter((ts) => ts > now - rule.windowMs);
      this.logs.set(logKey, log);
      counts.push(log.length);
      oldest.push(log[0] ?? now);
      if (log.length >= rule.limit) allowed = false;
      return log;
    });

    if (allowed) {
      logs.forEach((log, i) => {
        log.push(now);
        counts[i] = log.length;
      });
    }

    this.evictIdle(now, rules);
    return buildResult(rules, allowed, counts, oldest, now);
  }

  /** Drop empty logs so the map does not grow without bound. */
  private evictIdle(now: number, rules: WindowRule[]): void {
    if (this.logs.size < 10_000) return;
    const maxWindow = Math.max(...rules.map((r) => r.windowMs));
    for (const [key, log] of this.logs) {
      if (log.length === 0 || (log[log.length - 1] ?? 0) <= now - maxWindow) this.logs.delete(key);
    }
  }

  clear(): void {
    this.logs.clear();
  }
}

/**
 * Redis-backed store that degrades to an in-process log if Redis errors, so
 * an outage weakens (per-instance) limiting instead of disabling it.
 */
export class ResilientSlidingWindowStore implements SlidingWindowStore {
  private readonly fallback = new MemorySlidingWindowStore();

  constructor(private readonly primary: SlidingWindowStore) {}

  async hit(key: string, rules: WindowRule[], now = Date.now()): Promise<SlidingWindowResult> {
    try {
      return await this.primary.hit(key, rules, now);
    } catch {
      return this.fallback.hit(key, rules, now);
    }
  }
}
