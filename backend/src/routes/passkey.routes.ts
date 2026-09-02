/**
 * Passkey/WebAuthn Routes
 *
 * Express API routes for WebAuthn passkey registration and authentication.
 * These routes handle the server-side operations for passwordless authentication
 * using biometric passkeys (TouchID, FaceID, Windows Hello).
 */

import { Router, Request, Response, NextFunction } from 'express';
import { body, query, validationResult } from 'express-validator';
import { getPasskeyService } from '../services/passkey.service.js';

const router = Router();
const passkeyService = getPasskeyService();

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
// Registration routes
// ---------------------------------------------------------------------------

/**
 * POST /api/passkey/register/challenge
 *
 * Generate a registration challenge for creating a new passkey.
 *
 * Request body:
 *   - userId: string (required) - The user's unique identifier
 *   - userName: string (required) - The user's email or username
 *   - userDisplayName: string (required) - The user's display name
 *
 * Response:
 *   - challenge: PublicKeyCredentialCreationOptions - For client-side WebAuthn API
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

      const challenge = await passkeyService.generateRegistrationChallenge(
        userId,
        userName,
        userDisplayName
      );

      // Convert Buffer fields to base64 for JSON serialization
      const serializableChallenge = {
        ...challenge,
        challenge: challenge.challenge.toString('base64'),
        user: {
          ...challenge.user,
          id: challenge.user.id.toString('base64'),
        },
        excludeCredentials: challenge.excludeCredentials.map((cred) => ({
          ...cred,
          id: cred.id.toString('base64'),
        })),
      };

      res.json({
        success: true,
        data: serializableChallenge,
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
 * Verify and store a registration response.
 *
 * Request body:
 *   - userId: string (required) - The user who registered
 *   - challenge: string (required) - The original challenge
 *   - credentialId: string (required) - The credential ID from the authenticator
 *   - attestationObject: string (required) - The attestation object
 *   - clientDataJSON: string (required) - The client data JSON
 *   - publicKeyX: string (required) - The public key X coordinate
 *   - publicKeyY: string (required) - The public key Y coordinate
 *   - signCount: number (required) - The signature counter
 *
 * Response:
 *   - credentialId: string - The stored credential ID
 *   - publicKeyX: string - The public key X coordinate
 *   - publicKeyY: string - The public key Y coordinate
 *   - signCount: number - The signature counter
 *   - deviceName: string | undefined - The device name (if available)
 */
router.post(
  '/register/verify',
  [
    body('userId').isString().notEmpty().withMessage('userId is required'),
    body('challenge').isString().notEmpty().withMessage('challenge is required'),
    body('credentialId').isString().notEmpty().withMessage('credentialId is required'),
    body('attestationObject').isString().notEmpty().withMessage('attestationObject is required'),
    body('clientDataJSON').isString().notEmpty().withMessage('clientDataJSON is required'),
    body('publicKeyX').isString().isLength({ min: 64, max: 64 }).withMessage('publicKeyX must be 64 hex chars'),
    body('publicKeyY').isString().isLength({ min: 64, max: 64 }).withMessage('publicKeyY must be 64 hex chars'),
    body('signCount').isInt({ min: 0 }).withMessage('signCount must be a non-negative integer'),
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const {
        userId,
        challenge,
        credentialId,
        attestationObject,
        clientDataJSON,
        publicKeyX,
        publicKeyY,
        signCount,
      } = req.body;

      const result = await passkeyService.verifyRegistration(userId, challenge, {
        credentialId,
        attestationObject,
        clientDataJSON,
        publicKeyX,
        publicKeyY,
        signCount,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      console.error('Registration verification error:', error);
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to verify registration',
      });
    }
  }
);

// ---------------------------------------------------------------------------
// Authentication routes
// ---------------------------------------------------------------------------

