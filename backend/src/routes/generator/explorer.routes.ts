import { Request, Response, Router } from 'express';
import {
  buildExplorerLink,
  ExplorerAdapterError,
  ExplorerMode,
  filterTransactions,
  getExplorerSnapshot,
} from '../../services/blockExplorer.service.js';
import logger from '../../utils/logger.js';

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
    const limit = req.query.limit ? Number(req.query.limit) : 25;
    const seed = req.query.seed ? Number(req.query.seed) : undefined;
    const mode = parseMode(req);

    const snapshot = await getExplorerSnapshot({ limit, seed, mode });
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
    const query = String(req.query.q ?? '');
    const mode = parseMode(req);
    const snapshot = await getExplorerSnapshot({ limit: 50, mode });
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
router.get('/explorer/link/:hash', (req: Request<{ hash: string }>, res: Response): void => {
  const network = req.query.network === 'public' ? 'public' : 'testnet';
  const hash = typeof req.params.hash === 'string' ? req.params.hash : '';
  const link = buildExplorerLink(hash, network);
  res.json({ status: 'success', data: { link } });
});

export default router;
