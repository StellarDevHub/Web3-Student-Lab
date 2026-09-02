import { Request } from 'express';
import { createHash } from 'crypto';
import prisma from '../db/index.js';
import logger, { auditLogger, getCorrelationId } from './logger.js';

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

/** Shape written into the DB `details` JSON column */
interface AuditDetailsRecord {
  _hash: string;
  correlationId: string | undefined;
  [key: string]: unknown;
}

function buildChainInput(
  prevHash: string | undefined,
  timestamp: string,
  userId: string | null | undefined,
  action: string,
  payload: Record<string, unknown>
): string {
  return [
    prevHash ?? '',
    timestamp,
    userId ?? '',
    action,
    JSON.stringify(payload),
  ].join('\x00');
}

/**
 * Logs an administrative or sensitive action to the database and immutable
 * file storage.  Sensitive fields must be stripped by the caller before
 * passing `details`.
 */
export async function logAudit(data: AuditLogData): Promise<void> {
  try {
    const timestamp = new Date().toISOString();
    const correlationId = getCorrelationId();

    const previousLog = await prisma.auditLog.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { hash: true },
    });

    const prevHash = previousLog?.hash ?? undefined;

    const payload = {
      userEmail: data.userEmail,
      entity: data.entity,
      entityId: data.entityId,
      details: data.details,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      correlationId,
    };

    const chainInput = buildChainInput(prevHash, timestamp, data.userId, data.action, payload);
    const hash = createHash('sha256').update(chainInput, 'utf8').digest('hex');

    const logEntry = {
      ...data,
      timestamp,
      correlationId,
      hash,
    };

    auditLogger.info(logEntry);

    const detailsRecord: AuditDetailsRecord = {
      _hash: hash,
      correlationId,
    };

    if (typeof data.details === 'object' && data.details !== null) {
      Object.assign(detailsRecord, data.details as Record<string, unknown>);
    }

    await prisma.auditLog.create({
      data: {
        userId: data.userId ?? null,
        userEmail: data.userEmail ?? null,
        action: data.action,
        entity: data.entity ?? null,
        entityId: data.entityId ?? null,
        details: detailsRecord as any,
        ipAddress: data.ipAddress ?? null,
        userAgent: data.userAgent ?? null,
        prevHash: prevHash ?? null,
      },
    });

    logger.info(
      `Audit Log: ${data.action} by ${data.userEmail ?? data.userId ?? 'unknown'}`,
      {
        correlationId,
        action: data.action,
        entity: data.entity,
      }
    );
  } catch (error) {
    logger.error('Failed to create audit log:', {
      error,
      correlationId: getCorrelationId(),
    });
  }
}

/** Shape of `req.user` as set by auth middleware on authenticated routes */
interface AuthenticatedUser {
  id?: string;
  email?: string;
}

/** Body shapes that may carry a top-level `email` field (login / register) */
interface BodyWithOptionalEmail {
  email?: string;
}

/**
 * Helper to log an audit entry from an Express request.
 * Extracts user identity from `req.user` (authenticated routes) or falls back
 * to `req.body.email` for login / register flows.
 */
export async function logRequestAudit(
  req: Request,
  action: string,
  entity?: string,
  entityId?: string,
  details?: unknown
): Promise<void> {
  const user = req.user as AuthenticatedUser | undefined;

  const body = req.body as BodyWithOptionalEmail | undefined;
  const fallbackEmail: string | null = body?.email ?? null;

  return logAudit({
    userId: user?.id ?? null,
    userEmail: user?.email ?? fallbackEmail,
    action,
    entity: entity ?? null,
    entityId: entityId ?? null,
    details: details ?? null,
    ipAddress: (req.ip ?? req.socket?.remoteAddress) ?? null,
    userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
  });
}

