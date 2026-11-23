import { Request, Response, Router } from 'express';
import { authenticate } from '../../auth/auth.middleware.js';
import { getProfileStatusByWallet, login, register } from '../../auth/auth.service.js';
import {
  getSessionStatus,
  lockSession,
  purgeSession,
  touchSession,
  unlockSession,
} from '../../auth/sessionMonitor.js';
import { blacklistAccessToken, rotateRefreshToken, revokeAllUserTokens, verifyRefreshToken } from '../../auth/token.service.js';
import { LoginRequest } from '../../auth/types.js';
import { loginSchema, registerSchema, web3VerifySchema } from '../../auth/validation.schemas.js';
import { createNonce, verifySignature } from '../../auth/web3.service.js';
import { buildSep10Challenge, verifySep10Challenge } from '../../auth/sep10.service.js';
import { slidingWindowRateLimiter } from '../../middleware/rateLimiter.js';
import { validateRequest } from '../../utils/validation.js';
import { auditAction } from '../../middleware/audit.js';
import { clearRefreshTokenCookie, getRefreshTokenFromReq, setRefreshTokenCookie } from '../../utils/cookie.js';
import { requireTurnstile } from '../../middleware/turnstile.js';
import logger from '../../utils/logger.js';

const router: ReturnType<typeof Router> = Router();

