import { Router, Request, Response } from 'express';

import {
  buildExplorerLink,
  ExplorerAdapterError,
  ExplorerMode,
  filterTransactions,
  getExplorerSnapshot,
} from '../../services/blockExplorer.service.js';
import logger from '../../utils/logger.js';
import { getQueryString, getQueryInt } from '../../utils/queryParams.js';

const router: ReturnType<typeof Router> = Router();

function parseMode(req: Request): ExplorerMode | undefined {
  const modeQuery = String(req.query.mode ?? '').toLowerCase();
  if (modeQuery === 'live' || modeQuery === 'simulation') {
    return modeQuery;
  }
  const useSim = String(req.query.useSimulation ?? '').toLowerCase();
  if (useSim === 'true' || useSim === '1') {
    return 'simulation';
  }
  if (useSim === 'false' || useSim === '0') {
    return 'live';
  }
  return undefined;
}

/**
 * @route GET /api/v1/generator/explorer/snapshot
 * @desc Get cached or live ledger snapshot for hackathon research
 */
router.get('/explorer/snapshot', async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = req.query.limit !== undefined ? getQueryInt(req.query.limit, 25) : 25;
    const seed =
      req.query.seed !== undefined ? getQueryInt(req.query.seed, NaN) : undefined;
    const snapshot = await getExplorerSnapshot({
      limit,
      seed: seed !== undefined && !Number.isNaN(seed) ? seed : undefined as never,
    });

    res.json({ status: 'success', data: snapshot });
  } catch (error: unknown) {
    logger.error('Block explorer snapshot failed', {
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof ExplorerAdapterError) {
      res.status(error.statusCode).json({ error: error.message, code: error.code });
      return;
    }

    res.status(500).json({ error: 'Failed to fetch explorer snapshot' });
  }
});

/**
 * @route GET /api/v1/generator/explorer/search
 * @desc Filter transactions by query string
 */
router.get('/explorer/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const query = getQueryString(req.query.q);
    const snapshot = await getExplorerSnapshot({ limit: 50 });

    const filtered = filterTransactions(snapshot.transactions, query);

    res.json({
      status: 'success',
      data: {
        transactions: filtered,
        stats: snapshot.stats,
        query,
      },
    });
  } catch (error: unknown) {
    logger.error('Block explorer search failed', {
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof ExplorerAdapterError) {
      res.status(error.statusCode).json({ error: error.message, code: error.code });
      return;
    }

    res.status(500).json({ error: 'Failed to search transactions' });
  }
});

/**
 * @route GET /api/v1/generator/explorer/link/:hash
 * @desc Build external explorer URL for a transaction hash
 */
router.get('/explorer/link/:hash', (req: Request, res: Response) => {
  const network = getQueryString(req.query.network) === 'public' ? 'public' : 'testnet';
  const hash = getQueryString(req.params.hash);

  const link = buildExplorerLink(hash, network);
  res.json({ status: 'success', data: { link } });
});

export default router;
