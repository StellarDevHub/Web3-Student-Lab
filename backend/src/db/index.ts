import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '@prisma/client';
import pg from 'pg';
import { getDatabaseRoleForOperation } from './requestContext.js';

const DEFAULT_DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/web3-student-lab?schema=public';

const writeConnectionString =
  process.env.DATABASE_URL ||
  DEFAULT_DATABASE_URL;
const readConnectionString = process.env.READ_DATABASE_URL || writeConnectionString;

const parsePoolOption = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
};

const poolConfig: pg.PoolConfig = {
  max: parsePoolOption(process.env.DB_POOL_MAX, 20),
  idleTimeoutMillis: parsePoolOption(process.env.DB_POOL_IDLE_TIMEOUT_MS, 10000),
  connectionTimeoutMillis: parsePoolOption(process.env.DB_POOL_CONNECTION_TIMEOUT_MS, 5000),
};

const hasDedicatedReadReplica = readConnectionString !== writeConnectionString;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaWrite: PrismaClient | undefined;
  prismaRead: PrismaClient | undefined;
  writePool: pg.Pool | undefined;
  readPool: pg.Pool | undefined;
};

const writePool =
  globalForPrisma.writePool ??
  new pg.Pool({
    connectionString: writeConnectionString,
    ...poolConfig,
  });

const readPool = hasDedicatedReadReplica
  ? globalForPrisma.readPool ??
    new pg.Pool({
      connectionString: readConnectionString,
      ...poolConfig,
    })
  : writePool;

import { getWorkspaceId } from '../middleware/WorkspaceContext.js';

const writeAdapter = new PrismaPg(writePool);
const readAdapter = hasDedicatedReadReplica ? new PrismaPg(readPool) : writeAdapter;

const workspaceModels = [
  'Student', 'Course', 'Certificate', 'Enrollment', 
  'Feedback', 'LearningProgress', 'AuditLog', 'Canvas'
];

const workspaceExtension = Prisma.defineExtension({
  name: 'workspace-isolation',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!workspaceModels.includes(model)) {
          return query(args);
        }

        const workspaceId = getWorkspaceId();
        
        // Only enforce workspaceId if one is set in the context
        if (!workspaceId) {
           throw new Error(`Strict Workspace Isolation: Missing workspace context for ${operation} on ${model}`);
        }

        if (['findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy', 'update', 'updateMany', 'delete', 'deleteMany'].includes(operation)) {
          args.where = { ...args.where, workspaceId };
          return query(args);
        }

        if (['create', 'createMany'].includes(operation)) {
          if (Array.isArray(args.data)) {
            args.data = args.data.map((d: any) => ({ ...d, workspaceId }));
          } else {
            args.data = { ...args.data, workspaceId };
          }
          return query(args);
        }

        if (operation === 'upsert') {
          args.create = { ...args.create, workspaceId };
          args.update = { ...args.update, workspaceId };
          // Note: We don't modify args.where for upsert because it requires unique fields.
          // However, our update/delete logic already ensures isolation.
          // To be safe for upsert, we can check the record afterwards or before.
          // But since IDs are cuid/unique, an upsert on a non-existent ID in this workspace 
          // will either create a new one with correct workspaceId or fail if it exists elsewhere 
          // (if we had composite unique constraints).
          return query(args);
        }

        if (['findUnique', 'findUniqueOrThrow'].includes(operation)) {
          const result = await query(args);
          if (result && (result as any).workspaceId !== workspaceId) {
            if (operation === 'findUniqueOrThrow') throw new Error('Record not found');
            return null;
          }
          return result;
        }

        return query(args);
      }
    }
  }
});

const basePrismaWrite = globalForPrisma.prismaWrite ?? new PrismaClient({ adapter: writeAdapter });
const basePrismaRead = hasDedicatedReadReplica
  ? globalForPrisma.prismaRead ?? new PrismaClient({ adapter: readAdapter })
  : basePrismaWrite;

const prismaWrite = basePrismaWrite.$extends(workspaceExtension) as unknown as PrismaClient;
const prismaRead = basePrismaRead.$extends(workspaceExtension) as unknown as PrismaClient;


const getClientForOperation = (operation: string): PrismaClient => {
  if (!hasDedicatedReadReplica) {
    return prismaWrite;
  }

  const role = getDatabaseRoleForOperation(operation);
  return role === 'read' ? prismaRead : prismaWrite;
};

const isModelDelegate = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  return 'findUnique' in value && 'create' in value;
};

const createModelDelegateProxy = (modelName: string): object => {
  return new Proxy(
    {},
    {
      get(_target, operationKey: string | symbol) {
        const operationName = String(operationKey);
        const client = getClientForOperation(operationName);
        const delegate = (client as unknown as Record<string, unknown>)[modelName] as
          | Record<string, unknown>
          | undefined;
        const operation = delegate?.[operationKey as keyof typeof delegate];

        if (typeof operation === 'function') {
          return operation.bind(delegate);
        }

        return operation;
      },
    }
  );
};

const prismaProxy = new Proxy(prismaWrite as PrismaClient, {
  get(target, property, receiver) {
    if (property === '$connect') {
      return () => prismaWrite.$connect();
    }

    if (property === '$disconnect') {
      return async () => {
        await prismaWrite.$disconnect();
        if (hasDedicatedReadReplica) {
          await prismaRead.$disconnect();
        }

        await writePool.end();
        if (hasDedicatedReadReplica) {
          await readPool.end();
        }
      };
    }

    if (property === '$queryRaw' || property === '$queryRawUnsafe') {
      const client = getClientForOperation('findMany');
      const operation = (client as unknown as Record<string, unknown>)[property as string];
      if (typeof operation === 'function') {
        return operation.bind(client);
      }

      return operation;
    }

    const value = Reflect.get(target as object, property, receiver);

    if (typeof value === 'function') {
      return value.bind(prismaWrite);
    }

    if (typeof property === 'string' && isModelDelegate(value)) {
      return createModelDelegateProxy(property);
    }

    return value;
  },
});

export const prisma = globalForPrisma.prisma ?? prismaProxy;

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaWrite = prismaWrite;
  globalForPrisma.prismaRead = prismaRead;
  globalForPrisma.writePool = writePool;
  globalForPrisma.readPool = readPool;
}

export default prisma;
