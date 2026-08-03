import { Request, Response, NextFunction } from 'express';
import { captureException } from '../utils/sentry.js';
import { sendErrorEnvelope } from '../utils/apiError.js';

/** Wraps an async handler so rejections reach the global error handler. */
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

/**
 * Global error handler — emits the versioned error envelope documented in
 * `src/utils/apiError.ts`. Client messages stay safe (5xx is collapsed to a
 * generic sentence); the full error and stack are logged against the same
 * correlation ID that is returned to the caller.
 */
export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  captureException(err);

  // Headers already flushed — nothing valid can be sent, hand back to Express.
  if (res.headersSent) {
    return next(err);
  }

  return sendErrorEnvelope(req, res, err);
};
