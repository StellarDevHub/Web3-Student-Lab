import { NextFunction, Request, Response } from 'express';
import prisma from '../db/index.js';
import { logAudit } from '../utils/audit.js';
import { getWorkspaceId } from './WorkspaceContext.js';

/**
 * Multi-tenant workspace membership guard (#1119).
 *
 * Validates the active workspace (from the `x-workspace-id` header, captured
 * by `optionalWorkspaceMiddleware` into AsyncLocalStorage) against the
 * organizations the authenticated student is enrolled in:
 *
 *  1. The student's own `Student.workspaceId`, or
 *  2. A workspace they hold an active `Enrollment` in.
 *
 * Admins bypass the check (they manage all workspaces).
 *
 * On violation the request is rejected with **403 Forbidden** and the attempt
 * is written to the security audit stream (`WORKSPACE_ACCESS_DENIED`).
 *
 * Must run AFTER `authenticate` (needs `req.user`). Requests without an
 * authenticated user, or without a workspace context, pass through — public
 * endpoints and unscoped requests are governed by the Prisma extension's
 * per-query filtering instead.
 */
export const validateWorkspaceMembership = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const workspaceId = getWorkspaceId();
  const user = (req as Request & { user?: { id: string; role?: string } }).user;

  if (!workspaceId || !user) {
    next();
    return;
  }

  // Admins manage all workspaces.
  if (user.role === 'admin') {
    next();
    return;
  }

  try {
    const student = await prisma.student.findUnique({
      where: { id: user.id },
      select: { workspaceId: true },
    });

    if (student?.workspaceId === workspaceId) {
      next();
      return;
    }

    const enrollment = await prisma.enrollment.findFirst({
      where: { studentId: user.id, workspaceId, status: 'active' },
      select: { id: true },
    });

    if (enrollment) {
      next();
      return;
    }

    await logAudit({
      userId: user.id,
      action: 'WORKSPACE_ACCESS_DENIED',
      entity: 'Workspace',
      entityId: workspaceId,
      details: {
        reason: 'user is not enrolled in workspace',
        path: req.path,
        method: req.method,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(403).json({
      error: 'Forbidden: you do not belong to this workspace',
    });
  } catch (error) {
    // Fail closed on lookup errors: never leak cross-tenant data.
    await logAudit({
      userId: user.id,
      action: 'WORKSPACE_ACCESS_DENIED',
      entity: 'Workspace',
      entityId: workspaceId,
      details: { reason: 'membership check failed', error: String(error) },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.status(403).json({ error: 'Forbidden: workspace membership could not be verified' });
  }
};