/**
 * @openapi
 * /api/v1/auth/register:
 *   post:
 *     summary: Register a new student
 *     description: Creates a new student account with email, password, and optional Stellar wallet address.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, firstName, lastName]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: student@web3studentlab.com
 *               password:
 *                 type: string
 *                 minLength: 6
 *                 example: SecureP@ss123
 *               firstName:
 *                 type: string
 *                 example: Jane
 *               lastName:
 *                 type: string
 *                 example: Doe
 *               walletAddress:
 *                 type: string
 *                 description: Stellar wallet public key (G...)
 *                 example: GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVWXYZ
 *     responses:
 *       201:
 *         description: Student registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *                 token:
 *                   type: string
 *       409:
 *         description: Email or wallet already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
  '/register',
  validateRequest(registerSchema),
  requireTurnstile(),
  auditAction('USER_REGISTER', 'User'),
  async (req: Request, res: Response) => {
  try {
    // Request body is already validated by middleware
    const { email, password, firstName, lastName, walletAddress } = req.body;

    // Register the student
    const authResponse = await register({
      email,
      password,
      firstName,
      lastName,
      walletAddress,
    });

    setRefreshTokenCookie(res, authResponse.refreshToken);
    res.status(201).json(authResponse);
  } catch (_error) {
    console.error('Registration handler error:', _error);
    if (_error instanceof Error && _error.message === 'Student with this email already exists') {
      res.status(409).json({ error: _error.message });
      return;
    }
    if (
      _error instanceof Error &&
      _error.message === 'This wallet is already linked to another profile'
    ) {
      res.status(409).json({ error: _error.message });
      return;
    }
    const message = _error instanceof Error ? _error.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

/**
 * @openapi
 * /api/v1/auth/profile-status:
 *   get:
 *     summary: Check profile status by wallet address
 *     description: Returns whether a Stellar wallet address has a linked profile.
 *     tags: [Auth]
 *     security: []
 *     parameters:
 *       - in: query
 *         name: walletAddress
 *         required: true
 *         schema:
 *           type: string
 *         description: Stellar wallet public key (G...)
 *         example: GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVWXYZ
 *     responses:
 *       200:
 *         description: Profile status retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 hasProfile:
 *                   type: boolean
 *                 profile:
 *                   type: object
 *                   nullable: true
 *       400:
 *         description: Missing wallet address
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/profile-status', async (req: Request, res: Response) => {
  try {
    const walletAddress =
      typeof req.query.walletAddress === 'string' ? req.query.walletAddress.trim() : '';

    if (!walletAddress) {
      res.status(400).json({ error: 'walletAddress is required' });
      return;
    }

    const result = await getProfileStatusByWallet(walletAddress);
    res.json(result);
  } catch (_error) {
    console.error("PROFILE STATUS ERROR:", _error);
    res.status(500).json({ error: 'Failed to fetch profile status' });
  }
});

/**
 * @openapi
 * /api/v1/auth/login:
 *   post:
 *     summary: Login with email and password
 *     description: Authenticates a student using email/password and returns a JWT access token.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: student@web3studentlab.com
 *               password:
 *                 type: string
 *                 example: SecureP@ss123
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *                 token:
 *                   type: string
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
  '/login',
  validateRequest(loginSchema),
  requireTurnstile(),
  auditAction('USER_LOGIN', 'User'),
  async (req: Request, res: Response) => {
  const { email, password }: LoginRequest = req.body;

  try {
    // Login the student
    const authResponse = await login({ email, password });

    setRefreshTokenCookie(res, authResponse.refreshToken);
    res.json(authResponse);
  } catch (_error) {
    if (_error instanceof Error && _error.message === 'Invalid credentials') {
      res.status(401).json({ error: _error.message });
      return;
    }

    // Demo/Mock login fallback only if the database is actually unreachable
    if (email && password) {
      console.warn('Database unreachable, using demo login fallback');
      res.json({
        token: 'mock-jwt-token-for-demo-purposes',
        user: {
          id: 'demo-student-id',
          email,
          name: 'Demo Student',
          did: null,
        },
      });
      return;
    }

    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/v1/auth/me:
 *   get:
 *     summary: Get current authenticated user
 *     description: Returns the profile of the currently authenticated student.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: Missing or invalid authentication token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/me', authenticate, (req: Request, res: Response) => {
  // User is attached to request by authenticate middleware
  res.json({ user: req.user });
});

/**
 * @openapi
 * /api/v1/auth/refresh:
 *   post:
 *     summary: Rotate refresh token
 *     description: Issues a new access/refresh token pair using a valid refresh token.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 description: A valid refresh token
 *     responses:
 *       200:
 *         description: New token pair issued
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *                 refreshToken:
 *                   type: string
 *       400:
 *         description: Refresh token is required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Invalid or expired refresh token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/refresh', async (req: Request, res: Response) => {
  const refreshToken = getRefreshTokenFromReq(req);

  if (!refreshToken) {
    res.status(400).json({ error: 'Refresh token is required' });
    return;
  }

  try {
    const tokens = await rotateRefreshToken(refreshToken);
    setRefreshTokenCookie(res, tokens.refreshToken);
    res.json({ accessToken: tokens.accessToken });
  } catch (_error) {
    clearRefreshTokenCookie(res);
    res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

/**
 * @openapi
 * /api/v1/auth/logout:
 *   post:
 *     summary: Logout and blacklist current access token
 *     description: Invalidates the current JWT access token by adding it to a blacklist.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Logged out successfully
 *       401:
 *         description: Missing or invalid authentication token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
  '/logout',
  authenticate,
  auditAction('USER_LOGOUT', 'User'),
  async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];

  if (token) {
    // Blacklist for 15 minutes (match access token expiry)
    await blacklistAccessToken(token, 15 * 60);
  }

  const refreshToken = getRefreshTokenFromReq(req);
  if (refreshToken) {
    try {
      const payload = await verifyRefreshToken(refreshToken);
      await revokeAllUserTokens(payload.userId);
    } catch (_e) {
      // Token already invalid/revoked
    }
  } else if (req.user?.id) {
    await revokeAllUserTokens(req.user.id);
  }

  clearRefreshTokenCookie(res);
  res.json({ message: 'Logged out successfully' });
});

/**
 * @openapi
 * /api/v1/auth/sep10/challenge:
 *   get:
 *     summary: Generate a SEP-0010 challenge transaction for Stellar wallet authentication
 *     description: Creates an RFC-compliant SEP-0010 challenge transaction envelope with a 5-minute time bound.
 *     tags: [Auth]
 *     security: []
 *     parameters:
 *       - in: query
 *         name: account
 *         required: true
 *         schema:
 *           type: string
 *         description: Client Stellar public key (G...)
 *       - in: query
 *         name: home_domain
 *         required: false
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Challenge transaction generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 transaction:
 *                   type: string
 *                 network_passphrase:
 *                   type: string
 *       400:
 *         description: Missing or invalid account parameter
 */
