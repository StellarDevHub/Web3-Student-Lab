import crypto from 'crypto';
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

export interface AuditLogRow {
  id?: string;
  userId?: string | null;
  userEmail?: string | null;
  action: string;
  entity?: string | null;
  entityId?: string | null;
  details?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  prevHash?: string | null;
  hash?: string | null;
  createdAt?: Date | string;
}

/**
 * Genesis hash used as the prevHash for the very first audit log in the chain.
 * Standard 64-character SHA-256 hex zero string.
 */
export const GENESIS_HASH = '0'.repeat(64);

/**
 * Deterministically canonicalizes a JSON-compatible object/value by sorting keys recursively.
 */
export function canonicalize(obj: unknown): string {
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (obj instanceof Date) return JSON.stringify(obj.toISOString());
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalize).join(',') + ']';
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  return (
    '{' +
    keys
      .map((key) => `${JSON.stringify(key)}:${canonicalize((obj as Record<string, unknown>)[key])}`)
      .join(',') +
    '}'
  );
}

/**
 * Serializes audit row fields canonically for SHA-256 hash computation.
 */
export function serializeAuditRow(data: {
  action: string;
  entity?: string | null;
  entityId?: string | null;
  userId?: string | null;
  userEmail?: string | null;
  details?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt?: Date | string;
}): string {
  const normalized = {
    action: data.action,
    createdAt: data.createdAt instanceof Date ? data.createdAt.toISOString() : data.createdAt || '',
    details: data.details ?? null,
    entity: data.entity ?? null,
    entityId: data.entityId ?? null,
    ipAddress: data.ipAddress ?? null,
    userAgent: data.userAgent ?? null,
    userEmail: data.userEmail ?? null,
    userId: data.userId ?? null,
  };
  return canonicalize(normalized);
}

/**
 * Computes hash = SHA256(row || prevHash)
 */
export function computeRowHash(
  row: {
    action: string;
    entity?: string | null;
    entityId?: string | null;
    userId?: string | null;
    userEmail?: string | null;
    details?: unknown;
    ipAddress?: string | null;
    userAgent?: string | null;
    createdAt?: Date | string;
  },
  prevHash: string
): string {
  const serializedRow = serializeAuditRow(row);
  return crypto.createHash('sha256').update(`${serializedRow}||${prevHash}`).digest('hex');
}

/**
 * Logs an administrative action to the audit_logs table, maintaining an unbroken cryptographic hash-chain.
 */
export async function logAudit(data: AuditLogData) {
  try {
    // Retrieve the most recent audit entry to link prevHash
    const lastLog = await prisma.auditLog.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { id: true, hash: true },
    });

    const prevHash = lastLog?.hash || GENESIS_HASH;
    const createdAt = new Date();

    const rowForHash = {
      action: data.action,
      entity: data.entity ?? null,
      entityId: data.entityId ?? null,
      userId: data.userId ?? null,
      userEmail: data.userEmail ?? null,
      details: data.details ?? null,
      ipAddress: data.ipAddress ?? null,
      userAgent: data.userAgent ?? null,
      createdAt,
    };

    const hash = computeRowHash(rowForHash, prevHash);

    const created = await prisma.auditLog.create({
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
        prevHash,
        hash,
        createdAt,
      },
    });

    logger.info(
      `Audit Log: ${data.action} by ${data.userEmail || 'unknown'} [hash: ${hash.substring(0, 8)}...]`
    );
    return created;
  } catch (error) {
    logger.error('Failed to create audit log:', error);
    return null;
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
) {
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
