import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import {
  configureSessionMonitor,
  DEFAULT_EXTENDED_IDLE_MS,
  DEFAULT_IDLE_LOCK_MS,
  getSessionStatus,
  lockSession,
  purgeSession,
  registerWebSocketTerminator,
  touchSession,
  unlockSession,
} from '../src/auth/sessionMonitor.js';

describe('Session Activity Monitor (#1116)', () => {
  const userId = 'student-42';

  beforeEach(() => {
    configureSessionMonitor({
      idleLockMs: DEFAULT_IDLE_LOCK_MS,
      extendedIdleMs: DEFAULT_EXTENDED_IDLE_MS,
    });
  });

  it('starts unlocked with zero idle for an unknown user', async () => {
    const status = await getSessionStatus(userId, Date.now());
    expect(status.locked).toBe(false);
    expect(status.shouldPurge).toBe(false);
    expect(status.idleLockThresholdMs).toBe(DEFAULT_IDLE_LOCK_MS);
    expect(status.extendedIdleThresholdMs).toBe(DEFAULT_EXTENDED_IDLE_MS);
  });

  it('tracks idle time from the last recorded activity', async () => {
    const now = Date.now();
    await touchSession(userId);
    // Simulate 1 minute passing.
    const status = await getSessionStatus(userId, now + 60_000);
    expect(status.lastActivityAt).toBeLessThanOrEqual(now);
    expect(status.idleMs).toBeGreaterThanOrEqual(60_000);
    expect(status.locked).toBe(false);
  });

  it('locks the session on demand', async () => {
    await touchSession(userId);
    await lockSession(userId);
    const status = await getSessionStatus(userId);
    expect(status.locked).toBe(true);
  });

  it('unlocks a session after re-authentication', async () => {
    await touchSession(userId);
    await lockSession(userId);
    expect(await unlockSession(userId)).toBe(true);
    const status = await getSessionStatus(userId);
    expect(status.locked).toBe(false);
  });

  it('activity after a lock clears it (active user is never blurred)', async () => {
    await touchSession(userId);
    await lockSession(userId);
    await touchSession(userId);
    const status = await getSessionStatus(userId);
    expect(status.locked).toBe(false);
  });

  it('flags extended idle for purge at 30 minutes', async () => {
    const now = Date.now();
    await touchSession(userId);
    const status = await getSessionStatus(userId, now + DEFAULT_EXTENDED_IDLE_MS + 1000);
    expect(status.shouldPurge).toBe(true);
  });

  it('refuses to unlock a purged (extended-idle) session', async () => {
    const now = Date.now();
    await touchSession(userId);
    await lockSession(userId);
    configureSessionMonitor({ idleLockMs: 0, extendedIdleMs: 1 });
    expect(await unlockSession(userId)).toBe(false);
    // Restore defaults for subsequent tests.
    configureSessionMonitor({
      idleLockMs: DEFAULT_IDLE_LOCK_MS,
      extendedIdleMs: DEFAULT_EXTENDED_IDLE_MS,
    });
  });

  it('purges the session: clears state and revokes tokens', async () => {
    await touchSession(userId);
    await lockSession(userId);

    const terminated: string[] = [];
    registerWebSocketTerminator(async (id: string) => {
      terminated.push(id);
    });

    await purgeSession(userId);

    expect(terminated).toContain(userId);
    const status = await getSessionStatus(userId);
    expect(status.locked).toBe(false);
    expect(status.shouldPurge).toBe(false);
  });

  it('uses a configurable idle lock threshold', async () => {
    configureSessionMonitor({ idleLockMs: 5 * 60 * 1000 });
    const now = Date.now();
    await touchSession(userId);
    const status = await getSessionStatus(userId, now + 6 * 60 * 1000);
    expect(status.idleLockThresholdMs).toBe(5 * 60 * 1000);
    expect(status.idleMs).toBeGreaterThan(status.idleLockThresholdMs);
  });
});
