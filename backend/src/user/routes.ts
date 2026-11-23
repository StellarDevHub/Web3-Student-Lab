import { Prisma } from '@prisma/client';
import { Request, Response, Router } from 'express';
import { authenticate } from '../auth/auth.middleware.js';
import { DidValidationError, validateStudentDidCompatibility } from '../auth/auth.service.js';
import prisma from '../db/index.js';
import { markUserWriteToPrimary } from '../db/requestContext.js';
import { linkDidToCertificates } from '../routes/certificates.js';
import logger from '../utils/logger.js';

const router: ReturnType<typeof Router> = Router();

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

    const existingStudent = await prisma.student.findUnique({
      where: { id: req.user.id },
      select: { walletAddress: true },
    });

    const normalizedDid = validateStudentDidCompatibility({
      did,
      walletAddress: existingStudent?.walletAddress ?? null,
      expectedNetwork: process.env.STELLAR_NETWORK || 'testnet',
    });
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
    if (error instanceof DidValidationError) {
      logger.warn('Rejected DID update on user profile', {
        route: '/api/v1/user/profile',
        userId: req.user?.id,
        reason: error.message,
      });
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

import { anonymizationService } from '../services/anonymizationService.js';

/**
 * @route   DELETE /api/user/me
 * @desc    GDPR Account Deletion & Cryptographic Anonymization Pipeline (Issue #1115)
 * @access  Private
 */
router.delete(['/me', '/delete'], authenticate, async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const receipt = await anonymizationService.deleteAndAnonymizeStudent(req.user.id);
    res.status(200).json(receipt);
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Failed to process GDPR account deletion' });
  }
});

/**
 * @route   GET /api/user/onboarding
 * @desc    Get user onboarding state (mocked)
 * @access  Private
 */
router.get('/onboarding', authenticate, async (req: Request, res: Response) => {
  // Mock response for now, replace with actual DB query if schema is updated
  res.json({
    hasCompletedWalletCreation: false,
    hasReceivedTokens: false,
    hasDeployedContract: false,
    currentStepIndex: 0,
  });
});

/**
 * @route   PUT /api/user/onboarding
 * @desc    Update user onboarding state (mocked)
 * @access  Private
 */
router.put('/onboarding', authenticate, async (req: Request, res: Response) => {
  // Mock response for now
  res.json({ success: true });
});

export default router;
