import { Request, Response, Router } from 'express';
import { authenticate } from '../auth/auth.middleware.js';
import logger from '../utils/logger.js';
import {
  getCurrentPolicyVersion,
  hasConsented,
  recordPolicyConsent,
} from '../services/privacyPolicy.service.js';

const router = Router();

/**
 * @route   GET /api/v1/playground/privacy-policy
 * @desc    Get the current privacy policy version
 * @access  Public
 */
router.get('/', (_req: Request, res: Response): void => {
  res.json({
    status: 'success',
    data: { version: getCurrentPolicyVersion() },
  });
});

/**
 * @route   GET /api/v1/playground/privacy-policy/status
 * @desc    Check whether the authenticated user has consented to the privacy policy
 * @access  Private
 */
router.get('/status', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const policyVersion = (req.query.version as string) || getCurrentPolicyVersion();
    const consented = await hasConsented(userId, policyVersion);
    res.json({ status: 'success', data: { consented, policyVersion } });
  } catch (error) {
    logger.error('GET /playground/privacy-policy/status failed', error);
    res.status(500).json({ status: 'error', message: 'Failed to check policy consent' });
  }
});

/**
 * @route   POST /api/v1/playground/privacy-policy/consent
 * @desc    Record privacy policy consent for the authenticated user
 * @access  Private
 */
router.post('/consent', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const policyVersion = req.body.policyVersion || getCurrentPolicyVersion();
    const ipAddress =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0] ?? req.ip;

    const record = await recordPolicyConsent(userId, policyVersion, ipAddress);
    res.status(201).json({ status: 'success', data: record });
  } catch (error) {
    logger.error('POST /playground/privacy-policy/consent failed', error);
    res.status(500).json({ status: 'error', message: 'Failed to record policy consent' });
  }
});

export default router;
