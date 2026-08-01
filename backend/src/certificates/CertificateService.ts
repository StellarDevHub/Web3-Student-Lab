import prisma from '../db/index.js';
import { storageService } from '../services/storage/index.js';
import { certificateBlockchainService } from '../blockchain/CertificateBlockchainService.js';
import {
    Certificate,
    CertificateMetadata,
    MintCertificateRequest,
    VerificationResult,
} from '../types/certificate.types.js';
import { certificateImageGenerator } from '../utils/certificateImageGenerator.js';
import logger from '../utils/logger.js';
import { MetadataGenerator } from './MetadataGenerator.js';
import { computeCertificateContentHash, verifyCertificateContentHash } from './ContentHash.js';

export class CertificateService {
  private metadataGenerator: MetadataGenerator;

  constructor() {
    this.metadataGenerator = new MetadataGenerator();
  }

  /**
   * Mints a new certificate for a student after course completion
   * On-chain integration: mints NFT via Soroban contract
   */
  async mintCertificate(
    request: MintCertificateRequest,
    issuerDid: string,
    contractAddress: string,
    network: string
  ): Promise<Certificate & { metadata: CertificateMetadata }> {
    const { studentId, courseId, grade, tokenId, did } = request;

    // Validate student exists
    const student = await prisma.student.findUnique({
      where: { id: studentId },
    });

    if (!student) {
      throw new Error(`Student with ID ${studentId} not found`);
    }

    // Validate course exists
    const course = await prisma.course.findUnique({
      where: { id: courseId },
    });

    if (!course) {
      throw new Error(`Course with ID ${courseId} not found`);
    }

    // Check enrollment status - student must be enrolled
    const enrollment = await prisma.enrollment.findUnique({
      where: {
        studentId_courseId: {
          studentId,
          courseId,
        },
      },
    });

    if (!enrollment) {
      throw new Error(`Student ${studentId} is not enrolled in course ${courseId}`);
    }

    // Generate certificate ID
    const certificateId = `cert-${studentId.substring(0, 8)}-${courseId.substring(0, 8)}-${Date.now()}`;

    // Generate tokenId if not provided
    const tokenIdValue = tokenId || Math.floor(Math.random() * 1000000).toString();

    // Create certificate record before minting (so we have the ID for metadata)
    const certificate = await prisma.certificate.create({
      data: {
        id: certificateId,
        studentId,
        courseId,
        tokenId: tokenIdValue,
        issuedAt: new Date(),
        certificateHash: null,
        status: 'MINTED',
        did: did || issuerDid,
        contractAddress,
        network,
        grade: grade || null,
      },
      include: {
        student: true,
        course: true,
      },
    });

    let metadata: CertificateMetadata | undefined;

    try {
      // Generate and pin the certificate image and metadata to decentralized storage
      const imageBuffer = await certificateImageGenerator.generateCertificateImage({
        studentName: `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'Student',
        courseTitle: course.title,
        instructor: course.instructor,
        completionDate: certificate.issuedAt.toISOString(),
        grade: certificate.grade || undefined,
        credentialId: certificate.tokenId || tokenIdValue,
        issuerName: process.env.ISSUER_NAME || 'Web3 Student Lab',
      });

      const imageAsset = await storageService.pinCertificateImage({
        certificateId: certificateId,
        content: imageBuffer,
        mimeType: 'image/svg+xml',
      });

      metadata = this.metadataGenerator.generate(certificate, course, student, {
        imageUri: imageAsset.ipfsUri,
        externalUrl: `${process.env.API_BASE_URL || 'http://localhost:8080'}/api/v1/certificates/${
          certificate.tokenId || tokenIdValue
        }/metadata`,
      });

      if (!metadata) {
        logger.error(`Failed to generate metadata for certificate ${certificateId}`);
        throw new Error('Failed to generate certificate metadata');
      }

      const metadataAsset = await storageService.pinCertificateMetadata({
        certificateId: certificateId,
        content: metadata,
      });

      // Call blockchain service to mint actual NFT
      const mintResult = await certificateBlockchainService.mintCertificate(metadata);

      const finalTokenId = mintResult.tokenId || tokenIdValue;

      // Compute the immutable content-integrity hash from the final,
      // post-mint certificate fields. This hash binds the certificate
      // metadata to a deterministic fingerprint that is re-verified on
      // every retrieval/verification so tampering with stored fields
      // can be detected instead of silently served.
      const contentHash = computeCertificateContentHash({
        id: certificateId,
        studentId: certificate.studentId,
        courseId: certificate.courseId,
        tokenId: finalTokenId,
        grade: certificate.grade,
        did: certificate.did,
        issuedAt: certificate.issuedAt,
      });

      // Update certificate with blockchain transaction details
      await prisma.certificate.update({
        where: { id: certificateId },
        data: {
          certificateHash: mintResult.transactionHash,
          contractAddress: mintResult.contractAddress,
          status: 'ACTIVE',
          metadataUri: metadataAsset.ipfsUri,
          tokenId: finalTokenId,
          contentHash,
        },
      });

      // Update returned certificate
      certificate.certificateHash = mintResult.transactionHash;
      certificate.contractAddress = mintResult.contractAddress;
      certificate.status = 'ACTIVE' as any;
      certificate.tokenId = finalTokenId;
      certificate.contentHash = contentHash;

      logger.info(`Certificate minted on-chain: ${certificateId} -> token ${mintResult.tokenId}`, {
        certificateId,
        tokenId: mintResult.tokenId,
        txHash: mintResult.transactionHash,
      });
    } catch (error) {
      logger.error(`Certificate issuance failed for ${certificateId}:`, error);
      await prisma.certificate.update({
        where: { id: certificateId },
        data: {
          status: 'FAILED',
        },
      });
      await storageService.releaseResource('certificate', certificateId);
      throw new Error(
        `Failed to mint certificate: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    // Return certificate with metadata
    return { ...certificate, metadata };
  }

  /**
   * Verifies a certificate by token ID - main verification endpoint
   */
  async verifyCertificate(tokenId: string): Promise<VerificationResult['onChainData']> {
    // Find certificate in database
    const certificate = await prisma.certificate.findFirst({
      where: { tokenId },
      include: {
        student: {
          select: {
            walletAddress: true,
            did: true,
          },
        },
        course: true,
      },
    });

    if (!certificate) {
      throw new Error('Certificate not found');
    }

    // Get student wallet address
    const walletAddress =
      certificate.student.walletAddress || this.extractWalletFromDid(certificate.student.did);

    // Return verification result
    return {
      tokenId: certificate.tokenId || '',
      owner: walletAddress,
      mintedAt: certificate.issuedAt,
      contractAddress: certificate.contractAddress || '',
      transactionHash: certificate.transactionHash || certificate.certificateHash || '',
      network: certificate.network || 'stellar-testnet',
    };
  }

  /**
   * Verifies a certificate by certificate ID (public endpoint)
   */
  async verifyCertificateById(certificateId: string): Promise<VerificationResult> {
    const certificate = await prisma.certificate.findUnique({
      where: { id: certificateId },
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
        status: 'invalid' as any,
        onChainData: null,
        message: 'Certificate not found',
      };
    }

    const walletAddress =
      certificate.student.walletAddress || this.extractWalletFromDid(certificate.student.did);

    // Re-verify the content hash on every retrieval. If the stored
    // metadata no longer matches the hash recorded at mint time, we
    // must surface a tamper-detected result rather than silently
    // returning the (possibly altered) data as valid.
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
      logger.error(`Certificate integrity check failed for ${certificateId}`, {
        certificateId,
        expectedHash: hashCheck.expected,
        actualHash: hashCheck.actual,
      });
      return {
        isValid: false,
        certificate: null,
        status: 'TAMPERED' as any,
        onChainData: null,
        message: 'Certificate integrity check failed: stored metadata does not match its content hash',
      };
    }

    const metadata = this.metadataGenerator.generate(
      certificate as any,
      certificate.course as any,
      certificate.student as any
    );

    const onChainData: VerificationResult['onChainData'] = {
      tokenId: certificate.tokenId || '',
      owner: walletAddress,
      mintedAt: certificate.issuedAt,
      contractAddress: certificate.contractAddress || '',
      transactionHash: certificate.transactionHash || certificate.certificateHash || '',
      network: certificate.network || 'stellar-testnet',
    };

    const result: VerificationResult = {
      isValid: certificate.status === 'ACTIVE',
      certificate: metadata,
      status: certificate.status as any,
      onChainData,
    };

    if (certificate.status === 'REVOKED') {
      result.revocationInfo = {
        revokedAt: certificate.revokedAt!,
        reason: certificate.revocationReason!,
        // NOTE: revokedBy (the actor's issuer DID) is intentionally
        // redacted from this public-facing verification response —
        // see VerificationService for the canonical public surface.
        revokedBy: 'redacted',
      };
    }

    return result;
  }

  /**
   * Batch verification for multiple certificates
   */
  async batchVerify(tokenIds: string[]): Promise<VerificationResult[]> {
    if (tokenIds.length > 100) {
      throw new Error('Maximum 100 certificates allowed per batch verification');
    }

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

    const certMap = new Map<string, typeof certificates[number]>(
      certificates
        .filter((c): c is typeof certificates[number] => typeof c.tokenId === 'string')
        .map((c) => [c.tokenId, c] as const)
    );

    const results: VerificationResult[] = [];

    for (const tokenId of tokenIds) {
      const cert = certMap.get(tokenId);

      if (!cert) {
        results.push({
          isValid: false,
          certificate: null,
          status: 'invalid' as any,
          onChainData: null,
          message: 'Certificate not found',
        });
        continue;
      }

      const walletAddress =
        cert.student.walletAddress || this.extractWalletFromDid(cert.student.did);
      const metadata = this.metadataGenerator.generate(cert as any, cert.course as any, cert.student as any);

      const onChainData: VerificationResult['onChainData'] = {
        tokenId: cert.tokenId || '',
        owner: walletAddress,
        mintedAt: cert.issuedAt,
        contractAddress: cert.contractAddress || '',
        transactionHash: cert.transactionHash || cert.certificateHash || '',
        network: cert.network || 'stellar-testnet',
      };

      results.push({
        isValid: cert.status === 'ACTIVE',
        certificate: metadata,
        status: cert.status as any,
        onChainData,
      });
    }

    return results;
  }

  /**
   * Gets metadata for a certificate by token ID
   */
  async getMetadata(tokenId: string): Promise<CertificateMetadata | null> {
    const certificate = await prisma.certificate.findFirst({
      where: { tokenId },
      include: {
        student: {
          select: {
            id: true,
            email: true,
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
      return null;
    }

    return this.metadataGenerator.generate(certificate, certificate.course!, certificate.student);
  }

  /**
   * Gets full certificate with all details
   */
  async getCertificateById(certificateId: string): Promise<Certificate | null> {
    return await prisma.certificate.findUnique({
      where: { id: certificateId },
      include: {
        student: {
          select: {
            id: true,
            email: true,
            walletAddress: true,
            did: true,
            firstName: true,
            lastName: true,
          },
        },
        course: true,
      },
    });
  }

  /**
   * Gets certificates by student
   */
  async getCertificatesByStudent(
    studentId: string
  ): Promise<Array<Certificate & { metadata: CertificateMetadata }>> {
    const certificates = await prisma.certificate.findMany({
      where: { studentId },
      include: {
        student: {
          select: {
            id: true,
            email: true,
            walletAddress: true,
            did: true,
            firstName: true,
            lastName: true,
          },
        },
        course: true,
      },
      orderBy: { issuedAt: 'desc' },
    });

    return certificates.map((cert) => ({
      ...cert,
      metadata: this.metadataGenerator.generate(cert, cert.course!, cert.student),
    }));
  }

  /**
   * Gets certificates by status (for admin/issuer)
   */
  async getCertificatesByStatus(
    status: string,
    limit = 50,
    offset = 0
  ): Promise<{ certificates: Certificate[]; total: number }> {
    const [certificates, total] = await Promise.all([
      prisma.certificate.findMany({
        where: { status },
        include: {
          student: {
            select: {
              id: true,
              email: true,
              walletAddress: true,
              did: true,
              firstName: true,
              lastName: true,
            },
          },
          course: true,
        },
        orderBy: { issuedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.certificate.count({ where: { status } }),
    ]);

    return { certificates, total };
  }

  /**
   * Gets all certificates with pagination
   */
  async getAllCertificates(
    limit = 50,
    offset = 0
  ): Promise<{
    certificates: Certificate[];
    total: number;
  }> {
    const [certificates, total] = await Promise.all([
      prisma.certificate.findMany({
        include: {
          student: {
            select: {
              id: true,
              email: true,
              walletAddress: true,
              did: true,
              firstName: true,
              lastName: true,
            },
          },
          course: true,
        },
        orderBy: { issuedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.certificate.count(),
    ]);

    return { certificates, total };
  }

  /**
   * Get analytics for certificates
   */
  async getAnalytics() {
    const totalCertificates = await prisma.certificate.count();
    const byStatusRaw = await prisma.certificate.groupBy({
      by: ['status'],
      _count: { status: true },
    });

    const byStatus = byStatusRaw.reduce(
      (acc, item) => {
        acc[item.status] = item._count.status;
        return acc;
      },
      {} as Record<string, number>
    );

    const uniqueStudents = await prisma.certificate.groupBy({
      by: ['studentId'],
      _count: { studentId: true },
    });

    const uniqueCourses = await prisma.certificate.groupBy({
      by: ['courseId'],
      _count: { courseId: true },
    });

    const revokedCount = byStatus['REVOKED'] || 0;
    const revocationRate = totalCertificates > 0 ? revokedCount / totalCertificates : 0;

    return {
      totalCertificates,
      byStatus,
      totalVerifications: 0,
      uniqueStudents: uniqueStudents.length,
      uniqueCourses: uniqueCourses.length,
      revocationRate,
      issuedThisMonth: 0,
      issuedThisWeek: 0,
      issuedToday: 0,
    };
  }

  /**
   * Revokes a certificate by ID (delegated to RevocationService)
   */
  async revokeCertificate(
    certificateId: string,
    reason: string,
    revokedBy: string
  ): Promise<Certificate> {
    const { revocationService } = await import('./RevocationService.js');
    return revocationService.revokeCertificate(certificateId, {
      certificateId,
      reason,
      revokedBy,
    });
  }

  /**
   * Reissues a certificate (delegated to RevocationService)
   */
  async reissueCertificate(
    certificateId: string,
    reason: string,
    newGrade: string,
    issuedBy: string
  ): Promise<{ original: Certificate; new: Certificate }> {
    const { revocationService } = await import('./RevocationService.js');
    return revocationService.reissueCertificate({
      certificateId,
      reason,
      newGrade,
      issuedBy,
    });
  }

  /**
   * Extracts wallet address from DID string
   */
  private extractWalletFromDid(did?: string | null): string {
    if (!did) return 'GUNKNOWNWALLETADDRESS';

    const parts = did.split(':');
    if (parts.length === 3 && parts[0] === 'did' && parts[1] === 'stellar') {
      return parts[2] || '';
    }
    return 'GUNKNOWNWALLETADDRESS';
  }
}

export const certificateService = new CertificateService();
