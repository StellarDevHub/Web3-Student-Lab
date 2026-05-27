import { Router } from 'express';
import { securityService } from '../services/securityService.js';

const router = Router();

/**
 * @route GET /api/v1/security/public-key
 * @desc Get the current rotating public key for payload encryption
 * @access Public
 */
router.get('/public-key', (req, res) => {
  const publicKeyData = securityService.getPublicKey();

  if (!publicKeyData) {
    return res.status(500).json({
      status: 'error',
      message: 'Encryption keys not initialized',
    });
  }

  res.json({
    status: 'success',
    data: publicKeyData,
  });
});

export default router;
