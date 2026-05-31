import { PrismaClient } from '@prisma/client';
import { getWorkspaceId } from '../middleware/WorkspaceContext.js';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
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
]);

const basePrisma = globalForPrisma.prisma ?? new PrismaClient({
  accelerateUrl: process.env.DATABASE_URL || 'prisma://dummy:dummy@localhost:5432/dummy'
});

const prisma = basePrisma.$extends({
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
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = basePrisma;
}

export { prisma };
export default prisma as PrismaClient;
