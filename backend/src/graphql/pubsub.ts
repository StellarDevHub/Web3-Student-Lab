/**
 * Typed GraphQL Pub/Sub — BE-007
 *
 * Fan-out bus backing the GraphQL subscriptions. Topics are keyed by the
 * subscription argument (`exercise:<studentId>`, `course-progress:<courseId>`)
 * so a publish only touches the listeners that actually asked for it, and
 * delivery to in-process subscribers is synchronous — the dominant cost of
 * a push is the WebSocket write itself, well inside the 50ms budget.
 *
 * Producers usually run in other processes (API server, BullMQ workers), so
 * when a Redis bridge is enabled every publish is also relayed over a Redis
 * channel and re-dispatched locally by each subscriber process. Messages
 * carry the origin instance id so a process never delivers its own publish
 * twice. Redis being down degrades to local-only delivery; it never throws
 * into the caller.
 *
 * Each subscription iterator keeps a bounded buffer (oldest events dropped
 * first) so a slow client cannot grow server memory without bound, and
 * `return()` — invoked by graphql-ws on `complete` or socket close — removes
 * the listener immediately.
 */

import { randomUUID } from 'crypto';
import { Redis } from 'ioredis';
import logger from '../utils/logger.js';

export type ExerciseStatus = 'QUEUED' | 'RUNNING' | 'PASSED' | 'FAILED' | 'ERROR';
export type AnnouncementSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface ExerciseTestResultEvent {
  name: string;
  status: string;
  gasUsed: number;
  durationMs: number;
  error?: string | null;
}

export interface ExerciseStatusEvent {
  studentId: string;
  exerciseId: string;
  jobId?: string | null;
  status: ExerciseStatus;
  gasUsed?: number | null;
  gasLimit?: number | null;
  terminationReason?: string | null;
  passed?: number | null;
  total?: number | null;
  tests?: ExerciseTestResultEvent[] | null;
  message?: string | null;
  emittedAt: string;
}

export interface CourseProgressEvent {
  courseId: string;
  studentId: string;
  percentage: number;
  status: string;
  completedLessons: string[];
  emittedAt: string;
}

export interface GlobalAnnouncementEvent {
  id: string;
  title: string;
  message: string;
  severity: AnnouncementSeverity;
  publishedBy?: string | null;
  emittedAt: string;
}

export const topics = {
  exerciseStatus: (studentId: string) => `exercise:${studentId}`,
  courseProgress: (courseId: string) => `course-progress:${courseId}`,
  courseUpdated: (courseId: string) => `course:${courseId}`,
  announcements: () => 'announcements',
};

type Listener = (payload: unknown) => void;

export interface SubscriptionIterator<T> extends AsyncIterableIterator<T> {
  return(): Promise<IteratorResult<T>>;
}

/** Events buffered per subscriber before the oldest are dropped. */
export const SUBSCRIBER_BUFFER_LIMIT = 100;
const REDIS_CHANNEL = 'graphql:pubsub';

interface BridgeMessage {
  origin: string;
  topic: string;
  payload: unknown;
}

export class PubSub {
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly instanceId = randomUUID();
  private publisher: Redis | null = null;
  private subscriber: Redis | null = null;
  private bridgeUrl: string | null = null;

  /** Relay publishes through Redis so subscribers in other processes receive them. */
  enableRedisBridge(url: string): void {
    this.bridgeUrl = url;
  }

