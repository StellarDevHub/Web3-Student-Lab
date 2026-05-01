import { Router } from 'express';
import { certificateController } from '../certificates/certificates.controller.js';
import { MintCertificateSchema } from './certificates/validation.schemas.js';

const router = Router();

/**
 * Certificate Routes
 *
 * Endpoints:
 * - GET /api/certificates/verify/:tokenId           Public verification
 * - POST /api/certificates/verify/batch              Batch verification
 * - GET /api/certificates/:tokenId/metadata          NFT metadata
 * - GET /api/certificates/:certificateId             Get certificate
 * - GET /api/certificates/student/:studentId        Student certificates
 * - POST /api/certificates                          Mint new cert
 * - PUT /api/certificates/:id/revoke                 Revoke cert
 * - POST /api/certificates/:id/reissue              Reissue cert
 * - GET /api/certificates/analytics                 Analytics
 * - GET /api/certificates/:id/image                 Image gen
 * - GET /api/certificates/:id/qr                    QR code
 */

// Public verification endpoint (no auth)
router.get('/verify/:tokenId', certificateController.verifyCertificate.bind(certificateController));

// Batch verification endpoint (no auth)
router.post('/verify/batch', certificateController.batchVerify.bind(certificateController));

// NFT metadata endpoint (no auth, required for NFT platforms)
router.get('/:tokenId/metadata', certificateController.getMetadata.bind(certificateController));

// Get full certificate details
router.get('/:certificateId', certificateController.getCertificate.bind(certificateController));

// Get certificates by student
router.get(
  '/student/:studentId',
  certificateController.getCertificatesByStudent.bind(certificateController)
);

// Mint new certificate (would require auth in production)
router.post('/', certificateController.mintCertificate.bind(certificateController));

// Revoke certificate
router.put(
  '/:certificateId/revoke',
  certificateController.revokeCertificate.bind(certificateController)
);

// Reissue certificate
router.post(
  '/:certificateId/reissue',
  certificateController.reissueCertificate.bind(certificateController)
);

// List/Filter certificates
router.get('/', certificateController.listCertificates.bind(certificateController));

// Analytics (admin)
router.get('/analytics', certificateController.getAnalytics.bind(certificateController));

// Certificate image generation
router.get('/:id/image', certificateController.getCertificateImage.bind(certificateController));

// QR code generation
router.get('/:id/qr', certificateController.getQRCode.bind(certificateController));

export default router;
