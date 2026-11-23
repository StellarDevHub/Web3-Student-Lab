/**
 * Per-request DataLoaders (#1424 / BE-HARD-33).
 *
 * Batching every nested field resolver through these loaders collapses the
 * classic N+1 pattern (`students { enrollments { course } }`,
 * `courses { enrollments { student } }`) into a bounded number of SQL
 * queries — one batch per relation per request instead of one query per row.
 *
 * Loaders are created per request (see `context.ts`) so their in-memory cache
 * dedupes repeated keys within a single operation without leaking across
 * requests.
 */

import DataLoader from 'dataloader';
import type { PrismaClient } from '@prisma/client';

export type LoadedRow = Record<string, any>;

export interface GraphQLLoaders {
  studentById: DataLoader<string, LoadedRow | null>;
  courseById: DataLoader<string, LoadedRow | null>;
  enrollmentsByStudentId: DataLoader<string, LoadedRow[]>;
  enrollmentsByCourseId: DataLoader<string, LoadedRow[]>;
  certificatesByStudentId: DataLoader<string, LoadedRow[]>;
  certificatesByCourseId: DataLoader<string, LoadedRow[]>;
  learningProgressByStudentId: DataLoader<string, LoadedRow[]>;
  learningProgressByCourseId: DataLoader<string, LoadedRow[]>;
}

function groupByForeignKey(rows: LoadedRow[], key: string): Map<string, LoadedRow[]> {
  const grouped = new Map<string, LoadedRow[]>();
  for (const row of rows) {
    const id = String(row[key]);
    const bucket = grouped.get(id);
    if (bucket) {
      bucket.push(row);
    } else {
      grouped.set(id, [row]);
    }
  }
  return grouped;
}

/**
 * Create a fresh set of loaders bound to a Prisma client. Call once per
 * request / operation.
 */
export function createLoaders(prisma: PrismaClient): GraphQLLoaders {
  const model = (name: string): any => (prisma as any)[name];

  const byId = (modelName: string): DataLoader<string, LoadedRow | null> =>
    new DataLoader<string, LoadedRow | null>(async (ids) => {
      const rows: LoadedRow[] = await model(modelName).findMany({
        where: { id: { in: [...ids] } },
      });
      const map = new Map<string, LoadedRow>(rows.map((row) => [String(row.id), row]));
      return ids.map((id) => map.get(id) ?? null);
    });

  const byForeignKey = (modelName: string, foreignKey: string): DataLoader<string, LoadedRow[]> =>
    new DataLoader<string, LoadedRow[]>(async (ids) => {
      const rows: LoadedRow[] = await model(modelName).findMany({
        where: { [foreignKey]: { in: [...ids] } },
      });
      const grouped = groupByForeignKey(rows, foreignKey);
      return ids.map((id) => grouped.get(id) ?? []);
    });

  return {
    studentById: byId('student'),
    courseById: byId('course'),
    enrollmentsByStudentId: byForeignKey('enrollment', 'studentId'),
    enrollmentsByCourseId: byForeignKey('enrollment', 'courseId'),
    certificatesByStudentId: byForeignKey('certificate', 'studentId'),
    certificatesByCourseId: byForeignKey('certificate', 'courseId'),
    learningProgressByStudentId: byForeignKey('learningProgress', 'studentId'),
    learningProgressByCourseId: byForeignKey('learningProgress', 'courseId'),
  };
}
