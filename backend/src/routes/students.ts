import { Router, Request, Response } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { normalizeSorobanDid, DidValidationError, validateStudentDidCompatibility } from '../auth/auth.service.js';

import { invalidateUserCache } from '../cache/CacheInvalidation.js';
import { cacheMiddleware } from '../cache/CacheMiddleware.js';
import { CACHE_KEYS } from '../cache/CacheService.js';
import { cacheTTL } from '../config/redis.config.js';
import prisma from '../db/index.js';
import logger from '../utils/logger.js';
import { auditAction } from '../middleware/audit.js';
import { broadcastEvent } from '../websocket/gateway.js';
import { linkDidToCertificates } from './certificates.js';
import {
  CreateStudentSchema,
  UpdateStudentSchema,
  StudentIdParamSchema,
  type CreateStudentBody,
  type UpdateStudentBody,
  type StudentIdParam,
} from '../types/student.types.js';

// ---------------------------------------------------------------------------
// Typed request helpers
// ---------------------------------------------------------------------------

type CreateStudentRequest = Request<Record<string, never>, unknown, CreateStudentBody>;
type UpdateStudentRequest = Request<StudentIdParam, unknown, UpdateStudentBody>;
type StudentByIdRequest = Request<StudentIdParam>;

// ---------------------------------------------------------------------------
// Validation helper — parses a Zod schema and returns an error response on
// failure, so route handlers stay clean.
// ---------------------------------------------------------------------------

function parseBody<T>(
  schema: z.ZodType<T>,
  body: unknown,
  res: Response
): T | null {
  const result = schema.safeParse(body);
  if (!result.success) {
    const errors = result.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    res.status(400).json({ error: 'Validation failed', errors });
    return null;
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const router: ReturnType<typeof Router> = Router();

// GET /api/students — list all students
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const students = await prisma.student.findMany({
      include: {
        enrollments: true,
        certificates: true,
      },
    });
    res.json(students);
  } catch (error) {
    logger.error('Failed to fetch students', { error });
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

// GET /api/students/:id — get student by ID
router.get(
  '/:id',
  cacheMiddleware({
    ttl: cacheTTL.user.profile,
    keyGenerator: (req) => CACHE_KEYS.user.profile(typeof req.params.id === 'string' ? req.params.id : 'unknown'),
  }),
  async (req: StudentByIdRequest, res: Response): Promise<void> => {
    try {
      const paramResult = StudentIdParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        res.status(400).json({ error: 'Invalid student ID' });
        return;
      }
      const { id } = paramResult.data;

      const student = await prisma.student.findUnique({
        where: { id },
        include: {
          enrollments: { include: { course: true } },
          certificates: { include: { course: true } },
        },
      });

      if (!student) {
        res.status(404).json({ error: 'Student not found' });
        return;
      }

      res.json(student);
    } catch (error) {
      logger.error('Failed to fetch student', {
        error,
        studentId: req.params['id'],
      });
      res.status(500).json({ error: 'Failed to fetch student' });
    }
  }
);

// POST /api/students — create a new student
router.post(
  '/',
  auditAction('CREATE_STUDENT', 'Student'),
  async (req: CreateStudentRequest, res: Response): Promise<void> => {
    try {
      const body = parseBody(CreateStudentSchema, req.body, res);
      if (!body) return;

      const { email, firstName, lastName, did } = body;
      const normalizedDid = validateStudentDidCompatibility({
        did,
        expectedNetwork: process.env.STELLAR_NETWORK || 'testnet',

      });

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
      if (error instanceof DidValidationError) {
        logger.warn('Rejected student creation due to DID validation failure', {
          route: '/api/v1/students',
          email: req.body?.email,
          reason: error.message,
        });
        res.status(400).json({ error: error.message });
        return;
      }

      console.error("CREATE STUDENT ERROR:", error);
      res.status(500).json({ error: 'Failed to create student' });
    }
  }
);

// PUT /api/students/:id — update a student
router.put(
  '/:id',
  auditAction('UPDATE_STUDENT', 'Student'),
  auditAction('UPDATE_ONBOARDING', 'Student'),
  async (req: UpdateStudentRequest, res: Response): Promise<void> => {
    try {
      const paramResult = StudentIdParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        res.status(400).json({ error: 'Invalid student ID' });
        return;
      }
      const { id } = paramResult.data;

      const body = parseBody(UpdateStudentSchema, req.body, res);
      if (!body) return;

      const { email, firstName, lastName, did } = body;
      const existingStudent = await prisma.student.findUnique({
        where: { id },
        select: { walletAddress: true },
      });

      const normalizedDid = validateStudentDidCompatibility({
        did,
        walletAddress: existingStudent?.walletAddress ?? null,
        expectedNetwork: process.env.STELLAR_NETWORK || 'testnet',
      });

      const updateData: Prisma.StudentUpdateInput = {
        ...(email !== undefined ? { email } : {}),
        ...(firstName !== undefined ? { firstName } : {}),
        ...(lastName !== undefined ? { lastName } : {}),
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
      if (
        error instanceof Error &&
        error.message.startsWith('Invalid DID format')
      ) {
        res.status(400).json({ error: error.message });
        return;
      }

      logger.error('Failed to update student', {
        error,
        studentId: req.params['id'],
      });
      res.status(500).json({ error: 'Failed to update student' });
    }
  }
);

// DELETE /api/students/:id — delete a student
router.delete(
  '/:id',
  auditAction('DELETE_STUDENT', 'Student'),
  async (req: StudentByIdRequest, res: Response): Promise<void> => {
    try {
      const paramResult = StudentIdParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        res.status(400).json({ error: 'Invalid student ID' });
        return;
      }
      const { id } = paramResult.data;


      await prisma.student.delete({ where: { id } });
      await invalidateUserCache(id);
      res.status(204).send();
    } catch (error) {
      logger.error('Failed to delete student', {
        error,
        studentId: req.params['id'],
      });
      res.status(500).json({ error: 'Failed to delete student' });
    }
  }
);

export default router;