router.get(
  '/sep10/challenge',
  slidingWindowRateLimiter({
    windowMs: 60 * 1000,
    limit: 30,
    keyPrefix: 'rl:sep10:challenge',
  }),
  async (req: Request, res: Response) => {
    try {
      const account = (req.query.account || req.query.walletAddress) as string;
      const homeDomain = req.query.home_domain as string | undefined;
      const webAuthDomain = req.query.web_auth_domain as string | undefined;

      if (!account || typeof account !== 'string') {
        res.status(400).json({ error: 'account query parameter is required' });
        return;
      }

      const challenge = await buildSep10Challenge(account.trim(), homeDomain, webAuthDomain);
      res.json({
        transaction: challenge.transaction,
        network_passphrase: challenge.networkPassphrase,
      });
    } catch (error: any) {
      if (error.message?.includes('Invalid Stellar public key')) {
        res.status(400).json({ error: error.message });
        return;
      }
      logger.error('SEP-0010 challenge generation error:', error);
      res.status(500).json({ error: 'Failed to generate SEP-0010 challenge' });
    }
  }
);

/**
 * @openapi
 * /api/v1/auth/sep10/token:
 *   post:
 *     summary: Verify signed SEP-0010 challenge and obtain JWT tokens
 *     description: Verifies client signature(s) and multi-signature threshold weight, then issues JWT session tokens.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [transaction]
 *             properties:
 *               transaction:
 *                 type: string
 *                 description: Signed SEP-0010 challenge transaction envelope XDR
 *     responses:
 *       200:
 *         description: Signature verified, tokens issued
 *       401:
 *         description: Expired, forged, or insufficient signature weight
 */
router.post(
  '/sep10/token',
  auditAction('SEP10_LOGIN', 'User'),
  async (req: Request, res: Response) => {
    try {
      const transaction = req.body.transaction || req.body.signedChallenge || req.body.tx;

      if (!transaction || typeof transaction !== 'string') {
        res.status(400).json({ error: 'transaction is required' });
        return;
      }

      const authResponse = await verifySep10Challenge(transaction);
      setRefreshTokenCookie(res, authResponse.refreshToken);
      res.json({
        user: authResponse.user,
        accessToken: authResponse.accessToken,
        token: authResponse.accessToken,
        refreshToken: authResponse.refreshToken,
        signers: authResponse.signers,
      });
    } catch (error: any) {
      logger.warn('SEP-0010 token verification error:', error.message);
      res.status(401).json({ error: error.message || 'SEP-0010 challenge verification failed' });
    }
  }
);

// Alias /sep10/verify to /sep10/token
router.post('/sep10/verify', async (req: Request, res: Response) => {
  try {
    const transaction = req.body.transaction || req.body.signedChallenge || req.body.tx;
    if (!transaction || typeof transaction !== 'string') {
      res.status(400).json({ error: 'transaction is required' });
      return;
    }
    const authResponse = await verifySep10Challenge(transaction);
    setRefreshTokenCookie(res, authResponse.refreshToken);
    res.json(authResponse);
  } catch (error: any) {
    res.status(401).json({ error: error.message || 'SEP-0010 challenge verification failed' });
  }
});

