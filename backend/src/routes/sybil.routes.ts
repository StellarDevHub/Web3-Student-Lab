/**
 * Sybil resistance endpoints (Issues BE-019, BE-086).
 *
 *   POST /api/v1/sybil/score              -> compute & store the caller's composite score
 *   GET  /api/v1/sybil/score/:studentId   -> latest stored score (self or admin)
 *   POST /api/v1/sybil/verify             -> verify a score proof or badge credential
 *   POST /api/v1/sybil/gateway            -> verify Passport/BrightID and compute unified score (BE-086)
 *   GET  /api/v1/sybil/gateway/eligibility -> check voting/bounty eligibility (BE-086)
 */

import { Router, type Response } from 'express';
import { z } from 'zod';
import { authenticateToken, type AuthRequest } from '../middleware/auth.js';
import { credentialIssuanceService } from '../services/credentialIssuanceService.js';
import {
  SYBIL_BADGE_CREDENTIAL_TYPE,
  SYBIL_SCORE_CREDENTIAL_TYPE,
  SybilScoreError,
  sybilScoreService,
} from '../services/sybilScoreService.js';
import {
  SybilVerificationError,
  verifySybilIdentity,
  QUADRATIC_VOTING_THRESHOLD,
} from '../services/sybilVerification.js';
import prisma from '../db/index.js';
import logger from '../utils/logger.js';

const router: Router = Router();

const scoreSchema = z.object({
  studentId: z.string().min(1).optional(),
  stellarAccountId: z.string().min(1),
  evmAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  worldIdProof: z
    .object({
      merkle_root: z.string().min(1),
      nullifier_hash: z.string().min(1),
      proof: z.string().min(1),
      verification_level: z.enum(['orb', 'device']),
    })
    .optional(),
});

const gatewaySchema = z.object({
  studentId: z.string().min(1).optional(),
  evmAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  brightId: z
    .object({
      uniqueId: z.string().min(1),
      verification: z.string().min(1),
      signature: z.string().min(1),
    })
    .optional(),
});

const isAdmin = (req: AuthRequest): boolean => req.user?.role?.toLowerCase() === 'admin';

router.post('/score', authenticateToken as any, async (req: AuthRequest, res: Response) => {
  const parsed = scoreSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid body', details: parsed.error.flatten() });
  }
  const { studentId: requestedStudentId, evmAddress, worldIdProof, stellarAccountId } = parsed.data;
  // Only admins may score on behalf of another student.
  const studentId = requestedStudentId && isAdmin(req) ? requestedStudentId : req.user!.id;

  try {
    const result = await sybilScoreService.computeScore({
      studentId,
      stellarAccountId,
      ...(evmAddress ? { evmAddress } : {}),
      ...(worldIdProof ? { worldIdProof } : {}),
    });
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof SybilScoreError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    logger.error('Failed to compute sybil score:', error);
    return res.status(500).json({ error: 'Failed to compute sybil score' });
  }
});

router.get('/score/:studentId', authenticateToken as any, (req: AuthRequest, res: Response) => {
  const studentId = String(req.params.studentId);
  if (studentId !== req.user!.id && !isAdmin(req)) {
    return res.status(403).json({ error: 'Not allowed to view this score' });
  }
  const result = sybilScoreService.getScore(studentId);
  if (!result) {
    return res.status(404).json({ error: 'No current sybil score for this student' });
  }
  return res.status(200).json(result);
});

router.post('/verify', async (req, res) => {
  const credential = req.body?.credential ?? req.body;
  const types: unknown = credential?.type;
  if (
    !Array.isArray(types) ||
    !(types.includes(SYBIL_SCORE_CREDENTIAL_TYPE) || types.includes(SYBIL_BADGE_CREDENTIAL_TYPE))
  ) {
    return res.status(400).json({ error: 'Not a sybil score proof or badge credential' });
  }
  const result = await credentialIssuanceService.verifyCredential(credential);
  return res.status(result.valid ? 200 : 422).json(result);
});

/**
 * BE-086: verify Gitcoin Passport / BrightID proofs, compute unified score,
 * persist the verification record, and reject duplicate identity bindings.
 */
router.post('/gateway', authenticateToken as any, async (req: AuthRequest, res: Response) => {
  const parsed = gatewaySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid body', details: parsed.error.flatten() });
  }
  const { studentId: requestedStudentId, evmAddress, brightId } = parsed.data;
  const studentId = requestedStudentId && isAdmin(req) ? requestedStudentId : req.user!.id;

  try {
    const result = await verifySybilIdentity({
      studentId,
      ...(evmAddress ? { evmAddress } : {}),
      ...(brightId ? { brightId } : {}),
    });
    await prisma.sybilVerificationRecord.create({
      data: {
        studentId,
        score: result.score,
        eligibleForVoting: result.eligibleForVoting,
        passportScore: result.components.passport.score,
        brightIdVerified: result.components.brightId.verified,
        verifiedAt: new Date(result.verifiedAt),
      },
    });
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof SybilVerificationError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    logger.error('Sybil gateway verification failed:', error);
    return res.status(500).json({ error: 'Sybil verification failed' });
  }
});

/**
 * BE-086: eligibility check used before quadratic voting or bounty claims.
 */
router.get('/gateway/eligibility', authenticateToken as any, async (req: AuthRequest, res: Response) => {
  const studentId = req.user!.id;
  const latest = await prisma.sybilVerificationRecord.findFirst({
    where: { studentId },
    orderBy: { verifiedAt: 'desc' },
  });
  if (!latest) {
    return res.status(404).json({ error: 'No sybil verification on record', eligibleForVoting: false });
  }
  return res.status(200).json({
    studentId,
    score: latest.score,
    threshold: QUADRATIC_VOTING_THRESHOLD,
    eligibleForVoting: latest.score > QUADRATIC_VOTING_THRESHOLD,
    verifiedAt: latest.verifiedAt,
  });
});

export default router;
