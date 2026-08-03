import type { Module } from '../../routes/learning/types.js';

/**
 * Pure, side-effect-free helpers for the curriculum search indexer.
 *
 * These functions contain the logic that benefits most from unit testing — the
 * shaping of index rows and the construction of the parameterised full-text
 * search SQL — without requiring a live database. The service layer
 * (`CurriculumSearchService`) wires them to Prisma.
 */

export type CurriculumEntityType = 'course' | 'module' | 'lesson';

/** Minimal course shape needed to build index entries. */
export interface SearchableCourse {
  id: string;
  title: string;
  description?: string | null;
}

/** A denormalised, searchable row destined for `curriculum_search_entries`. */
export interface CurriculumIndexEntry {
  entityType: CurriculumEntityType;
  entityId: string;
  courseId: string | null;
  title: string;
  content: string;
  difficulty: string | null;
}

/** Validated parameters for a curriculum search request. */
export interface CurriculumSearchParams {
  query: string;
  workspaceId: string;
  entityType?: CurriculumEntityType;
  difficulty?: string;
  courseId?: string;
  limit: number;
  offset: number;
  cursor?: {
    rank: number;
    title: string;
    id: string;
  };
}

/** A parameterised SQL statement ready for `$queryRawUnsafe(text, ...values)`. */
export interface ParameterisedQuery {
  text: string;
  values: unknown[];
}

/** Join non-empty text fragments into a single indexable block. */
function toContent(...parts: Array<string | null | undefined>): string {
  return parts
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join(' ');
}

/**
 * Flatten courses and their modules/lessons into index rows.
 *
 * Each course yields one `course` row, each module one `module` row, and each
 * lesson one `lesson` row. Lesson rows carry their difficulty so callers can
 * filter by it. The text block combines the title and description so both are
 * searchable.
 */
export function buildIndexEntries(
  courses: SearchableCourse[],
  curriculumByCourseId: Record<string, Module[]>
): CurriculumIndexEntry[] {
  const entries: CurriculumIndexEntry[] = [];

  for (const course of courses) {
    entries.push({
      entityType: 'course',
      entityId: course.id,
      courseId: course.id,
      title: course.title,
      content: toContent(course.title, course.description),
      difficulty: null,
    });

    const modules = curriculumByCourseId[course.id] ?? [];
    for (const module of modules) {
      entries.push({
        entityType: 'module',
        entityId: module.id,
        courseId: course.id,
        title: module.title,
        content: toContent(module.title, module.description),
        difficulty: null,
      });

      for (const lesson of module.lessons) {
        entries.push({
          entityType: 'lesson',
          entityId: lesson.id,
          courseId: course.id,
          title: lesson.title,
          content: toContent(lesson.title, lesson.description),
          difficulty: lesson.difficulty,
        });
      }
    }
  }

  return entries;
}

/**
 * Build the parameterised full-text search query.
 *
 * Uses `websearch_to_tsquery`, which safely parses arbitrary user input (quoted
 * phrases, `or`, `-negation`) and never throws on malformed queries. Results are
 * ranked with `ts_rank` (title weighted above body via the stored vector) and
 * paginated. All user-supplied values are passed as bind parameters — never
 * interpolated — so the query is injection-safe.
 */
export function buildCurriculumSearchQuery(params: CurriculumSearchParams): ParameterisedQuery {
  const values: unknown[] = [];
  const bind = (value: unknown): string => {
    values.push(value);
    return `$${values.length}`;
  };

  const queryParam = bind(params.query);
  const workspaceParam = bind(params.workspaceId);
  const rankExpr = `ts_rank("searchVector", websearch_to_tsquery('english', ${queryParam}))`;

  const where: string[] = [
    `"workspaceId" = ${workspaceParam}`,
    `"searchVector" @@ websearch_to_tsquery('english', ${queryParam})`,
  ];

  if (params.entityType) {
    where.push(`"entityType" = ${bind(params.entityType)}`);
  }
  if (params.difficulty) {
    where.push(`"difficulty" = ${bind(params.difficulty)}`);
  }
  if (params.courseId) {
    where.push(`"courseId" = ${bind(params.courseId)}`);
  }
  if (params.cursor) {
    const cursorRank = bind(params.cursor.rank);
    const cursorTitle = bind(params.cursor.title);
    const cursorId = bind(params.cursor.id);
    where.push(
      `(\n` +
        `  ${rankExpr} < ${cursorRank}\n` +
        `  OR (${rankExpr} = ${cursorRank} AND "title" > ${cursorTitle})\n` +
        `  OR (${rankExpr} = ${cursorRank} AND "title" = ${cursorTitle} AND "id" > ${cursorId})\n` +
        `)`
    );
  }

  const limitParam = bind(params.limit);
  const offsetParam = bind(params.offset);

  const text = [
    'SELECT "id", "entityType", "entityId", "courseId", "title", "content", "difficulty",',
    `       ${rankExpr} AS rank`,
    'FROM "curriculum_search_entries"',
    `WHERE ${where.join('\n  AND ')}`,
    'ORDER BY rank DESC, "title" ASC, "id" ASC',
    `LIMIT ${limitParam} OFFSET ${offsetParam}`,
  ].join('\n');

  return { text, values };
}
