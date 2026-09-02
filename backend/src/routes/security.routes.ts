/**
 * Security routes
 *
 * Public
 * ──────
 *   GET  /api/v1/security/public-key
 *     Returns the current RSA public key so clients can encrypt transit payloads.
 *
 * Admin (Bearer token with role "admin" required)
 * ───────────────────────────────────────────────
 *   GET  /api/v1/security/key-versions
 *     Lists all loaded symmetric key versions and which one is active.
 *     Can be disabled via ENCRYPTION_EXPOSE_KEY_VERSIONS=false.
 *
 *   POST /api/v1/security/rotate-payloads
 *     Re-encrypts a caller-supplied batch of envelopes under the active key.
 *     Body: { items: Array<{ id: string; envelopeStr: string }> }
 *     The caller is responsible for persisting the returned new envelopes.
 *     Batch size is capped by ENCRYPTION_ROTATION_BATCH_SIZE (default 100).
 *
 *   POST /api/v1/security/reload-keys
 *     Instructs the EncryptionKeyManager to re-scan process.env for new
 *     PAYLOAD_ENCRYPTION_KEY_v<N> variables without restarting the process.
 */

import { NextFunction, Request, Response, Router } from 'express';
import { z } from 'zod';
import config from '../config/env.config.js';
import { authenticateToken, type AuthRequest } from '../middleware/auth.js';
import { securityService } from '../services/securityService.js';
import logger from '../utils/logger.js';

const router: ReturnType<typeof Router> = Router();

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

/**
 * Require a valid JWT AND role === "admin".
 * Placed after authenticateToken so req.user is already populated.
 */
const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({
      status: 'error',
      message: 'Admin privileges required',
    });
    return;
  }
  next();
};

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const rotatePayloadsBodySchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().min(1),
        envelopeStr: z.string().min(1),
      })
    )
    .min(1)
    .max(config.encryption.rotationBatchSize, {
      message: `Batch size must not exceed ${config.encryption.rotationBatchSize}`,
    }),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * @route  GET /api/v1/security/public-key
 * @desc   Return the active RSA-4096 public key for client-side payload encryption
 * @access Public
 */
router.get('/public-key', (_req: Request, res: Response) => {
  const publicKeyData = securityService.getPublicKey();

  if (!publicKeyData) {
    res.status(500).json({
      status: 'error',
      message: 'Encryption keys not initialised',
    });
    return;
  }

  res.json({
    status: 'success',
    data: publicKeyData,
  });
});

/**
 * @route  GET /api/v1/security/key-versions
 * @desc   List all loaded symmetric key versions (no key material exposed)
 * @access Admin
 */
router.get(
  '/key-versions',
  authenticateToken as unknown as (req: Request, res: Response, next: NextFunction) => void,
  requireAdmin as (req: Request, res: Response, next: NextFunction) => void,
  (_req: Request, res: Response) => {
    if (!config.encryption.exposeKeyVersionEndpoint) {
      res.status(404).json({ status: 'error', message: 'Not found' });
      return;
    }

    const versions = securityService.listSymmetricKeyVersions();
    const activeVersion = securityService.getActiveSymmetricKeyVersion();

    res.json({
      status: 'success',
      data: {
        activeVersion,
        versions,
      },
    });
  }
);

/**
 * @route  POST /api/v1/security/rotate-payloads
 * @desc   Re-encrypt a batch of AES-GCM envelopes under the active key
 * @access Admin
 *
 * Request body:
 * {
 *   "items": [
 *     { "id": "<row-id>", "envelopeStr": "<current envelope string>" },
 *     ...
 *   ]
 * }
 *
 * Response:
 * {
 *   "status": "success",
 *   "data": {
 *     "processed": <number>,
 *     "migrated": <number>,
 *     "skipped": <number>,
 *     "failed": <number>,
 *     "results": [
 *       { "id": "...", "migrated": true,  "previousVersion": 1, "currentVersion": 2, "newEnvelope": "..." },
 *       { "id": "...", "migrated": false, "previousVersion": 2, "currentVersion": 2, "newEnvelope": "..." },
 *       { "id": "...", "error": "Cannot decrypt: key version 0 is not loaded" }
 *     ]
 *   }
 * }
 *
 * IMPORTANT: The newEnvelope value must be persisted by the caller.
 *            This endpoint does NOT write to the database.
 */
router.post(
  '/rotate-payloads',
  authenticateToken as unknown as (req: Request, res: Response, next: NextFunction) => void,
  requireAdmin as (req: Request, res: Response, next: NextFunction) => void,
  (req: Request, res: Response) => {
    // --- Input validation ---
    const parsed = rotatePayloadsBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        status: 'error',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { items } = parsed.data;

    // --- Run the batch ---
    const batchResults = securityService.rotateBatch(items);

    // --- Build a safe summary (no plaintext, no key material in response) ---
    let migrated = 0;
    let skipped = 0;
    let failed = 0;

    const results = batchResults.map((r) => {
      if ('error' in r) {
        failed++;
        // Return the sanitised error message; sensitive internals are never exposed
        return { id: r.id, error: r.error };
      }

      if (r.result.migrated) {
        migrated++;
      } else {
        skipped++;
      }

      return {
        id: r.id,
        migrated: r.result.migrated,
        previousVersion: r.result.previousVersion,
        currentVersion: r.result.currentVersion,
        // Return the new envelope so the caller can persist it
        newEnvelope: r.result.newEnvelope,
      };
    });

    logger.info(
      JSON.stringify({
        processed: items.length,
        migrated,
        skipped,
        failed,
        activeVersion: securityService.getActiveSymmetricKeyVersion(),
      }),
      'SecurityRoutes: rotate-payloads batch complete'
    );

    res.json({
      status: 'success',
      data: {
        processed: items.length,
        migrated,
        skipped,
        failed,
        results,
      },
    });
  }
);

/**
 * @route  POST /api/v1/security/reload-keys
 * @desc   Re-scan environment variables for new PAYLOAD_ENCRYPTION_KEY_v<N> entries
 * @access Admin
 *
 * Use this after adding a new key variable to a running process (e.g. via a
 * secrets manager sidecar) without restarting the server.
 */
router.post(
  '/reload-keys',
  authenticateToken as unknown as (req: Request, res: Response, next: NextFunction) => void,
  requireAdmin as (req: Request, res: Response, next: NextFunction) => void,
  (_req: Request, res: Response) => {
    try {
      securityService.reloadSymmetricKeys();

      const versions = securityService.listSymmetricKeyVersions();
      const activeVersion = securityService.getActiveSymmetricKeyVersion();

      res.json({
        status: 'success',
        data: {
          activeVersion,
          loadedVersions: versions.map((v) => v.version),
        },
      });
    } catch (err) {
      logger.error('SecurityRoutes: reload-keys failed', { err });
      // Do not expose the raw error message — it may contain path info
      res.status(500).json({
        status: 'error',
        message: 'Failed to reload encryption keys. Check server logs for details.',
      });
    }
  }
);

export default router;
