import { Request } from 'express';
import crypto from 'crypto';
import prisma from '../db/index.js';
import logger, { auditLogger } from './logger.js';

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
 * Logs an administrative or sensitive action to the database and immutable file storage
 */
export async function logAudit(data: AuditLogData): Promise<void> {
  try {
    // 1. Prepare log payload
    const timestamp = new Date().toISOString();
    const payload = {
      ...data,
      timestamp,
    };

    // 2. Generate a cryptographic hash of the payload for verification (Immutability proof)
    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');

    const logEntry = {
      ...payload,
      hash,
    };

    // 3. Write to immutable append-only file (Winston file transport)
    auditLogger.info(logEntry);

    // 4. Write to database for querying and UI display
    await prisma.auditLog.create({
      data: {
        userId: data.userId ?? null,
        userEmail: data.userEmail ?? null,
        action: data.action,
        entity: data.entity ?? null,
        entityId: data.entityId ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        details: typeof data.details === 'object' && data.details !== null ? { ...(data.details as any), _hash: hash } : { _hash: hash },
        ipAddress: data.ipAddress ?? null,
        userAgent: data.userAgent ?? null,
      },
    });

    // 5. Standard logging
    logger.info(`Audit Log: ${data.action} by ${data.userEmail || data.userId || 'unknown'}`);
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
  // Try to get user from req.user (authenticated routes)
  const user = req.user as { id?: string; email?: string } | undefined;
  
  // Try to get email from body if it's a login/register request without req.user
  const fallbackEmail = req.body?.email || null;

  return logAudit({
    userId: user?.id ?? null,
    userEmail: user?.email ?? fallbackEmail,
    action,
    entity: entity ?? null,
    entityId: entityId ?? null,
    details: details ?? null,
    ipAddress: (req.ip || req.socket?.remoteAddress) ?? null,
    userAgent: (req.headers['user-agent'] as string) ?? null,
  });
}
