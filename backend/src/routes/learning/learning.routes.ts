import { Request, Response, Router } from 'express';
import { authenticate } from '../../auth/auth.middleware.js';
import { validateBody, validateParams, validateQuery } from '../../utils/validation.js';
import {
  getCourseCurriculum,
  getStudentProgress,
  listCourses,
  updateStudentProgress,
} from './learning.service.js';
import {
  courseParamsSchema,
  coursesQuerySchema,
  progressUpdateSchema,
} from './validation.schemas.js';

const router = Router();

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
      const courses = await listCourses(difficulty);
      res.json({ courses });
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
      const course = await getCourseCurriculum(courseId, difficulty);

      if (!course) {
        res.status(404).json({ error: 'Course not found' });
        return;
      }

      res.json({ course });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
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
      const course = await getCourseCurriculum(courseId);

      if (!course) {
        res.status(404).json({ error: 'Course not found' });
        return;
      }

      const progress = await getStudentProgress(req.user!.id, courseId);

      res.json({ progress });
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
      const course = await getCourseCurriculum(courseId);

      if (!course) {
        res.status(404).json({ error: 'Course not found' });
        return;
      }

      const progress = await updateStudentProgress(req.user!.id, courseId, req.body);
      res.json({ progress });
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'LESSON_NOT_FOUND') {
        res.status(404).json({ error: 'Lesson not found' });
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
    const modules = await getCourseCurriculum('course-1');
    res.json({ modules: modules?.modules || [] });
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
    res.json({ progress, message: 'Lesson marked as complete' });
  } catch (_error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
