import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/auth.middleware.js';
import prisma from '../db/index.js';
import { logRequestAudit } from '../utils/audit.js';

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

    await logRequestAudit(req, action, entity, entityId, details);

    res.status(201).json({ status: 'success' });
  } catch (_error) {
    res.status(500).json({ error: 'Failed to record audit log' });
  }
});

/**
 * @route   GET /api/audit
 * @desc    Get recent audit logs
 * @access  Private (Admin only)
 */
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    // In a real app, check if user.role === 'ADMIN'
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
