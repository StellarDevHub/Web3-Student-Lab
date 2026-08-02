import { Router, Request, Response } from 'express';
import { getWorkspaceId } from '../../middleware/WorkspaceContext.js';
import { validateQuery } from '../../utils/validation.js';
import { curriculumSearchQuerySchema } from './curriculum-search.schemas.js';
import {
  reindexCurriculum,
  searchCurriculum,
} from '../../search/curriculum/CurriculumSearchService.js';

const router = Router();

/**
 * GET /api/v1/search
 *
 * Full-text search across indexed curriculum content (courses, modules,
 * lessons). Supports filtering by `type`, `difficulty` and `courseId`, and
 * pagination via `limit`/`offset`. Results are ranked by relevance.
 */
router.get('/', validateQuery(curriculumSearchQuerySchema), async (req: Request, res: Response) => {
  try {
    // Re-parse to obtain the coerced/typed values (validateQuery only validates).
    const { q, type, difficulty, courseId, limit, offset, cursorRank, cursorTitle, cursorId } =
      curriculumSearchQuerySchema.parse(req.query);
    const workspaceId = getWorkspaceId() ?? 'default';

    const results = await searchCurriculum({
      query: q,
      workspaceId,
      entityType: type,
      difficulty,
      courseId,
      limit,
      offset,
      cursor:
        cursorRank !== undefined && cursorTitle && cursorId
          ? { rank: cursorRank, title: cursorTitle, id: cursorId }
          : undefined,
    });

    res.json({ query: q, count: results.length, limit, offset, results });
  } catch {
    res.status(500).json({ error: 'Search request failed' });
  }
});

/**
 * POST /api/v1/search/reindex
 *
 * Rebuilds the curriculum search index for the current workspace. Intended for
 * admin/maintenance use (e.g. after curriculum updates or a fresh deploy).
 */
router.post('/reindex', async (_req: Request, res: Response) => {
  try {
    const workspaceId = getWorkspaceId() ?? 'default';
    const indexed = await reindexCurriculum(workspaceId);
    res.json({ indexed });
  } catch {
    res.status(500).json({ error: 'Reindex request failed' });
  }
});

export default router;
