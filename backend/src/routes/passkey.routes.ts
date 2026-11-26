/**
 * Passkey/WebAuthn Routes (BE-070)
 *
 * Express API routes for FIDO2/WebAuthn passkey registration and authentication,
 * powered by `@simplewebauthn/server` with strict 120s Redis challenge TTLs,
 * authenticator attachment enforcement, and cloned authenticator lockout.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import {
  getPasskeyService,
  PasskeyError,
  PasskeyService,
} from '../auth/passkey.service.js';

// ---------------------------------------------------------------------------
// Validation middleware
// ---------------------------------------------------------------------------

const handleValidationErrors = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array(),
    });
  }
  next();
};

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function createPasskeyRouter(service?: PasskeyService): Router {
  const router = Router();
  const getService = () => service ?? getPasskeyService();

  // -------------------------------------------------------------------------
  // Registration routes
  // -------------------------------------------------------------------------

  /**
   * POST /api/passkey/register/challenge
   *
   * Generate a FIDO2 registration challenge stored in Redis with a 120s TTL.
   */
  router.post(
    '/register/challenge',
    [
      body('userId').isString().notEmpty().withMessage('userId is required'),
      body('userName').isEmail().withMessage('userName must be a valid email'),
      body('userDisplayName').isString().notEmpty().withMessage('userDisplayName is required'),
    ],
    handleValidationErrors,
    async (req: Request, res: Response) => {
      try {
        const { userId, userName, userDisplayName } = req.body;
        const options = await getService().generateRegistrationChallenge(
          userId,
          userName,
          userDisplayName
        );

        res.json({
          success: true,
          data: options,
        });
      } catch (error) {
        console.error('Registration challenge error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to generate registration challenge',
        });
      }
    }
  );

  /**
   * POST /api/passkey/register/verify
   *
   * Verify a WebAuthn registration response (RegistrationResponseJSON).
   * Rejects expired/replayed challenges with 401 Unauthorized.
   */
  router.post(
    '/register/verify',
    [
      body('userId').isString().notEmpty().withMessage('userId is required'),
      body('challenge').isString().notEmpty().withMessage('challenge is required'),
      body('response').isObject().withMessage('response must be a WebAuthn RegistrationResponseJSON object'),
      body('response.id').isString().notEmpty().withMessage('response.id is required'),
      body('response.rawId').isString().notEmpty().withMessage('response.rawId is required'),
      body('response.response.clientDataJSON')
        .isString()
        .notEmpty()
        .withMessage('response.response.clientDataJSON is required'),
      body('response.response.attestationObject')
        .isString()
        .notEmpty()
        .withMessage('response.response.attestationObject is required'),
      body('deviceName').optional().isString(),
    ],
    handleValidationErrors,
    async (req: Request, res: Response) => {
      try {
        const { userId, challenge, response, deviceName } = req.body;
        const result = await getService().verifyRegistration(
          userId,
          challenge,
          response,
          deviceName
        );

        res.json({
          success: true,
          data: result,
        });
      } catch (error: any) {
        if (error instanceof PasskeyError) {
          return res.status(error.statusCode).json({
            success: false,
            code: error.code,
            error: error.message,
          });
        }
        console.error('Registration verification error:', error);
        res.status(400).json({
          success: false,
          error: error?.message || 'Failed to verify registration',
        });
      }
    }
  );

  // -------------------------------------------------------------------------
  // Authentication routes
  // -------------------------------------------------------------------------

  /**
   * POST /api/passkey/authenticate/challenge
   *
   * Generate a FIDO2 authentication challenge stored in Redis with a 120s TTL.
   */
  router.post(
    '/authenticate/challenge',
    [body('userId').optional().isString()],
    handleValidationErrors,
    async (req: Request, res: Response) => {
      try {
        const { userId } = req.body;
        const options = await getService().generateAuthenticationChallenge(userId);

        res.json({
          success: true,
          data: options,
        });
      } catch (error) {
        console.error('Authentication challenge error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to generate authentication challenge',
        });
      }
    }
  );

  /**
   * POST /api/passkey/authenticate/verify
   *
   * Verify a WebAuthn authentication response (AuthenticationResponseJSON).
   * - Expired or replayed challenges -> 401 Unauthorized
   * - Cloned authenticators (falling counter) -> 403 Forbidden + immediate lockout
   */
  router.post(
    '/authenticate/verify',
    [
      body('challenge').isString().notEmpty().withMessage('challenge is required'),
      body('response')
        .isObject()
        .withMessage('response must be a WebAuthn AuthenticationResponseJSON object'),
      body('response.id').isString().notEmpty().withMessage('response.id is required'),
      body('response.rawId').isString().notEmpty().withMessage('response.rawId is required'),
      body('response.response.authenticatorData')
        .isString()
        .notEmpty()
        .withMessage('response.response.authenticatorData is required'),
      body('response.response.clientDataJSON')
        .isString()
        .notEmpty()
        .withMessage('response.response.clientDataJSON is required'),
      body('response.response.signature')
        .isString()
        .notEmpty()
        .withMessage('response.response.signature is required'),
    ],
    handleValidationErrors,
    async (req: Request, res: Response) => {
      try {
        const { challenge, response } = req.body;
        const result = await getService().verifyAuthentication(challenge, response);

        res.json({
          success: true,
          data: result,
        });
      } catch (error: any) {
        if (error instanceof PasskeyError) {
          return res.status(error.statusCode).json({
            success: false,
            code: error.code,
            error: error.message,
          });
        }
        console.error('Authentication verification error:', error);
        res.status(400).json({
          success: false,
          error: error?.message || 'Failed to verify authentication',
        });
      }
    }
  );

  // -------------------------------------------------------------------------
  // Credential management routes
  // -------------------------------------------------------------------------

  /**
   * GET /api/passkey/credentials/:userId
   */
  router.get('/credentials/:userId', async (req: Request, res: Response) => {
    try {
      const userId = req.params.userId as string;
      const credentials = await getService().getUserCredentials(userId);

      res.json({
        success: true,
        data: credentials.map((cred) => ({
          id: cred.id,
          credentialId: cred.credentialId,
          deviceName: cred.deviceName,
          authenticatorAttachment: cred.authenticatorAttachment,
          locked: cred.locked,
          createdAt: cred.createdAt,
          lastUsedAt: cred.lastUsedAt,
        })),
      });
    } catch (error) {
      console.error('Get credentials error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get credentials',
      });
    }
  });

  /**
   * GET /api/passkey/credentials/:userId/count
   */
  router.get('/credentials/:userId/count', async (req: Request, res: Response) => {
    try {
      const userId = req.params.userId as string;
      const count = await getService().getUserCredentialCount(userId);

      res.json({
        success: true,
        data: { count },
      });
    } catch (error) {
      console.error('Get credential count error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get credential count',
      });
    }
  });

  /**
   * DELETE /api/passkey/credentials/:credentialId
   */
  router.delete('/credentials/:credentialId', async (req: Request, res: Response) => {
    try {
      const credentialId = req.params.credentialId as string;
      const deleted = await getService().deleteCredential(credentialId);

      res.json({
        success: true,
        data: { deleted },
      });
    } catch (error) {
      console.error('Delete credential error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete credential',
      });
    }
  });

  // -------------------------------------------------------------------------
  // Health check
  // -------------------------------------------------------------------------

  /**
   * GET /api/passkey/health
   */
  router.get('/health', async (_req: Request, res: Response) => {
    const config = getService().getConfig();
    res.json({
      success: true,
      data: {
        service: 'passkey',
        status: 'healthy',
        rpId: config.rpId,
        challengeTtlSeconds: config.challengeTtlSeconds,
      },
    });
  });

  return router;
}

const router = createPasskeyRouter();
export default router;