/**
 * @openapi
 * /api/v1/auth/nonce:
 *   get:
 *     summary: Generate a nonce for Web3 wallet authentication
 *     description: Creates a cryptographic nonce that must be signed by the wallet owner to authenticate via Stellar.
 *     tags: [Auth]
 *     security: []
 *     parameters:
 *       - in: query
 *         name: walletAddress
 *         required: true
 *         schema:
 *           type: string
 *         description: Stellar wallet public key (G...)
 *         example: GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVWXYZ
 *     responses:
 *       200:
 *         description: Nonce generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 nonce:
 *                   type: string
 *                   description: Cryptographic nonce to sign
 *                 expiresAt:
 *                   type: string
 *                   format: date-time
 *                   description: ISO 8601 expiration timestamp (5 minutes)
 *       400:
 *         description: Missing or invalid wallet address
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       429:
 *         description: Rate limit exceeded (10 requests/minute)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get(
  '/nonce',
  slidingWindowRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    limit: 10, // 10 requests per minute per IP
    keyPrefix: 'rl:nonce',
  }),
  async (req: Request, res: Response) => {
    try {
      const { walletAddress } = req.query;

      if (!walletAddress || typeof walletAddress !== 'string') {
        res.status(400).json({ error: 'Wallet address is required' });
        return;
      }

      // Validate wallet address format
      if (!/^G[A-Z2-7]{55}$/.test(walletAddress)) {
        res.status(400).json({ error: 'Invalid wallet address format' });
        return;
      }

      const nonce = await createNonce(walletAddress);
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      res.json({
        nonce,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (error) {
      console.error('Nonce generation error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * @openapi
 * /api/v1/auth/verify:
 *   post:
 *     summary: Verify Web3 wallet signature and authenticate
 *     description: Verifies a Stellar wallet signature against a previously issued nonce and returns JWT tokens.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [walletAddress, signature, nonce]
 *             properties:
 *               walletAddress:
 *                 type: string
 *                 description: Stellar wallet public key (G...)
 *                 example: GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVWXYZ
 *               signature:
 *                 type: string
 *                 description: Cryptographic signature of the nonce
 *               nonce:
 *                 type: string
 *                 description: The nonce previously obtained from GET /nonce
 *     responses:
 *       200:
 *         description: Signature verified, tokens issued
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *                 accessToken:
 *                   type: string
 *                 refreshToken:
 *                   type: string
 *       401:
 *         description: Invalid or expired nonce, or invalid signature
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
  '/verify',
  validateRequest(web3VerifySchema),
  auditAction('WEB3_LOGIN', 'User'),
  async (req: Request, res: Response) => {
    try {
      const { walletAddress, signature, nonce } = req.body;

      const authResponse = await verifySignature(walletAddress, signature, nonce);
      setRefreshTokenCookie(res, authResponse.refreshToken);
      res.json(authResponse);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Invalid or expired nonce') {
          res.status(401).json({ error: error.message });
          return;
        }
        if (
          error.message === 'Signature verification failed' ||
          error.message === 'Invalid signature format'
        ) {
          res.status(401).json({ error: 'Invalid signature' });
          return;
        }
      }

      console.error('Signature verification error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * @openapi
 * /api/v1/auth/session/activity:
 *   post:
 *     summary: Record session activity (mouse/keyboard/touch) and reset idle
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Activity recorded }
 *       401: { description: Unauthorized }
 */
router.post('/session/activity', authenticate, async (req: Request, res: Response) => {
  const userId = (req as unknown as { user?: { id: string } }).user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  await touchSession(userId);
  res.json({ ok: true });
});

/**
 * @openapi
 * /api/v1/auth/session/status:
 *   get:
 *     summary: Get session idle/lock status
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: SessionStatus }
 *       401: { description: Unauthorized }
 */
router.get('/session/status', authenticate, async (req: Request, res: Response) => {
  const userId = (req as unknown as { user?: { id: string } }).user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const status = await getSessionStatus(userId);
  res.json(status);
});

/**
 * @openapi
 * /api/v1/auth/session/lock:
 *   post:
 *     summary: Lock the session (blur UI, require re-auth)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Session locked }
 *       401: { description: Unauthorized }
 */
router.post('/session/lock', authenticate, async (req: Request, res: Response) => {
  const userId = (req as unknown as { user?: { id: string } }).user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  await lockSession(userId);
  res.json({ ok: true });
});

/**
 * @openapi
 * /api/v1/auth/session/unlock:
 *   post:
 *     summary: Unlock after re-authentication challenge
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Session unlocked }
 *       401: { description: Unauthorized }
 *       423: { description: Session purged by extended idle; full login required }
 */
router.post('/session/unlock', authenticate, async (req: Request, res: Response) => {
  const userId = (req as unknown as { user?: { id: string } }).user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const unlocked = await unlockSession(userId);
  if (!unlocked) {
    res.status(423).json({
      error: 'Session expired from extended inactivity; please sign in again',
    });
    return;
  }
  res.json({ ok: true });
});

/**
 * @openapi
 * /api/v1/auth/session/purge:
 *   post:
 *     summary: Purge extended-idle session (revoke tokens, terminate WebSockets)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Session purged }
 *       401: { description: Unauthorized }
 */
router.post('/session/purge', authenticate, async (req: Request, res: Response) => {
  const userId = (req as unknown as { user?: { id: string } }).user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  await purgeSession(userId);
  res.json({ ok: true });
});

export default router;
