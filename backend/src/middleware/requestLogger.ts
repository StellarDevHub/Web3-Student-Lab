import { Request, Response, NextFunction } from 'express';

/**
 * Request Logger Middleware
 * Logs HTTP method, URL, and timestamp for each incoming request
 */
export const requestLogger = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const timestamp = new Date().toISOString();
  const method = req.method;
  const url = req.originalUrl || req.url;

  console.log(`[${timestamp}] ${method} ${url}`);

  next();
};
