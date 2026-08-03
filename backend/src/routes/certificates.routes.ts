import { Router } from 'express';
import { certificateController } from '../certificates/index.js';
import { validate } from '../middleware/validation.js';
import {
  MintCertificateSchema,
  RevokeCertificateSchema,
  ReissueCertificateSchema,
  BatchVerificationSchema,
} from './certificates/validation.schemas.js';

const router: ReturnType<typeof Router> = Router();

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

export default router;
