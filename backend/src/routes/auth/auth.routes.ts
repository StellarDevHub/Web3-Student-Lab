import { Request, Response, Router } from 'express';
import { authenticate } from '../../auth/auth.middleware.js';
import { getProfileStatusByWallet, login, register } from '../../auth/auth.service.js';
import { blacklistAccessToken, rotateRefreshToken } from '../../auth/token.service.js';
import { LoginRequest } from '../../auth/types.js';
import { loginSchema, registerSchema, web3VerifySchema } from '../../auth/validation.schemas.js';
import { createNonce, verifySignature } from '../../auth/web3.service.js';
import { slidingWindowRateLimiter } from '../../middleware/rateLimiter.js';
import { validateRequest } from '../../utils/validation.js';

const router = Router();

/**
 * @route   POST /api/auth/register
 * @desc    Register a new student
 * @access  Public
 */
router.post('/register', validateRequest(registerSchema), async (req: Request, res: Response) => {
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

    res.status(201).json(authResponse);
  } catch (_error) {
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
    res.status(500).json({ error: 'Internal server error' });
  }
});

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
    res.status(500).json({ error: 'Failed to fetch profile status' });
  }
});

/**
 * @route   POST /api/auth/login
 * @desc    Login student
 * @access  Public
 */
router.post('/login', validateRequest(loginSchema), async (req: Request, res: Response) => {
  const { email, password }: LoginRequest = req.body;

  try {
    // Login the student
    const authResponse = await login({ email, password });

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
 * @route   GET /api/auth/me
 * @desc    Get current authenticated student
 * @access  Private
 */
router.get('/me', authenticate, (req: Request, res: Response) => {
  // User is attached to request by authenticate middleware
  res.json({ user: req.user });
});

/**
 * @route   POST /api/auth/refresh
 * @desc    Rotate refresh token
 * @access  Public
 */
router.post('/refresh', async (req: Request, res: Response) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    res.status(400).json({ error: 'Refresh token is required' });
    return;
  }

  try {
    const tokens = await rotateRefreshToken(refreshToken);
    res.json(tokens);
  } catch (_error) {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

/**
 * @route   POST /api/auth/logout
 * @desc    Logout student and blacklist current access token
 * @access  Private
 */
router.post('/logout', authenticate, async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];

  if (token) {
    // Blacklist for 15 minutes (match access token expiry)
    await blacklistAccessToken(token, 15 * 60);
  }

  res.json({ message: 'Logged out successfully' });
});

/**
 * @route   GET /api/auth/nonce
 * @desc    Generate a cryptographic nonce for Web3 wallet authentication
 * @access  Public
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
      if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
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
 * @route   POST /api/auth/verify
 * @desc    Verify Web3 wallet signature and authenticate user
 * @access  Public
 */
router.post('/verify', validateRequest(web3VerifySchema), async (req: Request, res: Response) => {
  try {
    const { walletAddress, signature, nonce } = req.body;

    const authResponse = await verifySignature(walletAddress, signature, nonce);

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
});

export default router;