/**
 * POST /api/passkey/authenticate/challenge
 *
 * Generate an authentication challenge for signing in.
 *
 * Request body:
 *   - userId: string (optional) - The user's ID to narrow credential list
 *
 * Response:
 *   - challenge: PublicKeyCredentialRequestOptions - For client-side WebAuthn API
 */
router.post(
  '/authenticate/challenge',
  [
    body('userId').optional().isString(),
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { userId } = req.body;

      const challenge = await passkeyService.generateAuthenticationChallenge(userId);

      // Convert Buffer fields to base64 for JSON serialization
      const serializableChallenge = {
        ...challenge,
        challenge: challenge.challenge.toString('base64'),
        allowCredentials: challenge.allowCredentials.map((cred) => ({
          ...cred,
          id: cred.id.toString('base64'),
        })),
      };

      res.json({
        success: true,
        data: serializableChallenge,
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
 * Verify an authentication response.
 *
 * Request body:
 *   - challenge: string (required) - The original challenge
 *   - credentialId: string (required) - The credential ID
 *   - authenticatorData: string (required) - The authenticator data
 *   - clientDataJSON: string (required) - The client data JSON
 *   - signature: string (required) - The signature
 *   - signCount: number (required) - The signature counter
 *
 * Response:
 *   - verified: boolean - Whether authentication was successful
 *   - credentialId: string - The credential ID
 *   - signCount: number - The updated sign count
 */
router.post(
  '/authenticate/verify',
  [
    body('challenge').isString().notEmpty().withMessage('challenge is required'),
    body('credentialId').isString().notEmpty().withMessage('credentialId is required'),
    body('authenticatorData').isString().notEmpty().withMessage('authenticatorData is required'),
    body('clientDataJSON').isString().notEmpty().withMessage('clientDataJSON is required'),
    body('signature').isString().notEmpty().withMessage('signature is required'),
    body('signCount').isInt({ min: 0 }).withMessage('signCount must be a non-negative integer'),
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const {
        challenge,
        credentialId,
        authenticatorData,
        clientDataJSON,
        signature,
        signCount,
      } = req.body;

      const result = await passkeyService.verifyAuthentication(challenge, {
        credentialId,
        authenticatorData,
        clientDataJSON,
        signature,
        signCount,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      console.error('Authentication verification error:', error);
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to verify authentication',
      });
    }
  }
);

// ---------------------------------------------------------------------------
// Credential management routes
// ---------------------------------------------------------------------------

/**
 * GET /api/passkey/credentials/:userId
 *
 * Get all credentials for a user.
 *
 * Response:
 *   - credentials: PasskeyCredential[] - The user's credentials
 */
router.get(
  '/credentials/:userId',
  [
    // No validation needed, userId is a path parameter
  ],
  async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;

      const credentials = await passkeyService.getUserCredentials(userId);

      res.json({
        success: true,
        data: credentials.map((cred) => ({
          id: cred.id,
          credentialId: cred.credentialId,
          deviceName: cred.deviceName,
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
  }
);

/**
 * GET /api/passkey/credentials/:userId/count
 *
 * Get the count of credentials for a user.
 *
 * Response:
 *   - count: number - The number of credentials
 */
router.get(
  '/credentials/:userId/count',
  async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;

      const count = await passkeyService.getUserCredentialCount(userId);

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
  }
);

/**
 * DELETE /api/passkey/credentials/:credentialId
 *
 * Delete a credential.
 *
 * Response:
 *   - deleted: boolean - Whether the credential was deleted
 */
router.delete(
  '/credentials/:credentialId',
  async (req: Request, res: Response) => {
    try {
      const { credentialId } = req.params;

      const deleted = await passkeyService.deleteCredential(credentialId);

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
  }
);

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

/**
 * GET /api/passkey/health
 *
 * Check if the passkey service is healthy.
 */
router.get('/health', async (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      service: 'passkey',
      status: 'healthy',
      rpId: 'web3-student-lab.com',
    },
  });
});

export default router;
