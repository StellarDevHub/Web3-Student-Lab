import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
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

const { mockIo, mockOn, mockDisconnect, mockConnect, mockRemoveAllListeners } = vi.hoisted(() => {
  const mockOn = vi.fn();
  const mockDisconnect = vi.fn();
  const mockConnect = vi.fn();
  const mockRemoveAllListeners = vi.fn();
  const mockIo = vi.fn(() => ({
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

beforeEach(() => {
  localStorage.setItem('token', 'test-token');
  registeredHandlers = new Map();

  mockOn.mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
    registeredHandlers.set(event, handler);
    return { on: mockOn, disconnect: mockDisconnect };
  });
});

afterEach(() => {
  localStorage.removeItem('token');
  localStorage.removeItem('auth_token');
  vi.clearAllMocks();
});

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
    localStorage.removeItem('token');

    const { result } = renderHook(() => useCourseNotifications(), { wrapper });

    expect(mockIo).not.toHaveBeenCalled();
    expect(result.current.connectionState).toBe('idle');
  });

  it('should connect with auth token', () => {
    renderHook(() => useCourseNotifications(), { wrapper });

    expect(mockIo).toHaveBeenCalledTimes(1);
    const [url, opts] = mockIo.mock.calls[0] as [string, { auth: { token: string } }];
    expect(url).toBe('ws://localhost:8080');
    expect(opts.auth.token).toBe('test-token');
  });

  it('should configure bounded exponential backoff with jitter', () => {
    renderHook(() => useCourseNotifications(), { wrapper });

    const [, opts] = mockIo.mock.calls[0] as [string, Record<string, unknown>];
    expect(opts.reconnection).toBe(true);
    expect(opts.reconnectionAttempts).toBe(COURSE_WS_MAX_RECONNECT_ATTEMPTS);
    expect(opts.reconnectionDelay).toBe(COURSE_WS_INITIAL_DELAY_MS);
    expect(opts.reconnectionDelayMax).toBe(COURSE_WS_MAX_DELAY_MS);
    expect(opts.randomizationFactor).toBe(COURSE_WS_RANDOMIZATION_FACTOR);
    expect(opts.timeout).toBe(COURSE_WS_CONNECTION_TIMEOUT_MS);
  });

  it('should push course_created events as course_update notifications', () => {
    const { result: notifResult } = renderHook(
      () => ({ notifs: useNotifications(), _hook: useCourseNotifications() }),
      { wrapper },
    );

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

  it('should push announcement events as announcement notifications', () => {
    const { result: notifResult } = renderHook(
      () => ({ notifs: useNotifications(), _hook: useCourseNotifications() }),
      { wrapper },
    );

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

  it('should track connection state as connected', () => {
    const { result } = renderHook(() => useCourseNotifications(), { wrapper });

    expect(result.current.connectionState).toBe('idle');

    emitEvent('connect', undefined);

    expect(result.current.connectionState).toBe('connected');
    expect(result.current.reconnectAttempt).toBe(0);
    expect(result.current.retryExhausted).toBe(false);
  });

  it('should enter reconnecting state on unexpected disconnect', () => {
    const { result } = renderHook(() => useCourseNotifications(), { wrapper });

    emitEvent('connect', undefined);
    emitEvent('disconnect', 'transport close');

    expect(result.current.connectionState).toBe('reconnecting');
  });

  it('should track reconnect attempts and recover', () => {
    const { result } = renderHook(() => useCourseNotifications(), { wrapper });

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

  it('should mark retries exhausted when reconnection fails', () => {
    const { result } = renderHook(() => useCourseNotifications(), { wrapper });

    emitEvent('connect_error', { message: 'xhr poll error' });
    emitEvent('reconnect_attempt', 1);
    emitEvent('reconnect_failed');

    expect(result.current.connectionState).toBe('disconnected');
    expect(result.current.retryExhausted).toBe(true);
  });

  it('should clean up socket on unmount and prevent reconnect attempts', () => {
    const { unmount } = renderHook(() => useCourseNotifications(), { wrapper });

    unmount();

    expect(mockRemoveAllListeners).toHaveBeenCalled();
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('should not reconnect after manual logout (token removed)', () => {
    renderHook(() => useCourseNotifications(), { wrapper });

    expect(mockIo).toHaveBeenCalledTimes(1);

    act(() => {
      localStorage.removeItem('token');
      window.dispatchEvent(new Event('storage'));
    });

    // The stale socket is torn down and no new socket is created.
    expect(mockDisconnect).toHaveBeenCalled();
    expect(mockIo).toHaveBeenCalledTimes(1);
  });

  it('should remove listeners and disconnect when the url changes (route change)', () => {
    const { rerender } = renderHook(
      ({ url }: { url: string }) => useCourseNotifications(url),
      { wrapper, initialProps: { url: 'ws://localhost:8080' } },
    );

    expect(mockIo).toHaveBeenCalledTimes(1);

    act(() => {
      rerender({ url: 'ws://localhost:8081' });
    });

    expect(mockRemoveAllListeners).toHaveBeenCalled();
    expect(mockDisconnect).toHaveBeenCalled();
    expect(mockIo).toHaveBeenCalledTimes(2);
  });
});