  private getPublisher(): Redis | null {
    if (!this.bridgeUrl) return null;
    if (!this.publisher) {
      this.publisher = new Redis(this.bridgeUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
      this.publisher.on('error', (err) => logger.warn('[graphql-pubsub] Redis publisher error', { error: err.message }));
    }
    return this.publisher;
  }

  private ensureSubscriber(): void {
    if (!this.bridgeUrl || this.subscriber) return;
    const subscriber = new Redis(this.bridgeUrl, { lazyConnect: true, maxRetriesPerRequest: null });
    this.subscriber = subscriber;
    subscriber.on('error', (err) => logger.warn('[graphql-pubsub] Redis subscriber error', { error: err.message }));
    subscriber.on('message', (_channel: string, raw: string) => {
      try {
        const message = JSON.parse(raw) as BridgeMessage;
        if (message.origin !== this.instanceId) this.dispatch(message.topic, message.payload);
      } catch (err) {
        logger.warn('[graphql-pubsub] Dropped malformed bridge message', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
    subscriber.subscribe(REDIS_CHANNEL).catch((err: Error) => {
      logger.warn('[graphql-pubsub] Redis subscribe failed; local delivery only', { error: err.message });
    });
  }

  private dispatch(topic: string, payload: unknown): void {
    const subs = this.listeners.get(topic);
    if (!subs) return;
    for (const listener of [...subs]) {
      try {
        listener(payload);
      } catch (err) {
        logger.warn('[graphql-pubsub] Listener threw', { topic, error: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  publish<T>(topic: string, payload: T): void {
    this.dispatch(topic, payload);
    const publisher = this.getPublisher();
    if (publisher) {
      const message: BridgeMessage = { origin: this.instanceId, topic, payload };
      publisher.publish(REDIS_CHANNEL, JSON.stringify(message)).catch((err: Error) => {
        logger.warn('[graphql-pubsub] Redis publish failed; delivered locally only', { topic, error: err.message });
      });
    }
  }

  listenerCount(topic: string): number {
    return this.listeners.get(topic)?.size ?? 0;
  }

  subscribe<T>(topic: string, filter?: (payload: T) => boolean): SubscriptionIterator<T> {
    this.ensureSubscriber();

    const buffer: T[] = [];
    let pending: ((result: IteratorResult<T>) => void) | null = null;
    let done = false;

    const listener: Listener = (raw) => {
      const payload = raw as T;
      if (done || (filter && !filter(payload))) return;
      if (pending) {
        const resolve = pending;
        pending = null;
        resolve({ value: payload, done: false });
        return;
      }
      buffer.push(payload);
      if (buffer.length > SUBSCRIBER_BUFFER_LIMIT) buffer.shift();
    };

    const subs = this.listeners.get(topic) ?? new Set<Listener>();
    subs.add(listener);
    this.listeners.set(topic, subs);

    const cleanup = () => {
      if (done) return;
      done = true;
      buffer.length = 0;
      subs.delete(listener);
      if (subs.size === 0) this.listeners.delete(topic);
      if (pending) {
        pending({ value: undefined, done: true });
        pending = null;
      }
    };

    const iterator: SubscriptionIterator<T> = {
      next() {
        if (buffer.length > 0) return Promise.resolve({ value: buffer.shift() as T, done: false });
        if (done) return Promise.resolve({ value: undefined, done: true });
        return new Promise<IteratorResult<T>>((resolve) => {
          pending = resolve;
        });
      },
      return() {
        cleanup();
        return Promise.resolve({ value: undefined, done: true });
      },
      throw(error?: unknown) {
        cleanup();
        return Promise.reject(error);
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };
    return iterator;
  }

  async close(): Promise<void> {
    await Promise.allSettled([this.publisher?.quit(), this.subscriber?.quit()]);
    this.publisher = null;
    this.subscriber = null;
  }
}

export const pubsub = new PubSub();

const bridgeUrl = process.env.GRAPHQL_PUBSUB_REDIS_URL ?? (process.env.NODE_ENV === 'test' ? undefined : process.env.REDIS_URL);
if (bridgeUrl && process.env.GRAPHQL_PUBSUB_REDIS !== 'false') {
  pubsub.enableRedisBridge(bridgeUrl);
}

const now = () => new Date().toISOString();

export function publishExerciseStatus(event: Omit<ExerciseStatusEvent, 'emittedAt'>): void {
  pubsub.publish<ExerciseStatusEvent>(topics.exerciseStatus(event.studentId), { ...event, emittedAt: now() });
}

export function publishCourseProgress(event: Omit<CourseProgressEvent, 'emittedAt'>): void {
  pubsub.publish<CourseProgressEvent>(topics.courseProgress(event.courseId), { ...event, emittedAt: now() });
}

export function publishGlobalAnnouncement(event: Omit<GlobalAnnouncementEvent, 'emittedAt' | 'id'>): GlobalAnnouncementEvent {
  const announcement: GlobalAnnouncementEvent = { ...event, id: randomUUID(), emittedAt: now() };
  pubsub.publish(topics.announcements(), announcement);
  return announcement;
}
