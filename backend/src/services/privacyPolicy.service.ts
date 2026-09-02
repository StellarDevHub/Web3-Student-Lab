import prisma from '../db/index.js';
import logger from '../utils/logger.js';

const CURRENT_POLICY_VERSION = '1.0.0';

export interface PolicyConsentRecord {
  userId: string;
  policyVersion: string;
  consentGiven: boolean;
  consentAt: Date;
  ipAddress: string | null;
}

/**
 * Record a user's privacy policy consent.
 */
export async function recordPolicyConsent(
  userId: string,
  policyVersion: string,
  ipAddress?: string
): Promise<PolicyConsentRecord> {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'PRIVACY_POLICY_ACCEPTED',
        entity: 'privacy_policy',
        entityId: policyVersion,
        details: { policyVersion, consentAt: new Date().toISOString() },
        ipAddress: ipAddress ?? null,
      },
    });

    logger.info('Privacy policy accepted', { userId, policyVersion });

    return {
      userId,
      policyVersion,
      consentGiven: true,
      consentAt: new Date(),
      ipAddress: ipAddress ?? null,
    };
  } catch (error) {
    logger.error('Failed to record privacy policy consent', { userId, policyVersion, error });
    throw error;
  }
}

/**
 * Check whether a user has consented to the current (or a specific) policy version.
 */
export async function hasConsented(
  userId: string,
  policyVersion = CURRENT_POLICY_VERSION
): Promise<boolean> {
  try {
    const record = await prisma.auditLog.findFirst({
      where: {
        userId,
        action: 'PRIVACY_POLICY_ACCEPTED',
        entityId: policyVersion,
      },
    });
    return record !== null;
  } catch (error) {
    logger.error('Failed to check policy consent', { userId, policyVersion, error });
    throw error;
  }
}

/**
 * Enforce privacy policy: throw if the user has not consented.
 */
export async function enforceConsent(
  userId: string,
  policyVersion = CURRENT_POLICY_VERSION
): Promise<void> {
  const consented = await hasConsented(userId, policyVersion);
  if (!consented) {
    throw Object.assign(
      new Error(`User ${userId} has not accepted privacy policy version ${policyVersion}`),
      { code: 'PRIVACY_POLICY_NOT_ACCEPTED', policyVersion }
    );
  }
}

/**
 * Return the current privacy policy version the platform requires.
 */
export function getCurrentPolicyVersion(): string {
  return CURRENT_POLICY_VERSION;
}
