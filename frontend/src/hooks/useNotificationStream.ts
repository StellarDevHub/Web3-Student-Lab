'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '@/lib/api-config';

/**
 * Shape of a course-notification event pushed over the SSE stream.
 * Mirrors `CourseNotification` in the backend notifications module.
 */
export interface NotificationStreamEvent {
  id: string;
  type: string;
  userId?: string;
  courseId?: string;
  courseTitle?: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

export type NotificationStreamState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected';

export interface UseNotificationStreamOptions {
  /** Backend base URL (defaults to the shared API_BASE_URL). */
  url?: string;
  /** Initial reconnect delay (ms). Default 1s. */
  initialDelayMs?: number;
  /** Maximum reconnect delay (ms). Default 30s. */
  maxDelayMs?: number;
  /** Reconnect attempts before giving up. Default 10. */
  maxAttempts?: number;
  /** Enable/disable auto-reconnect. Default true. */
  autoReconnect?: boolean;
  /** Callback for each notification event. */
  onEvent?: (event: NotificationStreamEvent) => void;
}

export interface UseNotificationStreamReturn {
  connectionState: NotificationStreamState;
  lastEventId: string | null;
  lastError: string | null;
  reconnectAttempt: number;
  /** Force-close the stream and clear state. */
  close: () => void;
}

/**
 * Real-time course notification hook backed by Server-Sent Events (#1122).
 *
 * - Connects to `GET /api/v1/notifications/stream` with the JWT as
 *   `access_token` (EventSource cannot send Authorization headers).
 * - Reconnects with **bounded exponential backoff + jitter**.
 * - On reconnect, sends the last received event id via the `Last-Event-ID`
 *   header, so notifications missed while disconnected are replayed by the
 *   server instead of being lost forever.
 */
export function useNotificationStream(
  options: UseNotificationStreamOptions = {},
): UseNotificationStreamReturn {
  const {
    url = API_BASE_URL,
    initialDelayMs = 1000,
    maxDelayMs = 30_000,
    maxAttempts = 10,
    autoReconnect = true,
    onEvent,
  } = options;

  const [connectionState, setConnectionState] =
    useState<NotificationStreamState>('idle');
  const [lastEventId, setLastEventId] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  const sourceRef = useRef<EventSource | null>(null);
  const attemptsRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedRef = useRef(false);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const close = useCallback(() => {
    closedRef.current = true;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    sourceRef.current?.close();
    sourceRef.current = null;
    attemptsRef.current = 0;
    setConnectionState('disconnected');
  }, []);

  useEffect(() => {
    const token =
      localStorage.getItem('token') ?? localStorage.getItem('auth_token');

    if (!token) {
      setConnectionState('idle');
      return undefined;
    }

    closedRef.current = false;

    // Read the persisted last-event id (localStorage survives reloads so
    // reconnection recovery works across page refreshes, #1122).
    const lastEventIdRef = {
      current: localStorage.getItem('notif_last_event_id'),
    };
    setLastEventId(lastEventIdRef.current);

    const connect = (): void => {
      if (closedRef.current) {
        return;
      }

      const streamUrl = new URL(`${url}/notifications/stream`);
      streamUrl.searchParams.set('access_token', token);
      // Last-Event-ID recovery (#1122): only send when we have seen events.
      if (lastEventIdRef.current) {
        streamUrl.searchParams.set('lastEventId', lastEventIdRef.current);
      }

      setConnectionState(
        attemptsRef.current === 0 ? 'connecting' : 'reconnecting',
      );

      const source = new EventSource(streamUrl.toString());
      sourceRef.current = source;

      source.addEventListener('open', () => {
        if (closedRef.current) {
          source.close();
          return;
        }
        attemptsRef.current = 0;
        setReconnectAttempt(0);
        setLastError(null);
        setConnectionState('connected');
      });

      // Named `notification` event from the backend bridge.
      source.addEventListener('notification', (raw) => {
        const event = raw as MessageEvent<string>;
        try {
          const parsed = JSON.parse(event.data) as NotificationStreamEvent;
          if (event.lastEventId) {
            lastEventIdRef.current = event.lastEventId;
            setLastEventId(event.lastEventId);
          } else if (parsed.id) {
            lastEventIdRef.current = parsed.id;
            setLastEventId(parsed.id);
          }
          onEventRef.current?.(parsed);
        } catch {
          // Ignore malformed payloads.
        }
      });

      source.onerror = () => {
        source.close();
        sourceRef.current = null;

        if (closedRef.current || !autoReconnect) {
          setConnectionState('disconnected');
          return;
        }

        attemptsRef.current += 1;
        setReconnectAttempt(attemptsRef.current);

        if (attemptsRef.current > maxAttempts) {
          setLastError('Reconnect attempts exhausted');
          setConnectionState('disconnected');
          return;
        }

        // Bounded exponential backoff with jitter (full jitter).
        const cap = Math.min(
          maxDelayMs,
          initialDelayMs * 2 ** (attemptsRef.current - 1),
        );
        const delay = Math.floor(cap * (0.5 + Math.random() * 0.5));
        timerRef.current = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      closedRef.current = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      sourceRef.current?.close();
      sourceRef.current = null;
      // Persist for the next mount so reconnection recovery works across
      // reloads (#1122).
      if (lastEventIdRef.current) {
        localStorage.setItem('notif_last_event_id', lastEventIdRef.current);
      }
    };
  }, [url, initialDelayMs, maxDelayMs, maxAttempts, autoReconnect]);

  return { connectionState, lastEventId, lastError, reconnectAttempt, close };
}
