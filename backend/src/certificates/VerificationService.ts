import prisma from '../db/index.js';
import {
  VerificationResult,
  CertificateMetadata,
  CertificateStatus,
} from '../types/certificate.types.js';
import { CertificateService } from './CertificateService.js';
import { MetadataGenerator } from './MetadataGenerator.js';
import logger from '../utils/logger.js';

export class VerificationService {
  private certificateService: CertificateService;
  private metadataGenerator: MetadataGenerator;

  constructor() {
    this.certificateService = new CertificateService();
    this.metadataGenerator = new MetadataGenerator();
  }

  /**
   * Verifies a single certificate by token ID
   * Public endpoint - no authentication required
   */
  async verifyByTokenId(tokenId: string): Promise<VerificationResult> {
    try {
      // Find certificate
      const certificate = await prisma.certificate.findFirst({
        where: { tokenId },
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

    // Fetch all certificates in a single query
    const certificates = await prisma.certificate.findMany({
      where: {
        tokenId: {
          in: tokenIds,
        },
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

    // Create a map for O(1) lookup
    const certMap = new Map(certificates.map((c) => [c.tokenId, c]));

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
    return this.certificateService.getMetadata(tokenId);
  }

  /**
   * Records a verification event for analytics
   */
  async recordVerification(tokenId: string): Promise<void> {
    // In a full implementation, log to analytics table
    logger.debug(`Certificate verified: ${tokenId}`);
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
        revokedBy: certificate.revokedBy!,
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
