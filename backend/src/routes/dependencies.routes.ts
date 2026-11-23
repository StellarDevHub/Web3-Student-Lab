import { Router } from 'express';
import {
  checkDependencies,
  updateDependencies,
  DependencyServiceError,
} from '../services/dependency-update.service.js';
import { fetchCrateFromCratesIo, compatibilityWarnings } from '../services/cratesio-proxy.js';
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
/**
 * GET /dependencies/proxy/:crate
 * Live crates.io proxy: resolves a crate's release metadata in real time
 * (with Redis caching) and reports any Soroban SDK compatibility warnings.
 */
router.get('/proxy/:crate', async (req, res) => {
  const crateName = req.params['crate'];
  if (!/^[\w-]+$/.test(crateName)) {
    res.status(400).json({ status: 'error', message: 'Invalid crate name' });
    return;
  }

  try {
    const meta = await fetchCrateFromCratesIo(crateName);
    if (!meta || !meta.max_version) {
      // Fall back to a soft 404 rather than an outage: the curated snapshot is
      // the offline fallback for dependency checks.
      res.status(404).json({ status: 'error', message: `Crate "${crateName}" not found or crates.io unreachable` });
      return;
    }
    const warnings = compatibilityWarnings([{ name: crateName, version: meta.max_version }]);
    res.json({
      status: 'success',
      data: {
        name: meta.name,
        version: meta.max_version,
        description: meta.description ?? null,
        releases: (meta.versions ?? []).filter((v) => !v.yanked).slice(0, 5).map((v) => v.num),
        warnings,
      },
    });
  } catch (error) {
    logger.error('Error resolving crate from crates.io proxy', error);
    res.status(502).json({ status: 'error', message: 'Unable to reach crates.io' });
  }
});

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
