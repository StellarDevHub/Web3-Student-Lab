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
} from './learning.service.js';
import {
    courseParamsSchema,
    coursesQuerySchema,
    progressUpdateSchema,
} from './validation.schemas.js';

const router: ReturnType<typeof Router> = Router();

/**
 * @route   GET /api/learning/courses
 * @desc    Get all learning courses
 * @access  Public
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
 * @route   GET /api/learning/courses/:courseId
 * @desc    Get a specific course curriculum
 * @access  Public
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
 * @route   GET /api/learning/courses/:courseId/lessons/:lessonId/content
 * @desc    Get decentralized lesson content (Markdown/MDX parsed)
 * @access  Public
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
 * @route   GET /api/learning/courses/:courseId/progress
 * @desc    Get user progress for a specific course
 * @access  Private
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
 * @route   PATCH /api/learning/courses/:courseId/progress
 * @desc    Update user progress for a specific course
 * @access  Private
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
