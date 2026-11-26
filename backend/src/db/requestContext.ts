import { AsyncLocalStorage } from 'node:async_hooks';

export interface DbRoutingContext {
  method: string;
  userId?: string;
  sessionId?: string;
  region?: string;
}

export interface DbRoutingContextOptions {
  userId?: string;
  sessionId?: string;
  region?: string;
}

export type DatabaseRole = 'primary' | 'read';

const READ_OPERATIONS = new Set<string>([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
]);

const MUTATING_HTTP_METHODS = new Set<string>(['POST', 'PUT', 'PATCH', 'DELETE']);

// Pin mutating sessions to primary for 3 seconds to defend against replication lag (BE-061).
export const DEFAULT_SESSION_PIN_WINDOW_MS = 3000;

export const getLagWindowMs = (): number => {
  const parsed = Number.parseInt(process.env.DB_REPLICATION_LAG_WINDOW_MS ?? '', 10);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_SESSION_PIN_WINDOW_MS;
  }

  return parsed;
};

const routingContextStorage = new AsyncLocalStorage<DbRoutingContext>();
const recentPrimaryReadUsers = new Map<string, number>();

const pruneExpiredEntries = (now: number): void => {
  const lagWindowMs = getLagWindowMs();

  for (const [key, timestamp] of recentPrimaryReadUsers.entries()) {
    if (now - timestamp > lagWindowMs) {
      recentPrimaryReadUsers.delete(key);
    }
  }
};

export const isSessionPinnedToPrimary = (sessionOrUserKey: string): boolean => {
  const now = Date.now();
  pruneExpiredEntries(now);

  const lastWriteAt = recentPrimaryReadUsers.get(sessionOrUserKey);
  if (lastWriteAt === undefined) {
    return false;
  }

  return now - lastWriteAt <= getLagWindowMs();
};

export const isReadOperation = (operation: string): boolean => READ_OPERATIONS.has(operation);

export const isMutatingHttpMethod = (method: string): boolean =>
  MUTATING_HTTP_METHODS.has(method.toUpperCase());

export const runWithDbRoutingContext = (
  method: string,
  callback: () => void,
  options?: DbRoutingContextOptions
): void => {
  routingContextStorage.run(
    {
      method: method.toUpperCase(),
      userId: options?.userId,
      sessionId: options?.sessionId,
      region: options?.region,
    },
    callback
  );
};

export const getCurrentDbRoutingContext = (): DbRoutingContext | undefined =>
  routingContextStorage.getStore();

export const getPreferredReplicaRegion = (): string | undefined =>
  routingContextStorage.getStore()?.region;

export const setDbRoutingUserId = (userId: string): void => {
  const store = routingContextStorage.getStore();
  if (!store) {
    return;
  }

  store.userId = userId;
};

export const setDbRoutingSessionId = (sessionId: string): void => {
  const store = routingContextStorage.getStore();
  if (!store) {
    return;
  }

  store.sessionId = sessionId;
};

export const markUserWriteToPrimary = (sessionOrUserKey: string): void => {
  const now = Date.now();
  recentPrimaryReadUsers.set(sessionOrUserKey, now);
  pruneExpiredEntries(now);
};

export const pinCurrentSessionToPrimary = (): void => {
  const store = routingContextStorage.getStore();
  if (!store) {
    return;
  }

  if (store.userId) {
    markUserWriteToPrimary(store.userId);
  }
  if (store.sessionId) {
    markUserWriteToPrimary(store.sessionId);
  }
};

export const getDatabaseRoleForOperation = (operation: string): DatabaseRole => {
  const store = routingContextStorage.getStore();

  if (!store || store.method !== 'GET') {
    return 'primary';
  }

  if (!READ_OPERATIONS.has(operation)) {
    return 'primary';
  }

  if (store.userId && isSessionPinnedToPrimary(store.userId)) {
    return 'primary';
  }

  if (store.sessionId && isSessionPinnedToPrimary(store.sessionId)) {
    return 'primary';
  }

  return 'read';
};

export const clearDbRoutingStateForTests = (): void => {
  recentPrimaryReadUsers.clear();
};
