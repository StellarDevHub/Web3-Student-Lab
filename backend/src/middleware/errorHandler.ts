import { Request, Response, NextFunction } from 'express';

export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Global error handler middleware
export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    status: 'error',
    message: 'Internal server error',
  });
};
