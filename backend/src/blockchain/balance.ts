import { Horizon } from '@stellar/stellar-sdk';
import { Request, Response, Router } from 'express';
import { HORIZON_URL } from '../config/rpcConfig.js';

const router = Router();

/**
 * GET /api/blockchain/balance/:publicKey
 * Returns the XLM balance of a given Stellar public key.
 */
router.get('/balance/:publicKey', async (req: Request, res: Response) => {
  const publicKey = req.params['publicKey'] as string;

  if (!publicKey || !/^G[A-Z2-7]{55}$/.test(publicKey)) {
    res.status(400).json({
      status: 'error',
      message: 'Invalid Stellar public key format',
    });
    return;
  }

  try {
    const server = new Horizon.Server(HORIZON_URL);
    const account = await server.loadAccount(publicKey as string);

    const nativeBalance = account.balances.find((b) => b.asset_type === 'native');

    res.json({
      status: 'success',
      data: {
        publicKey,
        network: HORIZON_URL.includes('testnet') ? 'testnet' : 'mainnet',
        balance: nativeBalance ? nativeBalance.balance : '0',
        asset: 'XLM',
      },
    });
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      'response' in error &&
      (error as { response: { status: number } }).response?.status === 404
    ) {
      res.status(404).json({
        status: 'error',
        message: 'Account not found on the Stellar network',
      });
      return;
    }

    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch balance from Stellar network',
    });
  }
});

export default router;
