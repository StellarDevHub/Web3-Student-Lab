/**
 * Supported types for course-related notifications.
 * Each type maps to a specific kind of course event so the
 * frontend can render appropriate icons, colors, and actions.
 */
export type CourseNotificationType =
  | 'course_created'
  | 'course_updated'
  | 'course_deleted'
  | 'announcement'
  | 'learning_opportunity';

/**
 * A course notification entity sent to the frontend.
 *
 * Notifications can be targeted at individual users (via userId)
 * or broadcast to everyone (userId is undefined).
 */
export interface CourseNotification {
  id: string;
  type: CourseNotificationType;
  /** Optional — when present the notification is for a specific user */
  userId?: string;
  courseId?: string;
  courseTitle?: string;
  title: string;
  message: string;
  /** Arbitrary metadata the frontend may use (e.g. links, actions) */
  metadata?: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

/**
 * Payload shape expected when creating a notification from anywhere
 * in the backend (e.g. course routes, admin tools).
 */
export interface CreateCourseNotificationDto {
  type: CourseNotificationType;
  userId?: string;
  courseId?: string;
  courseTitle?: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationListResponse {
  notifications: CourseNotification[];
  total: number;
  unreadCount: number;
}
