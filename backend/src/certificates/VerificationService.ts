import prisma from '../db/index.js';
import {
  VerificationResult,
  CertificateMetadata,
  CertificateStatus,
} from '../types/certificate.types.js';
import { MetadataGenerator } from './MetadataGenerator.js';
import logger from '../utils/logger.js';
import { verifyCertificateContentHash } from './ContentHash.js';

export class VerificationService {
  private metadataGenerator: MetadataGenerator;

  constructor() {
    this.metadataGenerator = new MetadataGenerator();
  }

  /**
   * Verifies a single certificate by token ID
   * Public endpoint - no authentication required
   */
  async verifyByTokenId(tokenId: string): Promise<VerificationResult> {
    try {
      // Find certificate by either tokenId or id
      const certificate = await prisma.certificate.findFirst({
        where: {
          OR: [
            { tokenId: tokenId },
            { id: tokenId }
          ]
        },
        include: {
          student: {
            select: {
              walletAddress: true,
              did: true,
              firstName: true,
              lastName: true,
            },
          },
          course: true,
        },
      });

      if (!certificate) {
        return {
          isValid: false,
          certificate: null,
          status: 'invalid' as CertificateStatus,
          onChainData: null,
          message: 'Certificate not found',
        };
      }

      // Re-verify the content hash before serving any data. A mismatch
      // means the stored metadata has diverged from what was hashed at
      // mint time — surface tamper detection instead of silently
      // returning the mismatched record.
      const hashCheck = verifyCertificateContentHash(
        {
          id: certificate.id,
          studentId: certificate.studentId,
          courseId: certificate.courseId,
          tokenId: certificate.tokenId,
          grade: certificate.grade,
          did: certificate.did,
          issuedAt: certificate.issuedAt,
        },
        (certificate as any).contentHash
      );

      if (hashCheck.state === 'tampered') {
        logger.error(`Certificate integrity check failed for token ${tokenId}`, {
          tokenId,
          certificateId: certificate.id,
          expectedHash: hashCheck.expected,
          actualHash: hashCheck.actual,
        });
        return {
          isValid: false,
          certificate: null,
          status: 'TAMPERED' as CertificateStatus,
          onChainData: null,
          message: 'Certificate integrity check failed: stored metadata does not match its content hash',
        };
      }

      // If revoked, return with revoked status
      if (certificate.status === 'REVOKED') {
        return this.buildRevokedResult(certificate);
      }

      // If reissued, check if we should show information
      if (certificate.status === 'REISSUED') {
        return this.buildReissuedResult(certificate);
      }

      // Build successful verification result
      return this.buildSuccessfulResult(certificate);
    } catch (error) {
      logger.error(`Verification error for token ${tokenId}:`, error);
      throw new Error(
        `Failed to verify certificate: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Batch verification for multiple token IDs
   * Accepts up to 100 certificates for performance
   */
  async batchVerify(tokenIds: string[]): Promise<VerificationResult[]> {
    if (tokenIds.length > 100) {
      throw new Error('Maximum 100 certificates allowed per batch verification');
    }

    // Fetch all certificates in a single query by either tokenId or id
    const certificates = await prisma.certificate.findMany({
      where: {
        OR: [
          { tokenId: { in: tokenIds } },
          { id: { in: tokenIds } }
        ]
      },
      include: {
        student: {
          select: {
            walletAddress: true,
            did: true,
            firstName: true,
            lastName: true,
          },
        },
        course: true,
      },
    });

    // Create a map for O(1) lookup by both id and tokenId
    const certMap = new Map();
    certificates.forEach((c) => {
      if (c.tokenId) certMap.set(c.tokenId, c);
      if (c.id) certMap.set(c.id, c);
    });

    const results: VerificationResult[] = [];

    for (const tokenId of tokenIds) {
      const cert = certMap.get(tokenId);

      if (!cert) {
        results.push({
          isValid: false,
          certificate: null,
          status: 'invalid' as CertificateStatus,
          onChainData: null,
          message: 'Certificate not found',
        });
        continue;
      }

      const hashCheck = verifyCertificateContentHash(
        {
          id: cert.id,
          studentId: cert.studentId,
          courseId: cert.courseId,
          tokenId: cert.tokenId,
          grade: cert.grade,
          did: cert.did,
          issuedAt: cert.issuedAt,
        },
        (cert as any).contentHash
      );

      if (hashCheck.state === 'tampered') {
        logger.error(`Certificate integrity check failed for token ${tokenId} (batch)`, {
          tokenId,
          certificateId: cert.id,
          expectedHash: hashCheck.expected,
          actualHash: hashCheck.actual,
        });
        results.push({
          isValid: false,
          certificate: null,
          status: 'TAMPERED' as CertificateStatus,
          onChainData: null,
          message: 'Certificate integrity check failed: stored metadata does not match its content hash',
        });
        continue;
      }

      // Determine status
      if (cert.status === 'REVOKED') {
        results.push({
          isValid: false,
          certificate: null,
          status: CertificateStatus.REVOKED,
          onChainData: null,
          message: 'Certificate has been revoked',
        });
      } else if (cert.status === 'REISSUED') {
        results.push({
          isValid: false,
          certificate: null,
          status: CertificateStatus.REISSUED,
          onChainData: null,
          message: 'Certificate has been reissued',
        });
      } else {
        const metadata = this.metadataGenerator.generate(cert, cert.course!, cert.student);
        const walletAddress = this.getWalletAddress(cert.student, cert.student.did);
        const onChainData = {
          tokenId: cert.tokenId || '',
          owner: walletAddress,
          mintedAt: cert.issuedAt,
          contractAddress: cert.contractAddress || '',
          transactionHash: cert.transactionHash || cert.certificateHash || '',
          network: cert.network || 'stellar-testnet',
        };

        results.push({
          isValid: true,
          certificate: metadata,
          status: cert.status as any,
          onChainData,
        });
      }
    }

    return results;
  }

  /**
   * Gets certificate metadata
   */
  async getMetadata(tokenId: string): Promise<CertificateMetadata | null> {
    const { certificateService } = await import('./CertificateService.js');
    return certificateService.getMetadata(tokenId);
  }

  /**
   * Records a verification event for analytics
   */
  async recordVerification(tokenId: string): Promise<void> {
    const certificate = await prisma.certificate.findFirst({
      where: {
        OR: [{ tokenId }, { id: tokenId }],
      },
      select: {
        id: true,
        tokenId: true,
        workspaceId: true,
      },
    });

    await prisma.certificateVerificationEvent.create({
      data: {
        workspaceId: certificate?.workspaceId || 'default',
        certificateId: certificate?.id || null,
        tokenId: certificate?.tokenId || tokenId,
      },
    });

    logger.debug(`Certificate verification event recorded: ${tokenId}`);
  }

  /**
   * Builds successful verification result
   */
  private buildSuccessfulResult(certificate: any): VerificationResult {
    const metadata = this.metadataGenerator.generate(
      certificate,
      certificate.course,
      certificate.student
    );

    const walletAddress = this.getWalletAddress(certificate.student, certificate.student.did);

    const onChainData = {
      tokenId: certificate.tokenId || '',
      owner: walletAddress,
      mintedAt: certificate.issuedAt,
      contractAddress: certificate.contractAddress || '',
      transactionHash: certificate.transactionHash || certificate.certificateHash || '',
      network: certificate.network || 'stellar-testnet',
    };

    return {
      isValid: true,
      certificate: metadata,
      status: certificate.status as any,
      onChainData,
    };
  }

  /**
   * Builds revoked verification result
   */
  private buildRevokedResult(certificate: any): VerificationResult {
    const metadata = this.metadataGenerator.generate(
      certificate,
      certificate.course,
      certificate.student
    );

    const walletAddress = this.getWalletAddress(certificate.student, certificate.student.did);

    const onChainData = {
      tokenId: certificate.tokenId || '',
      owner: walletAddress,
      mintedAt: certificate.issuedAt,
      contractAddress: certificate.contractAddress || '',
      transactionHash: certificate.transactionHash || '',
      network: certificate.network || 'stellar-testnet',
    };

    return {
      isValid: false,
      certificate: metadata,
      status: CertificateStatus.REVOKED,
      onChainData,
      revocationInfo: {
        revokedAt: certificate.revokedAt!,
        reason: certificate.revocationReason!,
        // The revoking actor's issuer DID is an internal identity detail
        // and is redacted from this public verification response.
        revokedBy: 'redacted',
      },
      message: 'This certificate has been revoked',
    };
  }

  /**
   * Builds reissued verification result
   */
  private buildReissuedResult(certificate: any): VerificationResult {
    const metadata = this.metadataGenerator.generate(
      certificate,
      certificate.course,
      certificate.student
    );

    const walletAddress = this.getWalletAddress(certificate.student, certificate.student.did);

    const onChainData = {
      tokenId: certificate.tokenId || '',
      owner: walletAddress,
      mintedAt: certificate.issuedAt,
      contractAddress: certificate.contractAddress || '',
      transactionHash: certificate.transactionHash || '',
      network: certificate.network || 'stellar-testnet',
    };

    return {
      isValid: false,
      certificate: metadata,
      status: CertificateStatus.REISSUED,
      onChainData,
      message: 'This certificate has been reissued. A newer version is available.',
    };
  }

  /**
   * Gets wallet address from student record or DID
   */
  private getWalletAddress(student: any, did?: string | null): string {
    if (student.walletAddress) {
      return student.walletAddress;
    }

    if (did) {
      const parts = did.split(':');
      if (parts.length === 3 && parts[0] === 'did' && parts[1] === 'stellar') {
        return parts[2] || '';
      }
    }

    return 'GUNKNOWN';
  }
}

export const verificationService = new VerificationService();
