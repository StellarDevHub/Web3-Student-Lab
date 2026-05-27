import { AsyncLocalStorage } from 'node:async_hooks';

interface DbRoutingContext {
  method: string;
  userId?: string;
}

type DatabaseRole = 'primary' | 'read';

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

const DEFAULT_LAG_WINDOW_MS = 1000;

const getLagWindowMs = (): number => {
  const parsed = Number.parseInt(process.env.DB_REPLICATION_LAG_WINDOW_MS ?? '', 10);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_LAG_WINDOW_MS;
  }

  return parsed;
};

const routingContextStorage = new AsyncLocalStorage<DbRoutingContext>();
const recentPrimaryReadUsers = new Map<string, number>();

const pruneExpiredEntries = (now: number): void => {
  const lagWindowMs = getLagWindowMs();

  for (const [userId, timestamp] of recentPrimaryReadUsers.entries()) {
    if (now - timestamp > lagWindowMs) {
      recentPrimaryReadUsers.delete(userId);
    }
  }
};

const shouldForcePrimaryReadForUser = (userId: string): boolean => {
  const now = Date.now();
  pruneExpiredEntries(now);

  const lastWriteAt = recentPrimaryReadUsers.get(userId);
  if (lastWriteAt === undefined) {
    return false;
  }

  return now - lastWriteAt <= getLagWindowMs();
};

export const runWithDbRoutingContext = (method: string, callback: () => void): void => {
  routingContextStorage.run({ method }, callback);
};

export const setDbRoutingUserId = (userId: string): void => {
  const store = routingContextStorage.getStore();
  if (!store) {
    return;
  }

  store.userId = userId;
};

export const markUserWriteToPrimary = (userId: string): void => {
  const now = Date.now();
  recentPrimaryReadUsers.set(userId, now);
  pruneExpiredEntries(now);
};

export const getDatabaseRoleForOperation = (operation: string): DatabaseRole => {
  const store = routingContextStorage.getStore();

  if (!store || store.method !== 'GET') {
    return 'primary';
  }

  if (!READ_OPERATIONS.has(operation)) {
    return 'primary';
  }

  if (store.userId && shouldForcePrimaryReadForUser(store.userId)) {
    return 'primary';
  }

  return 'read';
};

export const clearDbRoutingStateForTests = (): void => {
  recentPrimaryReadUsers.clear();
};
