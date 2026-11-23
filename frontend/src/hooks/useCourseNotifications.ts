'use client';

import { useEffect, useRef, useState, useCallback, type RefObject } from 'react';
import { io, Socket } from 'socket.io-client';
import { useNotifications } from '@/contexts/NotificationContext';

/**
 * Shape of a course-notification event emitted by the backend via Socket.IO.
 */
interface CourseNotificationEvent {
  id: string;
  type:
    | 'course_created'
    | 'course_updated'
    | 'course_deleted'
    | 'announcement'
    | 'learning_opportunity';
  courseId?: string;
  courseTitle?: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

/**
 * Reconnection policy (#898).
 *
 * socket.io-client applies bounded exponential backoff with full jitter:
 * `delay = min(base * 2^(attempt-1), maxDelay) * (0.5..1)`. We bound both the
 * attempt count and the maximum delay so a dead endpoint cannot cause an
 * unbounded reconnect storm, and randomize the delay so many clients do not
 * reconnect in lockstep.
 */
export const COURSE_WS_MAX_RECONNECT_ATTEMPTS = 8;
export const COURSE_WS_INITIAL_DELAY_MS = 500;
export const COURSE_WS_MAX_DELAY_MS = 15_000;
export const COURSE_WS_RANDOMIZATION_FACTOR = 0.5;
export const COURSE_WS_CONNECTION_TIMEOUT_MS = 10_000;

/**
 * Connection state exposed to the UI so it can render a non-intrusive
 * disconnected / reconnecting indicator (#898).
 *
 * - `idle`        — no authenticated session, or torn down.
 * - `connected`   — live socket with the notification bridge active.
 * - `reconnecting`— connection lost; bounded backoff retry in progress.
 * - `disconnected`— retries exhausted or the socket was manually closed.
 */
export type CourseConnectionState =
  | 'idle'
  | 'connected'
  | 'reconnecting'
  | 'disconnected';

export interface UseCourseNotificationsReturn {
  socketRef: RefObject<Socket | null>;
  connectionState: CourseConnectionState;
  reconnectAttempt: number;
  retryExhausted: boolean;
  lastError: string | null;
}

/**
 * Map backend notification types to the frontend's `AppNotification` type.
 */
function mapType(
  backendType: CourseNotificationEvent['type'],
): 'course_update' | 'announcement' | 'learning_opportunity' {
  switch (backendType) {
    case 'course_created':
    case 'course_updated':
    case 'course_deleted':
      return 'course_update';
    case 'announcement':
      return 'announcement';
    case 'learning_opportunity':
      return 'learning_opportunity';
    default:
      return 'course_update';
  }
}

/**
 * Hook that connects to the backend WebSocket, listens for
 * `course_notification` events, and pushes them into the
 * `NotificationContext` so they appear in the bell / sidebar / toasts.
 *
 * Reliability guarantees (#898):
 *
 * - Unexpected disconnects trigger a *bounded* number of reconnect attempts
 *   using exponential backoff with jitter (`reconnectionAttempts`,
 *   `reconnectionDelay`, `reconnectionDelayMax`, `randomizationFactor`).
 * - Component unmount or a missing auth token (manual logout) tears the
 *   socket down and *prevents* further reconnect attempts.
 * - Route changes re-run the effect; the previous socket's listeners are
 *   removed and the stale connection is closed, so there are no duplicate
 *   listeners or zombie connections.
 * - A recovered connection resumes event delivery without duplication.
 * - `connectionState` / `reconnectAttempt` / `retryExhausted` expose the
 *   recovery behavior to the UI.
 *
 * Must be used inside a `<NotificationProvider>`.
 *
 * @example
 * ```tsx
 * function App() {
 *   useCourseNotifications();
 *   return <Main />;
 * }
 * ```
 */
export function useCourseNotifications(
  url?: string
): UseCourseNotificationsReturn {
  const { push } = useNotifications();
  const socketRef = useRef<Socket | null>(null);
  // True once the socket has been intentionally torn down (unmount or
  // logout) so a late 'disconnect' event is not misread as a network fault.
  const manualDisconnectRef = useRef(false);

  const [token, setToken] = useState<string | null>(null);
  const [connectionState, setConnectionState] =
    useState<CourseConnectionState>('idle');
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [retryExhausted, setRetryExhausted] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  // Track the auth token so a manual logout (token removed) tears down the
  // socket and prevents reconnect attempts. The 'storage' event covers
  // cross-tab logout; same-tab logout re-renders via the auth flow.
  useEffect(() => {
    const readToken = () =>
      setToken(
        localStorage.getItem('token') ??
          localStorage.getItem('auth_token')
      );
    readToken();
    window.addEventListener('storage', readToken);
    return () => window.removeEventListener('storage', readToken);
  }, []);

  const handleEvent = useCallback(
    (event: CourseNotificationEvent) => {
      push({
        type: mapType(event.type),
        title: event.title,
        message: event.message,
      });
    },
    [push],
  );

  useEffect(() => {
    if (!token) {
      // No authenticated session (e.g. logged out) — do not connect (#898).
      setConnectionState('idle');
      return;
    }

    const socketUrl =
      url || process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080';

    const socket = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      // Bounded exponential backoff with jitter (#898).
      reconnection: true,
      reconnectionAttempts: COURSE_WS_MAX_RECONNECT_ATTEMPTS,
      reconnectionDelay: COURSE_WS_INITIAL_DELAY_MS,
      reconnectionDelayMax: COURSE_WS_MAX_DELAY_MS,
      randomizationFactor: COURSE_WS_RANDOMIZATION_FACTOR,
      timeout: COURSE_WS_CONNECTION_TIMEOUT_MS,
    });

    socketRef.current = socket;
    manualDisconnectRef.current = false;

    socket.on('connect', () => {
      setConnectionState('connected');
      setReconnectAttempt(0);
      setRetryExhausted(false);
      setLastError(null);
      console.log('[CourseNotifications] WebSocket connected');
    });

    socket.on('course_notification', (event: CourseNotificationEvent) => {
      handleEvent(event);
    });

    socket.on('disconnect', (reason) => {
      if (manualDisconnectRef.current) {
        // Intended teardown (unmount / logout) — never reconnect.
        setConnectionState('disconnected');
        return;
      }
      console.log(
        '[CourseNotifications] WebSocket disconnected:',
        reason,
      );
      setConnectionState('reconnecting');
    });

    socket.on('connect_error', (err) => {
      console.error(
        '[CourseNotifications] Connection error:',
        err.message,
      );
      setLastError(err.message);
      if (!manualDisconnectRef.current) {
        setConnectionState('reconnecting');
      }
    });

    socket.on('reconnect_attempt', (attempt: number) => {
      setReconnectAttempt(attempt);
      setConnectionState('reconnecting');
    });

    socket.on('reconnect', (attempt: number) => {
      setConnectionState('connected');
      setReconnectAttempt(0);
      setRetryExhausted(false);
      setLastError(null);
      console.log(
        '[CourseNotifications] WebSocket reconnected after',
        attempt,
        'attempt(s)',
      );
    });

    socket.on('reconnect_failed', () => {
      setConnectionState('disconnected');
      setRetryExhausted(true);
      console.warn(
        '[CourseNotifications] Reconnect attempts exhausted',
      );
    });

    return () => {
      // Prevent duplicate listeners and stale connections during route
      // changes / unmount, and never reconnect after teardown (#898).
      manualDisconnectRef.current = true;
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setConnectionState('idle');
    };
  }, [url, token, handleEvent]);

  return {
    socketRef,
    connectionState,
    reconnectAttempt,
    retryExhausted,
    lastError,
  };
}
