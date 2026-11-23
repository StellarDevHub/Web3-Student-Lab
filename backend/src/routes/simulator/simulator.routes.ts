import { Router, Request, Response } from 'express';
import {
  scanContractSource,
  validateScanRequest,
} from '../../services/vulnerabilityScanner.service.js';
import logger from '../../utils/logger.js';

const router: ReturnType<typeof Router> = Router();

/**
 * @openapi
 * /api/v1/simulator/scan:
 *   post:
 *     summary: Scan contract source for security vulnerabilities
 *     tags:
 *       - Simulator
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sourceCode
 *             properties:
 *               sourceCode:
 *                 type: string
 *                 description: Solidity contract source code to scan
 *     responses:
 *       200:
 *         description: Scan completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *       400:
 *         description: Invalid scan request
 *       500:
 *         description: Failed to scan contract
 */
/**
 * @route POST /api/v1/simulator/scan
 * @desc Scan contract source for security vulnerabilities
 */
router.post('/scan', (req: Request, res: Response) => {
  try {
    const validation = validateScanRequest(req.body?.sourceCode);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const result = scanContractSource(req.body.sourceCode);
    res.json({ status: 'success', data: result });
  } catch (error) {
    logger.error('Vulnerability scan failed', { error });
    res.status(500).json({ error: 'Failed to scan contract' });
  }
});

export default router;
