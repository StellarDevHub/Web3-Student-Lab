import { Router } from 'express';
import { ZodError } from 'zod';
import { BuybackIndexerUnavailableError, getBuybackDashboard } from '../tokenomics/buyback-indexer.service.js';
import logger from '../utils/logger.js';

const router: Router = Router();

/**
 * @openapi
 * /api/v1/tokenomics/buybacks:
 *   get:
 *     summary: Read validated token buyback, configuration, and supply data
 *     tags: [Tokenomics]
 *     responses:
 *       200: { description: Buyback indexer read model }
 *       503: { description: Indexer is not configured or unavailable }
 */
router.get('/buybacks', async (_req, res) => {
  try {
    // This service is the server-side indexer adapter. It does not generate
    // fallback records: a bad/unavailable source must remain visible to users.
    res.json(await getBuybackDashboard());
  } catch (error) {
    if (error instanceof BuybackIndexerUnavailableError) {
      return res.status(503).json({ error: error.message });
    }
    if (error instanceof ZodError) {
      logger.error('Buyback indexer returned an invalid payload', { issues: error.issues });
      return res.status(502).json({ error: 'Buyback indexer returned invalid data.' });
    }
    logger.error('Unable to load buyback dashboard data', error);
    return res.status(500).json({ error: 'Unable to load buyback dashboard data.' });
  }
});

export default router;
