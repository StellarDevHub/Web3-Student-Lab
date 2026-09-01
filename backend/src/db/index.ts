import { PrismaClient } from '@prisma/client';
import config from '../config/env.config.js';
import { encryptionMiddleware } from '../middleware/prismaEncryption.js';
import { getWorkspaceId } from '../middleware/WorkspaceContext.js';
import logger from '../utils/logger.js';
import { encryptionMiddleware } from '../middleware/prismaEncryption.js';
import { workspaceModels } from './workspaceModels.js';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  readPrisma: PrismaClient | undefined;
};

import { PrismaPg } from '@prisma/adapter-pg';
// @ts-ignore
import pkg from 'pg';
const { Pool } = pkg;

const createPool = (connectionString: string) => {
  const useSSL =
    process.env.NODE_ENV !== 'test' &&
    !connectionString.includes('sslmode=disable') &&
    !connectionString.includes('localhost') &&
    !connectionString.includes('127.0.0.1');

  const normalizedConnectionString = useSSL
    ? connectionString.replace(/sslmode=[^&]+/, 'sslmode=no-verify')
    : connectionString;

  return new Pool({
    connectionString: normalizedConnectionString,
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
      async $allOperations({ model, operation, args, query }: { model?: string; operation?: string; args?: any; query: (args: any) => Promise<any> }) {
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
          ].includes(operation!)
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

// Read-replica health & circuit breaker state
let readReplicaHealthy = true;
let replicaFailureCount = 0;
let replicaCircuitOpenUntil = 0;

const getReplicaFailureThreshold = () => config.db?.replica?.failureThreshold ?? 3;
const getReplicaCooldownMs = () => config.db?.replica?.cooldownMs ?? 30000;
const getReplicaCheckIntervalMs = () => config.db?.replica?.checkIntervalMs ?? 10000;
const getReplicaLagWindowMs = () => config.db?.replica?.replicationLagWindowMs ?? 1000;

const markReadReplicaFailure = () => {
  replicaFailureCount += 1;
  if (replicaFailureCount >= getReplicaFailureThreshold()) {
    readReplicaHealthy = false;
    replicaCircuitOpenUntil = Date.now() + getReplicaCooldownMs();
    logger.warn('Read replica circuit opened', { until: replicaCircuitOpenUntil });
  }
};

const probeReadReplica = async () => {
  try {
    await readPool.query('SELECT 1');
    // success
    replicaFailureCount = 0;
    readReplicaHealthy = true;
    replicaCircuitOpenUntil = 0;
    logger.info('Read replica probe succeeded, circuit closed');
  } catch (err) {
    replicaCircuitOpenUntil = Date.now() + getReplicaCooldownMs();
    logger.warn('Read replica probe failed', { err });
  }
};

const checkReadReplicaHealth = async () => {
  // If circuit is open, avoid frequent checks until cooldown expires
  if (!readReplicaHealthy && Date.now() < replicaCircuitOpenUntil) return;

  try {
    const res = await readPool.query(
      "SELECT EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp())) * 1000 AS lag_ms"
    );
    const lagMs = res?.rows?.[0]?.lag_ms;
    const lagWindow = getReplicaLagWindowMs();

    if (lagMs === null || lagMs === undefined) {
      throw new Error('pg_last_xact_replay_timestamp returned null (replica may not be streaming)');
    }

    if (Number(lagMs) > lagWindow) {
      throw new Error(`replica lag ${lagMs}ms exceeds window ${lagWindow}ms`);
    }

    // healthy
    replicaFailureCount = 0;
    readReplicaHealthy = true;
  } catch (err) {
    logger.warn('Read replica health check failed', { err: String(err), failureCount: replicaFailureCount });
    markReadReplicaFailure();
  }

  // If circuit was open and cooldown expired, probe once
  if (!readReplicaHealthy && Date.now() >= replicaCircuitOpenUntil) {
    await probeReadReplica();
  }
};

// Start periodic health checks
setInterval(() => {
  void checkReadReplicaHealth();
}, getReplicaCheckIntervalMs());

const routingExtension = {
  name: 'read-replica-routing',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }: { model?: string; operation?: string; args?: any; query: (args: any) => Promise<any> }) {
          const dbRole = getDatabaseRoleForOperation(operation!);

        if (dbRole === 'read' && readReplicaHealthy) {
          const modelClient = readPrisma[model as keyof typeof readPrisma];
          if (modelClient && typeof modelClient[operation as keyof typeof modelClient] === 'function') {
            try {
              return (modelClient[operation as keyof typeof modelClient] as any)(args);
            } catch (error) {
              logger.warn(
                `Read replica query failed for ${model}.${operation}, falling back to primary:`,
                error
              );
              // mark failure for circuit breaker
              try {
                markReadReplicaFailure();
              } catch (e) {
                logger.warn('Failed to mark read replica failure', { err: String(e) });
              }
            }
          }
        } else if (dbRole === 'read' && !readReplicaHealthy) {
          logger.debug('Skipping read replica route because replica circuit is open; using primary');
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

const encryptionExt = encryptionMiddleware();

const routedPrisma = prisma.$extends(routingExtension).$extends(encryptionExt);

routedPrisma.$use(async (params, next) => {
  if (
    params.model === 'AuditLog' &&
    ['update', 'delete', 'updateMany', 'deleteMany'].includes(params.action)
  ) {
    throw new Error('AuditLog records are immutable and cannot be modified or deleted');
  }
  return next(params);
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = basePrisma;
  globalForPrisma.readPrisma = baseReadPrisma;
}

export { prisma, readPrisma };
export default routedPrisma as PrismaClient;
