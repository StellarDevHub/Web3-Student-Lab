import { PrismaClient } from '@prisma/client';
import config from '../config/env.config.js';
import { encryptionMiddleware } from '../middleware/prismaEncryption.js';
import { getWorkspaceId, isSystemContext, WorkspaceAuthorizationError } from '../middleware/WorkspaceContext.js';
import logger from '../utils/logger.js';
import { rowLevelSecurityExtension, withWorkspaceTransaction } from './prismaMiddleware.js';
import {
  getDatabaseRoleForOperation,
  getPreferredReplicaRegion,
  isReadOperation,
  pinCurrentSessionToPrimary,
} from './requestContext.js';
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

interface ReplicaConfigEntry {
  region: string;
  url: string;
}

const resolveReplicaConfigs = (primaryUrl: string): ReplicaConfigEntry[] => {
  const entries: ReplicaConfigEntry[] = [];
  const seenUrls = new Set<string>();

  const addEntry = (region: string, url?: string) => {
    const trimmed = url?.trim();
    if (!trimmed || seenUrls.has(trimmed)) {
      return;
    }
    seenUrls.add(trimmed);
    entries.push({ region: region.toLowerCase(), url: trimmed });
  };

  const regionalUrls = config.db?.regionalReplicaUrls;
  if (regionalUrls) {
    for (const [region, url] of Object.entries(regionalUrls)) {
      addEntry(region, url);
    }
  }

  const listUrls = config.db?.readReplicaUrls ?? [];
  listUrls.forEach((url, idx) => {
    addEntry(`replica-${idx + 1}`, url);
  });

  addEntry('default', config.db?.readReplicaUrl);

  if (entries.length === 0) {
    entries.push({ region: 'default', url: primaryUrl });
  }

  return entries;
};

const primaryConnectionString = `${process.env.DATABASE_URL}`;
const replicaConfigs = resolveReplicaConfigs(primaryConnectionString);

const primaryPool = createPool(primaryConnectionString);
const primaryAdapter = new PrismaPg(primaryPool);
const basePrisma = globalForPrisma.prisma ?? new PrismaClient({ adapter: primaryAdapter });

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
          if (isSystemContext()) {
            return query(args);
          }
          throw new WorkspaceAuthorizationError();
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
          mutableArgs.where = { ...(mutableArgs.where ?? {}), workspaceId };
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

const extendClient = (client: PrismaClient) =>
  client
    .$extends(workspaceExtension)
    .$extends(rowLevelSecurityExtension(client as any));

// The RLS extension must be applied last so it runs innermost: its `query(args)`
// is then a lazy Prisma promise that can join the set_config batch transaction.
const prisma = extendClient(basePrisma);

interface ReplicaNode {
  region: string;
  pool: InstanceType<typeof Pool>;
  baseClient: PrismaClient;
  client: ReturnType<typeof extendClient>;
  healthy: boolean;
  failureCount: number;
  circuitOpenUntil: number;
  lastLagMs: number | null;
}

const replicaNodes: ReplicaNode[] = replicaConfigs.map((entry, index) => {
  const pool = createPool(entry.url);
  const adapter = new PrismaPg(pool);
  const baseClient =
    index === 0 && globalForPrisma.readPrisma
      ? globalForPrisma.readPrisma
      : new PrismaClient({ adapter });

  return {
    region: entry.region,
    pool,
    baseClient,
    client: extendClient(baseClient),
    healthy: true,
    failureCount: 0,
    circuitOpenUntil: 0,
    lastLagMs: null,
  };
});

const readPrisma = replicaNodes[0]!.client;
const baseReadPrisma = replicaNodes[0]!.baseClient;

let roundRobinIndex = 0;

const getReplicaFailureThreshold = () => config.db?.replica?.failureThreshold ?? 3;
const getReplicaCooldownMs = () => config.db?.replica?.cooldownMs ?? 30000;
const getReplicaCheckIntervalMs = () => config.db?.replica?.checkIntervalMs ?? 10000;
const getReplicaLagWindowMs = () => config.db?.replica?.replicationLagWindowMs ?? 3000;

const markReplicaFailure = (node: ReplicaNode) => {
  node.failureCount += 1;
  if (node.failureCount >= getReplicaFailureThreshold()) {
    node.healthy = false;
    node.circuitOpenUntil = Date.now() + getReplicaCooldownMs();
    logger.warn('Read replica circuit opened', {
      region: node.region,
      until: node.circuitOpenUntil,
    });
  }
};

const probeReplica = async (node: ReplicaNode) => {
  try {
    await node.pool.query('SELECT 1');
    node.failureCount = 0;
    node.healthy = true;
    node.circuitOpenUntil = 0;
    logger.info('Read replica probe succeeded, circuit closed', { region: node.region });
  } catch (err) {
    node.circuitOpenUntil = Date.now() + getReplicaCooldownMs();
    logger.warn('Read replica probe failed', { region: node.region, err });
  }
};

