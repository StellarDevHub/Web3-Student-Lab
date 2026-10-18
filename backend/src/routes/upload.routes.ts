import { Router } from 'express';
import { uploadController } from '../controllers/uploadController.js';
import { authenticateToken } from '../middleware/auth.js';

const uploadRouter: Router = Router();

/**
 * @openapi
 * /api/v1/upload/presign:
 *   post:
 *     summary: Generate a time-limited S3 pre-signed upload URL
 *     description: Enforces file size limits (5MB images, 10MB deliverables) and checks file extension/signature before generating a 15-minute presigned URL.
 *     tags: [Storage & Uploads]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [filename, contentType, fileSize]
 *             properties:
 *               filename:
 *                 type: string
 *                 example: deliverable.pdf
 *               contentType:
 *                 type: string
 *                 example: application/pdf
 *               fileSize:
 *                 type: number
 *                 example: 204800
 *               purpose:
 *                 type: string
 *                 enum: [avatar, image, deliverable, assignment, generic]
 *                 default: generic
 *               fileHeaderBase64:
 *                 type: string
 *                 description: Base64-encoded initial 32 bytes of the file for instant magic byte validation.
 *     responses:
 *       200:
 *         description: Pre-signed upload URL successfully created
 *       400:
 *         description: Validation error or forged extension
 */
uploadRouter.post('/presign', authenticateToken, uploadController.getPresignedUploadUrl);

/**
 * @openapi
 * /api/v1/upload/verify-magic-bytes:
 *   post:
 *     summary: Verify magic bytes against claimed MIME type
 *     description: Inspects raw binary header bytes to prevent forged extensions (e.g. .exe disguised as .png).
 *     tags: [Storage & Uploads]
 *     responses:
 *       200:
 *         description: Valid file signature
 *       400:
 *         description: Mismatched or executable file signature
 */
uploadRouter.post('/verify-magic-bytes', uploadController.verifyMagicBytes);

/**
 * @openapi
 * /api/v1/upload/complete:
 *   post:
 *     summary: Notify upload completion and enqueue async virus scan
 *     description: Triggers background ClamAV scanning job for an uploaded S3 object.
 *     tags: [Storage & Uploads]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       202:
 *         description: Virus scan enqueued
 */
uploadRouter.post('/complete', authenticateToken, uploadController.notifyUploadComplete);

export default uploadRouter;
