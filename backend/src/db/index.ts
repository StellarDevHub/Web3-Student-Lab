import { PrismaClient } from '@prisma/client';
import config from '../config/env.config.js';
import { getWorkspaceId } from '../middleware/WorkspaceContext.js';
import { getDatabaseRoleForOperation } from './requestContext.js';
import logger from '../utils/logger.js';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  readPrisma: PrismaClient | undefined;
};

const workspaceModels = new Set([
  'Student',
  'Course',
  'Certificate',
  'Enrollment',
  'Feedback',
  'LearningProgress',
  'AuditLog',
  'Canvas',
  'WebhookSubscription',
  'TranslationEntry',
  'VestingSchedule',
]);




import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const createPool = (connectionString: string) => {
  const useSSL =
    process.env.NODE_ENV !== 'test' &&
    !connectionString.includes('sslmode=disable') &&
    !connectionString.includes('localhost') &&
    !connectionString.includes('127.0.0.1');

  return new Pool({
    connectionString,
    ssl: useSSL ? { rejectUnauthorized: false } : false
  });
};

const primaryConnectionString = `${process.env.DATABASE_URL}`;
const readReplicaConnectionString = config.db.readReplicaUrl || primaryConnectionString;

const primaryPool = createPool(primaryConnectionString);
const readPool = createPool(readReplicaConnectionString);

const primaryAdapter = new PrismaPg(primaryPool);
const readAdapter = new PrismaPg(readPool);

const basePrisma = globalForPrisma.prisma ?? new PrismaClient({ adapter: primaryAdapter });
const baseReadPrisma = globalForPrisma.readPrisma ?? new PrismaClient({ adapter: readAdapter });

const workspaceExtension = {
  name: 'workspace-isolation',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!model || !workspaceModels.has(model)) {
          return query(args);
        }

        const workspaceId = getWorkspaceId();
        if (!workspaceId) {
          return query(args);
        }

        const mutableArgs = (args ?? {}) as Record<string, any>;

        if (
          [
            'findFirst',
            'findFirstOrThrow',
            'findMany',
            'count',
            'aggregate',
            'groupBy',
            'update',
            'updateMany',
            'delete',
            'deleteMany',
          ].includes(operation)
        ) {
          mutableArgs.where = { ...(mutableArgs.where ?? {}), workspaceId };
          return query(mutableArgs);
        }

        if (operation === 'create') {
          mutableArgs.data = { ...(mutableArgs.data ?? {}), workspaceId };
          return query(mutableArgs);
        }

        if (operation === 'createMany' && Array.isArray(mutableArgs.data)) {
          mutableArgs.data = mutableArgs.data.map((record: Record<string, any>) => ({
            ...record,
            workspaceId,
          }));
          return query(mutableArgs);
        }

        if (operation === 'upsert') {
          mutableArgs.create = { ...(mutableArgs.create ?? {}), workspaceId };
          mutableArgs.update = { ...(mutableArgs.update ?? {}), workspaceId };
          return query(mutableArgs);
        }

        if (operation === 'findUnique' || operation === 'findUniqueOrThrow') {
          const result = await query(mutableArgs);
          if (result && (result as Record<string, unknown>).workspaceId !== workspaceId) {
            return operation === 'findUnique'
              ? null
              : query({ ...mutableArgs, where: { id: '__missing__' } });
          }
          return result;
        }

        return query(mutableArgs);
      },
    },
  },
};

const prisma = basePrisma.$extends(workspaceExtension);
const readPrisma = baseReadPrisma.$extends(workspaceExtension);

const routingExtension = {
  name: 'read-replica-routing',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const dbRole = getDatabaseRoleForOperation(operation);

        if (dbRole === 'read') {
          const modelClient = readPrisma[model as keyof typeof readPrisma];
          if (modelClient && typeof modelClient[operation as keyof typeof modelClient] === 'function') {
            try {
              return (modelClient[operation as keyof typeof modelClient] as any)(args);
            } catch (error) {
              logger.warn(
                `Read replica query failed for ${model}.${operation}, falling back to primary:`,
                error
              );
            }
          }
        }

        const modelClient = prisma[model as keyof typeof prisma];
        if (modelClient && typeof modelClient[operation as keyof typeof modelClient] === 'function') {
          return (modelClient[operation as keyof typeof modelClient] as any)(args);
        }

        return query(args);
      },
    },
  },
};

const routedPrisma = prisma.$extends(routingExtension);

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = basePrisma;
  globalForPrisma.readPrisma = baseReadPrisma;
}

export { prisma, readPrisma };
export default routedPrisma as PrismaClient;
