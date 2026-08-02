import { Request, Response, Router } from 'express';
import { authenticate } from '../auth/auth.middleware.js';
import logger from '../utils/logger.js';
import {
  clearSessionErrors,
  ErrorSeverity,
  getSessionErrors,
  getUserErrors,
  logSimulatorError,
} from '../services/simulatorErrorLog.service.js';

const router = Router();

const VALID_SEVERITIES: ErrorSeverity[] = ['low', 'medium', 'high', 'critical'];

/**
 * @route   POST /api/v1/simulator/errors
 * @desc    Log a new error from the blockchain learning simulator
 * @access  Private
 */
router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { sessionId, severity, code, message, context } = req.body;

    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).json({ status: 'error', message: 'sessionId is required' });
      return;
    }
    if (!VALID_SEVERITIES.includes(severity)) {
      res.status(400).json({
        status: 'error',
        message: `severity must be one of: ${VALID_SEVERITIES.join(', ')}`,
      });
      return;
    }
    if (!code || typeof code !== 'string') {
      res.status(400).json({ status: 'error', message: 'code is required' });
      return;
    }
    if (!message || typeof message !== 'string') {
      res.status(400).json({ status: 'error', message: 'message is required' });
      return;
    }

    const entry = logSimulatorError(
      sessionId,
      severity,
      code,
      message,
      typeof context === 'object' && context !== null ? context : {},
      userId
    );

    res.status(201).json({ status: 'success', data: entry });
  } catch (error) {
    logger.error('POST /simulator/errors failed', error);
    res.status(500).json({ status: 'error', message: 'Failed to log simulator error' });
  }
});

/**
 * @route   GET /api/v1/simulator/errors/session/:sessionId
 * @desc    Get errors for a specific simulator session
 * @access  Private
 */
router.get('/session/:sessionId', authenticate, (req: Request, res: Response): void => {
  const { sessionId } = req.params;
  const severity = req.query.severity as ErrorSeverity | undefined;

  if (severity && !VALID_SEVERITIES.includes(severity)) {
    res.status(400).json({
      status: 'error',
      message: `severity must be one of: ${VALID_SEVERITIES.join(', ')}`,
    });
    return;
  }

  const errors = getSessionErrors(sessionId, severity);
  res.json({ status: 'success', data: { errors, total: errors.length } });
});

/**
 * @route   GET /api/v1/simulator/errors/me
 * @desc    Get all errors logged by the authenticated user
 * @access  Private
 */
router.get('/me', authenticate, (req: Request, res: Response): void => {
  const userId = req.user!.id;
  const errors = getUserErrors(userId);
  res.json({ status: 'success', data: { errors, total: errors.length } });
});

/**
 * @route   DELETE /api/v1/simulator/errors/session/:sessionId
 * @desc    Clear all errors for a simulator session
 * @access  Private
 */
router.delete('/session/:sessionId', authenticate, (req: Request, res: Response): void => {
  const { sessionId } = req.params;
  const cleared = clearSessionErrors(sessionId);
  res.json({ status: 'success', data: { cleared } });
});

export default router;
