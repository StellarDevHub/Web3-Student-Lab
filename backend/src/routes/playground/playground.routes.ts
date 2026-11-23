import { Router, Request, Response } from 'express';
import {
  TRIAGE_SCENARIOS,
  getLeaderboard,
  scoreRound,
  updateLeaderboard,
  type LeaderboardEntry,
} from '../../services/issueTriage.service.js';
import logger from '../../utils/logger.js';

const router: ReturnType<typeof Router> = Router();

/**
 * @route GET /api/v1/playground/triage/scenarios
 * @desc List issue triage minigame scenarios
 */
router.get('/triage/scenarios', (_req: Request, res: Response) => {
  const scenarios = TRIAGE_SCENARIOS.map(({ correctPriority, correctLabels, hint, ...rest }) => ({
    ...rest,
    // Omit answers from client payload — scoring happens server-side
  }));
  res.json({ status: 'success', data: { scenarios } });
});

/**
 * @route POST /api/v1/playground/triage/score
 * @desc Score a triage round and optionally update leaderboard
 */
router.post('/triage/score', async (req: Request, res: Response) => {
  try {
    const { submissions, playerId } = req.body ?? {};
    if (!Array.isArray(submissions) || submissions.length === 0) {
      res.status(400).json({ error: 'submissions array is required.' });
      return;
    }

    const round = scoreRound(submissions);
    let leaderboardEntry: LeaderboardEntry | null = null;


    if (playerId && typeof playerId === 'string') {
      leaderboardEntry = await updateLeaderboard(
        playerId,
        round.totalPoints,
        submissions.length
      );
    }

    res.json({
      status: 'success',
      data: { ...round, leaderboardEntry },
    });
  } catch (error) {
    logger.error('Issue triage scoring failed', { error });
    res.status(500).json({ error: 'Failed to score triage round' });
  }
});

/**
 * @route GET /api/v1/playground/triage/leaderboard
 * @desc Get Redis-backed triage leaderboard
 */
router.get('/triage/leaderboard', async (_req: Request, res: Response) => {
  try {
    const leaderboard = await getLeaderboard();
    res.json({ status: 'success', data: { leaderboard } });
  } catch (error) {
    logger.error('Leaderboard fetch failed', { error });
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

export default router;
