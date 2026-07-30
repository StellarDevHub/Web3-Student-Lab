import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../utils/response.js';

/**
 * Middleware to restrict access to administrator users only.
 * Must be applied AFTER an authentication middleware that attaches req.user.
 */
export const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
  const user = (req as any).user;

  if (!user) {
    res.status(401).json(ApiResponse.error('Authentication required'));
    return;
  }

  if (user.role !== 'admin') {
    res.status(403).json(ApiResponse.error('Admin access required'));
    return;
  }

  next();
};
