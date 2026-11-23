import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import prisma from '../db/index.js';
import logger from '../utils/logger.js';

const router = Router();

router.post(
  '/contributor-proofs',
  body('did').isString().notEmpty(),
  body('walletAddress').isString().notEmpty(),
  body('githubHandle').isString().notEmpty(),
  body('proofHash').isString().notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const { did, walletAddress, githubHandle, proofHash, documentId, versionId } = req.body;

    try {
      const proof = await prisma.contributorProof.create({
        data: {
          did,
          walletAddress,
          githubHandle,
          proofHash,
          documentId: documentId || null,
          versionId: versionId || null,
        },
      });

      logger.info('Contributor proof recorded', { proofHash, did });
      res.status(201).json(proof);
    } catch (error) {
      logger.error('Failed to record contributor proof:', error);
      res.status(500).json({ error: 'Failed to record contributor proof' });
    }
  }
);

router.get('/contributor-proofs/:did', async (req, res) => {
  const { did } = req.params;
  const proofs = await prisma.contributorProof.findMany({
    where: { did },
    orderBy: { createdAt: 'desc' },
  });
  res.json(proofs);
});

export default router;
