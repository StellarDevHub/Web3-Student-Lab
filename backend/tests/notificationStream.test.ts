import { describe, expect, it, beforeEach } from '@jest/globals';
import { Response } from 'express';
import { SseSessionManager } from '../src/sse/SseSessionManager.js';
import {
  _clearRecentEvents,
  _recentCount,
  forwardNotification,
  NOTIFICATIONS_CHANNEL,
  replayMissedEvents,
  RECENT_EVENTS_PER_USER,
} from '../src/sse/notificationStream.js';

const createMockResponse = (): Response => {
  const chunks: string[] = [];
  const res = {
    write: jest.fn((chunk: string) => {
      chunks.push(String(chunk));
      return true;
    }),
    _chunks: chunks,
  } as unknown as Response & { _chunks: string[] };
  return res;
};

const notifMessage = (id: string, title: string, userId?: string): string =>
  JSON.stringify({
    id,
    type: 'announcement',
    ...(userId ? { userId } : {}),
    title,
    message: title,
    read: false,
    createdAt: new Date().toISOString(),
  });

describe('SSE Notification Stream (#1122)', () => {
  beforeEach(() => {
    _clearRecentEvents();
  });

  it('exposes the course_notifications Redis channel', () => {
    expect(NOTIFICATIONS_CHANNEL).toBe('course_notifications');
  });

  it('forwards targeted events to the session of the recipient user only', () => {
    const manager = new SseSessionManager(60000);
    const aliceRes = createMockResponse();
    const bobRes = createMockResponse();

    const aliceClient = manager.addClient('alice', aliceRes);
    const bobClient = manager.addClient('bob', bobRes);

    forwardNotification(notifMessage('notif-1', 'For Alice', 'alice'));

    expect(aliceRes.write).toHaveBeenCalledWith(expect.stringContaining('event: announcement'));
    expect(aliceRes.write).toHaveBeenCalledWith(expect.stringContaining('"title":"For Alice"'));
    expect(bobRes.write).not.toHaveBeenCalled();

    manager.removeClient('alice', aliceClient);
    manager.removeClient('bob', bobClient);
  });

  it('includes an id: line when an event id is provided (Last-Event-ID support)', () => {
    const manager = new SseSessionManager(60000);
    const res = createMockResponse();
    const clientId = manager.addClient('alice', res);

    forwardNotification(notifMessage('notif-42', 'Hi', 'alice'));

    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('id: notif-42'));
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('event: announcement'));

    manager.removeClient('alice', clientId);
  });

  it('broadcasts to all connected clients when no userId is targeted', () => {
    const manager = new SseSessionManager(60000);
    const aliceRes = createMockResponse();
    const bobRes = createMockResponse();

    const aliceClient = manager.addClient('alice', aliceRes);
    const bobClient = manager.addClient('bob', bobRes);

    forwardNotification(notifMessage('notif-broadcast', 'Global announcement'));

    expect(aliceRes.write).toHaveBeenCalledWith(
      expect.stringContaining('"title":"Global announcement"')
    );
    expect(bobRes.write).toHaveBeenCalledWith(
      expect.stringContaining('"title":"Global announcement"')
    );

    manager.removeClient('alice', aliceClient);
    manager.removeClient('bob', bobClient);
  });

  it('remembers recent events per user for reconnection replay', () => {
    const manager = new SseSessionManager(60000);
    const res = createMockResponse();
    const clientId = manager.addClient('alice', res);

    // Targeted
    forwardNotification(notifMessage('notif-1', 'A', 'alice'));
    // Broadcast
    forwardNotification(notifMessage('notif-2', 'B'));

    expect(_recentCount('alice')).toBeGreaterThanOrEqual(1);
    expect(_recentCount(undefined)).toBeGreaterThanOrEqual(1);

    manager.removeClient('alice', clientId);
  });

  it('replays only events with an id newer than Last-Event-ID', () => {
    const manager = new SseSessionManager(60000);
    const res = createMockResponse();
    const clientId = manager.addClient('alice', res);

    forwardNotification(notifMessage('notif-1', 'Old', 'alice'));
    forwardNotification(notifMessage('notif-2', 'Mid', 'alice'));
    forwardNotification(notifMessage('notif-3', 'New', 'alice'));

    const replayRes = createMockResponse();
    replayMissedEvents('alice', 'notif-2', replayRes);

    const allWrites = (replayRes.write as unknown as jest.Mock).mock.calls
      .map((call) => String(call[0]))
      .join('');
    expect(allWrites).toContain('notif-3');
    expect(allWrites).not.toContain('notif-1');
    expect(allWrites).not.toContain('notif-2');

    manager.removeClient('alice', clientId);
  });

  it('replays nothing when no Last-Event-ID is provided', () => {
    const manager = new SseSessionManager(60000);
    const res = createMockResponse();
    const clientId = manager.addClient('alice', res);
    forwardNotification(notifMessage('notif-1', 'A', 'alice'));

    const replayRes = createMockResponse();
    replayMissedEvents('alice', null, replayRes);
    expect(replayRes.write).not.toHaveBeenCalled();

    manager.removeClient('alice', clientId);
  });

  it('caps the per-user replay buffer', () => {
    const manager = new SseSessionManager(60000);
    const res = createMockResponse();
    const clientId = manager.addClient('alice', res);

    for (let i = 0; i < RECENT_EVENTS_PER_USER + 50; i++) {
      forwardNotification(notifMessage(`notif-${i}`, `N${i}`, 'alice'));
    }

    const replayRes = createMockResponse();
    replayMissedEvents('alice', 'notif-0', replayRes);
    // Buffer is bounded — not all 150 events survive.
    const allWrites = (replayRes.write as unknown as jest.Mock).mock.calls
      .map((call) => String(call[0]))
      .join('');
    expect(allWrites).toContain('notif-149');
    expect(allWrites).not.toContain('notif-0');

    manager.removeClient('alice', clientId);
  });

  it('ignores malformed messages', () => {
    expect(forwardNotification('not json')).toBe(false);
    expect(forwardNotification(JSON.stringify({ type: 'announcement' }))).toBe(false);
  });
});
