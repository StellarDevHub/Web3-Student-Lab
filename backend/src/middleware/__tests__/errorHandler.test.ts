import { Request, Response, NextFunction } from 'express';
import { errorHandler, LocalizedError } from '../errorHandler.js';
import * as sentry from '../../utils/sentry.js';

jest.mock('../../utils/sentry.js', () => ({
  captureException: jest.fn(),
}));

describe('errorHandler', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = {
      t: jest.fn((key: string) => `translated:${key}`),
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
    jest.clearAllMocks();
    
    // Silence console.error for clean test output
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('translates LocalizedError and uses its status code', () => {
    const error = new LocalizedError('auth.unauthorized', 401);
    
    errorHandler(error, req as Request, res as Response, next);

    expect(sentry.captureException).toHaveBeenCalledWith(error);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      status: 'error',
      message: 'translated:auth.unauthorized',
    });
  });

  it('falls back to key if translation function is missing on LocalizedError', () => {
    req.t = undefined;
    const error = new LocalizedError('auth.forbidden', 403);
    
    errorHandler(error, req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      status: 'error',
      message: 'auth.forbidden',
    });
  });

  it('handles standard Error by returning 500 and a generic message', () => {
    const error = new Error('Database connection failed (sensitive info)');
    
    errorHandler(error, req as Request, res as Response, next);

    expect(sentry.captureException).toHaveBeenCalledWith(error);
    expect(res.status).toHaveBeenCalledWith(500);
    // Does not leak 'Database connection failed (sensitive info)'
    expect(res.json).toHaveBeenCalledWith({
      status: 'error',
      message: 'translated:error.internal',
    });
  });

  it('handles standard Error when translation function is missing', () => {
    req.t = undefined;
    const error = new Error('Some error');
    
    errorHandler(error, req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      status: 'error',
      message: 'Internal server error',
    });
  });
});
