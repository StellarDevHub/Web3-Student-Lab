import prisma from '../../db/index.js';
import { COURSES, curriculumByCourseId } from '../../routes/learning/curriculum.data.js';
import {
  buildCurriculumSearchQuery,
  buildIndexEntries,
  type CurriculumIndexEntry,
  type CurriculumSearchParams,
  type SearchableCourse,
} from './curriculumSearchQuery.js';

/**
 * CurriculumSearchService — the database-facing layer of the search indexer.
 *
 * Responsibilities:
 *  - `reindexCurriculum`: (re)build the `curriculum_search_entries` table from
 *    the curriculum sources (static modules/lessons + DB course records).
 *  - `searchCurriculum`: run the PostgreSQL full-text query and return ranked
 *    results.
 *
 * The query/row-shaping logic lives in `curriculumSearchQuery.ts` (pure and unit
 * tested); this module only wires it to Prisma.
 */

/** A single ranked search hit returned to the API. */
export interface CurriculumSearchResult {
  id: string;
  entityType: string;
  entityId: string;
  courseId: string | null;
  title: string;
  content: string;
  difficulty: string | null;
  rank: number;
}

// The default Prisma export is workspace-extended; raw queries and the new model
// are accessed dynamically to avoid coupling to the extension's narrowed types.
const db = prisma as unknown as {
  $queryRawUnsafe: (text: string, ...values: unknown[]) => Promise<unknown[]>;
  $transaction: (ops: unknown[]) => Promise<unknown>;
  course: { findMany: (args: unknown) => Promise<SearchableCourse[]> };
  curriculumSearchEntry: {
    deleteMany: (args: unknown) => unknown;
    createMany: (args: unknown) => unknown;
  };
};

/**
 * Merge the curriculum sources into a deduplicated set of index rows.
 *
 * The static curriculum (`curriculum.data.ts`) is the source of modules and
 * lessons; DB `Course` rows are also indexed so live courses are searchable.
 * Pure and deterministic for easy testing — pass the DB courses in.
 */
export function collectIndexEntries(dbCourses: SearchableCourse[]): CurriculumIndexEntry[] {
  const staticEntries = buildIndexEntries(
    COURSES.map((c) => ({ id: c.id, title: c.title, description: c.description })),
    curriculumByCourseId
  );
  // DB courses contribute only 'course' rows (no static modules attached).
  const dbEntries = buildIndexEntries(dbCourses, {});

  const seen = new Set<string>();
  const merged: CurriculumIndexEntry[] = [];
  for (const entry of [...staticEntries, ...dbEntries]) {
    const key = `${entry.entityType}:${entry.entityId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(entry);
  }
  return merged;
}

/**
 * Rebuild the search index for a workspace. Returns the number of rows indexed.
 * The stored `searchVector` is populated by the database trigger on insert.
 */
export async function reindexCurriculum(workspaceId: string): Promise<number> {
  let dbCourses: SearchableCourse[] = [];
  try {
    dbCourses = await db.course.findMany({
      where: { workspaceId },
      select: { id: true, title: true, description: true },
    });
  } catch {
    // If the courses table is unavailable, still index the static curriculum.
    dbCourses = [];
  }

  const entries = collectIndexEntries(dbCourses);

  await db.$transaction([
    db.curriculumSearchEntry.deleteMany({ where: { workspaceId } }),
    db.curriculumSearchEntry.createMany({
      data: entries.map((entry) => ({ ...entry, workspaceId })),
      skipDuplicates: true,
    }),
  ]);

  return entries.length;
}

/** Execute the full-text search and return ranked results. */
export async function searchCurriculum(
  params: CurriculumSearchParams
): Promise<CurriculumSearchResult[]> {
  const { text, values } = buildCurriculumSearchQuery(params);
  const rows = await db.$queryRawUnsafe(text, ...values);
  return rows as CurriculumSearchResult[];
}
