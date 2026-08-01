import { Request, Response, Router } from 'express';
import { authenticate } from '../auth/auth.middleware.js';
import prisma from '../db/index.js';
import { logRequestAudit } from '../utils/audit.js';
import { buildPaginatedResponse, parsePaginationQuery } from '../utils/pagination.js';

const router: ReturnType<typeof Router> = Router();

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
    const pagination = parsePaginationQuery(req, { defaultPageSize: 25, maxPageSize: 50 });

    const [logs, totalItems] = await Promise.all([
      prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: pagination.pageSize,
        skip: pagination.offset,
      }),
      prisma.auditLog.count(),
    ]);

    res.json(buildPaginatedResponse(logs, totalItems, pagination.page, pagination.pageSize, pagination.offset));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch audit logs';
    res.status(message.includes('Page') || message.includes('Offset') ? 400 : 500).json({
      error: message,
    });
  }
});

export default router;
