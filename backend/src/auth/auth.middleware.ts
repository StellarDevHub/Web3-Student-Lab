import { NextFunction, Request, Response } from 'express';
import { setDbRoutingUserId } from '../db/requestContext.js';
import { getStudentById } from './auth.service.js';
import { isAccessTokenBlacklisted, verifyAccessToken } from './token.service.js';
import { User } from './types.js';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

/**
 * Middleware to authenticate requests using JWT token
 * Expects Authorization header with format: "Bearer <token>"
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authorization token required' });
      return;
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      res.status(401).json({ error: 'Invalid token format' });
      return;
    }

    // Verify the token
    const decoded = verifyAccessToken(token);

    // Check if token is blacklisted
    if (await isAccessTokenBlacklisted(token)) {
      res.status(401).json({ error: 'Token has been revoked' });
      return;
    }

    // Get the user from database
    const user = await getStudentById(decoded.userId);

    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    // Attach user to request object
    req.user = user;
    setDbRoutingUserId(user.id);

    next();
  } catch (error) {
    if (error instanceof Error && error.name === 'JsonWebTokenError') {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    if (error instanceof Error && error.name === 'TokenExpiredError') {
      res.status(401).json({ error: 'Token expired' });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Optional authentication middleware
 * Attaches user to request if token is valid, but doesn't require it
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      next();
      return;
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      next();
      return;
    }

    // Verify the token
    const decoded = verifyAccessToken(token);

    // Get the user from database
    const user = await getStudentById(decoded.userId);

    if (user) {
      req.user = user;
      setDbRoutingUserId(user.id);
    }

    next();
  } catch {
    // Continue without user if token is invalid
    next();
  }
};
