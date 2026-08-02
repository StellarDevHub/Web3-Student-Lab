import { Request, Response, Router } from 'express';
import { authenticate } from '../auth/auth.middleware.js';
import logger from '../utils/logger.js';
import {
  acceptTermsOfService,
  getCurrentTosVersion,
  hasTosAcceptance,
} from '../services/termsOfService.service.js';

const router = Router();

/**
 * @route   GET /api/v1/roadmap/tos
 * @desc    Get the current Terms of Service version
 * @access  Public
 */
router.get('/', (_req: Request, res: Response): void => {
  res.json({
    status: 'success',
    data: { version: getCurrentTosVersion() },
  });
});

/**
 * @route   GET /api/v1/roadmap/tos/status
 * @desc    Check whether the authenticated user has accepted the current TOS
 * @access  Private
 */
router.get('/status', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const version = (req.query.version as string) || getCurrentTosVersion();
    const accepted = await hasTosAcceptance(userId, version);
    res.json({ status: 'success', data: { accepted, version } });
  } catch (error) {
    logger.error('GET /roadmap/tos/status failed', error);
    res.status(500).json({ status: 'error', message: 'Failed to check TOS status' });
  }
});

/**
 * @route   POST /api/v1/roadmap/tos/accept
 * @desc    Record acceptance of the Terms of Service for the authenticated user
 * @access  Private
 */
router.post('/accept', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const version = req.body.version || getCurrentTosVersion();
    const ipAddress =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0] ?? req.ip;

    const record = await acceptTermsOfService(userId, version, ipAddress);
    res.status(201).json({ status: 'success', data: record });
  } catch (error) {
    logger.error('POST /roadmap/tos/accept failed', error);
    res.status(500).json({ status: 'error', message: 'Failed to record TOS acceptance' });
  }
});

export default router;
