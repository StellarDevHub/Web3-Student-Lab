import prisma from '../db/index.js';
import {
  Certificate,
  RevokeCertificateRequest,
  ReissueCertificateRequest,
} from '../types/certificate.types.js';
import { CertificateService } from './CertificateService.js';
import logger from '../utils/logger.js';
import { logAudit } from '../utils/audit.js';

/**
 * Raised when the actor performing a revoke/reissue action is not on
 * the configured list of authorized certificate issuers. Kept as a
 * distinct error type so the controller layer can map it to 403
 * instead of a generic 500.
 */
export class UnauthorizedIssuerError extends Error {
  constructor(message = 'Actor is not an authorized certificate issuer') {
    super(message);
    this.name = 'UnauthorizedIssuerError';
  }
}

/**
 * Returns the set of issuer DIDs allowed to revoke/reissue
 * certificates. Configured via AUTHORIZED_ISSUER_DIDS (comma
 * separated); falls back to the platform's own ISSUER_DID so a
 * single-issuer deployment keeps working without extra config.
 */
function getAuthorizedIssuerDids(): Set<string> {
  const configured = process.env.AUTHORIZED_ISSUER_DIDS;
  if (configured && configured.trim()) {
    return new Set(
      configured
        .split(',')
        .map((did) => did.trim())
        .filter(Boolean)
    );
  }

  const fallback = process.env.ISSUER_DID;
  return new Set(fallback ? [fallback] : []);
}

function assertAuthorizedIssuer(actorDid: string): void {
  const authorized = getAuthorizedIssuerDids();
  // If no issuer allow-list is configured at all, we cannot verify
  // authorization — fail closed rather than silently accepting any DID.
  if (authorized.size === 0 || !authorized.has(actorDid)) {
    throw new UnauthorizedIssuerError();
  }
}

export class RevocationService {
  private certificateService: CertificateService;

  constructor() {
    this.certificateService = new CertificateService();
  }

