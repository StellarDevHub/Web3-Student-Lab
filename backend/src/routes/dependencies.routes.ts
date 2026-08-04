import { Router } from 'express';
import {
  checkDependencies,
  updateDependencies,
  DependencyServiceError,
} from '../services/dependency-update.service.js';
import { validateRequest } from '../utils/validation.js';
import logger from '../utils/logger.js';
import { dependencyCheckSchema, dependencyUpdateSchema } from './dependencies.validation.schemas.js';

const router: ReturnType<typeof Router> = Router();

/**
 * POST /dependencies/check
 * Parse a Cargo.toml and return outdated dependency information.
 */
router.post('/check', validateRequest(dependencyCheckSchema), async (req, res) => {
  try {
    const result = await checkDependencies(req.body.cargoToml);
    res.json({ status: 'success', ...result });
  } catch (error) {
    logger.error('Error checking dependencies', error);
    res.status(500).json({ status: 'error', message: 'Unable to check dependencies' });
  }
});

/**
 * POST /dependencies/update
 * Apply selected dependency updates and return a suggested Cargo.toml.
 */
router.post('/update', validateRequest(dependencyUpdateSchema), async (req, res) => {
  try {
    const result = await updateDependencies(req.body.cargoToml, req.body.dependencies);
    res.json({ status: 'success', ...result });
  } catch (error) {
    logger.error('Error updating dependencies', error);
    if (error instanceof DependencyServiceError) {
      res.status(503).json({ status: 'error', code: error.code, message: error.message });
      return;
    }
    res.status(500).json({ status: 'error', message: 'Unable to update dependencies' });
  }
});

export default router;
