'use client';

import { useEffect, useRef, useCallback } from 'react';
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
export function useCourseNotifications(url?: string) {
  const { push } = useNotifications();
  const socketRef = useRef<Socket | null>(null);

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
    const token = localStorage.getItem('auth_token');
    if (!token) {
      return;
    }

    const socketUrl =
      url || process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080';

    const socket = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[CourseNotifications] WebSocket connected');
    });

    socket.on('course_notification', (event: CourseNotificationEvent) => {
      handleEvent(event);
    });

    socket.on('disconnect', () => {
      console.log('[CourseNotifications] WebSocket disconnected');
    });

    socket.on('connect_error', (err) => {
      console.error('[CourseNotifications] Connection error:', err.message);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [url, handleEvent]);

  return socketRef;
}
