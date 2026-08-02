import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { NotificationProvider, useNotifications, groupNotifications } from '../NotificationContext';
import type { ReactNode } from 'react';

function wrapper({ children }: { children: ReactNode }) {
  return <NotificationProvider>{children}</NotificationProvider>;
}

beforeEach(() => {
  vi.useFakeTimers();
});

describe('NotificationContext', () => {
  describe('useNotifications', () => {
    it('should start with empty state', () => {
      const { result } = renderHook(() => useNotifications(), { wrapper });

      expect(result.current.notifications).toEqual([]);
      expect(result.current.toasts).toEqual([]);
      expect(result.current.unreadCount).toBe(0);
    });

    it('should add a notification via push', () => {
      const { result } = renderHook(() => useNotifications(), { wrapper });

      act(() => {
        result.current.push({
          type: 'course_update',
          title: 'New Course',
          message: 'Web3 101 is now available.',
        });
      });

      expect(result.current.notifications).toHaveLength(1);
      expect(result.current.notifications[0].title).toBe('New Course');
      expect(result.current.notifications[0].type).toBe('course_update');
      expect(result.current.notifications[0].read).toBe(false);
      expect(result.current.notifications[0].id).toBeTruthy();
      expect(result.current.notifications[0].timestamp).toBeTruthy();
      expect(result.current.unreadCount).toBe(1);
    });

    it('should support all new notification types', () => {
      const { result } = renderHook(() => useNotifications(), { wrapper });

      act(() => {
        result.current.push({
          type: 'course_update',
          title: 'Course Update',
          message: 'Updated content.',
        });
      });

      act(() => {
        result.current.push({
          type: 'announcement',
          title: 'Platform Announcement',
          message: 'New features!',
        });
      });

      act(() => {
        result.current.push({
          type: 'learning_opportunity',
          title: 'Workshop',
          message: 'Join the workshop.',
        });
      });

      expect(result.current.notifications).toHaveLength(3);
      expect(result.current.notifications[0].type).toBe('learning_opportunity');
      expect(result.current.notifications[1].type).toBe('announcement');
      expect(result.current.notifications[2].type).toBe('course_update');
    });

    it('should mark a notification as read', () => {
      const { result } = renderHook(() => useNotifications(), { wrapper });

      act(() => {
        result.current.push({
          type: 'course_update',
          title: 'Test',
          message: 'Mark me.',
        });
      });

      const notifId = result.current.notifications[0].id;

      act(() => {
        result.current.markRead(notifId);
      });

      expect(result.current.notifications[0].read).toBe(true);
      expect(result.current.unreadCount).toBe(0);
    });

    it('should mark all notifications as read', () => {
      const { result } = renderHook(() => useNotifications(), { wrapper });

      act(() => {
        result.current.push({ type: 'course_update', title: 'A', message: '1' });
        result.current.push({ type: 'announcement', title: 'B', message: '2' });
      });

      act(() => {
        result.current.markAllRead();
      });

      expect(result.current.notifications.every((n) => n.read)).toBe(true);
      expect(result.current.unreadCount).toBe(0);
    });

    it('should dismiss toasts', () => {
      const { result } = renderHook(() => useNotifications(), { wrapper });

      act(() => {
        result.current.push({ type: 'course_update', title: 'Toast', message: 'Dismiss me.' });
      });

      const toastId = result.current.toasts[0].id;
      expect(result.current.toasts).toHaveLength(1);

      act(() => {
        result.current.dismissToast(toastId);
      });

      expect(result.current.toasts).toHaveLength(0);
    });

    it('should keep notifications in list after toast is dismissed', () => {
      const { result } = renderHook(() => useNotifications(), { wrapper });

      act(() => {
        result.current.push({ type: 'course_update', title: 'Persist', message: 'Stay in list.' });
      });

      const notifId = result.current.notifications[0].id;
      const toastId = result.current.toasts[0].id;

      act(() => {
        result.current.dismissToast(toastId);
      });

      expect(result.current.toasts).toHaveLength(0);
      expect(result.current.notifications).toHaveLength(1);
      expect(result.current.notifications[0].id).toBe(notifId);
    });

    it('should cap toasts at max 3', () => {
      const { result } = renderHook(() => useNotifications(), { wrapper });

      act(() => {
        result.current.push({ type: 'course_update', title: 'A', message: '1' });
        vi.advanceTimersByTime(300);
        result.current.push({ type: 'course_update', title: 'B', message: '2' });
        vi.advanceTimersByTime(300);
        result.current.push({ type: 'course_update', title: 'C', message: '3' });
        vi.advanceTimersByTime(300);
        result.current.push({ type: 'course_update', title: 'D', message: '4' });
      });

      expect(result.current.toasts).toHaveLength(3);
      expect(result.current.notifications).toHaveLength(4);
    });

    it('should throw when used outside provider', () => {
      try {
        renderHook(() => useNotifications());
      } catch (e) {
        expect((e as Error).message).toMatch(/NotificationProvider/);
      }
    });
  });

  describe('groupNotifications', () => {
    it('should group notifications by type', () => {
      const notifications = [
        { id: '1', type: 'course_update' as const, title: 'A', message: 'm', timestamp: 5, read: false },
        { id: '2', type: 'course_update' as const, title: 'B', message: 'm', timestamp: 4, read: true },
        { id: '3', type: 'announcement' as const, title: 'C', message: 'm', timestamp: 3, read: false },
        { id: '4', type: 'enrollment' as const, title: 'D', message: 'm', timestamp: 2, read: true },
      ];

      const groups = groupNotifications(notifications);
      expect(groups).toHaveLength(3);

      const courseGroup = groups.find((g) => g.type === 'course_update');
      expect(courseGroup?.count).toBe(2);
      expect(courseGroup?.read).toBe(false);

      const annGroup = groups.find((g) => g.type === 'announcement');
      expect(annGroup?.count).toBe(1);
    });

    it('should return groups sorted by latest timestamp', () => {
      const notifications = [
        { id: '1', type: 'enrollment' as const, title: 'Old', message: 'm', timestamp: 1, read: true },
        { id: '2', type: 'course_update' as const, title: 'New', message: 'm', timestamp: 10, read: false },
      ];

      const groups = groupNotifications(notifications);
      expect(groups[0].type).toBe('course_update');
      expect(groups[1].type).toBe('enrollment');
    });
  });
});
