import { Router, Request, Response } from 'express';
import { authenticateToken } from '../../middleware/auth.js';
import { requireAdmin } from '../../middleware/admin.js';
import { validate } from '../../middleware/validation.js';
import { auditAction } from '../../middleware/audit.js';
import { invalidateAllCourses, invalidateCourseCache } from '../../cache/CacheInvalidation.js';
import { createNotification } from '../../notifications/index.js';
import prisma from '../../db/index.js';
import logger from '../../utils/logger.js';
import { ApiResponse } from '../../utils/response.js';
import { getQueryString } from '../../utils/queryParams.js';
import {
  CreateCourseSchema,
  UpdateCourseSchema,
} from './courses.validation.schemas.js';

const router: ReturnType<typeof Router> = Router();

// Protect all admin course routes with token authentication and admin role requirement
router.use(authenticateToken as any);
router.use(requireAdmin as any);

/**
 * @openapi
 * /api/v1/admin/courses:
 *   get:
 *     summary: List all courses with admin metrics
 *     tags: [Admin Courses]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of courses with enrollment and completion statistics
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const courses = await prisma.course.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            enrollments: true,
            certificates: true,
            feedback: true,
          },
        },
      },
    });

    res.json({
      status: 'success',
      data: {
        courses: courses.map((course) => ({
          ...course,
          createdAt: course.createdAt.toISOString(),
          updatedAt: course.updatedAt.toISOString(),
        })),
        count: courses.length,
      },
    });
  } catch (error) {
    logger.error('Failed to fetch courses for admin', { error });
    res.status(500).json(ApiResponse.error('Failed to fetch courses'));
  }
});

/**
 * @openapi
 * /api/v1/admin/courses/{id}:
 *   get:
 *     summary: Get course detail by ID for admin
 *     tags: [Admin Courses]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Course details with statistics
 *       404:
 *         description: Course not found
 */
router.get('/:id', async (req: Request, res: Response) => {
  const id = getQueryString(req.params.id);
  if (!id) {
    return res.status(400).json(ApiResponse.error('Course ID is required'));
  }
  try {
    const course = await prisma.course.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            enrollments: true,
            certificates: true,
            feedback: true,
            learningProgress: true,
          },
        },
      },
    });

    if (!course) {
      return res.status(404).json(ApiResponse.error('Course not found'));
    }

    res.json({
      status: 'success',
      data: {
        course: {
          ...course,
          createdAt: course.createdAt.toISOString(),
          updatedAt: course.updatedAt.toISOString(),
        },
      },
    });
  } catch (error) {
    logger.error(`Failed to fetch course ${id} for admin`, { error });
    res.status(500).json(ApiResponse.error('Failed to fetch course details'));
  }
});

/**
 * @openapi
 * /api/v1/admin/courses:
 *   post:
 *     summary: Create a new course
 *     tags: [Admin Courses]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, instructor]
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               instructor:
 *                 type: string
 *               credits:
 *                 type: integer
 *                 default: 3
 *     responses:
 *       201:
 *         description: Course created successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       503:
 *         description: Database unavailable
 */
router.post(
  '/',
  validate(CreateCourseSchema),
  auditAction('CREATE_COURSE', 'Course'),
  async (req: Request, res: Response) => {
    try {
      const { title, description, instructor, credits, workspaceId } = req.body;

      const createdCourse = await prisma.course.create({
        data: {
          title,
          description: description || '',
          instructor,
          credits: credits ?? 3,
          ...(workspaceId ? { workspaceId } : {}),
        },
      });

      await invalidateAllCourses();

      // Notify students about the new course
      try {
        await createNotification({
          type: 'course_created',
          courseId: createdCourse.id,
          courseTitle: createdCourse.title,
          title: 'New Course Available',
          message: `"${createdCourse.title}" has been added — enroll now to start learning.`,
          metadata: { instructor: createdCourse.instructor, credits: createdCourse.credits },
        });
      } catch (notifyErr) {
        logger.warn('Failed to send notification for new course', { error: notifyErr });
      }

      res.status(201).json({
        status: 'success',
        data: {
          course: {
            ...createdCourse,
            createdAt: createdCourse.createdAt.toISOString(),
            updatedAt: createdCourse.updatedAt.toISOString(),
          },
        },
      });
    } catch (error) {
      logger.error('Failed to create course via admin route', { error });
      res.status(503).json(
        ApiResponse.error('Course could not be created: the database is temporarily unavailable')
      );
    }
  }
);

/**
 * @openapi
 * /api/v1/admin/courses/{id}:
 *   put:
 *     summary: Update an existing course
 *     tags: [Admin Courses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Course updated successfully
 *       404:
 *         description: Course not found
 */
router.put(
  '/:id',
  validate(UpdateCourseSchema),
  auditAction('UPDATE_COURSE', 'Course'),
  async (req: Request, res: Response) => {
    const id = getQueryString(req.params.id);
    if (!id) {
      return res.status(400).json(ApiResponse.error('Course ID is required'));
    }
    try {
      const { title, description, instructor, credits } = req.body;

      const existing = await prisma.course.findUnique({ where: { id } });
      if (!existing) {
        return res.status(404).json(ApiResponse.error('Course not found'));
      }

      const updateData: {
        title?: string;
        description?: string;
        instructor?: string;
        credits?: number;
      } = {};

      if (typeof title === 'string') updateData.title = title;
      if (typeof description === 'string') updateData.description = description;
      if (typeof instructor === 'string') updateData.instructor = instructor;
      if (typeof credits === 'number') updateData.credits = credits;

      const updated = await prisma.course.update({
        where: { id },
        data: updateData,
      });

      await invalidateCourseCache(id);

      if (title && existing.title !== updated.title) {
        try {
          await createNotification({
            type: 'course_updated',
            courseId: id,
            courseTitle: updated.title,
            title: 'Course Updated',
            message: `"${updated.title}" has been updated with new content. Check it out!`,
            metadata: {
              oldTitle: existing.title,
              changes: { title: true, description: description !== undefined },
            },
          });
        } catch (notifyErr) {
          logger.warn('Failed to send update notification', { error: notifyErr });
        }
      }

      res.json({
        status: 'success',
        data: {
          course: {
            ...updated,
            createdAt: updated.createdAt.toISOString(),
            updatedAt: updated.updatedAt.toISOString(),
          },
        },
      });
    } catch (error) {
      logger.error(`Failed to update course ${id} via admin route`, { error });
      res.status(503).json(
        ApiResponse.error('Course could not be updated: the database is temporarily unavailable')
      );
    }
  }
);

/**
 * @openapi
 * /api/v1/admin/courses/{id}:
 *   delete:
 *     summary: Delete a course
 *     tags: [Admin Courses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Course deleted successfully
 *       404:
 *         description: Course not found
 */
router.delete(
  '/:id',
  auditAction('DELETE_COURSE', 'Course'),
  async (req: Request, res: Response) => {
    const id = getQueryString(req.params.id);
    if (!id) {
      return res.status(400).json(ApiResponse.error('Course ID is required'));
    }
    try {
      const existing = await prisma.course.findUnique({ where: { id } });
      if (!existing) {
        return res.status(404).json(ApiResponse.error('Course not found'));
      }

      await prisma.course.delete({ where: { id } });
      await invalidateCourseCache(id);

      res.status(204).send();
    } catch (error) {
      logger.error(`Failed to delete course ${id} via admin route`, { error });
      res.status(503).json(
        ApiResponse.error('Course could not be deleted: the database is temporarily unavailable')
      );
    }
  }
);

export default router;