const checkReplicaNodeHealth = async (node: ReplicaNode) => {
  // If circuit is open, avoid frequent checks until cooldown expires
  if (!node.healthy && Date.now() < node.circuitOpenUntil) return;

  try {
    const res = await node.pool.query(
      'SELECT EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp())) * 1000 AS lag_ms'
    );
    const lagMs = res?.rows?.[0]?.lag_ms;
    const lagWindow = getReplicaLagWindowMs();

    if (lagMs === null || lagMs === undefined) {
      throw new Error('pg_last_xact_replay_timestamp returned null (replica may not be streaming)');
    }

    const numericLagMs = Number(lagMs);
    node.lastLagMs = numericLagMs;

    if (numericLagMs > lagWindow) {
      throw new Error(`replica lag ${numericLagMs}ms exceeds window ${lagWindow}ms`);
    }

    node.failureCount = 0;
    node.healthy = true;
  } catch (err) {
    logger.warn('Read replica health check failed', {
      region: node.region,
      err: String(err),
      failureCount: node.failureCount,
    });
    markReplicaFailure(node);
  }

  // If circuit was open and cooldown expired, probe once
  if (!node.healthy && Date.now() >= node.circuitOpenUntil) {
    await probeReplica(node);
  }
};

const checkAllReadReplicasHealth = async () => {
  await Promise.all(replicaNodes.map((node) => checkReplicaNodeHealth(node)));
};

const selectHealthyReplica = (preferredRegion?: string): ReplicaNode | null => {
  const healthyNodes = replicaNodes.filter((node) => node.healthy);
  if (healthyNodes.length === 0) {
    return null;
  }

  if (preferredRegion) {
    const normalized = preferredRegion.toLowerCase();
    const regionalMatch = healthyNodes.find((node) => node.region === normalized);
    if (regionalMatch) {
      return regionalMatch;
    }
  }

  const selected = healthyNodes[roundRobinIndex % healthyNodes.length]!;
  roundRobinIndex = (roundRobinIndex + 1) % healthyNodes.length;
  return selected;
};

const getReplicaPoolStatus = () =>
  replicaNodes.map((node) => ({
    region: node.region,
    healthy: node.healthy,
    failureCount: node.failureCount,
    circuitOpenUntil: node.circuitOpenUntil,
    lastLagMs: node.lastLagMs,
  }));

// Start periodic health checks
if (process.env.NODE_ENV !== 'test') {
  const replicaTimer = setInterval(() => {
    void checkAllReadReplicasHealth();
  }, getReplicaCheckIntervalMs());
  if (typeof replicaTimer.unref === 'function') {
    replicaTimer.unref();
  }
}

const routingExtension = {
  name: 'read-replica-routing',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }: { model?: string; operation?: string; args?: any; query: (args: any) => Promise<any> }) {
        // Any Prisma write operation pins the active user/session to primary for 3s
        if (operation && !isReadOperation(operation)) {
          pinCurrentSessionToPrimary();
        }

        const dbRole = getDatabaseRoleForOperation(operation!);

        if (dbRole === 'read') {
          const replica = selectHealthyReplica(getPreferredReplicaRegion());
          if (replica) {
            const modelClient = replica.client[model as keyof typeof replica.client];
            if (modelClient && typeof modelClient[operation as keyof typeof modelClient] === 'function') {
              try {
                return await (modelClient[operation as keyof typeof modelClient] as any)(args);
              } catch (error) {
                logger.warn(
                  `Read replica query failed on region=${replica.region} for ${model}.${operation}, falling back to primary:`,
                  error
                );
                try {
                  markReplicaFailure(replica);
                } catch (e) {
                  logger.warn('Failed to mark read replica failure', { err: String(e) });
                }
              }
            }
          } else {
            logger.debug('Skipping read replica route because all replica circuits are open; using primary');
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

const encryptionExt = encryptionMiddleware();

const routedPrisma = prisma.$extends(routingExtension).$extends(encryptionExt);

if (typeof (basePrisma as any).$use === 'function') {
  (basePrisma as any).$use(async (params: any, next: any) => {
    if (
      params.model === 'AuditLog' &&
      ['update', 'delete', 'updateMany', 'deleteMany'].includes(params.action)
    ) {
      throw new Error('AuditLog records are immutable and cannot be modified or deleted');
    }
    return next(params);
  });
}

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = basePrisma;
  globalForPrisma.readPrisma = baseReadPrisma;
}

/**
 * Interactive transaction on the primary with the current workspace context
 * applied for its whole duration (BE-005). Use this instead of
 * `prisma.$transaction(async (tx) => ...)` for workspace-scoped work.
 */
const workspaceTransaction = <R>(fn: (tx: typeof prisma) => Promise<R>, options?: Record<string, unknown>) =>
  withWorkspaceTransaction(prisma as any, fn as any, options) as Promise<R>;

export { getReplicaPoolStatus, prisma, readPrisma, workspaceTransaction };
export default routedPrisma as PrismaClient;
