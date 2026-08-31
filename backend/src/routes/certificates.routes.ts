import { Router } from 'express';
import { certificateController } from '../certificates/index.js';
import { validate } from '../middleware/validation.js';
import {
  MintCertificateSchema,
  RevokeCertificateSchema,
  ReissueCertificateSchema,
  BatchVerificationSchema,
} from './certificates/validation.schemas.js';
import explorerRouter from './certificates/explorer.routes.js';
import { certificatePdfGenerator } from '../certificates/PdfGenerator.js';
import prisma from '../db/index.js';
import logger from '../utils/logger.js';

const router: ReturnType<typeof Router> = Router();

// Mount public analytics explorer under /certificates/explorer
router.use('/explorer', explorerRouter);

/**
 * @route   GET /api/v1/certificates/:certificateId/download.pdf
 * @desc    Download a signed PDF diploma for a certificate.
 * @access  Public
 */
router.get('/:certificateId/download.pdf', async (req, res) => {
  try {
    const { certificateId } = req.params;

    const cert = await prisma.certificate.findUnique({
      where: { id: certificateId },
      include: {
        student: { select: { firstName: true, lastName: true } },
        course: { select: { title: true, instructor: true } },
      },
    });

    if (!cert) {
      return res.status(404).json({ status: 'error', message: 'Certificate not found' });
    }

    const studentName = cert.student
      ? `${cert.student.firstName || ''} ${cert.student.lastName || ''}`.trim()
      : 'Unknown Student';

    const result = await certificatePdfGenerator.generatePdf({
      studentName,
      courseTitle: cert.course?.title ?? 'Unknown Course',
      instructor: cert.course?.instructor ?? 'Unknown Instructor',
      issuedAt: cert.issuedAt.toISOString(),
      certificateId: cert.id,
      grade: cert.grade ?? undefined,
    });

    const filename = `certificate-${cert.id}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Certificate-Signature', result.signature);
    res.setHeader('X-Certificate-Public-Key', result.publicKeyHex);
    res.setHeader('X-Certificate-SHA256', result.sha256);
    return res.send(Buffer.from(result.pdfBytes));
  } catch (error) {
    logger.error('[CertificatesRoutes] PDF download failed', { error });
    return res.status(500).json({ status: 'error', message: 'PDF generation failed' });
  }
});

/**
 * Certificate Routes
 *
 * Validation middleware is applied to all mutating endpoints using Zod schemas.
 * The `validate()` factory parses req.body against the schema and returns 400
 * with structured error messages on failure, preventing invalid data from
 * reaching the controller layer.
 */

/**
 * @openapi
 * /api/v1/certificates/verify/{tokenId}:
 *   get:
 *     summary: Verify a certificate by token ID
 *     description: Public endpoint to verify the authenticity and status of a certificate NFT.
 *     tags: [Certificates]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: tokenId
 *         required: true
 *         schema:
 *           type: string
 *         description: NFT token ID of the certificate
 *     responses:
 *       200:
 *         description: Certificate verification result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 valid:
 *                   type: boolean
 *                 certificate:
 *                   $ref: '#/components/schemas/Certificate'
 *       404:
 *         description: Certificate not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/verify/:tokenId', certificateController.verifyCertificate.bind(certificateController));

/**
 * @openapi
 * /api/v1/certificates/verify/batch:
 *   post:
 *     summary: Batch verify certificates
 *     description: Verify multiple certificate token IDs in a single request (up to 100).
 *     tags: [Certificates]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tokenIds]
 *             properties:
 *               tokenIds:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 100
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Batch verification results
 *       400:
 *         description: Invalid request body
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
  '/verify/batch',
  validate(BatchVerificationSchema),
  certificateController.batchVerify.bind(certificateController)
);

/**
 * @openapi
 * /api/v1/certificates/{tokenId}/metadata:
 *   get:
 *     summary: Get NFT metadata for a certificate
 *     description: Returns Stellar NFT metadata for the certificate token.
 *     tags: [Certificates]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: tokenId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: NFT metadata
 *       404:
 *         description: Token not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:tokenId/metadata', certificateController.getMetadata.bind(certificateController));

/**
 * @openapi
 * /api/v1/certificates/analytics:
 *   get:
 *     summary: Get certificate analytics
 *     description: Returns aggregate statistics about certificates (minted, revoked, active).
 *     tags: [Certificates]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Certificate analytics data
 *       401:
 *         description: Missing or invalid authentication token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/analytics', certificateController.getAnalytics.bind(certificateController));

/**
 * @openapi
 * /api/v1/certificates/{certificateId}:
 *   get:
 *     summary: Get certificate by ID
 *     description: Returns full certificate details including metadata, status, and verification info.
 *     tags: [Certificates]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: certificateId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Certificate details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Certificate'
 *       404:
 *         description: Certificate not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:certificateId', certificateController.getCertificate.bind(certificateController));

/**
 * @openapi
 * /api/v1/certificates/student/{studentId}:
 *   get:
 *     summary: Get certificates by student
 *     description: Returns all certificates issued to a specific student.
 *     tags: [Certificates]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of student certificates
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 certificates:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Certificate'
 */
router.get(
  '/student/:studentId',
  certificateController.getCertificatesByStudent.bind(certificateController)
);

/**
 * @openapi
 * /api/v1/certificates:
 *   post:
 *     summary: Mint a new certificate
 *     description: Creates and mints a new certificate NFT on the Stellar blockchain.
 *     tags: [Certificates]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [studentId, courseId]
 *             properties:
 *               studentId:
 *                 type: string
 *                 description: Student identifier
 *               courseId:
 *                 type: string
 *                 description: Course identifier
 *               tokenId:
 *                 type: string
 *                 description: Optional custom token ID
 *               grade:
 *                 type: string
 *                 description: Optional grade (e.g., "A+")
 *               did:
 *                 type: string
 *                 description: Optional decentralized identifier
 *     responses:
 *       201:
 *         description: Certificate minted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Certificate'
 *       400:
 *         description: Invalid request body
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Missing or invalid authentication token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
  '/',
  validate(MintCertificateSchema),
  certificateController.mintCertificate.bind(certificateController)
);

/**
 * @openapi
 * /api/v1/certificates/{certificateId}/revoke:
 *   put:
 *     summary: Revoke a certificate
 *     description: Revokes an existing certificate, marking it as invalid on-chain.
 *     tags: [Certificates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: certificateId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [certificateId, reason, revokedBy]
 *             properties:
 *               certificateId:
 *                 type: string
 *               reason:
 *                 type: string
 *                 maxLength: 500
 *                 description: Reason for revocation
 *               revokedBy:
 *                 type: string
 *                 description: DID of the revoking authority
 *     responses:
 *       200:
 *         description: Certificate revoked
 *       400:
 *         description: Invalid request body
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Missing or invalid authentication token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.put(
  '/:certificateId/revoke',
  validate(RevokeCertificateSchema),
  certificateController.revokeCertificate.bind(certificateController)
);

/**
 * @openapi
 * /api/v1/certificates/{certificateId}/reissue:
 *   post:
 *     summary: Reissue a certificate
 *     description: Reissues a previously revoked certificate with optional grade update.
 *     tags: [Certificates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: certificateId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [certificateId, reason, issuedBy]
 *             properties:
 *               certificateId:
 *                 type: string
 *               reason:
 *                 type: string
 *                 maxLength: 500
 *               newGrade:
 *                 type: string
 *                 description: Optional updated grade
 *               issuedBy:
 *                 type: string
 *                 description: DID of the issuing authority
 *     responses:
 *       200:
 *         description: Certificate reissued
 *       400:
 *         description: Invalid request body
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Missing or invalid authentication token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
  '/:certificateId/reissue',
  validate(ReissueCertificateSchema),
  certificateController.reissueCertificate.bind(certificateController)
);

/**
 * @openapi
 * /api/v1/certificates:
 *   get:
 *     summary: List and filter certificates
 *     description: Returns a paginated, filterable list of certificates.
 *     tags: [Certificates]
 *     security: []
 *     responses:
 *       200:
 *         description: List of certificates
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 certificates:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Certificate'
 */
router.get('/', certificateController.listCertificates.bind(certificateController));

/**
 * @openapi
 * /api/v1/certificates/{id}/image:
 *   get:
 *     summary: Generate certificate image
 *     description: Returns a generated certificate image (PNG).
 *     tags: [Certificates]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Certificate image
 *         content:
 *           image/png:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Certificate not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id/image', certificateController.getCertificateImage.bind(certificateController));

/**
 * @openapi
 * /api/v1/certificates/{id}/qr:
 *   get:
 *     summary: Generate certificate QR code
 *     description: Returns a QR code (PNG/SVG) linking to the certificate verification page.
 *     tags: [Certificates]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: QR code image
 *         content:
 *           image/png:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Certificate not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id/qr', certificateController.getQRCode.bind(certificateController));

/**
 * @openapi
 * /api/v1/certificates/merkle/anchor:
 *   post:
 *     summary: Anchor cohort Merkle root
 *     description: Anchors a Merkle root hash for a graduation cohort on-chain.
 *     tags: [Certificates]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [cohortId, rootHash]
 *             properties:
 *               cohortId:
 *                 type: string
 *               rootHash:
 *                 type: string
 *     responses:
 *       200:
 *         description: Merkle root anchored
 *       400:
 *         description: Invalid request body
 *       401:
 *         description: Missing or invalid authentication token
 */
router.post(
  '/merkle/anchor',
  validate(AnchorMerkleCohortSchema),
  certificateController.anchorMerkleCohort.bind(certificateController)
);

/**
 * @openapi
 * /api/v1/certificates/merkle/verify:
 *   post:
 *     summary: Verify Merkle inclusion proof
 *     description: Validates a leaf hash against an anchored cohort Merkle root using inclusion proof.
 *     tags: [Certificates]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [cohortId, leafHash, proof]
 *             properties:
 *               cohortId:
 *                 type: string
 *               leafHash:
 *                 type: string
 *               proof:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Inclusion proof verification result
 *       400:
 *         description: Invalid request body
 */
router.post(
  '/merkle/verify',
  validate(VerifyMerkleInclusionSchema),
  certificateController.verifyMerkleInclusion.bind(certificateController)
);

/**
 * @openapi
 * /api/v1/certificates/{id}/openbadges:
 *   get:
 *     summary: Export OpenBadges v3.0 JSON-LD
 *     description: Returns an OpenBadges v3.0 compliant JSON-LD credential package.
 *     tags: [Certificates]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [json-ld, assertion]
 *         description: Export format
 *     responses:
 *       200:
 *         description: OpenBadges v3.0 JSON-LD package
 *         content:
 *           application/ld+json:
 *             schema:
 *               type: object
 *       404:
 *         description: Certificate not found
 */
router.get('/:id/openbadges', certificateController.exportOpenBadges.bind(certificateController));

/**
 * @openapi
 * /api/v1/certificates/{id}/vc:
 *   get:
 *     summary: Issue a W3C Verifiable Credential v2.0
 *     description: Returns a signed W3C VC v2.0 course-completion credential (Ed25519Signature2020).
 *     tags: [Certificates]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: W3C Verifiable Credential v2.0 (JSON-LD)
 *         content:
 *           application/ld+json:
 *             schema:
 *               type: object
 *       404:
 *         description: Certificate not found
 */
router.get('/:id/vc', certificateController.issueVerifiableCredential.bind(certificateController));

/**
 * @openapi
 * /api/v1/certificates/{id}/vc/download:
 *   get:
 *     summary: Download a W3C Verifiable Credential v2.0 package
 *     description: Downloads the signed VC as an attachment for wallet import.
 *     tags: [Certificates]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: W3C Verifiable Credential package (attachment)
 *       404:
 *         description: Certificate not found
 */
router.get(
  '/:id/vc/download',
  certificateController.downloadVerifiableCredential.bind(certificateController)
);

/**
 * @openapi
 * /api/v1/certificates/vc/issuer:
 *   get:
 *     summary: Issuer DID document
 *     description: Returns the JSON-LD DID document of the credential issuer with the Ed25519 verification key.
 *     tags: [Certificates]
 *     security: []
 *     responses:
 *       200:
 *         description: Issuer DID document (JSON-LD)
 */
router.get('/vc/issuer', certificateController.getVcIssuerDidDocument.bind(certificateController));

/**
 * @openapi
 * /api/v1/certificates/vc/verify:
 *   post:
 *     summary: Verify a W3C Verifiable Credential
 *     description: Resolves the issuer DID, verifies the Ed25519Signature2020 proof, and rejects tampered/forged/revoked credentials.
 *     tags: [Certificates]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [credential]
 *             properties:
 *               credential:
 *                 type: object
 *     responses:
 *       200:
 *         description: Credential verified
 *       422:
 *         description: Verification failed (tampered / forged / revoked)
 */
router.post(
  '/vc/verify',
  certificateController.verifyVerifiableCredential.bind(certificateController)
);

export default router;
