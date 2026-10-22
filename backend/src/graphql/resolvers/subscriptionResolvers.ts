/**
 * GraphQL subscription resolvers — BE-007
 *
 * Authorization happens at subscribe time using the identity graphql-ws
 * established from the connection's JWT (see graphqlWsServer.ts):
 *
 *  - exerciseStatusUpdated(studentId): the student themself, or an admin.
 *  - courseProgressChanged(courseId): admins see every student; anyone else
 *    only receives events about their own progress.
 *  - newGlobalAnnouncement: any authenticated connection.
 */

import { GraphQLError } from 'graphql';
import {
  publishGlobalAnnouncement,
  pubsub,
  topics,
  type AnnouncementSeverity,
  type CourseProgressEvent,
  type ExerciseStatusEvent,
  type GlobalAnnouncementEvent,
} from '../pubsub.js';

export interface SubscriptionUser {
  id: string;
  role?: string;
}

export interface ContextWithUser {
  user?: SubscriptionUser | null;
}

const isAdmin = (user: SubscriptionUser) => user.role?.toLowerCase() === 'admin';

export function requireUser(context: ContextWithUser): SubscriptionUser {
  if (!context?.user?.id) {
    throw new GraphQLError('Authentication required', { extensions: { code: 'UNAUTHENTICATED' } });
  }
  return context.user;
}

const forbidden = (message: string) => new GraphQLError(message, { extensions: { code: 'FORBIDDEN' } });

const ANNOUNCEMENT_SEVERITIES: AnnouncementSeverity[] = ['INFO', 'WARNING', 'CRITICAL'];
const MAX_ANNOUNCEMENT_TITLE = 200;
const MAX_ANNOUNCEMENT_MESSAGE = 5_000;

export const subscriptionResolvers = {
  courseUpdated: {
    subscribe: (_parent: unknown, { courseId }: { courseId: string }, context: ContextWithUser) => {
      requireUser(context);
      return pubsub.subscribe(topics.courseUpdated(courseId));
    },
    resolve: (payload: unknown) => payload,
  },

  exerciseStatusUpdated: {
    subscribe: (_parent: unknown, { studentId }: { studentId: string }, context: ContextWithUser) => {
      const user = requireUser(context);
      if (user.id !== studentId && !isAdmin(user)) {
        throw forbidden('You can only subscribe to your own exercise updates');
      }
      return pubsub.subscribe<ExerciseStatusEvent>(topics.exerciseStatus(studentId));
    },
    resolve: (payload: ExerciseStatusEvent) => payload,
  },

  courseProgressChanged: {
    subscribe: (_parent: unknown, { courseId }: { courseId: string }, context: ContextWithUser) => {
      const user = requireUser(context);
      const filter = isAdmin(user) ? undefined : (event: CourseProgressEvent) => event.studentId === user.id;
      return pubsub.subscribe<CourseProgressEvent>(topics.courseProgress(courseId), filter);
    },
    resolve: (payload: CourseProgressEvent) => payload,
  },

  newGlobalAnnouncement: {
    subscribe: (_parent: unknown, _args: unknown, context: ContextWithUser) => {
      requireUser(context);
      return pubsub.subscribe<GlobalAnnouncementEvent>(topics.announcements());
    },
    resolve: (payload: GlobalAnnouncementEvent) => payload,
  },
};

export const subscriptionMutationResolvers = {
  publishGlobalAnnouncement: (
    _parent: unknown,
    { input }: { input: { title: string; message: string; severity?: AnnouncementSeverity | null } },
    context: ContextWithUser
  ): GlobalAnnouncementEvent => {
    const user = requireUser(context);
    if (!isAdmin(user)) throw forbidden('Admin access required');

    const title = input.title.trim();
    const message = input.message.trim();
    if (!title || title.length > MAX_ANNOUNCEMENT_TITLE) {
      throw new GraphQLError(`title must be 1-${MAX_ANNOUNCEMENT_TITLE} characters`, {
        extensions: { code: 'BAD_USER_INPUT' },
      });
    }
    if (!message || message.length > MAX_ANNOUNCEMENT_MESSAGE) {
      throw new GraphQLError(`message must be 1-${MAX_ANNOUNCEMENT_MESSAGE} characters`, {
        extensions: { code: 'BAD_USER_INPUT' },
      });
    }
    const severity = input.severity && ANNOUNCEMENT_SEVERITIES.includes(input.severity) ? input.severity : 'INFO';

    return publishGlobalAnnouncement({ title, message, severity, publishedBy: user.id });
  },
};
