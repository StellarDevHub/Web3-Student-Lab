'use client';

import React, { createContext, useCallback, useContext, useReducer, useRef } from 'react';

/**
 * Supported notification types.
 *
 * - `signature`           – transaction signing events
 * - `enrollment`          – course enrollment state updates
 * - `certificate`         – certificate issuance & claims
 * - `system`              – system & platform alerts
 * - `error`               – errors & exceptions
 * - `course_update`       – a course was created, updated, or removed
 * - `announcement`        – community / platform-wide announcements
 * - `learning_opportunity` – suggested courses, events, or workshops
 */
export type NotificationType =
  | 'signature'
  | 'enrollment'
  | 'certificate'
  | 'system'
  | 'error'
  | 'course_update'
  | 'announcement'
  | 'learning_opportunity';

export type NotificationPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  priority?: NotificationPriority;
  txHash?: string;
  explorerUrl?: string;
  step?: number;
  totalSteps?: number;
  stepName?: string;
  progress?: number;
  autoDismissMs?: number;
  count?: number;
  dedupeKey?: string;
}

export interface NotificationGroup {
  type: NotificationType;
  label: string;
  count: number;
  latestId: string;
  latestTimestamp: number;
  read: boolean;
}

const PRIORITY_WEIGHTS: Record<NotificationPriority, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export function getDefaultPriority(type: NotificationType, priority?: NotificationPriority): NotificationPriority {
  if (priority) return priority;
  switch (type) {
    case 'error':
      return 'urgent';
    case 'signature':
    case 'certificate':
      return 'high';
    case 'enrollment':
    case 'course_update':
      return 'medium';
    case 'system':
    case 'announcement':
    case 'learning_opportunity':
    default:
      return 'low';
  }
}

export function getStellarExpertUrl(txHash: string, network: string = 'public'): string {
  if (!txHash) return '';
  const net = network === 'testnet' ? 'testnet' : 'public';
  return `https://stellar.expert/explorer/${net}/tx/${txHash}`;
}

export function getDedupeKey(n: Partial<AppNotification>): string {
  if (n.dedupeKey) return n.dedupeKey;
  return `${n.type || 'system'}:${n.title || ''}:${n.message || ''}`;
}

export function sortToasts(toasts: AppNotification[]): AppNotification[] {
  return [...toasts].sort((a, b) => {
    const weightA = PRIORITY_WEIGHTS[getDefaultPriority(a.type, a.priority)];
    const weightB = PRIORITY_WEIGHTS[getDefaultPriority(b.type, b.priority)];
    if (weightA !== weightB) {
      return weightB - weightA; // Higher priority first
    }
    return b.timestamp - a.timestamp; // Newer first
  });
}

interface State {
  notifications: AppNotification[];
  toasts: AppNotification[]; // capped queue for storm prevention
}

type Action =
  | { type: 'ADD'; payload: AppNotification }
  | { type: 'UPDATE_PROGRESS'; payload: { id: string; updates: Partial<AppNotification> } }
  | { type: 'MARK_READ'; id: string }
  | { type: 'MARK_ALL_READ' }
  | { type: 'DISMISS_TOAST'; id: string }
  | { type: 'CLEAR_TOASTS' };

