import prisma from '../db/index.js';
import logger from '../utils/logger.js';

const CURRENT_TOS_VERSION = '1.0.0';

export interface TosRecord {
  userId: string;
  version: string;
  acceptedAt: Date;
  ipAddress: string | null;
}

/**
 * Record a user's acceptance of the Terms of Service.
 */
export async function acceptTermsOfService(
  userId: string,
  version: string,
  ipAddress?: string
): Promise<TosRecord> {
  try {
    // Stored as an audit log entry so it is immutable and auditable.
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'TOS_ACCEPTED',
        entity: 'terms_of_service',
        entityId: version,
        details: { version, acceptedAt: new Date().toISOString() },
        ipAddress: ipAddress ?? null,
      },
    });

    logger.info('Terms of Service accepted', { userId, version });

    return {
      userId,
      version,
      acceptedAt: new Date(),
      ipAddress: ipAddress ?? null,
    };
  } catch (error) {
    logger.error('Failed to record TOS acceptance', { userId, version, error });
    throw error;
  }
}

/**
 * Check whether a user has accepted the current (or a specific) TOS version.
 */
export async function hasTosAcceptance(
  userId: string,
  version = CURRENT_TOS_VERSION
): Promise<boolean> {
  try {
    const record = await prisma.auditLog.findFirst({
      where: {
        userId,
        action: 'TOS_ACCEPTED',
        entityId: version,
      },
    });
    return record !== null;
  } catch (error) {
    logger.error('Failed to check TOS acceptance', { userId, version, error });
    throw error;
  }
}

/**
 * Return the current TOS version the platform requires.
 */
export function getCurrentTosVersion(): string {
  return CURRENT_TOS_VERSION;
}
