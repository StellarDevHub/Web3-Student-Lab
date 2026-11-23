import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../auth/auth.middleware.js';
import { GasRelayerService } from '../blockchain/gasRelayer.service.js';
import { assertQuota, getUsage } from '../blockchain/relayerQuota.js';
import logger from '../utils/logger.js';
import { submitFeeBump } from '../workers/relayerWorker.js';

const router = Router();
const relayer = new GasRelayerService();

// Max fee the relayer is willing to pay — must match gasRelayer.service.ts env var
const MAX_FEE_STROOPS = parseInt(process.env.RELAYER_MAX_FEE_STROOPS || '10000000', 10);

const relaySchema = z.object({
  innerTxXdr: z.string().min(10),
});

// Derive a stable DID-like identifier from the authenticated user.
// Uses user.did if present, otherwise falls back to wallet address, then user id.
function studentDid(user: Express.Request['user']): string {
  return (user as any)?.did || (user as any)?.walletAddress || String((user as any)?.id);
}

/**
 * POST /relayer/relay
 * Accept a student-signed inner transaction XDR, wrap it in a fee-bump envelope,
 * and submit it to Horizon on behalf of the student.
 */
router.post('/relay', authenticate, async (req: Request, res: Response) => {
  const parse = relaySchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'innerTxXdr is required' });
    return;
  }

  const { innerTxXdr } = parse.data;
  const user = req.user!;
  const did = studentDid(user);

  try {
    await assertQuota(did, MAX_FEE_STROOPS);
  } catch (err: any) {
    res.status(429).json({ error: err.message });
    return;
  }

  let feeBumpXdr: string;
  try {
    const result = await relayer.buildFeeBump({
      innerTxXdr,
      studentPublicKey: (user as any).walletAddress || '',
    });
    feeBumpXdr = result.feeBumpXdr;
  } catch (err: any) {
    logger.warn(`Fee-bump build failed for ${did}: ${err.message}`);
    res.status(400).json({ error: err.message });
    return;
  }

  try {
    const feeAccount = relayer.getRelayerPublicKey();
    const submitted = await submitFeeBump(feeBumpXdr, feeAccount, did, MAX_FEE_STROOPS);
    res.json({ hash: submitted.hash, ledger: submitted.ledger });
  } catch (err: any) {
    logger.error(`Fee-bump submission failed for ${did}: ${err.message}`);
    res.status(502).json({ error: err.message });
  }
});

/**
 * GET /relayer/quota
 * Return the authenticated student's daily gas quota usage.
 */
router.get('/quota', authenticate, async (req: Request, res: Response) => {
  const did = studentDid(req.user);
  const usage = await getUsage(did);
  res.json(usage);
});

export default router;
