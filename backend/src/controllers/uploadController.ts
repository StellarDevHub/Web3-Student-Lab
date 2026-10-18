import { Request, Response } from 'express';
import { fileUploadService, validateMagicBytes } from '../services/fileUploadService.js';
import { ApiResponse } from '../utils/response.js';
import logger from '../utils/logger.js';

export const uploadController = {
  /**
   * Request an S3 pre-signed upload URL for direct-to-S3 client uploads.
   * Enforces 15-minute expiration, max file size limits (5MB images, 10MB deliverables),
   * and magic byte validation before granting access.
   */
  async getPresignedUploadUrl(req: Request, res: Response) {
    try {
      const { filename, contentType, fileSize, purpose = 'generic', fileHeaderBase64 } = req.body;

      if (!filename || !contentType || !fileSize) {
        return res.status(400).json(
          ApiResponse.error('Missing required parameters: filename, contentType, and fileSize are required')
        );
      }

      // If magic bytes sample is supplied, validate it immediately
      if (fileHeaderBase64) {
        try {
          const buffer = Buffer.from(fileHeaderBase64, 'base64');
          const validation = validateMagicBytes(buffer, contentType);
          if (!validation.valid) {
            logger.warn('File upload rejected by magic byte inspection', {
              filename,
              claimedMime: contentType,
              detectedMime: validation.detectedMime,
              error: validation.error,
              userId: (req as any).user?.id,
            });
            return res.status(400).json(
              ApiResponse.error(validation.error || 'Magic byte signature mismatch. File extension might be forged.')
            );
          }
        } catch (err: any) {
          return res.status(400).json(ApiResponse.error(`Failed to parse fileHeaderBase64: ${err.message}`));
        }
      }

      const result = await fileUploadService.generatePresignedUploadUrl(
        {
          filename,
          contentType,
          fileSize: Number(fileSize),
          purpose,
          userId: (req as any).user?.id,
          workspaceId: (req as any).workspaceId || 'default',
        },
        { expiresInSeconds: 15 * 60 } // 15 minutes
      );

      return res.status(200).json(
        ApiResponse.success('Presigned upload URL generated successfully', result)
      );
    } catch (error: any) {
      logger.error('Error in getPresignedUploadUrl controller:', error);
      return res.status(400).json(ApiResponse.error(error.message || 'Failed to generate upload URL'));
    }
  },

  /**
   * Validate uploaded file header magic bytes and extension alignment.
   */
  async verifyMagicBytes(req: Request, res: Response) {
    try {
      const { fileHeaderBase64, claimedContentType, filename } = req.body;

      if (!fileHeaderBase64 || !claimedContentType) {
        return res.status(400).json(
          ApiResponse.error('fileHeaderBase64 and claimedContentType are required')
        );
      }

      const buffer = Buffer.from(fileHeaderBase64, 'base64');
      const validation = validateMagicBytes(buffer, claimedContentType);

      if (!validation.valid) {
        return res.status(400).json({
          status: 'error',
          valid: false,
          error: validation.error,
          detectedMime: validation.detectedMime,
          claimedMime: claimedContentType,
        });
      }

      return res.status(200).json({
        status: 'success',
        valid: true,
        detectedMime: validation.detectedMime,
        claimedMime: claimedContentType,
      });
    } catch (error: any) {
      logger.error('Error verifying magic bytes:', error);
      return res.status(500).json(ApiResponse.error(error.message || 'Failed to verify file magic bytes'));
    }
  },

  /**
   * Notification webhook or callback invoked when a file upload completes in S3.
   * Enqueues an asynchronous ClamAV virus scan job.
   */
  async notifyUploadComplete(req: Request, res: Response) {
    try {
      const { fileKey, metadata = {} } = req.body;

      if (!fileKey) {
        return res.status(400).json(ApiResponse.error('fileKey is required'));
      }

      const jobId = await fileUploadService.enqueueVirusScan(fileKey, {
        ...metadata,
        userId: (req as any).user?.id,
        timestamp: new Date().toISOString(),
      });

      return res.status(202).json(
        ApiResponse.success('File upload accepted and enqueued for virus scanning', {
          fileKey,
          scanJobId: jobId,
          status: 'scan_enqueued',
        })
      );
    } catch (error: any) {
      logger.error('Error queueing virus scan on upload completion:', error);
      return res.status(500).json(ApiResponse.error(error.message || 'Failed to enqueue file for virus scan'));
    }
  },
};