const MAX_TOASTS = 3;
const MAX_NOTIFICATIONS = 500;

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'ADD': {
      const payload = action.payload;
      const key = getDedupeKey(payload);

      // Deduplicate active toasts: check if same dedupeKey exists
      const existingToastIdx = state.toasts.findIndex((t) => getDedupeKey(t) === key);
      let updatedToasts = [...state.toasts];

      if (existingToastIdx >= 0) {
        const existing = updatedToasts[existingToastIdx];
        const updatedItem: AppNotification = {
          ...existing,
          ...payload,
          id: existing.id,
          count: (existing.count || 1) + 1,
          timestamp: payload.timestamp,
          read: false,
        };
        updatedToasts[existingToastIdx] = updatedItem;
      } else {
        updatedToasts = [payload, ...updatedToasts];
      }

      // Sort by priority then timestamp and cap at MAX_TOASTS
      const toasts = sortToasts(updatedToasts).slice(0, MAX_TOASTS);

      // Deduplicate in notifications list or prepend
      const existingNotifIdx = state.notifications.findIndex((n) => n.id === payload.id || getDedupeKey(n) === key);
      let updatedNotifs = [...state.notifications];

      if (existingNotifIdx >= 0) {
        const existing = updatedNotifs[existingNotifIdx];
        updatedNotifs[existingNotifIdx] = {
          ...existing,
          ...payload,
          id: existing.id,
          count: (existing.count || 1) + 1,
          timestamp: payload.timestamp,
          read: false,
        };
      } else {
        updatedNotifs = [payload, ...updatedNotifs];
      }
      const notifications = updatedNotifs.slice(0, MAX_NOTIFICATIONS);

      return { notifications, toasts };
    }

    case 'UPDATE_PROGRESS': {
      const { id, updates } = action.payload;

      const updateItem = (item: AppNotification): AppNotification => {
        if (item.id !== id && getDedupeKey(item) !== id) return item;

        const nextStep = updates.step ?? item.step;
        const nextTotal = updates.totalSteps ?? item.totalSteps;
        let nextProgress = updates.progress ?? item.progress;

        if (updates.progress === undefined && nextStep !== undefined && nextTotal !== undefined && nextTotal > 0) {
          nextProgress = Math.round((nextStep / nextTotal) * 100);
        }

        const txHash = updates.txHash ?? item.txHash;
        const explorerUrl = updates.explorerUrl ?? (txHash ? getStellarExpertUrl(txHash) : item.explorerUrl);

        return {
          ...item,
          ...updates,
          step: nextStep,
          totalSteps: nextTotal,
          progress: nextProgress,
          txHash,
          explorerUrl,
          timestamp: Date.now(),
        };
      };

      const notifications = state.notifications.map(updateItem);
      const toasts = sortToasts(state.toasts.map(updateItem));

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
    case 'CLEAR_TOASTS':
      return {
        ...state,
        toasts: [],
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
        count: n.count || 1,
        latestId: n.id,
        latestTimestamp: n.timestamp,
        read: n.read,
      });
    } else {
      map.set(n.type, {
        ...existing,
        count: existing.count + (n.count || 1),
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
    course_update: 'Course Updates',
    announcement: 'Announcements',
    learning_opportunity: 'Learning Opportunities',
  };
  return labels[type];
}

export interface NotificationContextValue {
  notifications: AppNotification[];
  toasts: AppNotification[];
  unreadCount: number;
  push: (n: Omit<AppNotification, 'id' | 'timestamp' | 'read'> & Partial<AppNotification>) => string;
  updateProgress: (id: string, updates: Partial<AppNotification>) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { notifications: [], toasts: [] });
  // Rate-limit: track last push time per type to batch storms
  const lastPushRef = useRef<Map<NotificationType, number>>(new Map());

  const push = useCallback((n: Omit<AppNotification, 'id' | 'timestamp' | 'read'> & Partial<AppNotification>): string => {
    const now = Date.now();
    const id = n.id || `${now}-${Math.random().toString(36).slice(2)}`;
    const priority = getDefaultPriority(n.type, n.priority);
    const txHash = n.txHash;
    const explorerUrl = n.explorerUrl || (txHash ? getStellarExpertUrl(txHash) : undefined);
    let progress = n.progress;
    if (progress === undefined && n.step !== undefined && n.totalSteps !== undefined && n.totalSteps > 0) {
      progress = Math.round((n.step / n.totalSteps) * 100);
    }

    const notification: AppNotification = {
      id,
      timestamp: now,
      read: false,
      priority,
      explorerUrl,
      progress,
      count: 1,
      ...n,
    };

    const last = lastPushRef.current.get(n.type) ?? 0;
    // Throttle same-type notifications to max 1 toast per 200ms unless urgent or high priority
    if (now - last < 200 && priority !== 'urgent' && priority !== 'high') {
      dispatch({ type: 'ADD', payload: notification });
      return id;
    }

    lastPushRef.current.set(n.type, now);
    dispatch({ type: 'ADD', payload: notification });
    return id;
  }, []);

  const updateProgress = useCallback((id: string, updates: Partial<AppNotification>) => {
    dispatch({ type: 'UPDATE_PROGRESS', payload: { id, updates } });
  }, []);

  const markRead = useCallback((id: string) => dispatch({ type: 'MARK_READ', id }), []);
  const markAllRead = useCallback(() => dispatch({ type: 'MARK_ALL_READ' }), []);
  const dismissToast = useCallback((id: string) => dispatch({ type: 'DISMISS_TOAST', id }), []);
  const clearToasts = useCallback(() => dispatch({ type: 'CLEAR_TOASTS' }), []);

  const unreadCount = state.notifications.filter((n) => !n.read).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications: state.notifications,
        toasts: state.toasts,
        unreadCount,
        push,
        updateProgress,
        markRead,
        markAllRead,
        dismissToast,
        clearToasts,
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
