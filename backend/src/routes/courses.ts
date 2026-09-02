import { Router } from 'express';

import { cacheMiddleware } from '../cache/CacheMiddleware.js';
import { invalidateAllCourses, invalidateCourseCache } from '../cache/CacheInvalidation.js';
import { cacheTTL } from '../config/redis.config.js';
import prisma from '../db/index.js';
import { auditAction } from '../middleware/audit.js';
import { createNotification } from '../notifications/index.js';
import { getQueryString } from '../utils/queryParams.js';
import logger from '../utils/logger.js';



const router: ReturnType<typeof Router> = Router();

type CourseView = {
  id: string;
  title: string;
  description: string;
  instructor: string;
  credits: number;
  createdAt: string;
  updatedAt: string;
};

interface MockCourse {
  id: string;
  title: string;
  description: string | null;
  instructor: string;
  credits: number;
  createdAt: string;
  updatedAt: string;
}

// Robust Mock Database for 100% Demo Uptime
let courses: CourseView[] = [


  {
    id: 'cm1yxxxx-intro',
    title: 'Introduction to Web3 and Stellar',
    description:
      'Learn the foundational concepts of blockchain technology, decentralized networks, and how the Stellar consensus protocol enables fast, low-cost cross-border payments.',
    instructor: 'Satoshi N.',
    credits: 3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'cm1yxxxx-soroban',
    title: 'Soroban Smart Contracts 101',
    description:
      'A deep dive into writing secure smart contracts on the Stellar network using Rust and the Soroban SDK. Execute state changes and build immutable modules.',
    instructor: 'Vitalik B.',
    credits: 5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'cm1yxxxx-defi',
    title: 'Decentralized Finance (DeFi) primitives',
    description:
      'Master the core primitives of DeFi including Liquidity Pools, Automated Market Makers (AMMs), and yield generation directly on-chain.',
    instructor: 'Hayden A.',
    credits: 4,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

function toCourseView(course: {
  id: string;
  title: string;
  description: string | null;
  instructor: string;
  credits: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}): CourseView {
  return {
    id: course.id,
    title: course.title,
    description: course.description ?? '',
    instructor: course.instructor,
    credits: course.credits,
    createdAt:
      typeof course.createdAt === 'string' ? course.createdAt : course.createdAt.toISOString(),
    updatedAt:
      typeof course.updatedAt === 'string' ? course.updatedAt : course.updatedAt.toISOString(),
  };
}

async function ensureSeedCourses() {
  try {
    const count = await prisma.course.count();
    if (count > 0) {
      const persistedCourses = await prisma.course.findMany({
        orderBy: {
          createdAt: 'asc',
        },
      });
      courses = persistedCourses.map(toCourseView);
      return courses;
    }

    for (const course of courses) {
      await prisma.course.create({
        data: {
          id: course.id,
          title: course.title,
          description: course.description,
          instructor: course.instructor,
          credits: course.credits,
        },
      });
    }
  } catch (error) {
    logger.error('Failed to seed courses', { error });
  }
}

/**
 * Loads the live course catalog from the database. Throws on any
 * database failure — callers are responsible for deciding how to
 * degrade (#911: never silently substitute mock data for a real
 * outage without telling the caller).
 */
async function loadLiveCourses() {
  await ensureSeedCourses();
  const persisted = await prisma.course.findMany({ orderBy: { createdAt: 'asc' } });
  return persisted.map((course) => ({
    ...course,
    createdAt: course.createdAt.toISOString(),
    updatedAt: course.updatedAt.toISOString(),
  }));
}

// GET /api/courses - Get all courses
router.get('/', cacheMiddleware({ ttl: cacheTTL.courses.list }), async (_req, res) => {
  try {
    const courses = await loadLiveCourses();
    res.json({ courses, dataSource: 'live' });
  } catch (error) {
    logger.error('Database unavailable in GET /courses, serving demo data', { error });
    res.status(200).json({
      courses,
      dataSource: 'demo',
      message: 'Live course data is temporarily unavailable. Showing demo data.',
    });

  }
});

// GET /api/courses/:id - Get course by ID
router.get(
  '/:id',
  cacheMiddleware({
    ttl: cacheTTL.courses.detail,
    keyGenerator: (req) => `course:${getQueryString(req.params.id)}`,

  }),
  async (req, res) => {
    const id = typeof req.params.id === 'string' ? req.params.id : undefined;
    if (!id) {
      return res.status(400).json({ error: 'Course id is required' });
    }
    try {
      const id = getQueryString(req.params.id);
      const availableCourses = await ensureSeedCourses();
      if (!availableCourses) {
        return res.status(404).json({ error: 'Course not found', dataSource: 'live' });
      }
      const course = availableCourses.find((c) => c.id === id);
      if (!course) {
        return res.status(404).json({ error: 'Course not found' });
      }

      res.json({ course, dataSource: 'live' });
    } catch (error) {
      logger.error(`Database unavailable in GET /courses/${id}, checking demo data`, { error });
      const demoCourse = courses.find((c) => c.id === id);
      if (!demoCourse) {
        return res.status(404).json({ error: 'Course not found', dataSource: 'demo' });
      }
      res.status(200).json({
        course: demoCourse,
        dataSource: 'demo',
        message: 'Live course data is temporarily unavailable. Showing demo data.',
      });
    }
  }
);

// POST /api/courses - Create a new course
// Write operations only ever succeed against the live database — a
// database failure here must be reported explicitly (503), never
// silently accepted as if the course was actually persisted.
router.post('/', auditAction('CREATE_COURSE', 'Course'), async (req, res) => {
  try {
    const { title, description, instructor, credits } = req.body;

    if (!title || !instructor) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const newCourse: CourseView = {
      id: `course-${Date.now()}`,
      title,
      description: description ?? '',
      instructor,
      credits: credits || 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const createdCourse = await prisma.course.create({
      data: {
        id: newCourse.id,
        title: newCourse.title,
        description: newCourse.description,
        instructor: newCourse.instructor,
        credits: newCourse.credits,
      },
    });

    courses.push(toCourseView(createdCourse));

    await invalidateAllCourses();

    // Notify students about the new course
    await createNotification({
      type: 'course_created',
      courseId: newCourse.id,
      courseTitle: newCourse.title,
      title: 'New Course Available',
      message: `"${newCourse.title}" has been added — enroll now to start learning.`,
      metadata: { instructor: newCourse.instructor, credits: newCourse.credits },
    });

    res.status(201).json({
      ...createdCourse,
      createdAt: createdCourse.createdAt.toISOString(),
      updatedAt: createdCourse.updatedAt.toISOString(),
    });
  } catch (error) {
    logger.error('Failed to create course (database unavailable)', { error });
    res.status(503).json({
      error: 'Course could not be created: the database is temporarily unavailable',
    });
  }
});

// PUT /api/courses/:id - Update a course
router.put('/:id', auditAction('UPDATE_COURSE', 'Course'), async (req, res) => {
  const id = typeof req.params.id === 'string' ? req.params.id : undefined;
  if (!id) {
    return res.status(400).json({ error: 'Course id is required' });
  }
  try {
    const id = getQueryString(req.params.id);

    const { title, description, instructor, credits } = req.body;

    const existing = await prisma.course.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const updated = await prisma.course.update({
      where: { id },
      data: { title, description, instructor, credits },

    });

    await invalidateCourseCache(courseId);

    // Notify enrolled students about the update
    if (existing.title !== updated.title || description) {
      await createNotification({
        type: 'course_updated',
        courseId: id,
        courseTitle: updated.title,

        title: 'Course Updated',
        message: `"${updated.title}" has been updated with new content. Check it out!`,
        metadata: {
          oldTitle: existing.title,
          changes: { title: title !== existing.title, description: !!description },
        },
      });
    }

    res.json({
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error) {
    logger.error(`Failed to update course ${id} (database unavailable)`, { error });
    res.status(503).json({
      error: 'Course could not be updated: the database is temporarily unavailable',
    });
  }
});

// DELETE /api/courses/:id - Delete a course
router.delete('/:id', auditAction('DELETE_COURSE', 'Course'), async (req, res) => {
  const id = typeof req.params.id === 'string' ? req.params.id : undefined;
  if (!id) {
    return res.status(400).json({ error: 'Course id is required' });
  }
  try {
    const id = getQueryString(req.params.id);


    courses = courses.filter((c) => c.id !== courseId);
    await prisma.course.delete({
      where: { id: courseId },
    });



    await invalidateCourseCache(id);
    res.status(204).send();
  } catch (error) {
    logger.error(`Failed to delete course ${id} (database unavailable)`, { error });
    res.status(503).json({
      error: 'Course could not be deleted: the database is temporarily unavailable',
    });
  }
});

export default router;
