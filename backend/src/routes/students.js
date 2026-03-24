import { Router } from 'express';
import prisma from '../db/index.js';
const router = Router();
// GET /api/students - Get all students
router.get('/', async (req, res) => {
  try {
    const students = await prisma.student.findMany({
      include: {
        enrollments: true,
        certificates: true,
      },
    });
    res.json(students);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});
// GET /api/students/:id - Get student by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const student = await prisma.student.findUnique({
      where: { id },
      include: {
        enrollments: {
          include: {
            course: true,
          },
        },
        certificates: {
          include: {
            course: true,
          },
        },
      },
    });
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }
    res.json(student);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch student' });
  }
});
// POST /api/students - Create a new student
router.post('/', async (req, res) => {
  try {
    const { email, firstName, lastName } = req.body;
    if (!email || !firstName || !lastName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const student = await prisma.student.create({
      data: {
        email,
        firstName,
        lastName,
      },
    });
    res.status(201).json(student);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create student' });
  }
});
// PUT /api/students/:id - Update a student
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { email, firstName, lastName } = req.body;
    const student = await prisma.student.update({
      where: { id },
      data: {
        email,
        firstName,
        lastName,
      },
    });
    res.json(student);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update student' });
  }
});
// DELETE /api/students/:id - Delete a student
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.student.delete({
      where: { id },
    });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete student' });
  }
});
export default router;
//# sourceMappingURL=students.js.map
