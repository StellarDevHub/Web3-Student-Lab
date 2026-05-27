import { NextFunction, Request, Response } from 'express';
import { securityService } from '../services/securityService.js';
import logger from '../utils/logger.js';

interface EncryptedPayload {
  keyId: string;
  encryptedData: string;
}

/**
 * Middleware to decrypt encrypted JSON payloads
 * Expects { keyId: string, encryptedData: string } in body or a specific header
 */
export const decryptionMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Only process if it has the encrypted flag or specific structure
  const isEncrypted =
    req.get('X-Payload-Encryption') === 'true' ||
    (req.body && req.body.encryptedData && req.body.keyId);

  if (!isEncrypted) {
    return next();
  }

  try {
    const { keyId, encryptedData } = req.body as EncryptedPayload;

    if (!keyId || !encryptedData) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing keyId or encryptedData in encrypted payload',
      });
    }

    // Decrypt the payload
    const decryptedData = securityService.decrypt(keyId, encryptedData);

    // Replace body with decrypted data
    req.body = decryptedData;

    // Log that decryption happened, but NOT the data
    logger.info(`Successfully decrypted payload for ${req.path} using key ${keyId}`);

    // Ensure we don't leak decrypted data in logs (the requestLogger might log req.body)
    // Some request loggers use a 'decrypted' flag to avoid logging body
    (req as any)._isDecrypted = true;

    next();
  } catch (error: any) {
    logger.error(`Decryption failed for ${req.path}: ${error.message}`);
    return res.status(400).json({
      status: 'error',
      message: 'Failed to decrypt payload. Please ensure you are using a valid public key.',
    });
  }
};
