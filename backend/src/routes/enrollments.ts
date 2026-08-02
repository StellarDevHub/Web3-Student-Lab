import { Router } from 'express';
import prisma from '../db/index.js';

const router = Router();

interface Enrollment {
  id: string;
  studentId: string;
  courseId: string;
  status: string;
  enrolledAt: string;
}

// Robust Mock Database for 100% Demo Uptime
let enrollments: Enrollment[] = [];

// GET /api/enrollments - Get all enrollments
router.get('/', async (req, res) => {
  try {
    const persisted = await prisma.enrollment.findMany({
      include: {
        course: true,
      },
      orderBy: {
        enrolledAt: 'desc',
      },
    });

    if (persisted.length > 0) {
      res.json(persisted);
      return;
    }

    res.json(enrollments);
  } catch {
    res.status(500).json({ error: 'Failed to fetch enrollments' });
  }
});

// GET /api/enrollments/student/:studentId - Get enrollments by student ID
router.get('/student/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const persisted = await prisma.enrollment.findMany({
      where: { studentId },
      include: {
        course: true,
      },
      orderBy: {
        enrolledAt: 'desc',
      },
    });

    if (persisted.length > 0) {
      res.json(persisted);
      return;
    }

    res.json(enrollments.filter((enrollment) => enrollment.studentId === studentId));
  } catch {
    res.status(500).json({ error: 'Failed to fetch student enrollments' });
  }
});

// GET /api/enrollments/:id - Get enrollment by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const persisted = await prisma.enrollment.findUnique({
      where: { id },
      include: {
        course: true,
      },
    });

    if (persisted) {
      res.json(persisted);
      return;
    }

    const enrollment = enrollments.find((e) => e.id === id);

    if (!enrollment) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    res.json(enrollment);
  } catch {
    res.status(500).json({ error: 'Failed to fetch enrollment' });
  }
});

// POST /api/enrollments - Enroll a student in a course
router.post('/', async (req, res) => {
  try {
    const { studentId, courseId } = req.body;

    if (!studentId || !courseId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Auto-create an enrollment if it doesn't already exist
    const persistedExisting = await prisma.enrollment.findUnique({
      where: {
        studentId_courseId: {
          studentId,
          courseId,
        },
      },
      include: {
        course: true,
      },
    });
    if (persistedExisting) {
      return res.status(200).json(persistedExisting);
    }

    const existing = enrollments.find((e) => e.studentId === studentId && e.courseId === courseId);
    if (existing) {
      return res.status(200).json(existing);
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId },
    });
    const course = await prisma.course.findUnique({
      where: { id: courseId },
    });

    if (!student || !course) {
      return res.status(404).json({ error: 'Student or course not found' });
    }

    const newEnrollment = {
      id: `enr-${Date.now()}`,
      studentId,
      courseId,
      status: 'active',
      enrolledAt: new Date().toISOString(),
    };

    const persistedEnrollment = await prisma.enrollment.create({
      data: {
        studentId,
        courseId,
        status: 'active',
      },
      include: {
        course: true,
      },
    });

    enrollments.push(newEnrollment);
    res.status(201).json(persistedEnrollment);
  } catch {
    res.status(500).json({ error: 'Failed to enroll student' });
  }
});

// PUT /api/enrollments/:id - Update enrollment status
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const persisted = await prisma.enrollment.update({
      where: { id },
      data: { status },
      include: {
        course: true,
      },
    });

    const index = enrollments.findIndex((e) => e.id === id);
    if (index !== -1) {
      const current = enrollments[index]!;
      enrollments[index] = { ...current, status };
    }

    res.json(persisted);
  } catch {
    res.status(500).json({ error: 'Failed to update enrollment' });
  }
});

// DELETE /api/enrollments/:id - Unenroll a student from a course
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.enrollment.delete({
      where: { id },
    });
    enrollments = enrollments.filter((e) => e.id !== id);
    res.status(204).send();
  } catch {
    res.status(500).json({ error: 'Failed to unenroll student' });
  }
});

export default router;
