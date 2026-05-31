import { Router } from 'express';
import { normalizeSorobanDid } from '../auth/auth.service.js';
import { cacheMiddleware } from '../cache/CacheMiddleware.js';
import { invalidateUserCache } from '../cache/CacheInvalidation.js';
import { CACHE_KEYS } from '../cache/CacheService.js';
import { cacheTTL } from '../config/redis.config.js';
import prisma from '../db/index.js';
import { broadcastEvent } from '../websocket/gateway.js';
import { linkDidToCertificates } from './certificates.js';
import { auditAction } from '../middleware/audit.js';

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
  } catch {
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

// GET /api/students/:id - Get student by ID
router.get(
  '/:id',
  cacheMiddleware({
    ttl: cacheTTL.user.profile,
    keyGenerator: (req) => CACHE_KEYS.user.profile(req.params.id as string),
  }),
  async (req, res) => {
    try {
      const { id } = req.params;
      const student = await prisma.student.findUnique({
        where: { id: id as string },
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
    } catch {
      res.status(500).json({ error: 'Failed to fetch student' });
    }
  }
);

// POST /api/students - Create a new student
router.post('/', auditAction('CREATE_STUDENT', 'Student'), async (req, res) => {
  try {
    const { email, firstName, lastName, did } = req.body;

    if (!email || !firstName || !lastName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const normalizedDid = normalizeSorobanDid(did);

    const student = await prisma.student.create({
      data: {
        email,
        firstName,
        lastName,
        did: normalizedDid ?? null,
        password: 'placeholder_password', // TODO: Implement proper password hashing
      },
    });

    // Broadcast event
    await broadcastEvent('dashboard_updated', {
      type: 'STUDENT_CREATED',
      studentId: student.id,
      timestamp: new Date().toISOString(),
    });

    res.status(201).json(student);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Invalid DID format')) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.status(500).json({ error: 'Failed to create student' });
  }
});

// PUT /api/students/:id - Update a student
router.put('/:id', auditAction('UPDATE_STUDENT', 'Student'), async (req, res) => {
  try {
    const { id } = req.params;
    const { email, firstName, lastName, did } = req.body;
    const normalizedDid = normalizeSorobanDid(did);

    const updateData: Record<string, unknown> = {
      email,
      firstName,
      lastName,
    };

    if (normalizedDid !== undefined) {
      updateData.did = normalizedDid;
    }

    const student = await prisma.student.update({
      where: { id },
      data: updateData,
    });

    if (normalizedDid !== undefined) {
      await prisma.certificate.updateMany({
        where: { studentId: id },
        data: { did: student.did ?? null },
      });
      linkDidToCertificates(id, student.did ?? null);
    }

    await invalidateUserCache(id);
    res.json(student);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Invalid DID format')) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.status(500).json({ error: 'Failed to update student' });
  }
});

// DELETE /api/students/:id - Delete a student
router.delete('/:id', auditAction('DELETE_STUDENT', 'Student'), async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.student.delete({
      where: { id },
    });

    await invalidateUserCache(id);
    res.status(204).send();
  } catch {
    res.status(500).json({ error: 'Failed to delete student' });
  }
});

export default router;
