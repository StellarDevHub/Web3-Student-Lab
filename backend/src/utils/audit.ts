import { Request } from 'express';
import prisma from '../db/index.js';
import logger from './logger.js';

export interface AuditLogData {
  userId?: string | null;
  userEmail?: string | null;
  action: string;
  entity?: string | null;
  entityId?: string | null;
  details?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Logs an administrative action to the audit_logs table
 */
export async function logAudit(data: AuditLogData): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: data.userId ?? null,
        userEmail: data.userEmail ?? null,
        action: data.action,
        entity: data.entity ?? null,
        entityId: data.entityId ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        details: (data.details as any) ?? null,
        ipAddress: data.ipAddress ?? null,
        userAgent: data.userAgent ?? null,
      },
    });
    logger.info(`Audit Log: ${data.action} by ${data.userEmail || 'unknown'}`);
  } catch (error) {
    logger.error('Failed to create audit log:', error);
    // We don't want to fail the main action if logging fails, but we should know about it
  }
}

/**
 * Helper to log an audit entry from an Express request
 */
export async function logRequestAudit(
  req: Request,
  action: string,
  entity?: string,
  entityId?: string,
  details?: unknown
): Promise<void> {
  const user = req.user as { id: string; email: string } | undefined;

  return logAudit({
    userId: user?.id ?? null,
    userEmail: user?.email ?? null,
    action,
    entity: entity ?? null,
    entityId: entityId ?? null,
    details: details ?? null,
    ipAddress: (req.ip || req.socket.remoteAddress) ?? null,
    userAgent: (req.headers['user-agent'] as string) ?? null,
  });
}
