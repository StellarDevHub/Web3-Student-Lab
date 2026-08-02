import { Router, Request, Response } from 'express';
import { estimateGas, validateGasRequest } from '../../services/gasEstimation.service.js';
import logger from '../../utils/logger.js';

const router = Router();

/**
 * @route POST /api/v1/osct/gas-estimate
 * @desc Estimate Soroban gas for open-source contribution review
 */
router.post('/gas-estimate', (req: Request, res: Response) => {
  try {
    const validation = validateGasRequest(req.body?.sourceCode);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const result = estimateGas({
      sourceCode: req.body.sourceCode,
      budgetPreset: req.body.budgetPreset,
    });

    res.json({ status: 'success', data: result });
  } catch (error) {
    logger.error('OSCT gas estimation failed', { error });
    res.status(500).json({ error: 'Failed to estimate gas' });
  }
});

export default router;
