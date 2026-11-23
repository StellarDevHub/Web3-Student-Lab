/**
 * Certificate Analytics Explorer Routes — Issue #1179
 *
 * Public endpoints providing:
 *  - Platform overview stats
 *  - Student & course leaderboards
 *  - Searchable certificate directory (by wallet, DID, course, status)
 *  - CSV export for institutional transparency reports
 *  - Grade distribution for charting
 *
 * All routes are unauthenticated (public explorer).
 * Analytical queries execute in sub-second time over indexed PostgreSQL columns.
 */

import { Router, Request, Response } from 'express';
import { certificateExplorerService } from '../../certificates/CertificateExplorer.js';
import logger from '../../utils/logger.js';

const router: ReturnType<typeof Router> = Router();

// ── Overview Stats ─────────────────────────────────────────────────────────

/**
 * @route   GET /api/v1/certificates/explorer/stats
 * @desc    Public platform overview — total certs, students, courses, trends.
 * @access  Public
 */
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await certificateExplorerService.getExplorerStats();
    return res.json({ status: 'success', data: stats });
  } catch (error) {
    logger.error('[ExplorerRoutes] getExplorerStats failed', { error });
    return res.status(500).json({
      status: 'error',
      message: 'Failed to fetch explorer statistics',
    });
  }
});

// ── Leaderboards ───────────────────────────────────────────────────────────

/**
 * @route   GET /api/v1/certificates/explorer/leaderboard/students
 * @desc    Top students by certificate count.
 * @access  Public
 * @query   limit — number of entries (1–50, default 10)
 */
router.get('/leaderboard/students', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query['limit'] ?? '10'), 10) || 10));
    const data = await certificateExplorerService.getStudentLeaderboard(limit);
    return res.json({ status: 'success', data });
  } catch (error) {
    logger.error('[ExplorerRoutes] getStudentLeaderboard failed', { error });
    return res.status(500).json({
      status: 'error',
      message: 'Failed to fetch student leaderboard',
    });
  }
});

/**
 * @route   GET /api/v1/certificates/explorer/leaderboard/courses
 * @desc    Top courses by certificate issuance volume.
 * @access  Public
 * @query   limit — number of entries (1–50, default 10)
 */
router.get('/leaderboard/courses', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query['limit'] ?? '10'), 10) || 10));
    const data = await certificateExplorerService.getCourseLeaderboard(limit);
    return res.json({ status: 'success', data });
  } catch (error) {
    logger.error('[ExplorerRoutes] getCourseLeaderboard failed', { error });
    return res.status(500).json({
      status: 'error',
      message: 'Failed to fetch course leaderboard',
    });
  }
});

// ── Searchable Directory ───────────────────────────────────────────────────

/**
 * @route   GET /api/v1/certificates/explorer/search
 * @desc    Search certificates by student address, DID, course, or status.
 * @access  Public
 * @query   walletAddress, did, courseTitle, status, issuerDid,
 *          issuedAfter, issuedBefore, page, pageSize
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const {
      walletAddress,
      did,
      courseTitle,
      status,
      issuerDid,
      issuedAfter,
      issuedBefore,
      page,
      pageSize,
    } = req.query as Record<string, string | undefined>;

    const parsedPage = page ? parseInt(page, 10) : 1;
    const parsedPageSize = pageSize ? parseInt(pageSize, 10) : 20;

    if (isNaN(parsedPage) || parsedPage < 1) {
      return res.status(400).json({ status: 'error', message: 'Invalid page parameter' });
    }
    if (isNaN(parsedPageSize) || parsedPageSize < 1 || parsedPageSize > 100) {
      return res.status(400).json({ status: 'error', message: 'pageSize must be between 1 and 100' });
    }

    const data = await certificateExplorerService.searchCertificates({
      walletAddress,
      did,
      courseTitle,
      status,
      issuerDid,
      issuedAfter,
      issuedBefore,
      page: parsedPage,
      pageSize: parsedPageSize,
    });

    return res.json({ status: 'success', data });
  } catch (error) {
    logger.error('[ExplorerRoutes] searchCertificates failed', { error });
    return res.status(500).json({
      status: 'error',
      message: 'Search failed',
    });
  }
});

// ── Grade Distribution ─────────────────────────────────────────────────────

/**
 * @route   GET /api/v1/certificates/explorer/grade-distribution
 * @desc    Grade distribution across all certificates (for charting).
 * @access  Public
 */
router.get('/grade-distribution', async (_req: Request, res: Response) => {
  try {
    const data = await certificateExplorerService.getGradeDistribution();
    return res.json({ status: 'success', data });
  } catch (error) {
    logger.error('[ExplorerRoutes] getGradeDistribution failed', { error });
    return res.status(500).json({
      status: 'error',
      message: 'Failed to fetch grade distribution',
    });
  }
});

// ── CSV Export ─────────────────────────────────────────────────────────────

/**
 * @route   GET /api/v1/certificates/explorer/export.csv
 * @desc    Download institutional academic transparency report as CSV.
 * @access  Public
 * @query   Same filters as /search (walletAddress, courseTitle, status, etc.)
 *          Results capped at 10 000 rows.
 */
router.get('/export.csv', async (req: Request, res: Response) => {
  try {
    const {
      walletAddress,
      did,
      courseTitle,
      status,
      issuerDid,
      issuedAfter,
      issuedBefore,
    } = req.query as Record<string, string | undefined>;

    const csv = await certificateExplorerService.exportCertificatesCsv({
      walletAddress,
      did,
      courseTitle,
      status,
      issuerDid,
      issuedAfter,
      issuedBefore,
    });

    const filename = `certificates-export-${new Date().toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (error) {
    logger.error('[ExplorerRoutes] exportCertificatesCsv failed', { error });
    return res.status(500).json({
      status: 'error',
      message: 'CSV export failed',
    });
  }
});

export default router;
