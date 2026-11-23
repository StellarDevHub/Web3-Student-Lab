import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  NotificationProvider,
  useNotifications,
  groupNotifications,
  getStellarExpertUrl,
  getDedupeKey,
} from '../NotificationContext';
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

    it('should support priority ordering in toast queue', () => {
      const { result } = renderHook(() => useNotifications(), { wrapper });

      act(() => {
        result.current.push({
          type: 'system',
          title: 'Low priority',
          message: 'Low info',
          priority: 'low',
        });
        result.current.push({
          type: 'error',
          title: 'Urgent Error',
          message: 'Critical error occurred',
          priority: 'urgent',
        });
        result.current.push({
          type: 'signature',
          title: 'High priority tx',
          message: 'Signature required',
          priority: 'high',
        });
      });

      expect(result.current.toasts[0].title).toBe('Urgent Error');
      expect(result.current.toasts[1].title).toBe('High priority tx');
      expect(result.current.toasts[2].title).toBe('Low priority');
    });

    it('should deduplicate identical error/notification toasts', () => {
      const { result } = renderHook(() => useNotifications(), { wrapper });

      act(() => {
        result.current.push({
          type: 'error',
          title: 'Network Timeout',
          message: 'Failed to connect to RPC node',
        });
        result.current.push({
          type: 'error',
          title: 'Network Timeout',
          message: 'Failed to connect to RPC node',
        });
      });

      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0].count).toBe(2);
    });

    it('should support multi-step transaction live progress updates', () => {
      const { result } = renderHook(() => useNotifications(), { wrapper });
      let txId = '';

      act(() => {
        txId = result.current.push({
          type: 'signature',
          title: 'Mint Certificate',
          message: 'Initiating transaction...',
          step: 1,
          totalSteps: 3,
          stepName: 'Signing XDR',
        });
      });

      expect(result.current.toasts[0].progress).toBe(33);

      act(() => {
        result.current.updateProgress(txId, {
          step: 2,
          totalSteps: 3,
          stepName: 'Submitting to Horizon',
          txHash: 'abc123def456',
        });
      });

      expect(result.current.toasts[0].step).toBe(2);
      expect(result.current.toasts[0].progress).toBe(67);
      expect(result.current.toasts[0].txHash).toBe('abc123def456');
      expect(result.current.toasts[0].explorerUrl).toBe(
        'https://stellar.expert/explorer/public/tx/abc123def456'
      );
    });

    it('should generate correct Stellar Expert URLs', () => {
      const publicUrl = getStellarExpertUrl('12345', 'public');
      const testnetUrl = getStellarExpertUrl('12345', 'testnet');

      expect(publicUrl).toBe('https://stellar.expert/explorer/public/tx/12345');
      expect(testnetUrl).toBe('https://stellar.expert/explorer/testnet/tx/12345');
    });

    it('should clear all toasts using clearToasts', () => {
      const { result } = renderHook(() => useNotifications(), { wrapper });

      act(() => {
        result.current.push({ type: 'system', title: 'T1', message: 'M1' });
        result.current.push({ type: 'error', title: 'T2', message: 'M2' });
      });

      expect(result.current.toasts.length).toBeGreaterThan(0);

      act(() => {
        result.current.clearToasts();
      });

      expect(result.current.toasts).toHaveLength(0);
      expect(result.current.notifications.length).toBeGreaterThan(0);
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