  /**
   * Revokes a certificate by certificate ID
   * Only authorized issuers/admins can call this
   */
  async revokeCertificate(
    certificateId: string,
    request: RevokeCertificateRequest
  ): Promise<Certificate> {
    const { reason, revokedBy } = request;

    // Validate certificate exists and can be revoked
    const certificate = await prisma.certificate.findUnique({
      where: { id: certificateId },
      include: { student: true, course: true },
    });

    if (!certificate) {
      throw new Error('Certificate not found');
    }

    const priorStatus = certificate.status;

    try {
      // Check if already revoked
      if (certificate.status === 'REVOKED') {
        throw new Error('Certificate already revoked');
      }

      // Check if certificate can be revoked
      if (certificate.status === 'EXPIRED') {
        throw new Error('Expired certificates cannot be revoked');
      }

      // Check if issuer is authorized
      if (!revokedBy) {
        throw new Error('Revocation requires a valid issuer DID');
      }

      assertAuthorizedIssuer(revokedBy);

      // Perform revocation
      const updated = await prisma.certificate.update({
        where: { id: certificateId },
        data: {
          status: 'REVOKED',
          revokedAt: new Date(),
          revocationReason: reason,
          revokedBy,
          updatedAt: new Date(),
        },
        include: {
          student: true,
          course: true,
        },
      });

      logger.info(`Certificate revoked successfully`, {
        certificateId,
        reason,
        revokedBy,
        priorStatus,
        timestamp: new Date().toISOString(),
      });

      await logAudit({
        userEmail: revokedBy,
        action: 'CERTIFICATE_REVOKED',
        entity: 'Certificate',
        entityId: certificateId,
        details: { reason, actorDid: revokedBy, priorStatus, newStatus: 'REVOKED' },
      });

      return updated;
    } catch (error) {
      // Audit both successful and failed/unauthorized revocation
      // attempts, so the trail shows who tried what and why it failed.
      await logAudit({
        userEmail: revokedBy || null,
        action: 'CERTIFICATE_REVOKE_FAILED',
        entity: 'Certificate',
        entityId: certificateId,
        details: {
          reason,
          actorDid: revokedBy,
          priorStatus,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });
      throw error;
    }
  }

  /**
   * Reissues a certificate (creates a new one, marks old as REISSUED)
   * Typically used when correcting errors or updating grades
   */
  async reissueCertificate(
    request: ReissueCertificateRequest
  ): Promise<{ original: Certificate; new: Certificate }> {
    const { certificateId, reason, newGrade, issuedBy } = request;

    // Validate original certificate
    const original = await prisma.certificate.findUnique({
      where: { id: certificateId },
      include: { student: true, course: true },
    });

    if (!original) {
      throw new Error('Original certificate not found');
    }

    const priorStatus = original.status;

    try {
      // Validate reissuance eligibility
      if (original.status === 'REVOKED') {
        throw new Error('Cannot reissue a revoked certificate');
      }

      if (original.status === 'EXPIRED') {
        throw new Error('Cannot reissue an expired certificate');
      }

      // Verify issuer authorization
      if (!issuedBy) {
        throw new Error('Reissuance requires a valid issuer DID');
      }

      assertAuthorizedIssuer(issuedBy);

      // Mark original as reissued
      await prisma.certificate.update({
        where: { id: certificateId },
        data: {
          status: 'REISSUED',
          updatedAt: new Date(),
        },
      });

      // Create new certificate with updated data
      const newCertificate = await this.certificateService.mintCertificate(
        {
          studentId: original.studentId,
          courseId: original.courseId,
          ...(newGrade ? { grade: newGrade } : original.grade ? { grade: original.grade } : {}),
          ...(original.did ? { did: original.did } : {}),
        },
        issuedBy,
        original.contractAddress || '',
        original.network || 'stellar-testnet'
      );

      // Update new certificate to link to original
      await prisma.certificate.update({
        where: { id: newCertificate.id },
        data: {
          previousVersionId: certificateId,
        },
      });

      newCertificate.previousVersionId = certificateId;

      logger.info(`Certificate reissued: ${certificateId} -> ${newCertificate.id}`, {
        originalId: certificateId,
        newId: newCertificate.id,
        reason,
        issuedBy,
        priorStatus,
      });

      await logAudit({
        userEmail: issuedBy,
        action: 'CERTIFICATE_REISSUED',
        entity: 'Certificate',
        entityId: certificateId,
        details: {
          reason,
          actorDid: issuedBy,
          priorStatus,
          newStatus: 'REISSUED',
          newCertificateId: newCertificate.id,
        },
      });

      original.status = 'REISSUED';
      return { original, new: newCertificate };
    } catch (error) {
      await logAudit({
        userEmail: issuedBy || null,
        action: 'CERTIFICATE_REISSUE_FAILED',
        entity: 'Certificate',
        entityId: certificateId,
        details: {
          reason,
          actorDid: issuedBy,
          priorStatus,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });
      throw error;
    }
  }

  /**
   * Bulk revokes multiple certificates
   */
  async bulkRevoke(
    certificateIds: string[],
    reason: string,
    revokedBy: string
  ): Promise<{ revoked: number; failed: number; errors: string[] }> {
    const errors: string[] = [];
    let revokedCount = 0;
    let failedCount = 0;

    for (const id of certificateIds) {
      try {
        await this.revokeCertificate(id, { certificateId: id, reason, revokedBy });
        revokedCount++;
      } catch (error) {
        failedCount++;
        errors.push(`${id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    logger.info(`Bulk revocation completed: ${revokedCount} revoked, ${failedCount} failed`, {
      count: revokedCount,
      failed: failedCount,
      errors,
    });

    return { revoked: revokedCount, failed: failedCount, errors };
  }
}

export const revocationService = new RevocationService();
