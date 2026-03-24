import { Router, Request, Response } from 'express';
import { register, login } from '../../auth/auth.service.js';
import { authenticate } from '../../auth/auth.middleware.js';
import { LoginRequest, RegisterRequest } from '../../auth/types.js';

const router = Router();

/**
 * @route   POST /api/auth/register
 * @desc    Register a new student
 * @access  Public
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, firstName, lastName }: RegisterRequest = req.body;

    // Validation
    if (!email || !password || !firstName || !lastName) {
      res.status(400).json({ error: 'All fields are required' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }

    // Register the student
    const authResponse = await register({
      email,
      password,
      firstName,
      lastName,
    });

    res.status(201).json(authResponse);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'Student with this email already exists'
    ) {
      res.status(409).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @route   POST /api/auth/login
 * @desc    Login student
 * @access  Public
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password }: LoginRequest = req.body;

    // Validation
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    // Login the student
    const authResponse = await login({ email, password });

    res.json(authResponse);
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid credentials') {
      res.status(401).json({ error: error.message });
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

export default router;
