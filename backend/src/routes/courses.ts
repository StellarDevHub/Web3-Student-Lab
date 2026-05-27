import { Router } from 'express';
import { cacheMiddleware } from '../cache/CacheMiddleware.js';
import { invalidateAllCourses, invalidateCourseCache } from '../cache/CacheInvalidation.js';
import { cacheTTL } from '../config/redis.config.js';
import prisma from '../db/index.js';
import { auditAction } from '../middleware/audit.js';

const router = Router();

// Robust Mock Database for 100% Demo Uptime
let courses = [
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

async function ensureSeedCourses() {
  try {
    const count = await prisma.course.count();
    if (count > 0) {
      const persistedCourses = await prisma.course.findMany({
        orderBy: {
          createdAt: 'asc',
        },
      });
      courses = persistedCourses.map((course) => ({
        ...course,
        createdAt: course.createdAt.toISOString(),
        updatedAt: course.updatedAt.toISOString(),
      }));
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

    return courses;
  } catch {
    return courses;
  }
}

// GET /api/courses - Get all courses
router.get('/', cacheMiddleware({ ttl: cacheTTL.courses.list }), async (req, res) => {
  try {
    res.json(await ensureSeedCourses());
  } catch {
    res.status(500).json({ error: 'Failed to fetch courses' });
  }
});

// GET /api/courses/:id - Get course by ID
router.get(
  '/:id',
  cacheMiddleware({
    ttl: cacheTTL.courses.detail,
    keyGenerator: (req) => `course:${req.params.id}`,
  }),
  async (req, res) => {
    try {
      const { id } = req.params;
      const availableCourses = await ensureSeedCourses();
      const course = availableCourses.find((c) => c.id === id);

      if (!course) {
        return res.status(404).json({ error: 'Course not found' });
      }

      res.json(course);
    } catch {
      res.status(500).json({ error: 'Failed to fetch course' });
    }
  }
);

// POST /api/courses - Create a new course
router.post('/', auditAction('CREATE_COURSE', 'Course'), async (req, res) => {
  try {
    const { title, description, instructor, credits } = req.body;

    if (!title || !instructor) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const newCourse = {
      id: `course-${Date.now()}`,
      title,
      description,
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

    courses.push({
      ...createdCourse,
      createdAt: createdCourse.createdAt.toISOString(),
      updatedAt: createdCourse.updatedAt.toISOString(),
    });
    await invalidateAllCourses();

    res.status(201).json(newCourse);
  } catch {
    res.status(500).json({ error: 'Failed to create course' });
  }
});

// PUT /api/courses/:id - Update a course
router.put('/:id', auditAction('UPDATE_COURSE', 'Course'), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, instructor, credits } = req.body;

    await ensureSeedCourses();
    const index = courses.findIndex((c) => c.id === id);

    if (index === -1) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const targetCourse = courses[index];

    if (targetCourse) {
      Object.assign(targetCourse, {
        title,
        description,
        instructor,
        credits,
        updatedAt: new Date().toISOString(),
      });
    }

    await prisma.course.update({
      where: { id },
      data: {
        title,
        description,
        instructor,
        credits,
      },
    });

    await invalidateCourseCache(id);

    res.json(targetCourse);
  } catch {
    res.status(500).json({ error: 'Failed to update course' });
  }
});

// DELETE /api/courses/:id - Delete a course
router.delete('/:id', auditAction('DELETE_COURSE', 'Course'), async (req, res) => {
  try {
    const { id } = req.params;

    courses = courses.filter((c) => c.id !== id);
    await prisma.course.delete({
      where: { id },
    });

    await invalidateCourseCache(id);

    res.status(204).send();
  } catch {
    res.status(500).json({ error: 'Failed to delete course' });
  }
});

export default router;
