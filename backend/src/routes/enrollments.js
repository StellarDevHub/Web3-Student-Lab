import { Router } from 'express';
import prisma from '../db/index.js';
const router = Router();
// GET /api/enrollments - Get all enrollments
router.get('/', async (req, res) => {
  try {
    const enrollments = await prisma.enrollment.findMany({
      include: {
        student: true,
        course: true,
      },
    });
    res.json(enrollments);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch enrollments' });
  }
});
// GET /api/enrollments/:id - Get enrollment by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const enrollment = await prisma.enrollment.findUnique({
      where: { id },
      include: {
        student: true,
        course: true,
      },
    });
    if (!enrollment) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }
    res.json(enrollment);
  } catch (error) {
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
    // Verify student and course exist
    const [student, course] = await Promise.all([
      prisma.student.findUnique({ where: { id: studentId } }),
      prisma.course.findUnique({ where: { id: courseId } }),
    ]);
    if (!student || !course) {
      return res.status(404).json({ error: 'Student or course not found' });
    }
    const enrollment = await prisma.enrollment.create({
      data: {
        studentId,
        courseId,
      },
      include: {
        student: true,
        course: true,
      },
    });
    res.status(201).json(enrollment);
  } catch (error) {
    res.status(500).json({ error: 'Failed to enroll student' });
  }
});
// PUT /api/enrollments/:id - Update enrollment status
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const enrollment = await prisma.enrollment.update({
      where: { id },
      data: { status },
      include: {
        student: true,
        course: true,
      },
    });
    res.json(enrollment);
  } catch (error) {
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
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to unenroll student' });
  }
});
export default router;
//# sourceMappingURL=enrollments.js.map
