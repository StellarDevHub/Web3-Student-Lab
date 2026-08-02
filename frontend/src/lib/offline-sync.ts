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
}

export interface QueuedLessonProgress {
  id: string;
  courseId: string;
  lessonId: string;
  completedAt: string;
  url: string;
  createdAt: number;
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
  });
}

export async function queueLessonProgressCompletion(input: {
  courseId: string;
  lessonId: string;
  completedAt?: string;
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
        headers: request.headers,
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

export async function flushQueuedLessonProgress() {
  if (typeof window === 'undefined' || !navigator.onLine) return;

  const queuedItems = await getQueuedLessonProgress();
  for (const item of queuedItems) {
    try {
      const response = await fetch(item.url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          completedLessonId: item.lessonId,
          completedAt: item.completedAt,
        }),
      });
      if (response.ok) {
        await removeQueuedLessonProgress(item.id);
      }
    } catch (error) {
      console.warn('[OfflineSync] Progress flush failed, keeping item:', item.id, error);
    }
  }
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
