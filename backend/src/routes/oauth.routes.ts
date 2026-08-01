import prisma from '../db/index.js';
import { Router, type Request, type Response } from 'express';
import { authenticate } from '../auth/auth.middleware.js';
import {
  buildAuthorizationUrl,
  createOAuthState,
  handleGitHubCallback,
  linkGitHubAccount,
} from '../auth/github.service.js';
import { auditAction } from '../middleware/audit.js';

const router: ReturnType<typeof Router> = Router();

/**
 * @route   GET /api/v1/oauth/github
 * @desc    Initiate GitHub OAuth login flow
 * @access  Public
 */
router.get('/github', async (req: Request, res: Response) => {
  try {
    // Create CSRF state and store in database
    const workspaceId = (req.query.workspaceId as string) || 'default';
    const state = await createOAuthState(workspaceId);

    // Build the GitHub authorization URL
    const authorizeUrl = buildAuthorizationUrl(state);

    // Redirect to GitHub for authorization
    res.redirect(authorizeUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to initiate GitHub OAuth';
    res.status(500).json({ error: message });
  }
});

/**
 * @route   GET /api/v1/oauth/github/callback
 * @desc    Handle GitHub OAuth callback after user authorization
 * @access  Public
 */
router.get(
  '/github/callback',
  auditAction('GITHUB_OAUTH_CALLBACK', 'User'),
  async (req: Request, res: Response) => {
    try {
      const { code, state } = req.query;

      if (!code || typeof code !== 'string') {
        res.status(400).json({ error: 'Authorization code is required' });
        return;
      }

      if (!state || typeof state !== 'string') {
        res.status(400).json({ error: 'State parameter is required' });
        return;
      }

      // Complete the OAuth flow
      const authResponse = await handleGitHubCallback(code, state);

      // Redirect to frontend with tokens as query parameters
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const redirectUrl = new URL(`${frontendUrl}/auth/callback`);

      redirectUrl.searchParams.set('token', authResponse.accessToken);
      redirectUrl.searchParams.set('refreshToken', authResponse.refreshToken);
      redirectUrl.searchParams.set('userId', authResponse.user.id);
      redirectUrl.searchParams.set('userName', authResponse.user.name);
      redirectUrl.searchParams.set('userEmail', authResponse.user.email);
      redirectUrl.searchParams.set('isNewUser', String(authResponse.isNewUser));

      res.redirect(redirectUrl.toString());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'GitHub OAuth failed';
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      res.redirect(`${frontendUrl}/auth/login?error=${encodeURIComponent(message)}`);
    }
  }
);

/**
 * @route   POST /api/v1/oauth/github/callback
 * @desc    Handle GitHub OAuth callback for API clients (returns JSON)
 * @access  Public
 */
router.post(
  '/github/callback',
  auditAction('GITHUB_OAUTH_CALLBACK_API', 'User'),
  async (req: Request, res: Response) => {
    try {
      const { code, state } = req.body;

      if (!code || typeof code !== 'string') {
        res.status(400).json({ error: 'Authorization code is required' });
        return;
      }

      if (!state || typeof state !== 'string') {
        res.status(400).json({ error: 'State parameter is required' });
        return;
      }

      // Complete the OAuth flow
      const authResponse = await handleGitHubCallback(code, state);

      res.json(authResponse);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'GitHub OAuth failed';
      res.status(401).json({ error: message });
    }
  }
);

/**
 * @route   POST /api/v1/oauth/github/link
 * @desc    Link GitHub account to an existing authenticated student
 * @access  Private
 */
router.post(
  '/github/link',
  authenticate,
  auditAction('GITHUB_OAUTH_LINK', 'User'),
  async (req: Request, res: Response) => {
    try {
      const { code } = req.body;

      if (!code || typeof code !== 'string') {
        res.status(400).json({ error: 'Authorization code is required' });
        return;
      }

      const studentId = req.user!.id;
      const authResponse = await linkGitHubAccount(studentId, code);

      res.json(authResponse);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to link GitHub account';
      res.status(409).json({ error: message });
    }
  }
);

/**
 * @route   GET /api/v1/oauth/github/status
 * @desc    Check if the authenticated user has a linked GitHub account
 * @access  Private
 */
router.get(
  '/github/status',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const student = await prisma.student.findUnique({
        where: { id: req.user!.id },
        select: {
          githubId: true,
          githubUsername: true,
          githubAvatarUrl: true,
        },
      });

      if (!student || !student.githubId) {
        res.json({ linked: false });
        return;
      }

      res.json({
        linked: true,
        githubId: student.githubId,
        githubUsername: student.githubUsername,
        githubAvatarUrl: student.githubAvatarUrl,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to check GitHub connection status' });
    }
  }
);

export default router;
