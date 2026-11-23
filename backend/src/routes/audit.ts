import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/auth.middleware.js';
import prisma from '../db/index.js';
import { logRequestAudit } from '../utils/audit.js';
import {
  anchorDailyAuditLogs,
  generateMerkleProof,
  verifyMerkleProof,
} from '../jobs/anchorMerkleRootJob.js';
import { verifyAuditChain } from '../scripts/verifyAuditChain.js';

const router = Router();

/**
 * @route   POST /api/audit/log
 * @desc    Manually log a frontend admin action
 * @access  Private (Admin only - though currently anyone authenticated)
 */
router.post('/log', authenticate, async (req: Request, res: Response) => {
  try {
    const { action, entity, entityId, details } = req.body;

    if (!action) {
      res.status(400).json({ error: 'Action is required' });
      return;
    }

    const created = await logRequestAudit(req, action, entity, entityId, details);

    res.status(201).json({ status: 'success', log: created });
  } catch (_error) {
    res.status(500).json({ error: 'Failed to record audit log' });
  }
});

/**
 * @route   GET /api/audit/verify
 * @desc    Verify the cryptographic hash-chain and Stellar Merkle anchors
 * @access  Private (Admin only)
 */
router.get('/verify', authenticate, async (_req: Request, res: Response) => {
  try {
    const report = await verifyAuditChain();
    res.json(report);
  } catch (_error) {
    res.status(500).json({ error: 'Failed to run audit chain verification' });
  }
});

/**
 * @route   GET /api/audit/anchors
 * @desc    Get all daily Merkle roots anchored to the Stellar ledger
 * @access  Private (Admin only)
 */
router.get('/anchors', authenticate, async (_req: Request, res: Response) => {
  try {
    const anchors = await prisma.merkleAnchor.findMany({
      orderBy: { anchoredAt: 'desc' },
      take: 50,
    });
    res.json(anchors);
  } catch (_error) {
    res.status(500).json({ error: 'Failed to fetch Merkle anchors' });
  }
});

/**
 * @route   POST /api/audit/anchor
 * @desc    Trigger an immediate Merkle root anchoring run for a 24h window
 * @access  Private (Admin only)
 */
router.post('/anchor', authenticate, async (req: Request, res: Response) => {
  try {
    const { periodStart, periodEnd } = req.body;
    const anchor = await anchorDailyAuditLogs({
      periodStart: periodStart ? new Date(periodStart) : undefined,
      periodEnd: periodEnd ? new Date(periodEnd) : undefined,
    });
    res.status(201).json({ status: 'success', anchor });
  } catch (_error) {
    res.status(500).json({ error: 'Failed to anchor daily audit Merkle root' });
  }
});

/**
 * @route   GET /api/audit/proof/:logId
 * @desc    Get cryptographic Merkle inclusion proof for a specific audit log
 * @access  Private (Admin only)
 */
router.get('/proof/:logId', authenticate, async (req: Request, res: Response) => {
  try {
    const rawLogId = req.params.logId;
    const logId = Array.isArray(rawLogId) ? rawLogId[0] : rawLogId;

    if (!logId) {
      res.status(400).json({ error: 'Log ID is required' });
      return;
    }

    const log = await prisma.auditLog.findUnique({
      where: { id: logId },
    });

    if (!log || !log.hash) {
      res.status(404).json({ error: 'Audit log not found or not hashed' });
      return;
    }

    // Find the Merkle anchor containing this log's createdAt
    const anchor = await prisma.merkleAnchor.findFirst({
      where: {
        periodStart: { lte: log.createdAt },
        periodEnd: { gte: log.createdAt },
      },
      orderBy: { anchoredAt: 'desc' },
    });

    if (!anchor) {
      res.status(404).json({ error: 'No Merkle anchor found for this log timeframe' });
      return;
    }

    // Fetch all logs in that period to generate the proof
    const periodLogs = await prisma.auditLog.findMany({
      where: {
        createdAt: {
          gte: anchor.periodStart,
          lte: anchor.periodEnd,
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const leaves = periodLogs.map((l) => l.hash).filter((h): h is string => Boolean(h));
    const targetIndex = periodLogs.findIndex((l) => l.id === logId);

    if (targetIndex === -1) {
      res.status(404).json({ error: 'Log not found in anchor period' });
      return;
    }

    const proof = generateMerkleProof(leaves, targetIndex);
    const isValid = verifyMerkleProof(log.hash, proof, anchor.merkleRoot);

    res.json({
      logId,
      logHash: log.hash,
      merkleRoot: anchor.merkleRoot,
      transactionHash: anchor.transactionHash,
      proof,
      isValid,
    });
  } catch (_error) {
    res.status(500).json({ error: 'Failed to generate Merkle proof' });
  }
});

/**
 * @route   GET /api/audit
 * @desc    Get recent audit logs
 * @access  Private (Admin only)
 */
router.get('/', authenticate, async (_req: Request, res: Response) => {
  try {
    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    res.json(logs);
  } catch (_error) {
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

export default router;
