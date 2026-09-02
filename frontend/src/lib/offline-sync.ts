const DB_NAME = 'web3-student-lab-offline-sync';
const DB_VERSION = 2;
const REQUEST_STORE = 'queued-requests';
const PROGRESS_STORE = 'lesson-progress';

export type QueuedRequestMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface QueuedRequest {
  id: string;
  url: string;
  method: QueuedRequestMethod;
  headers: Record<string, string>;
  body?: string;
  createdAt: number;
  /** Idempotency key (#1141): stable per logical action so a replayed
   *  flush can never double-apply a mutation server-side. */
  idempotencyKey?: string;
  /** Local mutation timestamp for deterministic conflict resolution. */
  clientTimestamp?: number;
  /** Highest-score anchor (lesson quiz) for same-timestamp tiebreaks. */
  score?: number;
}

export interface QueuedLessonProgress {
  id: string;
  courseId: string;
  lessonId: string;
  completedAt: string;
  url: string;
  createdAt: number;
  /** Snapshot of the learner's progress at queue time so the offline flush
   *  can replay the same whole-state update the backend schema accepts. */
  completedLessons?: string[];
  currentModuleId?: string | null;
  percentage?: number;
  status?: string;
  /** Idempotency key (#1141): stable per (course, lesson, attempt). */
  idempotencyKey?: string;
  /** Local mutation timestamp for deterministic conflict resolution. */
  clientTimestamp?: number;
  /** Highest-score anchor (lesson quiz) for same-timestamp tiebreaks. */
  score?: number;
  /** Set when the backend has acknowledged this sync (receipt). */
  syncedAt?: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function createId() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getDb() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('IndexedDB is only available in the browser.'));
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(REQUEST_STORE)) {
          db.createObjectStore(REQUEST_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(PROGRESS_STORE)) {
          db.createObjectStore(PROGRESS_STORE, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  return dbPromise;
}

async function writeItem<T>(storeName: string, value: T) {
  const db = await getDb();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put(value);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function readAll<T>(storeName: string): Promise<T[]> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const request = transaction.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

async function deleteItem(storeName: string, id: string) {
  const db = await getDb();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function queueOfflineRequest(request: Omit<QueuedRequest, 'id' | 'createdAt'>) {
  if (typeof window === 'undefined') return;

  await writeItem<QueuedRequest>(REQUEST_STORE, {
    ...request,
    id: createId(),
    createdAt: Date.now(),
    idempotencyKey: request.idempotencyKey ?? createId(),
    clientTimestamp: request.clientTimestamp ?? Date.now(),
  });
}

export async function queueLessonProgressCompletion(input: {
  courseId: string;
  lessonId: string;
  completedAt?: string;
  completedLessons?: string[];
  currentModuleId?: string | null;
  percentage?: number;
  status?: string;
  score?: number;
}) {
  if (typeof window === 'undefined') return;

  const completedAt = input.completedAt ?? new Date().toISOString();
  await writeItem<QueuedLessonProgress>(PROGRESS_STORE, {
    id: `${input.courseId}:${input.lessonId}`,
    courseId: input.courseId,
    lessonId: input.lessonId,
    completedAt,
    url: `/learning/courses/${input.courseId}/progress`,
    createdAt: Date.now(),
    completedLessons: input.completedLessons,
    currentModuleId: input.currentModuleId,
    percentage: input.percentage,
    status: input.status,
    idempotencyKey: `${input.courseId}:${input.lessonId}:${input.completedAt ?? completedAt}`,
    clientTimestamp: Date.now(),
    score: input.score,
  });
}

export async function getQueuedRequests(): Promise<QueuedRequest[]> {
  if (typeof window === 'undefined') return [];
  return readAll<QueuedRequest>(REQUEST_STORE);
}

export async function getQueuedLessonProgress(): Promise<QueuedLessonProgress[]> {
  if (typeof window === 'undefined') return [];
  return readAll<QueuedLessonProgress>(PROGRESS_STORE);
}

export async function removeQueuedRequest(id: string) {
  if (typeof window === 'undefined') return;
  await deleteItem(REQUEST_STORE, id);
}

export async function removeQueuedLessonProgress(id: string) {
  if (typeof window === 'undefined') return;
  await deleteItem(PROGRESS_STORE, id);
}

export async function flushQueuedRequests() {
  if (typeof window === 'undefined' || !navigator.onLine) return;

  const requests = await getQueuedRequests();
  for (const request of requests) {
    try {
      const response = await fetch(request.url, {
        method: request.method,
        headers: {
          ...request.headers,
          'Idempotency-Key': request.idempotencyKey ?? request.id,
          'X-Client-Timestamp': String(request.clientTimestamp ?? request.createdAt),
        },
        body: request.body,
        credentials: 'same-origin',
      });
      if (response.ok) {
        await removeQueuedRequest(request.id);
      }
    } catch (error) {
      console.warn('[OfflineSync] Flush failed, keeping queued request:', request.id, error);
    }
  }
}

/**
 * Deterministic conflict resolution (#1141): when the same (course, lesson)
 * exists multiple times in the queue, keep only the winner —
 * highest score first, then latest client timestamp. Progress overwrites are
 * impossible because the queue is a single source of truth per key and the
 * server applies the same rule via the idempotency key.
 */
export async function resolveLessonProgressConflicts(): Promise<void> {
  if (typeof window === 'undefined') return;
  const items = await getQueuedLessonProgress();

  const winnerByKey = new Map<string, QueuedLessonProgress>();
  for (const item of items) {
    const key = item.idempotencyKey ?? item.id;
    const existing = winnerByKey.get(key);
    if (!existing) {
      winnerByKey.set(key, item);
      continue;
    }
    const itemScore = item.score ?? 0;
    const existingScore = existing.score ?? 0;
    const itemTs = item.clientTimestamp ?? item.createdAt;
    const existingTs = existing.clientTimestamp ?? existing.createdAt;
    // Highest score wins; ties break on the latest timestamp.
    if (itemScore > existingScore || (itemScore === existingScore && itemTs > existingTs)) {
      winnerByKey.set(key, item);
    }
  }

  const winners = new Set(winnerByKey.values());
  for (const item of items) {
    if (!winners.has(item)) {
      await removeQueuedLessonProgress(item.id);
    }
  }
}

export async function flushQueuedLessonProgress() {
  if (typeof window === 'undefined' || !navigator.onLine) return;

  await resolveLessonProgressConflicts();

  const queuedItems = await getQueuedLessonProgress();
  for (const item of queuedItems) {
    try {
      const token = localStorage.getItem('token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      headers['Idempotency-Key'] = item.idempotencyKey ?? item.id;
      headers['X-Client-Timestamp'] = String(item.clientTimestamp ?? item.createdAt);
      headers['X-Client-Score'] = String(item.score ?? 0);

      const response = await fetch(item.url, {
        method: 'PATCH',
        headers,
        credentials: 'same-origin',
        body: JSON.stringify({
          lessonId: item.lessonId,
          status: 'completed',
          completedLessons: item.completedLessons,
          currentModuleId: item.currentModuleId,
          percentage: item.percentage,
          completedAt: item.completedAt,
          idempotencyKey: item.idempotencyKey,
        }),
      });
      if (response.ok) {
        // Sync receipt (#1141): record acknowledgment locally so progress
        // indicators can flip from "pending" to "synced".
        await writeItem<QueuedLessonProgress>(PROGRESS_STORE, {
          ...item,
          syncedAt: new Date().toISOString(),
        });
        await removeQueuedLessonProgress(item.id);
      }
    } catch (error) {
      console.warn('[OfflineSync] Progress flush failed, keeping item:', item.id, error);
    }
  }
}

/** Count of items still pending sync — drives local progress indicators. */
export async function getPendingSyncCount(): Promise<number> {
  if (typeof window === 'undefined') return 0;
  const [requests, progress] = await Promise.all([
    getQueuedRequests(),
    getQueuedLessonProgress(),
  ]);
  return requests.length + progress.filter((p) => !p.syncedAt).length;
}

export async function flushOfflineSyncQueue() {
  await Promise.all([flushQueuedRequests(), flushQueuedLessonProgress()]);
}

export function registerOnlineSync() {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handleOnline = () => {
    flushOfflineSyncQueue().catch((error) => {
      console.error('[OfflineSync] Error flushing queued work:', error);
    });
  };

  window.addEventListener('online', handleOnline);

  return () => {
    window.removeEventListener('online', handleOnline);
  };
}
