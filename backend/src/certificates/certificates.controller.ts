import { Request, Response } from 'express';
import { certificateImageGenerator } from '../utils/certificateImageGenerator.js';
import logger from '../utils/logger.js';
import { buildPaginatedResponse, parsePaginationQuery } from '../utils/pagination.js';
import { qrCodeGenerator } from '../utils/qrCodeGenerator.js';
import {
  certificateAnalytics,
  certificateService,
  revocationService,
  verificationService,
  verifiableCredentialService,
} from './index.js';
import { UnauthorizedIssuerError } from './RevocationService.js';

/**
 * Helper to convert param to string
 */
function getStringParam(value: string | string[] | undefined): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.length > 0) return value[0] || '';
  return '';
}

function getStringQuery(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') return value[0];
  return undefined;
}

/**
 * Certificate Controller
 * Handles all certificate-related HTTP endpoints
 */
export class CertificateController {
  /**
   * GET /api/certificates/verify/:tokenId
   * Public endpoint for verifying a single certificate
   */
  async verifyCertificate(req: Request, res: Response): Promise<void> {
    try {
      const tokenId = getStringParam(req.params.tokenId);
      if (!tokenId) {
        res.status(400).json({ error: 'Token ID is required', isValid: false });
        return;
      }

      const result = await verificationService.verifyByTokenId(tokenId);
      verificationService.recordVerification(tokenId).catch(() => {});
      res.status(200).json(result);
    } catch (error) {
      logger.error(
        `Verification error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      res.status(500).json({ error: 'Failed to verify certificate', isValid: false });
    }
  }

  /**
   * POST /api/certificates/verify/batch
   * Batch verification endpoint (no auth required)
   */
  async batchVerify(req: Request, res: Response): Promise<void> {
    try {
      const { tokenIds } = req.body;
      if (!Array.isArray(tokenIds)) {
        res.status(400).json({ error: 'tokenIds must be an array' });
        return;
      }
      if (tokenIds.length > 100) {
        res.status(400).json({ error: 'Maximum 100 certificates allowed per batch verification' });
        return;
      }
      if (tokenIds.length === 0) {
        res.status(400).json({ error: 'tokenIds array cannot be empty' });
        return;
      }

      const results = await verificationService.batchVerify(tokenIds);
      res.status(200).json(results);
    } catch (error) {
      logger.error(
        `Batch verification error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      res.status(500).json({ error: 'Failed to perform batch verification' });
    }
  }

  /**
   * GET /api/certificates/:tokenId/metadata
   * Returns NFT-compliant metadata for a certificate
   */
  async getMetadata(req: Request, res: Response): Promise<void> {
    try {
      const tokenId = getStringParam(req.params.tokenId);
      if (!tokenId) {
        res.status(400).json({ error: 'Token ID is required' });
        return;
      }

      const metadata = await verificationService.getMetadata(tokenId);
      if (!metadata) {
        res.status(404).json({ error: 'Certificate not found' });
        return;
      }

      res.set('Content-Type', 'application/json');
      res.status(200).json(metadata);
    } catch (error) {
      logger.error(
        `Metadata fetch error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      res.status(500).json({ error: 'Failed to fetch certificate metadata' });
    }
  }

  /**
   * GET /api/certificates/:certificateId
   * Get full certificate details
   */
  async getCertificate(req: Request, res: Response): Promise<void> {
    try {
      const certificateId = getStringParam(req.params.certificateId);
      if (!certificateId) {
        res.status(400).json({ error: 'Certificate ID is required' });
        return;
      }

      const certificate = await certificateService.getCertificateById(certificateId);
      if (!certificate) {
        res.status(404).json({ error: 'Certificate not found' });
        return;
      }

      res.status(200).json(certificate);
    } catch (error) {
      logger.error(
        `Get certificate error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      res.status(500).json({ error: 'Failed to fetch certificate' });
    }
  }

  /**
   * GET /api/certificates/student/:studentId
   * Get all certificates for a student
   */
  async getCertificatesByStudent(req: Request, res: Response): Promise<void> {
    try {
      const studentId = getStringParam(req.params.studentId);
      if (!studentId) {
        res.status(400).json({ error: 'Student ID is required' });
        return;
      }

      const certificates = await certificateService.getCertificatesByStudent(studentId);
      res.status(200).json({ studentId, count: certificates.length, certificates });
    } catch (error) {
      logger.error(
        `Get student certificates error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      res.status(500).json({ error: 'Failed to fetch student certificates' });
    }
  }

  /**
   * POST /api/certificates
   * Mint a new certificate
   */
  async mintCertificate(req: Request, res: Response): Promise<void> {
    try {
      const { studentId, courseId, tokenId, grade, did } = req.body as {
        studentId: string;
        courseId: string;
        tokenId?: string;
        grade?: string;
        did?: string;
      };

      if (!studentId || !courseId) {
        res.status(400).json({ error: 'studentId and courseId are required' });
        return;
      }

      const issuerDid =
        process.env.ISSUER_DID ||
        'did:stellar:GBRPYHIL2CI3FYQMWVUGE62KMGOBQKLCYJ3HLKBUBIW5VZH4S4MNOWT';
      const contractAddress = process.env.CERTIFICATE_CONTRACT_ID || 'GUNKNOWNCONTRACT';
      const network = process.env.STELLAR_NETWORK || 'stellar-testnet';

      const mintData: Parameters<typeof certificateService.mintCertificate>[0] = {
        studentId,
        courseId,
      };
      if (tokenId) mintData.tokenId = tokenId;
      if (grade) mintData.grade = grade;
      if (did) mintData.did = did;

      const result = await certificateService.mintCertificate(
        mintData,
        issuerDid,
        contractAddress,
        network
      );

      logger.info(`Certificate minted: ${result.id}`, { certificateId: result.id });
      res.status(201).json({ success: true, certificate: result, metadata: result.metadata });
    } catch (error) {
      logger.error(
        `Mint certificate error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to mint certificate',
        success: false,
      });
    }
  }

  /**
   * PUT /api/certificates/:certificateId/revoke
   * Revoke a certificate
   */
  async revokeCertificate(req: Request, res: Response): Promise<void> {
    try {
      const certificateId = getStringParam(req.params.certificateId);
      const { reason, revokedBy } = req.body;

      if (!certificateId) {
        res.status(400).json({ error: 'Certificate ID is required' });
        return;
      }
      if (!reason) {
        res.status(400).json({ error: 'Revocation reason is required' });
        return;
      }
      if (!revokedBy) {
        res.status(400).json({ error: 'revokedBy is required' });
        return;
      }

      const result = await revocationService.revokeCertificate(certificateId, {
        certificateId,
        reason,
        revokedBy,
      });
      res
        .status(200)
        .json({ success: true, certificate: result, message: 'Certificate revoked successfully' });
    } catch (error) {
      logger.error(`Revoke error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      if (error instanceof UnauthorizedIssuerError) {
        res.status(403).json({ error: error.message });
        return;
      }
      res
        .status(500)
        .json({ error: error instanceof Error ? error.message : 'Failed to revoke certificate' });
    }
  }

  /**
   * POST /api/certificates/:certificateId/reissue
   * Reissue a certificate (updates existing)
   */
  async reissueCertificate(req: Request, res: Response): Promise<void> {
    try {
      const certificateId = getStringParam(req.params.certificateId);
      const { reason, newGrade, issuedBy } = req.body;

      if (!certificateId) {
        res.status(400).json({ error: 'Certificate ID is required' });
        return;
      }
      if (!reason) {
        res.status(400).json({ error: 'Reissuance reason is required' });
        return;
      }
      if (!issuedBy) {
        res.status(400).json({ error: 'issuedBy is required' });
        return;
      }

      const result = await revocationService.reissueCertificate({
        certificateId,
        reason,
        newGrade,
        issuedBy,
      });
      res.status(200).json({
        success: true,
        original: result.original,
        newCertificate: result.new,
        message: 'Certificate reissued successfully',
      });
    } catch (error) {
      logger.error(`Reissue error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      if (error instanceof UnauthorizedIssuerError) {
        res.status(403).json({ error: error.message });
        return;
      }
      res
        .status(500)
        .json({ error: error instanceof Error ? error.message : 'Failed to reissue certificate' });
    }
  }

  /**
   * GET /api/certificates
   * List all certificates (with pagination)
   */
  async listCertificates(req: Request, res: Response): Promise<void> {
    try {
      const pagination = parsePaginationQuery(req, { defaultPageSize: 50, maxPageSize: 100 });
      const status = getStringQuery(req.query.status);

      if (status) {
        const result = await certificateService.getCertificatesByStatus(status, pagination.pageSize, pagination.offset);
        const paginationMetadata = buildPaginatedResponse(result.certificates, result.total, pagination.page, pagination.pageSize, pagination.offset);
        res.status(200).json({
          certificates: result.certificates,
          total: result.total,
          pagination: paginationMetadata.pagination,
        });
        return;
      }

      const result = await certificateService.getAllCertificates(pagination.pageSize, pagination.offset);
      res.status(200).json({
        certificates: result.certificates,
        total: result.total,
        pagination: buildPaginatedResponse(result.certificates, result.total, pagination.page, pagination.pageSize, pagination.offset).pagination,
      });
    } catch (error) {
      logger.error(
        `List certificates error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      const message = error instanceof Error ? error.message : 'Failed to fetch certificates';
      res.status(message.includes('Page') || message.includes('Offset') ? 400 : 500).json({ error: message });
    }
  }

  /**
   * GET /api/certificates/analytics
   * Get certificate analytics (admin)
   */
  async getAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const analytics = await certificateAnalytics.getAnalytics();
      res.status(200).json(analytics);
    } catch (error) {
      logger.error(`Analytics error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  }

  /**
   * GET /api/certificates/:id/image
   * Generate certificate image
   */
  async getCertificateImage(req: Request, res: Response): Promise<void> {
    try {
      const id = getStringParam(req.params.id);
      if (!id) {
        res.status(400).json({ error: 'Certificate ID is required' });
        return;
      }

      const certificate = await certificateService.getCertificateById(id);
      if (!certificate) {
        res.status(404).json({ error: 'Certificate not found' });
        return;
      }

      const imageOptions: Parameters<typeof certificateImageGenerator.generateCertificateImage>[0] = {
        studentName: certificate.student
          ? `${certificate.student.firstName} ${certificate.student.lastName}`.trim()
          : 'Student',
        courseTitle: certificate.course?.title || 'Course',
        instructor: certificate.course?.instructor || 'Instructor',
        completionDate: certificate.issuedAt.toISOString(),
        credentialId: certificate.tokenId || id,
        issuerName: process.env.ISSUER_NAME || 'Web3 Student Lab',
      };
      if (certificate.grade) {
        imageOptions.grade = certificate.grade;
      }
      const imageBuffer = await certificateImageGenerator.generateCertificateImage(imageOptions);

      res.set('Content-Type', 'image/svg+xml');
      res.status(200).send(imageBuffer);
    } catch (error) {
      logger.error(
        `Image generation error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      res.status(500).json({ error: 'Failed to generate certificate image' });
    }
  }

  /**
   * GET /api/certificates/:id/qr
   * Generate QR code for certificate
   */
  async getQRCode(req: Request, res: Response): Promise<void> {
    try {
      const id = getStringParam(req.params.id);
      if (!id) {
        res.status(400).json({ error: 'Certificate ID is required' });
        return;
      }

      const certificate = await certificateService.getCertificateById(id);
      if (!certificate) {
        res.status(404).json({ error: 'Certificate not found' });
        return;
      }

      const qrDataUrl = await qrCodeGenerator.generateCertificateVerificationQR(
        certificate.tokenId || certificate.id
      );
      res.set('Content-Type', 'image/png');
      const base64Data = qrDataUrl.replace(/^data:image\/png;base64,/, '');
      res.status(200).send(Buffer.from(base64Data, 'base64'));
    } catch (error) {
      logger.error(
        `QR generation error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      res.status(500).json({ error: 'Failed to generate QR code' });
    }
  }

  /**
   * POST /api/certificates/merkle/anchor
   * Anchor a cohort Merkle root on-chain
   */
  async anchorMerkleCohort(req: Request, res: Response): Promise<void> {
    try {
      const { cohortId, rootHash } = req.body;
      if (!cohortId || !rootHash) {
        res.status(400).json({ error: 'cohortId and rootHash are required' });
        return;
      }

      const result = await certificateService.anchorMerkleCohort(cohortId, rootHash);
      res.status(200).json(result);
    } catch (error) {
      logger.error(`Merkle anchor error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      res.status(500).json({ error: 'Failed to anchor Merkle cohort' });
    }
  }

  /**
   * POST /api/certificates/merkle/verify
   * Verify Merkle inclusion proof against anchored root
   */
  async verifyMerkleInclusion(req: Request, res: Response): Promise<void> {
    try {
      const { cohortId, leafHash, proof } = req.body;
      if (!cohortId || !leafHash || !Array.isArray(proof)) {
        res.status(400).json({ error: 'cohortId, leafHash, and proof array are required' });
        return;
      }

      const result = await certificateService.verifyMerkleInclusion(cohortId, leafHash, proof);
      res.status(200).json(result);
    } catch (error) {
      logger.error(`Merkle verify error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      res.status(500).json({ error: 'Failed to verify Merkle inclusion' });
    }
  }

  /**
   * GET /api/certificates/:id/openbadges
   * Export OpenBadges v3.0 JSON-LD credential package
   */
  async exportOpenBadges(req: Request, res: Response): Promise<void> {
    try {
      const id = getStringParam(req.params.id);
      if (!id) {
        res.status(400).json({ error: 'Certificate ID is required' });
        return;
      }

      const badge = await certificateService.exportOpenBadges(id);
      if (!badge) {
        res.status(404).json({ error: 'Certificate not found or not eligible for export' });
        return;
      }

      res.set('Content-Type', 'application/ld+json');
      res.set('Cache-Control', 'public, max-age=86400, immutable');
      res.status(200).json(badge);
    } catch (error) {
      logger.error(`OpenBadges export error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      res.status(500).json({ error: 'Failed to export OpenBadges package' });
    }
  }

  /**
   * GET /api/certificates/:id/vc
   * Issue a signed W3C Verifiable Credential v2.0 for a course completion.
   * Public; returns application/ld+json so wallets can import the package.
   */
  async issueVerifiableCredential(req: Request, res: Response): Promise<void> {
    try {
      const id = getStringParam(req.params.id);
      if (!id) {
        res.status(400).json({ error: 'Certificate ID is required' });
        return;
      }

      const credential = await verifiableCredentialService.issueCredential(id);
      if (!credential) {
        res.status(404).json({ error: 'Certificate not found' });
        return;
      }

      res.set('Content-Type', 'application/ld+json');
      res.set('Content-Disposition', `inline; filename="vc-${id}.jsonld"`);
      res.set('Cache-Control', 'public, max-age=86400, immutable');
      res.status(200).json(credential);
    } catch (error) {
      logger.error(`VC issue error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      res.status(500).json({ error: 'Failed to issue Verifiable Credential' });
    }
  }

  /**
   * GET /api/certificates/:id/vc/download
   * Download the W3C VC v2.0 package as an attachment for wallet import.
   */
  async downloadVerifiableCredential(req: Request, res: Response): Promise<void> {
    try {
      const id = getStringParam(req.params.id);
      if (!id) {
        res.status(400).json({ error: 'Certificate ID is required' });
        return;
      }

      const credential = await verifiableCredentialService.issueCredential(id);
      if (!credential) {
        res.status(404).json({ error: 'Certificate not found' });
        return;
      }

      res.set('Content-Type', 'application/ld+json');
      res.set('Content-Disposition', `attachment; filename="credential-${id}.jsonld"`);
      res.status(200).json(credential);
    } catch (error) {
      logger.error(`VC download error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      res.status(500).json({ error: 'Failed to download Verifiable Credential' });
    }
  }

  /**
   * POST /api/certificates/vc/verify
   * Verify a submitted W3C VC: resolves the issuer DID, verifies the
   * Ed25519Signature2020 proof, and rejects tampered/forged/revoked
   * credentials.
   */
  async verifyVerifiableCredential(req: Request, res: Response): Promise<void> {
    try {
      const { credential } = req.body ?? {};
      if (!credential || typeof credential !== 'object') {
        res.status(400).json({ valid: false, error: 'credential object is required' });
        return;
      }

      const result = await verifiableCredentialService.verifyCredential(credential);
      res.status(result.valid ? 200 : 422).json(result);
    } catch (error) {
      logger.error(`VC verify error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      res.status(500).json({ valid: false, error: 'Failed to verify Verifiable Credential' });
    }
  }

  /**
   * GET /api/certificates/vc/issuer
   * Return the issuer DID document (JSON-LD) with the Ed25519 verification key.
   */
  async getVcIssuerDidDocument(_req: Request, res: Response): Promise<void> {
    try {
      const doc = verifiableCredentialService.getIssuerDidDocument();
      res.set('Content-Type', 'application/ld+json');
      res.set('Cache-Control', 'public, max-age=3600');
      res.status(200).json(doc);
    } catch (error) {
      logger.error(`VC issuer doc error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      res.status(500).json({ error: 'Failed to fetch issuer DID document' });
    }
  }
}

export const certificateController = new CertificateController();
