import { Request, Response, NextFunction } from 'express';
import { captureException } from '../utils/sentry.js';

export class LocalizedError extends Error {
  constructor(
    public readonly key: string,
    public readonly status: number = 400
  ) {
    super(key);
    this.name = 'LocalizedError';
  }
}

export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Global error handler middleware
export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  captureException(err);
  console.error('Error:', err instanceof Error ? err.stack || err.message : err);

  if (err instanceof LocalizedError) {
    const message = req.t ? req.t(err.key) : err.key;
    return res.status(err.status).json({
      status: 'error',
      message,
    });
  }

  res.status(500).json({
    status: 'error',
    message: req.t ? req.t('error.internal') : 'Internal server error',
  });
};
