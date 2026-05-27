'use client';

import React, { createContext, useCallback, useContext, useReducer, useRef } from 'react';

export type NotificationType = 'signature' | 'enrollment' | 'certificate' | 'system' | 'error';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
}

export interface NotificationGroup {
  type: NotificationType;
  label: string;
  count: number;
  latestId: string;
  latestTimestamp: number;
  read: boolean;
}

interface State {
  notifications: AppNotification[];
  toasts: AppNotification[]; // capped queue for storm prevention
}

type Action =
  | { type: 'ADD'; payload: AppNotification }
  | { type: 'MARK_READ'; id: string }
  | { type: 'MARK_ALL_READ' }
  | { type: 'DISMISS_TOAST'; id: string };

const MAX_TOASTS = 3;
const MAX_NOTIFICATIONS = 500;

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'ADD': {
      const notifications = [action.payload, ...state.notifications].slice(0, MAX_NOTIFICATIONS);
      // Storm prevention: only keep latest MAX_TOASTS toasts
      const toasts = [action.payload, ...state.toasts].slice(0, MAX_TOASTS);
      return { notifications, toasts };
    }
    case 'MARK_READ':
      return {
        ...state,
        notifications: state.notifications.map((n) =>
          n.id === action.id ? { ...n, read: true } : n
        ),
      };
    case 'MARK_ALL_READ':
      return {
        ...state,
        notifications: state.notifications.map((n) => ({ ...n, read: true })),
      };
    case 'DISMISS_TOAST':
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.id),
      };
    default:
      return state;
  }
}

/** Group notifications by type, returning sorted groups (most recent first) */
export function groupNotifications(notifications: AppNotification[]): NotificationGroup[] {
  const map = new Map<NotificationType, NotificationGroup>();
  for (const n of notifications) {
    const existing = map.get(n.type);
    if (!existing) {
      map.set(n.type, {
        type: n.type,
        label: typeLabel(n.type),
        count: 1,
        latestId: n.id,
        latestTimestamp: n.timestamp,
        read: n.read,
      });
    } else {
      map.set(n.type, {
        ...existing,
        count: existing.count + 1,
        read: existing.read && n.read,
        latestTimestamp: Math.max(existing.latestTimestamp, n.timestamp),
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.latestTimestamp - a.latestTimestamp);
}

function typeLabel(type: NotificationType): string {
  const labels: Record<NotificationType, string> = {
    signature: 'Signatures',
    enrollment: 'Enrollments',
    certificate: 'Certificates',
    system: 'System',
    error: 'Errors',
  };
  return labels[type];
}

interface NotificationContextValue {
  notifications: AppNotification[];
  toasts: AppNotification[];
  unreadCount: number;
  push: (n: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  dismissToast: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { notifications: [], toasts: [] });
  // Rate-limit: track last push time per type to batch storms
  const lastPushRef = useRef<Map<NotificationType, number>>(new Map());

  const push = useCallback((n: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => {
    const now = Date.now();
    const last = lastPushRef.current.get(n.type) ?? 0;
    // Throttle same-type notifications to max 1 toast per 200ms
    if (now - last < 200) {
      // Still add to list but skip toast by dispatching without toast
      const notification: AppNotification = {
        ...n,
        id: `${now}-${Math.random().toString(36).slice(2)}`,
        timestamp: now,
        read: false,
      };
      dispatch({ type: 'ADD', payload: notification });
      return;
    }
    lastPushRef.current.set(n.type, now);
    const notification: AppNotification = {
      ...n,
      id: `${now}-${Math.random().toString(36).slice(2)}`,
      timestamp: now,
      read: false,
    };
    dispatch({ type: 'ADD', payload: notification });
  }, []);

  const markRead = useCallback((id: string) => dispatch({ type: 'MARK_READ', id }), []);
  const markAllRead = useCallback(() => dispatch({ type: 'MARK_ALL_READ' }), []);
  const dismissToast = useCallback((id: string) => dispatch({ type: 'DISMISS_TOAST', id }), []);

  const unreadCount = state.notifications.filter((n) => !n.read).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications: state.notifications,
        toasts: state.toasts,
        unreadCount,
        push,
        markRead,
        markAllRead,
        dismissToast,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}
