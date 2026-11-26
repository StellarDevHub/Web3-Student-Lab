import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { NotificationProvider, useNotifications } from '../../contexts/NotificationContext';
import {
  useCourseNotifications,
  COURSE_WS_MAX_RECONNECT_ATTEMPTS,
  COURSE_WS_INITIAL_DELAY_MS,
  COURSE_WS_MAX_DELAY_MS,
  COURSE_WS_RANDOMIZATION_FACTOR,
  COURSE_WS_CONNECTION_TIMEOUT_MS,
} from '../useCourseNotifications';
import type { ReactNode } from 'react';
import { clearSessionStorage, storeEncryptedSession } from '../../lib/credentialStorage';

const { mockIo, mockOn, mockDisconnect, mockConnect, mockRemoveAllListeners } = vi.hoisted(() => {
  const mockOn = vi.fn();
  const mockDisconnect = vi.fn();
  const mockConnect = vi.fn();
  const mockRemoveAllListeners = vi.fn();
  const mockIo = vi.fn((_url: string, _options: Record<string, unknown>) => ({
    on: mockOn,
    disconnect: mockDisconnect,
    connect: mockConnect,
    removeAllListeners: mockRemoveAllListeners,
  }));
  return { mockIo, mockOn, mockDisconnect, mockConnect, mockRemoveAllListeners };
});

vi.mock('socket.io-client', () => ({
  io: mockIo,
}));

let registeredHandlers: Map<string, (...args: unknown[]) => void> = new Map();

beforeEach(async () => {
  await storeEncryptedSession({ token: 'test-token' });
  registeredHandlers = new Map();

  mockOn.mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
    registeredHandlers.set(event, handler);
    return { on: mockOn, disconnect: mockDisconnect };
  });
});

afterEach(() => {
  clearSessionStorage();
  vi.clearAllMocks();
});

const waitForConnection = () => waitFor(() => expect(mockIo).toHaveBeenCalled());

function emitEvent(event: string, data: unknown) {
  const handler = registeredHandlers.get(event);
  if (handler) {
    act(() => handler(data));
  }
}

function wrapper({ children }: { children: ReactNode }) {
  return <NotificationProvider>{children}</NotificationProvider>;
}

