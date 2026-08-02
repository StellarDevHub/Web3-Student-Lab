'use client';

import { useCourseNotifications } from '@/hooks/useCourseNotifications';

/**
 * Renders nothing — exists solely to activate the
 * `useCourseNotifications` hook inside a server-rendered layout.
 *
 * Place once in the root layout so that course-related WebSocket
 * events are automatically bridged into the NotificationContext
 * for the entire app.
 */
export function CourseNotificationListener() {
  useCourseNotifications();
  return null;
}
