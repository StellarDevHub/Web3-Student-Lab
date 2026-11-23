import { Router } from 'express';
import { deployContract } from '../services/deployService.js';
import logger from '../utils/logger.js';

const router: Router = Router();

router.post('/deploy', async (req, res) => {
  try {
    const { wasmPath, network, sourceKey, rpcUrl } = req.body;

    if (!wasmPath || typeof wasmPath !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'wasmPath is required and must be a string',
      });
    }

    const result = await deployContract({ wasmPath, network, sourceKey, rpcUrl });

    if (!result.success) {
      return res.status(500).json({
        status: 'error',
        message: 'Contract deployment failed',
        error: result.error,
        network: result.network,
        durationMs: result.durationMs,
      });
    }

    res.status(201).json({
      status: 'success',
      contractId: result.contractId,
      network: result.network,
      durationMs: result.durationMs,
    });
  } catch (error) {
    logger.error('Unexpected error during contract deployment', error);
    res.status(500).json({ status: 'error', message: 'Unable to deploy contract' });
  }
});

export default router;
