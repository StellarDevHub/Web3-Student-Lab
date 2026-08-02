import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { NotificationProvider, useNotifications } from '../../contexts/NotificationContext';
import { useCourseNotifications } from '../useCourseNotifications';
import type { ReactNode } from 'react';

const { mockIo, mockOn, mockDisconnect } = vi.hoisted(() => {
  const mockOn = vi.fn();
  const mockDisconnect = vi.fn();
  const mockConnect = vi.fn();
  const mockIo = vi.fn(() => ({
    on: mockOn,
    disconnect: mockDisconnect,
    connect: mockConnect,
  }));
  return { mockIo, mockOn, mockDisconnect, mockConnect };
});

vi.mock('socket.io-client', () => ({
  io: mockIo,
}));

let registeredHandlers: Map<string, (...args: unknown[]) => void> = new Map();

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.setItem('auth_token', 'test-token');
  registeredHandlers = new Map();

  mockOn.mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
    registeredHandlers.set(event, handler);
    return { on: mockOn, disconnect: mockDisconnect };
  });
});

afterEach(() => {
  localStorage.removeItem('auth_token');
  vi.useRealTimers();
  vi.clearAllMocks();
});

function emitEvent(event: string, data: unknown) {
  const handler = registeredHandlers.get(event);
  if (handler) {
    handler(data);
  }
}

function wrapper({ children }: { children: ReactNode }) {
  return <NotificationProvider>{children}</NotificationProvider>;
}

describe('useCourseNotifications', () => {
  it('should not connect without an auth token', () => {
    localStorage.removeItem('auth_token');

    const { result } = renderHook(() => useCourseNotifications(), { wrapper });

    expect(mockIo).not.toHaveBeenCalled();
    expect(result.current.current).toBeNull();
  });

  it('should connect with auth token', () => {
    renderHook(() => useCourseNotifications(), { wrapper });

    expect(mockIo).toHaveBeenCalledTimes(1);
    const [url, opts] = mockIo.mock.calls[0];
    expect(url).toBe('ws://localhost:8080');
    expect(opts.auth.token).toBe('test-token');
  });

  it('should push course_created events as course_update notifications', () => {
    const { result: notifResult } = renderHook(
      () => ({ notifs: useNotifications(), _hook: useCourseNotifications() }),
      { wrapper },
    );

    act(() => {
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
    });

    expect(notifResult.current.notifs.notifications).toHaveLength(1);
    expect(notifResult.current.notifs.notifications[0].type).toBe('course_update');
    expect(notifResult.current.notifs.notifications[0].title).toBe('New Course Available');
  });

  it('should push course_updated events as course_update notifications', () => {
    const { result: notifResult } = renderHook(
      () => ({ notifs: useNotifications(), _hook: useCourseNotifications() }),
      { wrapper },
    );

    act(() => {
      emitEvent('course_notification', {
        id: 'n-2',
        type: 'course_updated',
        courseId: 'c-1',
        courseTitle: 'Web3 101',
        title: 'Course Updated',
        message: 'New modules added.',
        read: false,
        createdAt: new Date().toISOString(),
      });
    });

    expect(notifResult.current.notifs.notifications[0].type).toBe('course_update');
  });

  it('should push announcement events as announcement notifications', () => {
    const { result: notifResult } = renderHook(
      () => ({ notifs: useNotifications(), _hook: useCourseNotifications() }),
      { wrapper },
    );

    act(() => {
      emitEvent('course_notification', {
        id: 'n-3',
        type: 'announcement',
        title: 'Platform Update',
        message: 'We have new features!',
        read: false,
        createdAt: new Date().toISOString(),
      });
    });

    expect(notifResult.current.notifs.notifications[0].type).toBe('announcement');
  });

  it('should push learning_opportunity events correctly', () => {
    const { result: notifResult } = renderHook(
      () => ({ notifs: useNotifications(), _hook: useCourseNotifications() }),
      { wrapper },
    );

    act(() => {
      emitEvent('course_notification', {
        id: 'n-4',
        type: 'learning_opportunity',
        title: 'Workshop Alert',
        message: 'Sign up for the workshop.',
        read: false,
        createdAt: new Date().toISOString(),
      });
    });

    expect(notifResult.current.notifs.notifications[0].type).toBe('learning_opportunity');
  });

  it('should clean up socket on unmount', () => {
    const { unmount } = renderHook(() => useCourseNotifications(), { wrapper });

    unmount();

    expect(mockDisconnect).toHaveBeenCalled();
  });
});