describe('useCourseNotifications', () => {
  it('should not connect without an auth token', () => {
    clearSessionStorage();

    const { result } = renderHook(() => useCourseNotifications(), { wrapper });

    expect(mockIo).not.toHaveBeenCalled();
    expect(result.current.connectionState).toBe('idle');
  });

  it('should connect with auth token', async () => {
    renderHook(() => useCourseNotifications(), { wrapper });

    await waitFor(() => expect(mockIo).toHaveBeenCalledTimes(1));
    const [url, opts] = mockIo.mock.calls[0];
    expect(url).toBe('ws://localhost:8080');
    expect((opts.auth as { token: string }).token).toBe('test-token');
  });

  it('should configure bounded exponential backoff with jitter', async () => {
    renderHook(() => useCourseNotifications(), { wrapper });

    await waitForConnection();
    const [, opts] = mockIo.mock.calls[0];
    expect(opts.reconnection).toBe(true);
    expect(opts.reconnectionAttempts).toBe(COURSE_WS_MAX_RECONNECT_ATTEMPTS);
    expect(opts.reconnectionDelay).toBe(COURSE_WS_INITIAL_DELAY_MS);
    expect(opts.reconnectionDelayMax).toBe(COURSE_WS_MAX_DELAY_MS);
    expect(opts.randomizationFactor).toBe(COURSE_WS_RANDOMIZATION_FACTOR);
    expect(opts.timeout).toBe(COURSE_WS_CONNECTION_TIMEOUT_MS);
  });

  it('should push course_created events as course_update notifications', async () => {
    const { result: notifResult } = renderHook(
      () => ({ notifs: useNotifications(), _hook: useCourseNotifications() }),
      { wrapper },
    );

    await waitForConnection();
    emitEvent('course_notification', {
      id: 'n-1',
      type: 'course_created',
      courseId: 'c-1',
      courseTitle: 'Web3 101',
      title: 'New Course Available',
      message: 'Start learning today!',
      read: false,
      createdAt: new Date().toISOString(),
    });

    expect(notifResult.current.notifs.notifications).toHaveLength(1);
    expect(notifResult.current.notifs.notifications[0].type).toBe('course_update');
    expect(notifResult.current.notifs.notifications[0].title).toBe('New Course Available');
  });

  it('should push announcement events as announcement notifications', async () => {
    const { result: notifResult } = renderHook(
      () => ({ notifs: useNotifications(), _hook: useCourseNotifications() }),
      { wrapper },
    );

    await waitForConnection();
    emitEvent('course_notification', {
      id: 'n-3',
      type: 'announcement',
      title: 'Platform Update',
      message: 'We have new features!',
      read: false,
      createdAt: new Date().toISOString(),
    });

    expect(notifResult.current.notifs.notifications[0].type).toBe('announcement');
  });

  it('should track connection state as connected', async () => {
    const { result } = renderHook(() => useCourseNotifications(), { wrapper });

    expect(result.current.connectionState).toBe('idle');

    await waitForConnection();
    emitEvent('connect', undefined);

    expect(result.current.connectionState).toBe('connected');
    expect(result.current.reconnectAttempt).toBe(0);
    expect(result.current.retryExhausted).toBe(false);
  });

  it('should enter reconnecting state on unexpected disconnect', async () => {
    const { result } = renderHook(() => useCourseNotifications(), { wrapper });

    await waitForConnection();
    emitEvent('connect', undefined);
    emitEvent('disconnect', 'transport close');

    expect(result.current.connectionState).toBe('reconnecting');
  });

  it('should track reconnect attempts and recover', async () => {
    const { result } = renderHook(() => useCourseNotifications(), { wrapper });

    await waitForConnection();
    emitEvent('connect', undefined);
    emitEvent('disconnect', 'transport close');
    emitEvent('reconnect_attempt', 1);

    expect(result.current.connectionState).toBe('reconnecting');
    expect(result.current.reconnectAttempt).toBe(1);

    emitEvent('reconnect', 1);

    expect(result.current.connectionState).toBe('connected');
    expect(result.current.reconnectAttempt).toBe(0);
    expect(result.current.retryExhausted).toBe(false);
  });

  it('should mark retries exhausted when reconnection fails', async () => {
    const { result } = renderHook(() => useCourseNotifications(), { wrapper });

    await waitForConnection();
    emitEvent('connect_error', { message: 'xhr poll error' });
    emitEvent('reconnect_attempt', 1);
    emitEvent('reconnect_failed', undefined);

    expect(result.current.connectionState).toBe('disconnected');
    expect(result.current.retryExhausted).toBe(true);
  });

  it('should clean up socket on unmount and prevent reconnect attempts', async () => {
    const { unmount } = renderHook(() => useCourseNotifications(), { wrapper });

    await waitForConnection();
    unmount();

    expect(mockRemoveAllListeners).toHaveBeenCalled();
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('should not reconnect after manual logout (token removed)', async () => {
    renderHook(() => useCourseNotifications(), { wrapper });

    await waitFor(() => expect(mockIo).toHaveBeenCalledTimes(1));

    act(() => clearSessionStorage());

    // The stale socket is torn down and no new socket is created.
    await waitFor(() => expect(mockDisconnect).toHaveBeenCalled());
    expect(mockIo).toHaveBeenCalledTimes(1);
  });

  it('should remove listeners and disconnect when the url changes (route change)', async () => {
    const { rerender } = renderHook(
      ({ url }: { url: string }) => useCourseNotifications(url),
      { wrapper, initialProps: { url: 'ws://localhost:8080' } },
    );

    await waitFor(() => expect(mockIo).toHaveBeenCalledTimes(1));

    act(() => {
      rerender({ url: 'ws://localhost:8081' });
    });

    expect(mockRemoveAllListeners).toHaveBeenCalled();
    expect(mockDisconnect).toHaveBeenCalled();
    await waitFor(() => expect(mockIo).toHaveBeenCalledTimes(2));
  });
});
