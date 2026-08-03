import { Request, Response, Router } from 'express';
import { authenticate } from '../../auth/auth.middleware.js';
import cacheService from '../../cache/CacheService.js';
import prisma from '../../db/index.js';
import { MarkdownParserService } from '../../services/markdownParser.service.js';
import { buildGatewayUrl } from '../../services/storage/utils.js';
import { validateBody, validateParams, validateQuery } from '../../utils/validation.js';
import {
    getCourseCurriculum,
    getStudentProgress,
    listCourses,
    updateStudentProgress,
    ProgressPersistenceError,
    ProgressConflictError,
} from './learning.service.js';
import {
    courseParamsSchema,
    coursesQuerySchema,
    progressUpdateSchema,
} from './validation.schemas.js';

const router: ReturnType<typeof Router> = Router();

/**
 * @openapi
 * /api/v1/learning/courses:
 *   get:
 *     summary: List all learning courses
 *     description: Returns all available courses, optionally filtered by difficulty level.
 *     tags: [Learning]
 *     security: []
 *     parameters:
 *       - in: query
 *         name: difficulty
 *         schema:
 *           type: string
 *           enum: [beginner, intermediate, advanced]
 *         description: Filter courses by difficulty level
 *     responses:
 *       200:
 *         description: List of courses
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 courses:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/CurriculumCourse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get(
  '/courses',
  validateQuery(coursesQuerySchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const difficulty =
        typeof req.query.difficulty === 'string' ? req.query.difficulty : undefined;
      const { data: courses, dataSource } = await listCourses(difficulty);
      res.json({ courses, dataSource });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * @openapi
 * /api/v1/learning/courses/{courseId}:
 *   get:
 *     summary: Get a specific course curriculum
 *     description: Returns detailed curriculum for a course, including modules and lessons.
 *     tags: [Learning]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *         description: Unique course identifier
 *       - in: query
 *         name: difficulty
 *         schema:
 *           type: string
 *           enum: [beginner, intermediate, advanced]
 *     responses:
 *       200:
 *         description: Course curriculum
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 course:
 *                   $ref: '#/components/schemas/CurriculumCourse'
 *       404:
 *         description: Course not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get(
  '/courses/:courseId',
  validateParams(courseParamsSchema),
  validateQuery(coursesQuerySchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const courseId = req.params.courseId as string;
      const difficulty =
        typeof req.query.difficulty === 'string' ? req.query.difficulty : undefined;
      const { data: course, dataSource } = await getCourseCurriculum(courseId, difficulty);

      if (!course) {
        res.status(404).json({ error: 'Course not found' });
        return;
      }

      res.json({ course, dataSource });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * @openapi
 * /api/v1/learning/courses/{courseId}/lessons/{lessonId}/content:
 *   get:
 *     summary: Get decentralized lesson content
 *     description: Fetches and parses Markdown/MDX lesson content from decentralized storage (IPFS). Results are cached for 24 hours.
 *     tags: [Learning]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: lessonId
 *         required: true
 *         schema:
 *           type: string
 *         description: Unique lesson identifier
 *     responses:
 *       200:
 *         description: Parsed lesson content (HTML from Markdown/MDX)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       404:
 *         description: Decentralized content not found for this lesson
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to retrieve lesson content
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get(
  '/courses/:courseId/lessons/:lessonId/content',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { lessonId } = req.params;

      const cacheKey = `lesson:content:${lessonId}`;
      const cached = await cacheService.get<any>(cacheKey);
      if (cached) {
        res.json(cached);
        return;
      }

      const asset = await prisma.decentralizedAsset.findFirst({
        where: {
          resourceType: 'lesson',
          resourceId: typeof lessonId === 'string' ? lessonId : undefined,
        },
      });

      if (!asset) {
        res.status(404).json({ error: 'Decentralized content not found for this lesson' });
        return;
      }

      const gatewayUrl = buildGatewayUrl(asset.cid);
      const response = await fetch(gatewayUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch content from gateway: ${response.statusText}`);
      }

      const rawText = await response.text();
      const parsedContent = MarkdownParserService.parse(rawText);

      await cacheService.set(cacheKey, parsedContent, 3600 * 24); // Cache for 24 hours

      res.json(parsedContent);
    } catch (error) {
      console.error('Failed to retrieve decentralized lesson content:', error);
      res.status(500).json({ error: 'Failed to retrieve lesson content' });
    }
  }
);

/**
 * @openapi
 * /api/v1/learning/courses/{courseId}/progress:
 *   get:
 *     summary: Get student progress for a course
 *     description: Returns the authenticated student's progress including completed lessons and percentage.
 *     tags: [Learning]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Student progress
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 progress:
 *                   $ref: '#/components/schemas/Progress'
 *       401:
 *         description: Missing or invalid authentication token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Course not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get(
  '/courses/:courseId/progress',
  authenticate,
  validateParams(courseParamsSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const courseId = req.params.courseId as string;
      const { data: course } = await getCourseCurriculum(courseId);

      if (!course) {
        res.status(404).json({ error: 'Course not found' });
        return;
      }

      const { data: progress, dataSource } = await getStudentProgress(req.user!.id, courseId);

      res.json({ progress, dataSource });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * @openapi
 * /api/v1/learning/courses/{courseId}/progress:
 *   patch:
 *     summary: Update student progress for a course
 *     description: Updates lesson completion status and overall progress percentage for the authenticated student.
 *     tags: [Learning]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [lessonId, status]
 *             properties:
 *               lessonId:
 *                 type: string
 *                 description: Lesson identifier to update
 *               status:
 *                 type: string
 *                 enum: [not_started, in_progress, completed]
 *               percentage:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 100
 *                 description: Overall course completion percentage
 *     responses:
 *       200:
 *         description: Progress updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 progress:
 *                   $ref: '#/components/schemas/Progress'
 *       401:
 *         description: Missing or invalid authentication token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Course or lesson not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.patch(
  '/courses/:courseId/progress',
  authenticate,
  validateParams(courseParamsSchema),
  validateBody(progressUpdateSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const courseId = req.params.courseId as string;
      const { data: course } = await getCourseCurriculum(courseId);

      if (!course) {
        res.status(404).json({ error: 'Course not found' });
        return;
      }

      const progress = await updateStudentProgress(req.user!.id, courseId, req.body);
      res.json({ progress, dataSource: 'live' });
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'LESSON_NOT_FOUND') {
        res.status(404).json({ error: 'Lesson not found' });
        return;
      }

      if (error instanceof ProgressConflictError) {
        res.status(409).json({
          error: error.message,
          progress: error.current,
          dataSource: 'live',
        });
        return;
      }

      if (error instanceof ProgressPersistenceError) {
        res.status(503).json({
          error: error.message,
          dataSource: 'demo',
        });
        return;
      }

      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * Legacy routes for backward compatibility with the premium frontend
 * @route   GET /api/learning/modules
 */
router.get('/modules', async (req: Request, res: Response) => {
  try {
    const { data: course, dataSource } = await getCourseCurriculum('course-1');
    res.json({ modules: course?.modules || [], dataSource });
  } catch (_error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @route   POST /api/learning/progress/:userId/complete
 */
router.post('/progress/:userId/complete', async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId as string;
    const { lessonId } = req.body;
    const progress = await updateStudentProgress(userId, 'course-1', {
      lessonId,
      status: 'completed',
    });
    res.json({ progress, dataSource: 'live', message: 'Lesson marked as complete' });
  } catch (error: unknown) {
    if (error instanceof ProgressPersistenceError) {
      res.status(503).json({ error: error.message, dataSource: 'demo' });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
