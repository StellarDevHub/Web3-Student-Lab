import prisma from '../db/index.js';
import { Router, type Request, type Response } from 'express';
import { authenticate } from '../auth/auth.middleware.js';
import {
  handleGitHubCallback,
  linkGitHubAccount,
  linkGitHubIdentity,
  buildPkceAuthorizationUrl,
} from '../auth/github.service.js';
import {
  createOAuthLoginTicket,
  createOAuthPkceSession,
  consumeOAuthLoginTicket,
  consumeOAuthPkceSession,
} from '../auth/oauthPkce.js';
import { buildDiscordAuthorizationUrl, linkDiscordAccount } from '../auth/discord.service.js';
import { auditAction } from '../middleware/audit.js';
import { setRefreshTokenCookie } from '../utils/cookie.js';

const router: ReturnType<typeof Router> = Router();

/**
 * @route   GET /api/v1/oauth/github
 * @desc    Initiate GitHub OAuth login flow
 * @access  Public
 */
router.get('/github', async (req: Request, res: Response) => {
  try {
    const session = await createOAuthPkceSession({ provider: 'github', purpose: 'login' });
    res.redirect(buildPkceAuthorizationUrl(session.state, session.challenge));
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
      const oauthSession = await consumeOAuthPkceSession('github', state);
      if (!oauthSession) throw new Error('Invalid or expired OAuth state. Please try again.');
      let authResponse;
      if (oauthSession.purpose === 'link' && oauthSession.studentId) {
        await linkGitHubIdentity(oauthSession.studentId, code, oauthSession.verifier);
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        res.redirect(`${frontendUrl}/dashboard?githubLinked=true`);
        return;
      }
      authResponse = await handleGitHubCallback(code, state, oauthSession.verifier);
      const ticket = await createOAuthLoginTicket({ authResponse, isNewUser: authResponse.isNewUser });
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const redirectUrl = new URL(`${frontendUrl}/auth/callback`);
      redirectUrl.searchParams.set('ticket', ticket);

      res.redirect(redirectUrl.toString());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'GitHub OAuth failed';
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      res.redirect(`${frontendUrl}/auth/login?error=${encodeURIComponent(message)}`);
    }
  }
);

router.post(
  '/session',
  async (req: Request, res: Response) => {
    try {
      const ticket = req.body?.ticket;
      if (typeof ticket !== 'string') {
        res.status(400).json({ error: 'OAuth ticket is required' });
        return;
      }
      const result = await consumeOAuthLoginTicket<{
        authResponse: { refreshToken: string; [key: string]: unknown };
        isNewUser: boolean;
      }>(ticket);
      if (!result?.authResponse?.refreshToken) {
        res.status(401).json({ error: 'Invalid or expired OAuth ticket' });
        return;
      }
      setRefreshTokenCookie(res, result.authResponse.refreshToken);
      const { refreshToken: _refreshToken, ...authResponse } = result.authResponse;
      res.json({ ...authResponse, isNewUser: result.isNewUser });
    } catch {
      res.status(500).json({ error: 'OAuth session exchange failed' });
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

      const session = await consumeOAuthPkceSession('github', state);
      if (!session || session.purpose !== 'login') {
        res.status(401).json({ error: 'Invalid or expired OAuth state' });
        return;
      }
      const authResponse = await handleGitHubCallback(code, state, session.verifier);
      setRefreshTokenCookie(res, authResponse.refreshToken);

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
  '/github/link/start',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const session = await createOAuthPkceSession({
        provider: 'github',
        purpose: 'link',
        studentId: req.user!.id,
      });
      res.json({ authorizationUrl: buildPkceAuthorizationUrl(session.state, session.challenge) });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start GitHub linking';
      res.status(500).json({ error: message });
    }
  }
);

router.post(
  '/github/link',
  authenticate,
  auditAction('GITHUB_OAUTH_LINK', 'User'),
  async (req: Request, res: Response) => {
    try {
      const { code, state } = req.body;

      if (!code || typeof code !== 'string') {
        res.status(400).json({ error: 'Authorization code is required' });
        return;
      }

      if (!state || typeof state !== 'string') {
        res.status(400).json({ error: 'OAuth state is required' });
        return;
      }

      const session = await consumeOAuthPkceSession('github', state);
      if (!session || session.purpose !== 'link' || session.studentId !== req.user!.id) {
        res.status(401).json({ error: 'Invalid or expired OAuth state' });
        return;
      }

      const studentId = req.user!.id;
      const authResponse = await linkGitHubAccount(studentId, code, session.verifier);
      if (authResponse.refreshToken) {
        setRefreshTokenCookie(res, authResponse.refreshToken);
      }

      res.json(authResponse);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to link GitHub account';
      res.status(409).json({ error: message });
    }
  }
);

router.post('/discord/link/start', authenticate, async (req: Request, res: Response) => {
  try {
    const session = await createOAuthPkceSession({
      provider: 'discord',
      purpose: 'link',
      studentId: req.user!.id,
    });
    res.json({ authorizationUrl: buildDiscordAuthorizationUrl(session.state, session.challenge) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start Discord linking';
    res.status(500).json({ error: message });
  }
});

router.get('/discord/callback', async (req: Request, res: Response) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  try {
    const { code, state } = req.query;
    if (typeof code !== 'string' || typeof state !== 'string') {
      res.status(400).json({ error: 'Authorization code and state are required' });
      return;
    }
    const session = await consumeOAuthPkceSession('discord', state);
    if (!session || session.purpose !== 'link' || !session.studentId) {
      throw new Error('Invalid or expired OAuth state');
    }
    await linkDiscordAccount(session.studentId, code, session.verifier);
    res.redirect(`${frontendUrl}/dashboard?discordLinked=true`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Discord OAuth failed';
    res.redirect(`${frontendUrl}/dashboard?error=${encodeURIComponent(message)}`);
  }
});

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
          discordId: true,
          discordUsername: true,
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
        discordId: student.discordId,
        discordUsername: student.discordUsername,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to check GitHub connection status' });
    }
  }
);

router.get('/social/status', authenticate, async (req: Request, res: Response) => {
  try {
    const student = await prisma.student.findUnique({
      where: { id: req.user!.id },
      select: { githubUsername: true, discordUsername: true },
    });
    if (!student) {
      res.status(404).json({ error: 'Student not found' });
      return;
    }
    res.json({
      github: student.githubUsername ? { linked: true, username: student.githubUsername } : { linked: false },
      discord: student.discordUsername ? { linked: true, username: student.discordUsername } : { linked: false },
    });
  } catch {
    res.status(500).json({ error: 'Failed to load social identity status' });
  }
});

export default router;
