import { Prisma } from '@prisma/client';
import { Request, Response, Router } from 'express';
import { authenticate } from '../auth/auth.middleware.js';
import { normalizeSorobanDid } from '../auth/auth.service.js';
import prisma from '../db/index.js';
import { markUserWriteToPrimary } from '../db/requestContext.js';
import { linkDidToCertificates } from '../routes/certificates.js';

const router = Router();

/**
 * @route   GET /api/user/profile
 * @desc    Get current authenticated user profile
 * @access  Private
 */
router.get('/profile', authenticate, async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const student = await prisma.student.findUnique({
      where: { id: req.user.id },
    });

    if (!student) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      id: student.id,
      email: student.email,
      firstName: student.firstName,
      lastName: student.lastName,
      name: `${student.firstName} ${student.lastName}`,
      did: student.did ?? null,
      role: 'student',
      createdAt: student.createdAt.toISOString(),
      updatedAt: student.updatedAt.toISOString(),
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

/**
 * @route   PUT /api/user/profile
 * @desc    Update the current authenticated user profile, including the linked Soroban DID
 * @access  Private
 */
router.put('/profile', authenticate, async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { email, firstName, lastName, did } = req.body as {
      email?: string;
      firstName?: string;
      lastName?: string;
      did?: string | null;
    };

    const normalizedDid = normalizeSorobanDid(did);
    const updateData: {
      email?: string;
      firstName?: string;
      lastName?: string;
      did?: string | null;
    } = {};

    if (typeof email === 'string' && email.trim()) {
      updateData.email = email.trim().toLowerCase();
    }
    if (typeof firstName === 'string' && firstName.trim()) {
      updateData.firstName = firstName.trim();
    }
    if (typeof lastName === 'string' && lastName.trim()) {
      updateData.lastName = lastName.trim();
    }
    if (normalizedDid !== undefined) {
      updateData.did = normalizedDid;
    }

    if (Object.keys(updateData).length === 0) {
      res.status(400).json({ error: 'At least one profile field must be provided' });
      return;
    }

    const student = await prisma.student.update({
      where: { id: req.user.id },
      data: updateData,
    });

    if (normalizedDid !== undefined) {
      await prisma.certificate.updateMany({
        where: { studentId: req.user.id },
        data: { did: student.did ?? null },
      });
      linkDidToCertificates(req.user.id, student.did ?? null);
    }

    markUserWriteToPrimary(req.user.id);

    res.json({
      id: student.id,
      email: student.email,
      firstName: student.firstName,
      lastName: student.lastName,
      name: `${student.firstName} ${student.lastName}`,
      did: student.did ?? null,
      role: 'student',
      updatedAt: student.updatedAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Invalid DID format')) {
      res.status(400).json({ error: error.message });
      return;
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      res.status(409).json({ error: 'Email or DID already in use' });
      return;
    }

    res.status(500).json({ error: 'Failed to update user profile' });
  }
});

export default router;
