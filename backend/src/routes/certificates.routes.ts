import { Router } from 'express';
import { certificateController } from '../certificates/index';
import { validate } from '../middleware/validation';
import {
  MintCertificateSchema,
  RevokeCertificateSchema,
  ReissueCertificateSchema,
  BatchVerificationSchema,
} from './certificates/validation.schemas';

const router = Router();

/**
 * Certificate Routes
 *
 * Validation middleware is applied to all mutating endpoints using Zod schemas.
 * The `validate()` factory parses req.body against the schema and returns 400
 * with structured error messages on failure, preventing invalid data from
 * reaching the controller layer.
 *
 * Endpoints:
 * - GET  /api/certificates/verify/:tokenId     Public verification
 * - POST /api/certificates/verify/batch        Batch verification (validated)
 * - GET  /api/certificates/:tokenId/metadata   NFT metadata
 * - GET  /api/certificates/:certificateId      Get certificate
 * - GET  /api/certificates/student/:studentId  Student certificates
 * - POST /api/certificates                     Mint new cert (validated)
 * - PUT  /api/certificates/:id/revoke          Revoke cert (validated)
 * - POST /api/certificates/:id/reissue         Reissue cert (validated)
 * - GET  /api/certificates/analytics           Analytics
 * - GET  /api/certificates/:id/image           Image gen
 * - GET  /api/certificates/:id/qr              QR code
 */

// Public verification endpoint (no auth, no body)
router.get('/verify/:tokenId', certificateController.verifyCertificate.bind(certificateController));

// Batch verification — validate tokenIds array
router.post(
  '/verify/batch',
  validate(BatchVerificationSchema),
  certificateController.batchVerify.bind(certificateController)
);

// NFT metadata endpoint (no auth, required for NFT platforms)
router.get('/:tokenId/metadata', certificateController.getMetadata.bind(certificateController));

// Analytics (admin)
router.get('/analytics', certificateController.getAnalytics.bind(certificateController));

// Get full certificate details
router.get('/:certificateId', certificateController.getCertificate.bind(certificateController));

// Get certificates by student
router.get(
  '/student/:studentId',
  certificateController.getCertificatesByStudent.bind(certificateController)
);

// Mint new certificate — validate studentId, courseId, optional fields
router.post(
  '/',
  validate(MintCertificateSchema),
  certificateController.mintCertificate.bind(certificateController)
);

// Revoke certificate — validate reason and revokedBy
router.put(
  '/:certificateId/revoke',
  validate(RevokeCertificateSchema),
  certificateController.revokeCertificate.bind(certificateController)
);

// Reissue certificate — validate reason and issuedBy
router.post(
  '/:certificateId/reissue',
  validate(ReissueCertificateSchema),
  certificateController.reissueCertificate.bind(certificateController)
);

// List/Filter certificates
router.get('/', certificateController.listCertificates.bind(certificateController));

// Certificate image generation
router.get('/:id/image', certificateController.getCertificateImage.bind(certificateController));

// QR code generation
router.get('/:id/qr', certificateController.getQRCode.bind(certificateController));

export default router;
